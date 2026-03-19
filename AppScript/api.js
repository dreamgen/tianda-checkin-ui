/**
 * ====================================================================
 * api.js - 天達大班報到系統 API 層
 * ====================================================================
 * 版本: 1.0.0 (Phase 1)
 * 資料來源: 出席總表（Phase 1）
 * 說明: 所有 API 統一由 doPost(e) 路由呼叫，使用 JSON body 傳遞參數
 *
 * 使用方式:
 * POST https://script.google.com/macros/s/{DEPLOY_ID}/exec
 * Body: { "action": "ACTION_NAME", ...params }
 * ====================================================================
 */

// ────────────────────────────────────────────────────────────────────
// 常數設定
// ────────────────────────────────────────────────────────────────────
const SHEET_NAME = {
  ATTENDANCE_SUMMARY: '出席總表',
  MEMBERS:            '班員資料',
  MANUAL_CHECKIN:     '人工簽到表',
  SCHEDULES:          '班程',
  PARAMS:             '參數設定',
  COMMON_LIST:        '常用清單',
  SPECIAL_NOTES:      '特殊註記'
};

// ── Server-side Cache helpers (CacheService) ──────────────────────────────
function withCache(key, ttlSeconds, fn) {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  const result = fn();
  if (result && result.success) {
    try { cache.put(key, JSON.stringify(result), ttlSeconds); } catch (e) {}
  }
  return result;
}

function invalidateAttCache(dateStr, scheduleNote) {
  try {
    CacheService.getScriptCache().remove('att_' + dateStr + '_' + (scheduleNote || ''));
  } catch (e) {}
}

// 出席符號語義對照 (Raw symbol → English status)
const STATUS_MAP = {
  '○': 'present',
  '㊣': 'present_tutor',
  '★': 'online',
  '☆': 'online_tutor',
  '●': 'late',
  '╱': 'absent',
  '公': 'leave_public',
  '事': 'leave_personal',
  '病': 'leave_sick',
  '喪': 'leave_funeral',
  '婚': 'leave_wedding',
  '產': 'leave_maternity',
  '':  'no_record'
};

// 請假狀態列表（用於判斷是否請假）
const LEAVE_STATUSES = ['leave_public','leave_personal','leave_sick','leave_funeral','leave_wedding','leave_maternity'];

// ────────────────────────────────────────────────────────────────────
// 工具函式
// ────────────────────────────────────────────────────────────────────

/**
 * 建立統一回應格式
 */
function apiResponse(success, data, error) {
  return {
    success: success,
    data: data || null,
    error: error || null,
    timestamp: Utilities.formatDate(new Date(), 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ssXXX")
  };
}

/**
 * 將原始出席符號轉換為語義狀態
 */
function toStatus(raw) {
  return STATUS_MAP[raw] || 'unknown';
}

/**
 * 是否為出席(含實體/線上/遲到)
 */
function isCheckedIn(status) {
  return ['present','present_tutor','online','online_tutor','late'].includes(status);
}

/**
 * 是否為請假
 */
function isLeave(status) {
  return LEAVE_STATUSES.includes(status);
}

/**
 * 讀取出席總表的 Header 區（Row 1~8, Col 12+）並建立 date+classCode → 欄號 Map
 * @returns { dateClassMap: { "2026/3/1|1": colIndex }, dateRow3: [], classRow4: [], classCodeRow5: [] }
 */
function buildAttendanceSummaryMap(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol < 12) return null;

  // Row 3 (dates ISO), Row 4 (class names), Row 5 (class codes)
  const row3 = sheet.getRange(3, 12, 1, lastCol - 11).getValues()[0];
  const row4 = sheet.getRange(4, 12, 1, lastCol - 11).getValues()[0];
  const row5 = sheet.getRange(5, 12, 1, lastCol - 11).getValues()[0];

  const dateClassMap = {};

  row3.forEach((dateVal, i) => {
    if (!dateVal) return;
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return;
    const dateStr = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
    const classCode = String(row5[i] || '');
    const key = `${dateStr}|${classCode}`;
    dateClassMap[key] = i + 12; // 1-based column index
  });

  return {
    dateClassMap: dateClassMap,
    row3: row3,
    row4: row4,
    row5: row5
  };
}

/**
 * 讀取參數設定的 Named Range 值
 */
function getNamedRangeValue(rangeName) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const val = ss.getRangeByName(rangeName);
    return val ? val.getValue() : null;
  } catch(e) {
    Logger.log(`getNamedRangeValue(${rangeName}) 錯誤: ${e.message}`);
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────
// API 1: getMembers — 取得班員清單
// ────────────────────────────────────────────────────────────────────
/**
 * @param {Object} params - { unit, class, gender, status }
 * status: "active"(預設) | "all"
 */
function apiGetMembers(params) {
  params = params || {};
  const cacheKey = (params.status === 'active' && !params.unit && !params.class && !params.gender)
    ? 'members_active'
    : 'members_' + JSON.stringify(params);
  return withCache(cacheKey, 300, () => _apiGetMembersImpl(params));
}

function _apiGetMembersImpl(params) {
  params = params || {};
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME.MEMBERS);
    if (!sheet) throw new Error('找不到「班員資料」工作表');

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return apiResponse(true, [], null);

    // ✅ 正確欄位對應（依診斷確認）：
    // A(0):編號, B(1):姓名, C(2):所屬單位, D(3):班級,
    // E(4):特殊註記, F(5):乾坤, G(6):組別,
    // H(7):QRCODE(IMAGE-SKIP), I(8):啟用日期, J(9):失效日期,
    // K(10):備註, L(11):QRCODE1(IMAGE-SKIP), M(12):QRCODE2(IMAGE-SKIP),
    // N(13):QRCODE3(IMAGE-SKIP), O(14):QRCODEURL, P(15):QRCODEIMAGE
    const data = sheet.getRange(2, 1, lastRow - 1, 16).getValues();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = [];
    data.forEach(row => {
      const id = String(row[0] || '').trim();
      if (!id) return;

      const name        = String(row[1]  || '');
      const unit        = String(row[2]  || '');
      const classGroup  = String(row[3]  || '');
      const specialNote = String(row[4]  || '');  // E: 特殊註記
      const gender      = String(row[5]  || '');  // F: 乾坤
      const group       = String(row[6]  || '');  // G: 組別
      // row[7] = H: QRCODE (IMAGE object) → 跳過，不轉為字串
      // row[8] = I: 啟用日期，row[9] = J: 失效日期
      const joinDate   = row[8]  instanceof Date ? row[8]  : (row[8]  ? new Date(row[8])  : null);
      const expiryDate = row[9]  instanceof Date ? row[9]  : (row[9]  ? new Date(row[9])  : null);
      const notes      = String(row[10] || '');   // K: 備註
      // row[11~13]: QRCODE 1~3 (IMAGE) → 跳過
      const qrCodeUrl  = String(row[14] || '');   // O: QRCODEURL（完整報到用 URL）
      const qrCodeImg  = String(row[15] || '');   // P: QRCODEIMAGE（QR 圖片 URL）

      // 判斷是否有效（空白 = 無限制 = active）:
      // - joinDate 空白或已到啟用日 → OK
      // - expiryDate 空白或尚未到期 → OK
      const joinOk   = !joinDate   || joinDate   <= today;
      const expiryOk = !expiryDate || expiryDate >= today;
      const isActive = joinOk && expiryOk;

      // 篩選條件
      const statusFilter = params.status || 'active';
      if (statusFilter === 'active' && !isActive) return;
      if (params.unit   && unit      !== params.unit)         return;
      if (params.class  && !classGroup.includes(params.class)) return;
      if (params.gender && gender    !== params.gender)        return;

      result.push({
        id:           id,
        name:         name,
        unit:         unit,
        class:        classGroup,
        gender:       gender,
        group:        group,
        specialNote:  specialNote,
        isActive:     isActive,
        joinDate:     joinDate   ? Utilities.formatDate(joinDate,   'Asia/Taipei', 'yyyy-MM-dd') : null,
        expiryDate:   expiryDate ? Utilities.formatDate(expiryDate, 'Asia/Taipei', 'yyyy-MM-dd') : null,
        notes:        notes,
        qrCodeUrl:    qrCodeUrl,
        qrCodeImg:    qrCodeImg
      });
    });

    return apiResponse(true, { members: result, total: result.length }, null);

  } catch(e) {
    Logger.log('apiGetMembers 錯誤: ' + e.message + '\n' + e.stack);
    return apiResponse(false, null, e.message);
  }
}


// ────────────────────────────────────────────────────────────────────
// API 2: getMemberById — 取得單一班員詳細資料
// ────────────────────────────────────────────────────────────────────
function apiGetMemberById(params) {
  try {
    params = params || {};
    if (!params.id) throw new Error('缺少必要參數: id');

    const result = apiGetMembers({ status: 'all' });
    if (!result.success) throw new Error(result.error);

    // result.data 為 { members: [...], total: N }
    const member = (result.data.members || []).find(m => m.id === params.id);
    if (!member) return apiResponse(false, null, `找不到 ID: ${params.id}`);

    return apiResponse(true, member, null);

  } catch(e) {
    Logger.log('apiGetMemberById 錯誤: ' + e.message);
    return apiResponse(false, null, e.message);
  }
}

// ────────────────────────────────────────────────────────────────────
// API 3: getAttendanceByDate — 取得指定日期的出席名單
// ────────────────────────────────────────────────────────────────────
/**
 * @param {Object} params - { date: "yyyy/m/d", scheduleNote: "1"|"3", unit?, statusFilter? }
 */
function apiGetAttendanceByDate(params) {
  const cacheKey = 'att_' + (params.date || '') + '_' + (params.scheduleNote || params.classCode || '');
  return withCache(cacheKey, 60, () => _apiGetAttendanceByDateImpl(params));
}

function _apiGetAttendanceByDateImpl(params) {
  try {
    if (!params.date) throw new Error('缺少必要參數: date');

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME.ATTENDANCE_SUMMARY);
    if (!sheet) throw new Error('找不到「出席總表」工作表');

    const mapData = buildAttendanceSummaryMap(sheet);
    if (!mapData) throw new Error('出席總表格式異常');

    // 建立查找鍵
    const scheduleNote = String(params.scheduleNote || '');
    const key = `${params.date}|${scheduleNote}`;
    const targetCol = mapData.dateClassMap[key];

    if (!targetCol) {
      // 嘗試列出可用的日期供除錯
      const availableKeys = Object.keys(mapData.dateClassMap).slice(0, 10);
      throw new Error(`找不到日期「${params.date}」班別「${scheduleNote}」的出席資料。\n可用範例: ${availableKeys.join(', ')}`);
    }

    // 找到班別名稱
    const colOffset = targetCol - 12;
    const className = mapData.row4[colOffset] || '';

    // 取得 countMember
    const countMember = getNamedRangeValue('countMember') || 1500;

    // 讀取資料列: Col B(2), C(3), D(4), G(7), 目標欄
    const dataStartRow = 9;
    const dataCount = Math.min(Number(countMember), sheet.getLastRow() - dataStartRow + 1);
    if (dataCount <= 0) return apiResponse(true, [], null);

    const memberCols = sheet.getRange(dataStartRow, 2, dataCount, 6).getValues(); // B~G (6欄)
    const statusCol  = sheet.getRange(dataStartRow, targetCol, dataCount, 1).getValues();

    const result = [];
    let presentCount = 0, absentCount = 0, lateCount = 0, leaveCount = 0;

    memberCols.forEach((row, i) => {
      const id = String(row[0] || '').trim();
      if (!id) return;

      const name = String(row[1] || '');
      const unit = String(row[2] || '');
      // row[3]=班級, row[4]=註記, row[5]=乾坤(gender)
      const classGroup = String(row[3] || '');
      const specialNote = String(row[4] || '');
      const gender = String(row[5] || '');
      const rawStatus = String(statusCol[i][0] || '');
      const status = toStatus(rawStatus);
      const checkedIn = isCheckedIn(status);
      const leave = isLeave(status);

      // 篩選條件
      if (params.unit && unit !== params.unit) return;
      if (params.statusFilter) {
        if (params.statusFilter === 'present' && !checkedIn) return;
        if (params.statusFilter === 'absent' && (checkedIn || leave)) return;
        if (params.statusFilter === 'leave' && !leave) return;
        if (params.statusFilter === 'late' && status !== 'late') return;
      }

      // 統計
      if (checkedIn) presentCount++;
      else if (leave) leaveCount++;
      else if (status === 'late') lateCount++;
      else absentCount++;

      result.push({
        id: id,
        name: name,
        unit: unit,
        class: classGroup,
        gender: gender,
        specialNote: specialNote,
        statusRaw: rawStatus,
        status: status,
        isCheckedIn: checkedIn,
        isLeave: leave
      });
    });

    return apiResponse(true, {
      records: result,
      summary: {
        total: result.length,
        present: presentCount,
        absent: absentCount,
        late: lateCount,
        leave: leaveCount
      },
      scheduleInfo: {
        date: params.date,
        className: className,
        classCode: scheduleNote,
        targetCol: targetCol
      }
    }, null);

  } catch(e) {
    Logger.log('apiGetAttendanceByDate 錯誤: ' + e.message + '\n' + e.stack);
    return apiResponse(false, null, e.message);
  }
}

// ────────────────────────────────────────────────────────────────────
// 共用：寫入 人工簽到表 (A~E 欄)
// ────────────────────────────────────────────────────────────────────

/**
 * 將單筆報到記錄推送到 Firebase checkin-log 節點
 * 路徑：checkin-log/{date}_{scheduleNote}/{pushKey}
 * @param {{ time, id, name, scheduleNote, source }} record
 */
function fbPushCheckinLog(record) {
  try {
    const secret = PropertiesService.getScriptProperties().getProperty('FIREBASE_SECRET');
    if (!secret) { Logger.log('fbPushCheckinLog: 未設定 FIREBASE_SECRET'); return; }
    const tz = 'Asia/Taipei';
    const now = record._ts ? new Date(record._ts) : new Date();
    const date = Utilities.formatDate(now, tz, 'yyyy/M/d');
    const note = String(record.scheduleNote || '').trim();
    // 從 scheduleNote（如 "實體1"）取 classCode（末尾數字）
    const classCode = note.replace(/^[\u4e00-\u9fa5]+/, '') || 'X';
    const nodePath = encodeURIComponent(date + '_' + classCode);
    const dbUrl = 'https://jczs-checkin-default-rtdb.asia-southeast1.firebasedatabase.app';
    const url = dbUrl + '/checkin-log/' + nodePath + '.json?auth=' + secret;
    const payload = {
      time: Utilities.formatDate(now, tz, 'HH:mm:ss'),
      id: String(record.id || ''),
      name: String(record.name || ''),
      scheduleNote: note,
      source: String(record.source || '人工'),
      ts: now.getTime()
    };
    UrlFetchApp.fetch(url, {
      method: 'post',            // POST → Firebase auto-generates push key
      payload: JSON.stringify(payload),
      contentType: 'application/json',
      muteHttpExceptions: true
    });
  } catch (e) {
    Logger.log('fbPushCheckinLog 失敗: ' + e.message);
  }
}

/**
 * Google 表單送出觸發器：將電子簽到推送到 Firebase
 * 安裝方式：執行 installElectronicCheckinTrigger() 一次即可
 * 觸發時機：INDATA_電子簽到 對應的 Google 表單有人填送
 */
function onElectronicCheckinSubmit(e) {
  try {
    // e.values: 依工作表欄位順序的陣列（0-indexed）
    // INDATA_電子簽到 欄位：A(0)=時間戳, B(1)=ID, C(2)=姓名, E(4)=班程註記, G(6)=verify
    const values = e.values || [];
    if (!values[1]) return; // 無 ID 略過
    const ts = values[0] ? new Date(values[0]) : new Date();
    fbPushCheckinLog({
      _ts: ts.getTime(),
      id: String(values[1] || '').trim(),
      name: String(values[2] || '').trim(),
      scheduleNote: String(values[4] || '').trim(),
      source: '電子'
    });
  } catch (e) {
    Logger.log('onElectronicCheckinSubmit 錯誤: ' + e.message);
  }
}

/**
 * 執行此函式一次，安裝 Google 表單提交觸發器
 * 注意：需在 INDATA_電子簽到 所在的試算表中執行
 */
function installElectronicCheckinTrigger() {
  // 刪除已存在的同名觸發器，避免重複
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'onElectronicCheckinSubmit') {
      ScriptApp.deleteTrigger(t);
    }
  });
  // 建立 onFormSubmit 觸發器（針對連結的表單）
  ScriptApp.newTrigger('onElectronicCheckinSubmit')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onFormSubmit()
    .create();
  Logger.log('✅ 已安裝 onElectronicCheckinSubmit 觸發器');
}

/**
 * 格式化班程註記欄（Col E）
 * scheduleNote Col E 的格式為：出勤方式 + 班別代碼
 * 例如：attendanceMode="實體"，classCode="1" → "實體1"
 *       attendanceMode="線上"，classCode="3" → "線上3"
 *
 * 若傳入的 scheduleNote 已是完整格式（如 "實體1"），則直接使用。
 * 若傳入的是純數字（如 "1"），則自動加上預設前綴 attendanceMode（預設 "實體"）。
 *
 * @param  {string} scheduleNote   - 班別代碼或完整格式
 * @param  {string} attendanceMode - "實體"(預設) | "線上"
 * @returns {string}  完整班程註記，如 "實體1"
 */
function formatScheduleNote(scheduleNote, attendanceMode) {
  const note = String(scheduleNote || '').trim();
  const mode = String(attendanceMode || '實體').trim();
  // 若已含中文前綴（實體/線上）則直接使用，否則補上前綴
  if (/^[\u4e00-\u9fa5]/.test(note)) return note;  // 已有中文開頭
  if (!note) return '';
  return mode + note;
}
/**
 * 將報到記錄直接寫入 人工簽到表（只寫 A~E 欄，F~I 由公式自動）
 * @param {Array} records - [{ id, name, verify, scheduleNote, attendanceMode }]
 *   scheduleNote: 班別代碼（"1"）或完整格式（"實體1"）
 *   attendanceMode: "實體"(預設) | "線上"
 */
function writeToManualCheckin(records) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME.MANUAL_CHECKIN);
  if (!sheet) throw new Error('找不到「人工簽到表」工作表');

  const now = new Date();
  const rows = records.map(r => [
    now,                                                                  // A: 時間戳記
    String(r.id || ''),                                                   // B: ID
    String(r.name || ''),                                                 // C: NAME
    String(r.verify || ''),                                               // D: 檢核密碼
    formatScheduleNote(r.scheduleNote, r.attendanceMode)                  // E: 班程註記（完整格式，如 "實體1"）
  ]);

  if (rows.length === 0) return;

  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, rows.length, 5).setValues(rows);
  SpreadsheetApp.flush();

  // 推送到 Firebase checkin-log（非同步，不影響主流程）
  const scheduleNoteForPush = rows.length > 0 ? rows[0][4] : '';
  records.forEach(function(r, i) {
    fbPushCheckinLog({
      _ts: now.getTime(),
      id: String(r.id || ''),
      name: String(r.name || ''),
      scheduleNote: rows[i] ? rows[i][4] : scheduleNoteForPush,
      source: '人工'
    });
  });
}

/**
 * 驗證 verify token 是否與今日密碼相符
 */
function validateVerifyToken(verify) {
  const correctPw = getNamedRangeValue('CheckPassToday');
  if (!correctPw) return { valid: true, warning: 'CheckPassToday 未設定，跳過驗證' };
  if (String(verify) !== String(correctPw)) {
    return { valid: false, error: `驗證失敗：密碼不符 (輸入: ${verify})` };
  }
  return { valid: true };
}

// ────────────────────────────────────────────────────────────────────
// API 4: checkin — QR 掃描 / 單筆即時報到
// ────────────────────────────────────────────────────────────────────
/**
 * @param params.classCode      班別代碼，如 "1" 或 "3"
 * @param params.attendanceMode 出勤方式，"實體"(預設) | "線上"
 * @param params.scheduleNote   或直接傳完整格式 "實體1"（擇一使用）
 */
function apiCheckin(params) {
  try {
    if (!params.id)   throw new Error('缺少必要參數: id');
    if (!params.name) throw new Error('缺少必要參數: name');
    if (!params.verify) throw new Error('缺少必要參數: verify');
    // classCode 或 scheduleNote 至少要有一個
    if (!params.classCode && !params.scheduleNote) throw new Error('缺少必要參數: classCode 或 scheduleNote');

    const validation = validateVerifyToken(params.verify);
    if (!validation.valid) return apiResponse(false, null, validation.error);

    // 使用 classCode 優先，scheduleNote 作為備用（向下相容）
    const rawNote = params.classCode || params.scheduleNote;
    const mode    = params.attendanceMode || '實體';

    writeToManualCheckin([{
      id: params.id,
      name: params.name,
      verify: params.verify,
      scheduleNote: rawNote,
      attendanceMode: mode,
      notes: params.notes || ''
    }]);

    invalidateAttCache(
      Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/M/d'),
      formatScheduleNote(rawNote, mode)
    );

    return apiResponse(true, {
      message: `${params.name} 報到成功`,
      id: params.id,
      name: params.name,
      scheduleNote: formatScheduleNote(rawNote, mode),
      checkinTime: Utilities.formatDate(new Date(), 'Asia/Taipei', 'HH:mm:ss'),
      warning: validation.warning || null
    }, null);

  } catch(e) {
    Logger.log('apiCheckin 錯誤: ' + e.message);
    return apiResponse(false, null, e.message);
  }
}

// ────────────────────────────────────────────────────────────────────
// API 5: checkinManualBatch — 簡易報到批次提交
// ────────────────────────────────────────────────────────────────────
/**
 * @param params.attendanceMode 整批共用的出勤方式，"實體"(預設) | "線上"
 * @param params.records[].classCode  個別班別代碼，如 "1"
 * @param params.records[].scheduleNote 或完整格式 "實體1"（擇一）
 */
function apiCheckinManualBatch(params) {
  try {
    if (!params.verify) throw new Error('缺少必要參數: verify');
    if (!params.records || !Array.isArray(params.records) || params.records.length === 0) {
      throw new Error('缺少必要參數: records (需為非空陣列)');
    }

    const validation = validateVerifyToken(params.verify);
    if (!validation.valid) return apiResponse(false, null, validation.error);

    const globalMode = params.attendanceMode || '實體';

    // 組建每筆記錄（強制套用共用 verify）
    const records = params.records.map(r => ({
      id: r.id,
      name: r.name,
      verify: params.verify,
      scheduleNote: r.classCode || r.scheduleNote || '',  // classCode 優先
      attendanceMode: r.attendanceMode || globalMode,
      notes: r.notes || ''
    }));

    writeToManualCheckin(records);

    const todayStr = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/M/d');
    const notedNotes = [...new Set(records.map(r => formatScheduleNote(r.scheduleNote, r.attendanceMode)))];
    notedNotes.forEach(n => invalidateAttCache(todayStr, n));

    return apiResponse(true, {
      message: `成功批次報到 ${records.length} 筆`,
      count: records.length,
      names: records.map(r => r.name),
      checkinTime: Utilities.formatDate(new Date(), 'Asia/Taipei', 'HH:mm:ss'),
      warning: validation.warning || null
    }, null);

  } catch(e) {
    Logger.log('apiCheckinManualBatch 錯誤: ' + e.message);
    return apiResponse(false, null, e.message);
  }
}

// ────────────────────────────────────────────────────────────────────
// API 6: checkinTemp — 臨時報到（非在冊人員）
// ────────────────────────────────────────────────────────────────────
/**
 * @param params.classCode      班別代碼，如 "1"
 * @param params.attendanceMode 出勤方式，"實體"(預設) | "線上"
 * @param params.scheduleNote   或直接傳完整格式 "實體1"（擇一使用）
 */
function apiCheckinTemp(params) {
  try {
    if (!params.name)   throw new Error('缺少必要參數: name');
    if (!params.verify) throw new Error('缺少必要參數: verify');
    if (!params.classCode && !params.scheduleNote) throw new Error('缺少必要參數: classCode 或 scheduleNote');

    const validation = validateVerifyToken(params.verify);
    if (!validation.valid) return apiResponse(false, null, validation.error);

    const rawNote = params.classCode || params.scheduleNote;
    const mode    = params.attendanceMode || '實體';
    const fullNote = formatScheduleNote(rawNote, mode);  // → "實體1"

    const now = new Date();
    const tempId = 'TEMP-' + Utilities.formatDate(now, 'Asia/Taipei', 'yyyyMMdd') +
                   '-' + String(now.getTime()).slice(-4);

    const nameWithRelation = params.relatedId
      ? `${params.name}(關係人:${params.relatedId})`
      : params.name;

    writeToManualCheckin([{
      id: tempId,
      name: nameWithRelation,
      verify: params.verify,
      scheduleNote: rawNote,       // 傳入原始值，writeToManualCheckin 內部格式化
      attendanceMode: mode,
      notes: params.notes || '臨時報到'
    }]);

    invalidateAttCache(
      Utilities.formatDate(now, 'Asia/Taipei', 'yyyy/M/d'),
      fullNote
    );

    return apiResponse(true, {
      message: `臨時報到成功: ${params.name}`,
      tempId: tempId,
      name: params.name,
      scheduleNote: fullNote,
      checkinTime: Utilities.formatDate(now, 'Asia/Taipei', 'HH:mm:ss'),
      warning: validation.warning || null
    }, null);

  } catch(e) {
    Logger.log('apiCheckinTemp 錯誤: ' + e.message);
    return apiResponse(false, null, e.message);
  }
}

// ────────────────────────────────────────────────────────────────────
// API 7: getSchedules — 取得班程列表
// ────────────────────────────────────────────────────────────────────
function apiGetSchedules(params) {
  const cacheKey = 'sched_' + (params.filter || 'all');
  return withCache(cacheKey, 1800, () => _apiGetSchedulesImpl(params));
}

function _apiGetSchedulesImpl(params) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME.SCHEDULES);
    if (!sheet) throw new Error('找不到「班程」工作表');

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return apiResponse(true, [], null);

    // 班程欄位：A=日期, B=啟用, C=日期格式化, D=檢核密碼, E=週次, F=週次編號, G=班別代碼, H=班別名稱, I=封存狀態
    const data = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const filter = params.filter || 'all';
    const result = [];

    data.forEach(row => {
      if (!row[0]) return;
      const scheduleDate = new Date(row[0]);
      if (isNaN(scheduleDate.getTime())) return;

      scheduleDate.setHours(0, 0, 0, 0);

      // 日期篩選
      if (filter === 'future' && scheduleDate < today) return;
      if (filter === 'past'   && scheduleDate > today) return;
      if (filter === 'active' && String(row[1]) !== 'TRUE' && row[1] !== true) return;

      result.push({
        date: Utilities.formatDate(scheduleDate, 'Asia/Taipei', 'yyyy/M/d'),
        isActive: row[1] === true || String(row[1]) === 'TRUE',
        dateFormatted: String(row[2] || ''),
        verify: String(row[3] || ''),
        weekNumber: row[4] || '',
        weekIndex: row[5] || '',
        classCode: String(row[6] || ''),
        className: String(row[7] || ''),
        archiveStatus: String(row[8] || '')
      });
    });

    return apiResponse(true, result, null);

  } catch(e) {
    Logger.log('apiGetSchedules 錯誤: ' + e.message);
    return apiResponse(false, null, e.message);
  }
}

// ────────────────────────────────────────────────────────────────────
// API 8: getActiveSchedule — 取得當前啟用班程
// ────────────────────────────────────────────────────────────────────
function apiGetActiveSchedule(params) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // 從 參數設定 Named Ranges 讀取設定
    const checkPassToday   = getNamedRangeValue('CheckPassToday');
    const checkInFormURL   = getNamedRangeValue('CheckInFormURL');
    const checkInFormIDCol = getNamedRangeValue('CheckInFormIDCol');
    const checkInFormName  = getNamedRangeValue('CheckInFormNameCol');
    const qrCodeURL        = getNamedRangeValue('QRCodeURL');

    // 從 出席總表 中找到最近一個 ≤ 今天 的班程
    const summarySheet = ss.getSheetByName(SHEET_NAME.ATTENDANCE_SUMMARY);
    if (!summarySheet) throw new Error('找不到「出席總表」工作表');

    const mapData = buildAttendanceSummaryMap(summarySheet);
    const today = new Date();
    today.setHours(23, 59, 59, 0);

    let latestDate = null, latestClassName = '', latestClassCode = '';

    mapData.row3.forEach((dateVal, i) => {
      if (!dateVal) return;
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return;
      if (d <= today) {
        if (!latestDate || d > latestDate) {
          latestDate = d;
          latestClassName = mapData.row4[i] || '';
          latestClassCode = String(mapData.row5[i] || '');
        }
      }
    });

    const dateStr = latestDate
      ? `${latestDate.getFullYear()}/${latestDate.getMonth()+1}/${latestDate.getDate()}`
      : '';

    return apiResponse(true, {
      date: dateStr,
      className: latestClassName,
      classCode: latestClassCode,
      verify: checkPassToday,
      checkinFormBaseUrl: checkInFormURL,
      checkinFormIDEntry: checkInFormIDCol,
      checkinFormNameEntry: checkInFormName,
      qrCodeBaseUrl: qrCodeURL
    }, null);

  } catch(e) {
    Logger.log('apiGetActiveSchedule 錯誤: ' + e.message);
    return apiResponse(false, null, e.message);
  }
}

// ────────────────────────────────────────────────────────────────────
// API 9: getAttendanceStats — 出席統計 KPI
// ────────────────────────────────────────────────────────────────────
function apiGetAttendanceStats(params) {
  try {
    if (!params.date) throw new Error('缺少必要參數: date');

    // 先取得當日完整出席資料
    const attendanceResult = apiGetAttendanceByDate({
      date: params.date,
      scheduleNote: params.scheduleNote || ''
    });
    if (!attendanceResult.success) throw new Error(attendanceResult.error);

    const records = attendanceResult.data.records;

    // 統計
    const stats = {
      total: records.length,
      present: 0, absent: 0, late: 0, leave: 0,
      male: 0, female: 0, tutor: 0,
      byUnit: {}
    };

    records.forEach(r => {
      // 出席狀態計數
      if (['present','present_tutor','online','online_tutor'].includes(r.status)) stats.present++;
      else if (r.status === 'late') { stats.present++; stats.late++; }
      else if (isLeave(r.status)) stats.leave++;
      else stats.absent++;

      // 性別統計
      if (r.gender === '乾') stats.male++;
      else if (r.gender === '坤') stats.female++;

      // 輔導
      if (['present_tutor','online_tutor'].includes(r.status)) stats.tutor++;

      // 按區域統計
      const unit = r.unit || '未分類';
      if (!stats.byUnit[unit]) stats.byUnit[unit] = { present: 0, absent: 0, late: 0, leave: 0, total: 0 };
      stats.byUnit[unit].total++;
      if (r.isCheckedIn) stats.byUnit[unit].present++;
      else if (r.isLeave) stats.byUnit[unit].leave++;
      else stats.byUnit[unit].absent++;
    });

    // byUnit 轉成陣列便於前端處理
    const byUnitArray = Object.entries(stats.byUnit)
      .map(([unit, s]) => ({ unit, ...s }))
      .sort((a, b) => b.total - a.total);

    return apiResponse(true, {
      ...stats,
      byUnit: byUnitArray,
      scheduleInfo: attendanceResult.data.scheduleInfo
    }, null);

  } catch(e) {
    Logger.log('apiGetAttendanceStats 錯誤: ' + e.message);
    return apiResponse(false, null, e.message);
  }
}

// ────────────────────────────────────────────────────────────────────
// API 10: getUnits — 取得區別/單位清單
// ────────────────────────────────────────────────────────────────────
function apiGetUnits(params) {
  return withCache('units_list', 1800, () => _apiGetUnitsImpl(params));
}

function _apiGetUnitsImpl(params) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME.COMMON_LIST);

    if (!sheet) {
      // fallback: 從班員資料讀取唯一區別
      const membersResult = apiGetMembers({ status: 'active' });
      if (!membersResult.success) throw new Error(membersResult.error);
      const units = [...new Set(membersResult.data.map(m => m.unit).filter(Boolean))].sort();
      return apiResponse(true, units, null);
    }

    const lastRow = sheet.getLastRow();
    const data = sheet.getRange(2, 2, lastRow - 1, 1).getValues(); // B2:B
    const units = [...new Set(data.map(r => String(r[0] || '')).filter(Boolean))].sort();

    return apiResponse(true, units, null);

  } catch(e) {
    Logger.log('apiGetUnits 錯誤: ' + e.message);
    return apiResponse(false, null, e.message);
  }
}

// ────────────────────────────────────────────────────────────────────
// API 11: getMemberAttendanceHistory — 單一班員出席歷程
// ────────────────────────────────────────────────────────────────────
function apiGetMemberAttendanceHistory(params) {
  try {
    if (!params.id) throw new Error('缺少必要參數: id');

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME.ATTENDANCE_SUMMARY);
    if (!sheet) throw new Error('找不到「出席總表」工作表');

    const mapData = buildAttendanceSummaryMap(sheet);
    if (!mapData) throw new Error('出席總表格式異常');

    const countMember = Number(getNamedRangeValue('countMember') || 500);
    const dataStartRow = 9;
    const lastCol = sheet.getLastColumn();

    // 找到對應 ID 的列
    const idCol = sheet.getRange(dataStartRow, 2, countMember, 1).getValues();
    let memberRowIndex = -1;
    for (let i = 0; i < idCol.length; i++) {
      if (String(idCol[i][0] || '').trim() === params.id) {
        memberRowIndex = dataStartRow + i;
        break;
      }
    }

    if (memberRowIndex === -1) {
      return apiResponse(false, null, `找不到 ID: ${params.id}`);
    }

    // 讀取該列 Col L (12) 以後的資料
    const attendanceCols = lastCol - 11;
    if (attendanceCols <= 0) return apiResponse(true, [], null);

    const statusRow = sheet.getRange(memberRowIndex, 12, 1, attendanceCols).getValues()[0];
    const limit = params.limit || 20;

    const history = [];
    mapData.row3.forEach((dateVal, i) => {
      if (!dateVal) return;
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return;
      const rawStatus = String(statusRow[i] || '');
      if (!rawStatus) return; // 跳過空值（未來班程）

      history.push({
        date: `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`,
        className: mapData.row4[i] || '',
        classCode: String(mapData.row5[i] || ''),
        statusRaw: rawStatus,
        status: toStatus(rawStatus),
        isCheckedIn: isCheckedIn(toStatus(rawStatus)),
        isLeave: isLeave(toStatus(rawStatus))
      });
    });

    // 逆序（最新在前），截取 limit 筆
    history.reverse();
    const limited = history.slice(0, limit);

    return apiResponse(true, {
      memberId: params.id,
      history: limited,
      total: history.length
    }, null);

  } catch(e) {
    Logger.log('apiGetMemberAttendanceHistory 錯誤: ' + e.message);
    return apiResponse(false, null, e.message);
  }
}

// ────────────────────────────────────────────────────────────────────
// API 12: searchMembers — 進階搜尋
// ────────────────────────────────────────────────────────────────────
function apiSearchMembers(params) {
  try {
    if (!params.date) throw new Error('缺少必要參數: date');

    // 先取當日出席資料
    const attendanceResult = apiGetAttendanceByDate({
      date: params.date,
      scheduleNote: params.scheduleNote || ''
    });
    if (!attendanceResult.success) throw new Error(attendanceResult.error);

    let records = attendanceResult.data.records;

    // 套用搜尋條件
    if (params.name) {
      records = records.filter(r => r.name.includes(params.name));
    }
    if (params.surname) {
      records = records.filter(r => r.name.startsWith(params.surname));
    }
    if (params.unit) {
      records = records.filter(r => r.unit === params.unit);
    }
    if (params.class) {
      records = records.filter(r => r.class && r.class.includes(params.class));
    }
    if (params.statusFilter && params.statusFilter.length > 0) {
      records = records.filter(r => params.statusFilter.includes(r.status));
    }
    if (params.batchNames && params.batchNames.length > 0) {
      records = records.filter(r => params.batchNames.some(n => r.name.includes(n)));
    }

    return apiResponse(true, {
      records: records,
      total: records.length,
      scheduleInfo: attendanceResult.data.scheduleInfo
    }, null);

  } catch(e) {
    Logger.log('apiSearchMembers 錯誤: ' + e.message);
    return apiResponse(false, null, e.message);
  }
}
// ────────────────────────────────────────────────────────────────────
// API 12: getCheckinLog — 取得報到記錄（從來源直接讀取）
// ────────────────────────────────────────────────────────────────────
/**
 * @param {Object} params - { date?: "yyyy/M/d", classCode?: string }
 * date 預設為今日，classCode 可選（空則取該日所有班別）
 * GAS 自行從班程表查該日的檢核密碼，對符者才列入結果
 */
function apiGetCheckinLog(params) {
  try {
    params = params || {};
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const tz = 'Asia/Taipei';

    // 日期：預設今日
    const targetDate = params.date
      ? params.date
      : Utilities.formatDate(new Date(), tz, 'yyyy/M/d');
    const classCode  = String(params.classCode || '').trim();

    // 將 targetDate (如 "2026/3/19") 轉成 Date 對象，方便比較
    const targetDateObj = (function() {
      const parts = targetDate.split('/');
      return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    })();
    targetDateObj.setHours(0, 0, 0, 0);
    const targetDateMs = targetDateObj.getTime();

    // 1. 從班程表查指定日期的檢核密碼
    //    班程欄位：A=日期, D=檢核密碼, G=班別代碼
    const schedSheet = ss.getSheetByName(SHEET_NAME.SCHEDULES);
    if (!schedSheet) throw new Error('找不到「班程」工作表');
    const schedLastRow = schedSheet.getLastRow();
    const validVerifies = new Set(); // 有效密碼集合（可能同一日有多班別）
    let noVerifyRequired = false;     // 任一符合班程密碼為空 → 不需驗證

    if (schedLastRow >= 2) {
      const schedData = schedSheet.getRange(2, 1, schedLastRow - 1, 7).getValues();
      schedData.forEach(function(row) {
        if (!row[0]) return;
        const d = new Date(row[0]);
        d.setHours(0, 0, 0, 0);
        if (d.getTime() !== targetDateMs) return;
        const rowClassCode = String(row[6] || '').trim();
        // 指定班別時進行篩選
        if (classCode && rowClassCode !== classCode) return;
        const verifyVal = String(row[3] || '').trim();
        if (verifyVal) {
          validVerifies.add(verifyVal);
        } else {
          noVerifyRequired = true; // 密碼為空 → 該班程不需驗證
        }
      });
    }

    // 找不到符合的班程（連空密碼班程都沒有）
    if (!noVerifyRequired && validVerifies.size === 0) {
      return apiResponse(true, { records: [], date: targetDate, classCode: classCode, total: 0,
        note: '該日期無符合的班程' }, null);
    }

    // 2. 讀取電子簽到 和 人工簽到表
    const records = [];

    // — INDATA_電子簽到：A=時間戳, B=ID, C=姓名, E=班程註記, G=verify
    const eSheet = ss.getSheetByName('INDATA_電子簽到');
    if (eSheet) {
      const eLastRow = eSheet.getLastRow();
      if (eLastRow >= 2) {
        const eData = eSheet.getRange(2, 1, eLastRow - 1, 7).getValues();
        eData.forEach(function(row) {
          if (!row[1]) return; // 無 ID 跳過
          const ts = row[0] ? new Date(row[0]) : null;
          if (!ts || isNaN(ts.getTime())) return;
          const rowDate = new Date(ts.getTime());
          rowDate.setHours(0, 0, 0, 0);
          if (rowDate.getTime() !== targetDateMs) return;
          const recVerify = String(row[6] || '').trim();
          if (!noVerifyRequired && !validVerifies.has(recVerify)) return;
          const schedNote = String(row[4] || '').trim();
          // classCode 篩選：scheduleNote 包含 classCode 才通過
          if (classCode && !schedNote.includes(classCode)) return;
          records.push({
            timestamp: ts.getTime(),
            time: Utilities.formatDate(ts, tz, 'HH:mm:ss'),
            id: String(row[1]).trim(),
            name: String(row[2] || '').trim(),
            scheduleNote: schedNote,
            source: '電子'
          });
        });
      }
    }

    // — 人工簽到表：A=Google Form分欸, B=ID, C=姓名, E=班程註記, F=報到時間戳, I=verify
    const mSheet = ss.getSheetByName(SHEET_NAME.MANUAL_CHECKIN);
    if (mSheet) {
      const mLastRow = mSheet.getLastRow();
      if (mLastRow >= 2) {
        const mData = mSheet.getRange(2, 1, mLastRow - 1, 9).getValues();
        mData.forEach(function(row) {
          if (!row[1]) return; // 無 ID 跳過
          // 使用 F 欄（row[5]）作為報到時間，若空則 fallback 到 A 欄（row[0]）
          const ts = (row[5] && new Date(row[5]).getTime ? new Date(row[5]) :
                      row[0] ? new Date(row[0]) : null);
          if (!ts || isNaN(ts.getTime())) return;
          const rowDate = new Date(ts.getTime());
          rowDate.setHours(0, 0, 0, 0);
          if (rowDate.getTime() !== targetDateMs) return;
          const recVerify = String(row[8] || '').trim();
          if (!noVerifyRequired && !validVerifies.has(recVerify)) return;
          const schedNote = String(row[4] || '').trim();
          if (classCode && !schedNote.includes(classCode)) return;
          records.push({
            timestamp: ts.getTime(),
            time: Utilities.formatDate(ts, tz, 'HH:mm:ss'),
            id: String(row[1]).trim(),
            name: String(row[2] || '').trim(),
            scheduleNote: schedNote,
            source: '人工'
          });
        });
      }
    }

    // 3. 按時間戳反序排列（最新在前）
    records.sort(function(a, b) { return b.timestamp - a.timestamp; });

    // 移除 timestamp （內部排序用，不需要回傳）
    const result = records.map(function(r) {
      return { time: r.time, id: r.id, name: r.name, scheduleNote: r.scheduleNote, source: r.source };
    });

    return apiResponse(true, { records: result, date: targetDate, classCode: classCode, total: result.length }, null);

  } catch(e) {
    Logger.log('apiGetCheckinLog 錯誤: ' + e.message + '\n' + e.stack);
    return apiResponse(false, null, e.message);
  }
}

// ────────────────────────────────────────────────────────────────────
/**
 * 主路由函式，由 doPost(e) 呼叫
 */
function routeApiRequest(params) {
  const action = params.action;
  Logger.log(`API 請求: ${action} | 參數: ${JSON.stringify(params)}`);

  switch(action) {
    case 'getMembers':                  return apiGetMembers(params);
    case 'getMemberById':               return apiGetMemberById(params);
    case 'getAttendanceByDate':         return apiGetAttendanceByDate(params);
    case 'checkin':                     return apiCheckin(params);
    case 'checkinManualBatch':          return apiCheckinManualBatch(params);
    case 'checkinTemp':                 return apiCheckinTemp(params);
    case 'getSchedules':                return apiGetSchedules(params);
    case 'getActiveSchedule':           return apiGetActiveSchedule(params);
    case 'getAttendanceStats':          return apiGetAttendanceStats(params);
    case 'getUnits':                    return apiGetUnits(params);
    case 'getMemberAttendanceHistory':  return apiGetMemberAttendanceHistory(params);
    case 'searchMembers':               return apiSearchMembers(params);
    case 'getCheckinLog':               return apiGetCheckinLog(params);
    default:
      return apiResponse(false, null, `未知的 action: ${action}`);
  }
}

// ────────────────────────────────────────────────────────────────────
// 測試函式（可在 Apps Script 編輯器直接執行）
// ────────────────────────────────────────────────────────────────────

function testGetMembers() {
  const result = apiGetMembers({ unit: '基隆區', status: 'active' });
  const members = result.data ? result.data.members : [];
  Logger.log('testGetMembers → success: ' + result.success + ' | total: ' + (result.data ? result.data.total : 0));
  if (members && members.length > 0) Logger.log('第一筆: ' + JSON.stringify(members[0]));
  if (!result.success) Logger.log('錯誤: ' + result.error);
}

function testGetMemberById() {
  const result = apiGetMemberById({ id: 'H111310001' });
  Logger.log('testGetMemberById → ' + JSON.stringify(result));
}

function testGetAttendanceByDate() {
  // 請先確認此日期與班別代碼在出席總表中存在
  const result = apiGetAttendanceByDate({ date: '2026/3/1', scheduleNote: '1' });
  Logger.log('testGetAttendanceByDate → success: ' + result.success);
  if (result.success) {
    Logger.log('summary: ' + JSON.stringify(result.data.summary));
    Logger.log('scheduleInfo: ' + JSON.stringify(result.data.scheduleInfo));
    Logger.log('前3筆: ' + JSON.stringify(result.data.records.slice(0, 3)));
  } else {
    Logger.log('錯誤: ' + result.error);
  }
}

function testCheckin() {
  const checkPassToday = getNamedRangeValue('CheckPassToday');
  Logger.log('CheckPassToday = ' + checkPassToday);
  const result = apiCheckin({
    id: 'H111310001',
    name: '丁國恒',
    verify: checkPassToday || 'TEST',
    classCode: '1',
    attendanceMode: '實體',
    notes: '測試報到'
  });
  Logger.log('testCheckin → ' + JSON.stringify(result));
}

function testCheckinManualBatch() {
  const checkPassToday = getNamedRangeValue('CheckPassToday');
  const result = apiCheckinManualBatch({
    verify: checkPassToday || 'TEST',
    attendanceMode: '實體',
    records: [
      { id: 'H111310001', name: '丁國恒', classCode: '1', notes: '' },
      { id: 'H111310002', name: '丁耀盛', classCode: '1', notes: '' }
    ]
  });
  Logger.log('testCheckinManualBatch → ' + JSON.stringify(result));
}

function testCheckinTemp() {
  const checkPassToday = getNamedRangeValue('CheckPassToday');
  const result = apiCheckinTemp({
    name: '測試臨時人員',
    verify: checkPassToday || 'TEST',
    classCode: '1',
    attendanceMode: '實體',
    notes: '親屬陪同',
    relatedId: 'H111310001'
  });
  Logger.log('testCheckinTemp → ' + JSON.stringify(result));
}

function testGetSchedules() {
  const result = apiGetSchedules({ filter: 'future' });
  Logger.log('testGetSchedules → success: ' + result.success + ' | count: ' + (result.data ? result.data.length : 0));
  if (result.data && result.data.length > 0) Logger.log('前3筆: ' + JSON.stringify(result.data.slice(0, 3)));
}

function testGetActiveSchedule() {
  const result = apiGetActiveSchedule({});
  Logger.log('testGetActiveSchedule → ' + JSON.stringify(result));
}

function testGetAttendanceStats() {
  const result = apiGetAttendanceStats({ date: '2026/3/1', scheduleNote: '1' });
  Logger.log('testGetAttendanceStats → success: ' + result.success);
  if (result.success) {
    Logger.log('stats: ' + JSON.stringify({
      total: result.data.total,
      present: result.data.present,
      absent: result.data.absent,
      leave: result.data.leave,
      male: result.data.male,
      female: result.data.female
    }));
    Logger.log('byUnit前5: ' + JSON.stringify(result.data.byUnit.slice(0, 5)));
  } else {
    Logger.log('錯誤: ' + result.error);
  }
}

function testGetCheckinLog() {
  const date = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/M/d');
  Logger.log('== testGetCheckinLog | 日期: ' + date + ' ==');
  const result = apiGetCheckinLog({ date: date });
  Logger.log('success: ' + result.success);
  if (result.success) {
    const d = result.data;
    Logger.log('日期: ' + d.date + ' | 班別: ' + (d.classCode || '全部') + ' | 總筆數: ' + d.total);
    if (d.note) Logger.log('備註: ' + d.note);
    (d.records || []).slice(0, 5).forEach(function(r, i) {
      Logger.log((i + 1) + '. [' + r.source + '] ' + r.time + '  ' + r.name + '(' + r.id + ')  ' + r.scheduleNote);
    });
    if (d.total > 5) Logger.log('... 共 ' + d.total + ' 筆，僅顯示前 5 筆');
  } else {
    Logger.log('錯誤: ' + result.error);
  }
}

function testGetUnits() {
  const result = apiGetUnits({});
  Logger.log('testGetUnits → ' + JSON.stringify(result));
}

function testGetMemberAttendanceHistory() {
  const result = apiGetMemberAttendanceHistory({ id: 'H111310001', limit: 10 });
  Logger.log('testGetMemberAttendanceHistory → success: ' + result.success);
  if (result.success) Logger.log(JSON.stringify(result.data));
  else Logger.log('錯誤: ' + result.error);
}

function testSearchMembers() {
  const result = apiSearchMembers({
    date: '2026/3/1',
    scheduleNote: '1',
    unit: '基隆區',
    statusFilter: ['present', 'late']
  });
  Logger.log('testSearchMembers → success: ' + result.success + ' | total: ' + (result.data ? result.data.total : 0));
  if (result.data && result.data.records) Logger.log('前3筆: ' + JSON.stringify(result.data.records.slice(0, 3)));
}


function testGetMemberById() {
  const result = apiGetMemberById({ id: 'H111310001' });
  Logger.log('testGetMemberById → ' + JSON.stringify(result));
}

function testGetAttendanceByDate() {
  // 請先確認此日期與班別代碼在出席總表中存在
  const result = apiGetAttendanceByDate({ date: '2026/3/1', scheduleNote: '1' });
  Logger.log('testGetAttendanceByDate → success: ' + result.success);
  if (result.success) {
    Logger.log('summary: ' + JSON.stringify(result.data.summary));
    Logger.log('scheduleInfo: ' + JSON.stringify(result.data.scheduleInfo));
    Logger.log('前3筆: ' + JSON.stringify(result.data.records.slice(0, 3)));
  } else {
    Logger.log('錯誤: ' + result.error);
  }
}

function testCheckin() {
  const checkPassToday = getNamedRangeValue('CheckPassToday');
  Logger.log('CheckPassToday = ' + checkPassToday);
  const result = apiCheckin({
    id: 'H111310001',
    name: '丁國恒',
    verify: checkPassToday || 'TEST',
    scheduleNote: '1',
    method: 'manual',
    notes: '測試報到'
  });
  Logger.log('testCheckin → ' + JSON.stringify(result));
}

function testCheckinManualBatch() {
  const checkPassToday = getNamedRangeValue('CheckPassToday');
  const result = apiCheckinManualBatch({
    verify: checkPassToday || 'TEST',
    records: [
      { id: 'H111310001', name: '丁國恒', scheduleNote: '1', notes: '' },
      { id: 'H111310002', name: '丁耀盛', scheduleNote: '1', notes: '' }
    ]
  });
  Logger.log('testCheckinManualBatch → ' + JSON.stringify(result));
}

function testCheckinTemp() {
  const checkPassToday = getNamedRangeValue('CheckPassToday');
  const result = apiCheckinTemp({
    name: '測試臨時人員',
    verify: checkPassToday || 'TEST',
    scheduleNote: '1',
    notes: '親屬陪同',
    relatedId: 'H111310001'
  });
  Logger.log('testCheckinTemp → ' + JSON.stringify(result));
}

function testGetSchedules() {
  const result = apiGetSchedules({ filter: 'future' });
  Logger.log('testGetSchedules → success: ' + result.success + ' | count: ' + (result.data ? result.data.length : 0));
  if (result.data && result.data.length > 0) Logger.log('前3筆: ' + JSON.stringify(result.data.slice(0, 3)));
}

function testGetActiveSchedule() {
  const result = apiGetActiveSchedule({});
  Logger.log('testGetActiveSchedule → ' + JSON.stringify(result));
}

function testGetAttendanceStats() {
  const result = apiGetAttendanceStats({ date: '2026/3/1', scheduleNote: '1' });
  Logger.log('testGetAttendanceStats → success: ' + result.success);
  if (result.success) {
    Logger.log('stats: ' + JSON.stringify({
      total: result.data.total,
      present: result.data.present,
      absent: result.data.absent,
      leave: result.data.leave,
      male: result.data.male,
      female: result.data.female
    }));
    Logger.log('byUnit前5: ' + JSON.stringify(result.data.byUnit.slice(0, 5)));
  } else {
    Logger.log('錯誤: ' + result.error);
  }
}

function testGetUnits() {
  const result = apiGetUnits({});
  Logger.log('testGetUnits → ' + JSON.stringify(result));
}

function testGetMemberAttendanceHistory() {
  const result = apiGetMemberAttendanceHistory({ id: 'H111310001', limit: 10 });
  Logger.log('testGetMemberAttendanceHistory → success: ' + result.success);
  if (result.success) Logger.log(JSON.stringify(result.data));
  else Logger.log('錯誤: ' + result.error);
}

function testSearchMembers() {
  const result = apiSearchMembers({
    date: '2026/3/1',
    scheduleNote: '1',
    unit: '基隆區',
    statusFilter: ['present', 'late']
  });
  Logger.log('testSearchMembers → success: ' + result.success + ' | total: ' + (result.data ? result.data.total : 0));
  if (result.data && result.data.records) Logger.log('前3筆: ' + JSON.stringify(result.data.records.slice(0, 3)));
}
