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
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME.MEMBERS);
    if (!sheet) throw new Error('找不到「班員資料」工作表');

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return apiResponse(true, [], null);

    // 欄位: A=編號, B=姓名, C=所屬單位, D=班級, E=乾坤, F=組別, G=啟用日期, H=失效日期, I=備註, J=QR1, K=QR2
    const data = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = [];
    data.forEach(row => {
      const id = String(row[0] || '').trim();
      if (!id) return;

      const name = String(row[1] || '');
      const unit = String(row[2] || '');
      const classGroup = String(row[3] || '');
      const gender = String(row[4] || '');
      const group = String(row[5] || '');
      const joinDate = row[6] ? new Date(row[6]) : null;
      const expiryDate = row[7] ? new Date(row[7]) : null;
      const notes = String(row[8] || '');
      const qrCode1 = String(row[9] || '');
      const qrCode2 = String(row[10] || '');

      // 判斷是否有效
      const isActive = !expiryDate || expiryDate >= today;

      // 篩選條件
      const statusFilter = params.status || 'active';
      if (statusFilter === 'active' && !isActive) return;
      if (params.unit && unit !== params.unit) return;
      if (params.class && !classGroup.includes(params.class)) return;
      if (params.gender && gender !== params.gender) return;

      result.push({
        id: id,
        name: name,
        unit: unit,
        class: classGroup,
        gender: gender,
        group: group,
        isActive: isActive,
        joinDate: joinDate ? Utilities.formatDate(joinDate, 'Asia/Taipei', 'yyyy-MM-dd') : null,
        expiryDate: expiryDate ? Utilities.formatDate(expiryDate, 'Asia/Taipei', 'yyyy-MM-dd') : null,
        notes: notes,
        qrCode1: qrCode1,
        qrCode2: qrCode2
      });
    });

    return apiResponse(true, result, null);

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
    if (!params.id) throw new Error('缺少必要參數: id');

    const result = apiGetMembers({ status: 'all' });
    if (!result.success) throw new Error(result.error);

    const member = result.data.find(m => m.id === params.id);
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
// doPost 路由入口（由 程式碼.js 的 doPost 呼叫此函式）
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
    default:
      return apiResponse(false, null, `未知的 action: ${action}`);
  }
}

// ────────────────────────────────────────────────────────────────────
// 測試函式（可在 Apps Script 編輯器直接執行）
// ────────────────────────────────────────────────────────────────────

function testGetMembers() {
  const result = apiGetMembers({ unit: '基隆區', status: 'active' });
  Logger.log('testGetMembers → success: ' + result.success + ' | count: ' + (result.data ? result.data.length : 0));
  if (result.data && result.data.length > 0) Logger.log('第一筆: ' + JSON.stringify(result.data[0]));
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
