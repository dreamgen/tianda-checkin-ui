/**
 * ====================================================================
 * qrpwa-api-transplant.js
 * QRPWA 報到系統 API — 移植專用自含版
 * ====================================================================
 * 版本: 1.0.0
 *
 * 本檔案為獨立自含版本，貼入新 Google Sheet 的 AppScript 後即可運作。
 * 不依賴任何其他 .js 檔案。
 *
 * 提供功能：
 *   GET  ?action=verify&name={設定檔名稱}     → 驗證設定檔是否存在
 *   GET  ?action=getConfig&name={設定檔名稱}  → 取得 QRPWA 設定檔 JSON
 *   GET  ?action=listConfigs                  → 列出所有設定檔名稱
 *   POST { action: "getCheckinLog", ... }     → 即時報到記錄查詢
 *   POST { action: "getActiveSchedule" }      → 取得當前啟用班程
 *
 * ── 移植前請先完成 ─────────────────────────────────────────────────
 *   1. 修改下方「▼ 使用者設定區」的 Sheet 名稱 / 欄位位置
 *   2. 在 Google Sheet 建立所需的 Named Ranges（詳見說明文件）
 *   3. 部署為 Web App 後，將 URL 存入指令碼屬性 WEB_APP_URL
 *   4. 執行 tp_runSetupDiagnostic() 確認所有設定正確
 * ====================================================================
 */

// ====================================================================
// ▼ 使用者設定區 — 依你的 Google Sheet 結構修改這裡
// ====================================================================

// ── Sheet 名稱 ────────────────────────────────────────────────────
const TP_SHEET = {
  BUILD_INFO:       '建置系統注意事項', // 存放系統設定的 Sheet（B1/J1/N1）
  SCHEDULES:        '班程',             // 班程 Sheet
  ELECTRONIC_SIGN:  'INDATA_電子簽到',  // 電子掃描報到記錄
  MANUAL_SIGN:      '人工簽到表',       // 人工登記報到記錄
};

// ── 建置系統注意事項 Sheet 儲存格 ─────────────────────────────────
const TP_BUILD_CELL = {
  BASE_NAME:    'B1',  // 班別基礎名稱，例："天達大班"
  ATTEND_MODE:  'J1',  // 出勤模式字串，例："實體3"（去尾數字後得模式 "實體"）
  SCAN_MODE:    'N1',  // ScanMode 數值，例：2
};

// ── Named Range 名稱 ──────────────────────────────────────────────
const TP_NR = {
  PREF_URL:     'prefUrl_Attend',      // 含所有欄位的預填表單 URL（主要 entry code 來源）
  FORM_URL:     'CheckInFormURL',      // 表單回應基礎 URL
  ID_ENTRY:     'CheckInFormIDCol',    // ID entry code（備援）
  NAME_ENTRY:   'CheckInFormNameCol',  // NAME entry code（備援）
  QRCODE_PASS:  'paramQRCodePass',     // 密碼值（含 "..." 引號，自動去除）
  CHECK_PASS:   'CheckPassToday',      // 今日報到密碼
};

// ── 班程 Sheet 欄位（0-indexed）──────────────────────────────────
const TP_SCHED_COL = {
  DATE:         0,  // A: 日期
  VERIFY:       3,  // D: 檢核密碼
  CLASS_CODE:   6,  // G: 班別代碼（"1"~"7"）
  CLASS_NAME:   7,  // H: 班別顯示名稱（"第一週日"等）
};

// ── 電子簽到表 欄位（0-indexed）──────────────────────────────────
const TP_ESIGN_COL = {
  TIMESTAMP:    0,  // A: 時間戳
  ID:           1,  // B: ID
  NAME:         2,  // C: 姓名
  SCHED_NOTE:   4,  // E: 班程註記（"實體3" 等）
  VERIFY:       6,  // G: 檢核密碼
};

// ── 人工簽到表 欄位（0-indexed）──────────────────────────────────
const TP_MSIGN_COL = {
  FORM_TS:      0,  // A: Google 表單提交時間
  ID:           1,  // B: ID
  NAME:         2,  // C: 姓名
  SCHED_NOTE:   4,  // E: 班程註記
  CHECKIN_TS:   5,  // F: 實際報到時間（優先）
  VERIFY:       8,  // I: 檢核密碼
};

// ── prefUrl 佔位符 ─────────────────────────────────────────────────
const TP_PH = {
  ID:   '___ID',
  NAME: '___NAME',
  PASS: '___PASS',
  TYPE: '___TYPE',
};

// ── 指令碼屬性 Key ─────────────────────────────────────────────────
const TP_PROP_WEB_APP_URL = 'WEB_APP_URL';  // 儲存已部署 Web App URL

// ====================================================================
// ▲ 使用者設定區結束
// ====================================================================

// ──────────────────────────────────────────────────────────────────
// 選單
// ──────────────────────────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📡 QRPWA API')
    .addItem('📱 選擇設定檔並顯示 QR Code', 'tp_showConfigQRCodeDialog')
    .addSeparator()
    .addItem('✅ 診斷：確認所有設定', 'tp_runSetupDiagnostic')
    .addItem('📋 列出可用設定檔', 'tp_testListConfigs')
    .addItem('🔬 測試 getCheckinLog（今日）', 'tp_testCheckinLogToday')
    .addToUi();
}

// ====================================================================
// doGet — 處理 Config API（GET 請求）
// ====================================================================
function doGet(e) {
  try {
    const params  = (e && e.parameter) ? e.parameter : {};
    const action  = String(params['action'] || '').trim();
    const name    = String(params['name']   || '').trim();

    if (action === 'listConfigs') {
      return tp_handleConfigList();
    }
    if (name) {
      switch (action || 'verify') {
        case 'verify':    return tp_handleConfigVerify(name);
        case 'getConfig': return tp_handleConfigGet(name);
        default:
          return tp_jsonResp({ status: 'error', message: '未知 action: ' + action });
      }
    }
    return tp_jsonResp({ status: 'error', message: '缺少參數：name 或 action=listConfigs' });
  } catch (err) {
    return tp_jsonResp({ status: 'error', message: '伺服器錯誤：' + err.message });
  }
}

// ====================================================================
// doPost — 處理 Data API（POST 請求）
// ====================================================================
function doPost(e) {
  try {
    const body   = e && e.postData ? JSON.parse(e.postData.contents || '{}') : {};
    const action = String(body.action || '').trim();

    switch (action) {
      case 'getCheckinLog':      return tp_postResp(tp_apiGetCheckinLog(body));
      case 'getActiveSchedule':  return tp_postResp(tp_apiGetActiveSchedule(body));
      default:
        return tp_postResp(tp_apiResp(false, null, '未知的 action: ' + action));
    }
  } catch (err) {
    return tp_postResp(tp_apiResp(false, null, '伺服器錯誤：' + err.message));
  }
}

// ====================================================================
// CONFIG API — verify / getConfig / listConfigs
// ====================================================================

function tp_handleConfigVerify(name) {
  const available = tp_getAllConfigNames();
  if (!available.includes(name)) {
    return tp_jsonResp({ status: 'error', message: '找不到設定檔：' + name });
  }
  return tp_jsonResp({
    status:     'ok',
    configName: name,
    updatedAt:  Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd'),
    version:    '1'
  });
}

function tp_handleConfigGet(name) {
  const config = tp_buildConfig(name);
  if (!config) {
    return tp_jsonResp({ status: 'error', message: '找不到設定檔：' + name });
  }
  const output = Object.assign({}, config);
  delete output._classType;
  return tp_jsonResp({ status: 'ok', config: output });
}

function tp_handleConfigList() {
  const names = tp_getAllConfigNames();
  return tp_jsonResp({ status: 'ok', configs: names, total: names.length });
}

// ── 動態生成設定檔 JSON ────────────────────────────────────────────

function tp_buildConfig(name) {
  const fp      = tp_readFormParams();
  const entries = tp_getClassEntries(fp.attendanceMode, fp.baseName);
  const entry   = entries.find(function(e) { return e.configName === name; });
  if (!entry) {
    Logger.log('tp_buildConfig: 找不到設定檔「' + name + '」');
    return null;
  }
  const classType = entry.classType;
  const fields = [];

  if (fp.typeEntry) {
    fields.push({ fieldType: 2, fieldName: '上課方式', ColumnName: fp.typeEntry, ColumnValue: classType });
  }
  if (fp.passEntry) {
    fields.push({ fieldType: 2, fieldName: '檢核密碼', ColumnName: fp.passEntry, ColumnValue: fp.password });
  }
  if (fp.idEntry) {
    fields.push({ fieldType: 1, fieldName: '檢核ID',   ColumnName: fp.idEntry });
  }
  if (fp.nameEntry) {
    fields.push({ fieldType: 1, fieldName: '檢核名稱', ColumnName: fp.nameEntry });
  }

  return {
    SettingName:     name,
    AfterScanAction: { ActionMode: 1, ToHtml: '' },
    GoWebSiteByScan: { ScanMode: fp.scanMode, SendHtml: fp.baseUrl },
    SettingField:    fields,
    _classType:      classType
  };
}

function tp_getAllConfigNames() {
  const fp = tp_readFormParams();
  return tp_getClassEntries(fp.attendanceMode, fp.baseName)
    .map(function(e) { return e.configName; });
}

/**
 * tp_getClassEntries — 從「班程」Sheet G/H 欄讀取班別資訊
 * 回傳: [{ code, displayName, classType, configName }]
 * configName 格式: "{baseName}-{displayName}-{classType}"
 * 例: "新系統-第一週日-實體1"
 */
function tp_getClassEntries(attendanceMode, baseName) {
  const mode = (attendanceMode || '').trim();
  const base = (baseName || '').trim();
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(TP_SHEET.SCHEDULES);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const maxCol  = Math.max(TP_SCHED_COL.CLASS_CODE, TP_SCHED_COL.CLASS_NAME) + 1;
  const data    = sheet.getRange(2, 1, sheet.getLastRow() - 1, maxCol).getValues();
  const seen    = new Set();
  const entries = [];

  data.forEach(function(row) {
    if (!row[0] && !row[TP_SCHED_COL.CLASS_CODE]) return;
    const code        = String(row[TP_SCHED_COL.CLASS_CODE] || '').trim();
    const displayName = String(row[TP_SCHED_COL.CLASS_NAME] || '').trim();
    if (!code || seen.has(code)) return;
    seen.add(code);

    const classType  = mode + code;
    const configName = (base        ? base        + '-' : '') +
                       (displayName ? displayName + '-' : '') +
                       classType;
    entries.push({ code: code, displayName: displayName, classType: classType, configName: configName });
  });

  entries.sort(function(a, b) {
    return a.code.localeCompare(b.code, undefined, { numeric: true });
  });
  return entries;
}

/**
 * tp_readFormParams — 讀取表單相關設定
 * 優先讀 prefUrl_Attend Named Range（解析所有 entry codes）
 * 備援讀 CheckInFormIDCol / CheckInFormNameCol
 */
function tp_readFormParams() {
  const prefUrl = String(tp_nr(TP_NR.PREF_URL) || '').trim();
  const parsed  = tp_parsePrefUrl(prefUrl);

  const formUrl  = String(tp_nr(TP_NR.FORM_URL)    || '').trim();
  const idNR     = tp_normEntry(String(tp_nr(TP_NR.ID_ENTRY)   || ''));
  const nameNR   = tp_normEntry(String(tp_nr(TP_NR.NAME_ENTRY) || ''));
  const passRaw  = String(tp_nr(TP_NR.QRCODE_PASS)  || '').trim();

  const ss         = SpreadsheetApp.getActiveSpreadsheet();
  const buildSheet = ss.getSheetByName(TP_SHEET.BUILD_INFO);
  let baseName = '', attendanceMode = '', scanMode = 2;

  if (buildSheet) {
    baseName = String(buildSheet.getRange(TP_BUILD_CELL.BASE_NAME).getValue()   || '').trim();
    const j1 = String(buildSheet.getRange(TP_BUILD_CELL.ATTEND_MODE).getValue() || '').trim();
    attendanceMode = j1.replace(/\d+$/, '');   // "實體3" → "實體"
    const n1 = Number(buildSheet.getRange(TP_BUILD_CELL.SCAN_MODE).getValue()   || 0);
    if (n1 > 0) scanMode = n1;
  }

  const baseUrl   = formUrl || parsed.baseUrl;
  const idEntry   = parsed.entries[TP_PH.ID]   || idNR;
  const nameEntry = parsed.entries[TP_PH.NAME] || nameNR;
  const passEntry = parsed.entries[TP_PH.PASS] || '';
  const typeEntry = parsed.entries[TP_PH.TYPE] || '';
  let   password  = passRaw.replace(/^['"]+|['"]+$/g, '');
  if (!password) password = 'pass';

  return {
    baseUrl: baseUrl, idEntry: idEntry, nameEntry: nameEntry,
    passEntry: passEntry, typeEntry: typeEntry,
    password: password, scanMode: scanMode,
    attendanceMode: attendanceMode, baseName: baseName
  };
}

function tp_parsePrefUrl(prefUrl) {
  const result = { baseUrl: '', entries: {} };
  if (!prefUrl) return result;
  const qIdx = prefUrl.indexOf('?');
  if (qIdx !== -1) {
    result.baseUrl = prefUrl.substring(0, qIdx)
      .replace('/viewform', '/formResponse') + '?usp=pp_url';
  }
  const qs = qIdx !== -1 ? prefUrl.substring(qIdx + 1) : prefUrl;
  qs.split('&').forEach(function(param) {
    const eqIdx = param.indexOf('=');
    if (eqIdx === -1) return;
    var key, val;
    try {
      key = decodeURIComponent(param.substring(0, eqIdx));
      val = decodeURIComponent(param.substring(eqIdx + 1));
    } catch(ex) {
      key = param.substring(0, eqIdx);
      val = param.substring(eqIdx + 1);
    }
    if (key.startsWith('entry.') && val.startsWith('___')) {
      result.entries[val] = '&' + key;
    }
  });
  return result;
}

function tp_normEntry(entry) {
  return entry ? entry.replace(/=+$/, '').trim() : '';
}

// ====================================================================
// DATA API — getCheckinLog / getActiveSchedule
// ====================================================================

/**
 * tp_apiGetCheckinLog
 * 即時讀取電子簽到 + 人工簽到記錄，按時間倒序回傳
 *
 * @param {Object} params
 *   date      {string}  查詢日期 "yyyy/M/d"，省略=今日
 *   classCode {string}  班別代碼 "3"，省略=查全部
 *   eStartRow {number}  電子簽到起始列（增量）
 *   mStartRow {number}  人工簽到起始列（增量）
 */
function tp_apiGetCheckinLog(params) {
  try {
    params = params || {};
    const ss  = SpreadsheetApp.getActiveSpreadsheet();
    const tz  = 'Asia/Taipei';

    // 目標日期
    const targetDate = params.date
      ? String(params.date)
      : Utilities.formatDate(new Date(), tz, 'yyyy/M/d');
    const classCode  = String(params.classCode || '').trim();

    const dateParts = targetDate.split('/');
    const targetMs  = new Date(
      parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2])
    ).setHours(0, 0, 0, 0);

    // 1. 從班程表查有效密碼
    const schedSheet   = ss.getSheetByName(TP_SHEET.SCHEDULES);
    const validVerifies = new Set();
    let   noVerifyReq   = false;

    if (schedSheet && schedSheet.getLastRow() >= 2) {
      const sData = schedSheet.getRange(
        2, 1, schedSheet.getLastRow() - 1,
        Math.max(TP_SCHED_COL.CLASS_CODE, TP_SCHED_COL.VERIFY) + 1
      ).getValues();

      sData.forEach(function(row) {
        if (!row[TP_SCHED_COL.DATE]) return;
        const d = new Date(row[TP_SCHED_COL.DATE]);
        d.setHours(0, 0, 0, 0);
        if (d.getTime() !== targetMs) return;
        const rowCode = String(row[TP_SCHED_COL.CLASS_CODE] || '').trim();
        if (classCode && rowCode !== classCode) return;
        const v = String(row[TP_SCHED_COL.VERIFY] || '').trim();
        if (v) validVerifies.add(v); else noVerifyReq = true;
      });
    }

    if (!noVerifyReq && validVerifies.size === 0) {
      return tp_apiResp(true, {
        records: [], date: targetDate, classCode: classCode, total: 0,
        nextERow: Math.max(2, parseInt(params.eStartRow) || 2),
        nextMRow: Math.max(2, parseInt(params.mStartRow) || 2),
        note: '該日期無符合的班程'
      }, null);
    }

    // 2. 讀取記錄
    const records = [];
    let nextERow = Math.max(2, parseInt(params.eStartRow) || 2);
    let nextMRow = Math.max(2, parseInt(params.mStartRow) || 2);

    // — 電子簽到
    const eSheet = ss.getSheetByName(TP_SHEET.ELECTRONIC_SIGN);
    if (eSheet) {
      const eLastData = tp_getLastDataRow(eSheet, TP_ESIGN_COL.TIMESTAMP + 1);
      if (eLastData >= nextERow) {
        const eCols = Math.max(
          TP_ESIGN_COL.TIMESTAMP, TP_ESIGN_COL.ID, TP_ESIGN_COL.NAME,
          TP_ESIGN_COL.SCHED_NOTE, TP_ESIGN_COL.VERIFY
        ) + 1;
        const eData = eSheet.getRange(nextERow, 1, eLastData - nextERow + 1, eCols).getValues();
        eData.forEach(function(row) {
          if (!row[TP_ESIGN_COL.ID]) return;
          const ts = row[TP_ESIGN_COL.TIMESTAMP] ? new Date(row[TP_ESIGN_COL.TIMESTAMP]) : null;
          if (!ts || isNaN(ts.getTime())) return;
          const rowDate = new Date(ts); rowDate.setHours(0,0,0,0);
          if (rowDate.getTime() !== targetMs) return;
          const rv = String(row[TP_ESIGN_COL.VERIFY] || '').trim();
          if (!noVerifyReq && !validVerifies.has(rv)) return;
          const sn = String(row[TP_ESIGN_COL.SCHED_NOTE] || '').trim();
          if (classCode && !sn.includes(classCode)) return;
          records.push({
            _ts: ts.getTime(),
            time: Utilities.formatDate(ts, tz, 'HH:mm:ss'),
            id:   String(row[TP_ESIGN_COL.ID]   || '').trim(),
            name: String(row[TP_ESIGN_COL.NAME]  || '').trim(),
            scheduleNote: sn,
            source: '電子'
          });
        });
        nextERow = eLastData + 1;
      }
    }

    // — 人工簽到
    const mSheet = ss.getSheetByName(TP_SHEET.MANUAL_SIGN);
    if (mSheet) {
      const mLastData = tp_getLastDataRow(mSheet, TP_MSIGN_COL.ID + 1);
      if (mLastData >= nextMRow) {
        const mCols = Math.max(
          TP_MSIGN_COL.FORM_TS, TP_MSIGN_COL.ID, TP_MSIGN_COL.NAME,
          TP_MSIGN_COL.SCHED_NOTE, TP_MSIGN_COL.CHECKIN_TS, TP_MSIGN_COL.VERIFY
        ) + 1;
        const mData = mSheet.getRange(nextMRow, 1, mLastData - nextMRow + 1, mCols).getValues();
        mData.forEach(function(row) {
          if (!row[TP_MSIGN_COL.ID]) return;
          const ts = (row[TP_MSIGN_COL.CHECKIN_TS] ? new Date(row[TP_MSIGN_COL.CHECKIN_TS])
                    : row[TP_MSIGN_COL.FORM_TS]    ? new Date(row[TP_MSIGN_COL.FORM_TS]) : null);
          if (!ts || isNaN(ts.getTime())) return;
          const rowDate = new Date(ts); rowDate.setHours(0,0,0,0);
          if (rowDate.getTime() !== targetMs) return;
          const rv = String(row[TP_MSIGN_COL.VERIFY] || '').trim();
          if (!noVerifyReq && !validVerifies.has(rv)) return;
          const sn = String(row[TP_MSIGN_COL.SCHED_NOTE] || '').trim();
          if (classCode && !sn.includes(classCode)) return;
          records.push({
            _ts: ts.getTime(),
            time: Utilities.formatDate(ts, tz, 'HH:mm:ss'),
            id:   String(row[TP_MSIGN_COL.ID]   || '').trim(),
            name: String(row[TP_MSIGN_COL.NAME]  || '').trim(),
            scheduleNote: sn,
            source: '人工'
          });
        });
        nextMRow = mLastData + 1;
      }
    }

    // 3. 時間倒序，移除內部 _ts
    records.sort(function(a, b) { return b._ts - a._ts; });
    const result = records.map(function(r) {
      return { time: r.time, id: r.id, name: r.name, scheduleNote: r.scheduleNote, source: r.source };
    });

    return tp_apiResp(true, {
      records: result, date: targetDate, classCode: classCode,
      total: result.length, nextERow: nextERow, nextMRow: nextMRow
    }, null);

  } catch(e) {
    Logger.log('tp_apiGetCheckinLog 錯誤: ' + e.message + '\n' + e.stack);
    return tp_apiResp(false, null, e.message);
  }
}

/**
 * tp_apiGetActiveSchedule
 * 回傳今日（或最近一次）啟用班程資訊
 */
function tp_apiGetActiveSchedule(params) {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(TP_SHEET.SCHEDULES);
    if (!sheet) throw new Error('找不到「' + TP_SHEET.SCHEDULES + '」工作表');

    const today = new Date(); today.setHours(23, 59, 59, 0);
    const lastRow = sheet.getLastRow();
    const readCols = Math.max(
      TP_SCHED_COL.DATE, TP_SCHED_COL.VERIFY, TP_SCHED_COL.CLASS_CODE, TP_SCHED_COL.CLASS_NAME
    ) + 1;
    const data = lastRow >= 2
      ? sheet.getRange(2, 1, lastRow - 1, readCols).getValues()
      : [];

    let latestDate = null, latestClass = '', latestCode = '', latestVerify = '';

    data.forEach(function(row) {
      if (!row[TP_SCHED_COL.DATE]) return;
      const d = new Date(row[TP_SCHED_COL.DATE]);
      if (isNaN(d.getTime())) return;
      if (d <= today && (!latestDate || d > latestDate)) {
        latestDate   = d;
        latestClass  = String(row[TP_SCHED_COL.CLASS_NAME] || '');
        latestCode   = String(row[TP_SCHED_COL.CLASS_CODE] || '');
        latestVerify = String(row[TP_SCHED_COL.VERIFY]     || '');
      }
    });

    const dateStr = latestDate
      ? (latestDate.getFullYear() + '/' + (latestDate.getMonth()+1) + '/' + latestDate.getDate())
      : '';

    return tp_apiResp(true, {
      date:        dateStr,
      className:   latestClass,
      classCode:   latestCode,
      verify:      latestVerify,
      checkInFormUrl: String(tp_nr(TP_NR.FORM_URL) || '')
    }, null);

  } catch(e) {
    Logger.log('tp_apiGetActiveSchedule 錯誤: ' + e.message);
    return tp_apiResp(false, null, e.message);
  }
}

// ====================================================================
// 選單功能 — QR Code 對話框
// ====================================================================
function tp_showConfigQRCodeDialog() {
  const ui    = SpreadsheetApp.getUi();
  const names = tp_getAllConfigNames();

  if (names.length === 0) {
    ui.alert('⚠️ 無可用設定檔',
      '請確認：\n1. 「' + TP_SHEET.SCHEDULES + '」G欄有班別代碼\n' +
      '2. 「' + TP_SHEET.SCHEDULES + '」H欄有顯示名稱\n' +
      '3. 「' + TP_SHEET.BUILD_INFO + '」J1 有出勤模式（例："實體3"）',
      ui.ButtonSet.OK);
    return;
  }

  let webAppUrl = '';
  try {
    webAppUrl = (PropertiesService.getScriptProperties()
      .getProperty(TP_PROP_WEB_APP_URL) || '').trim();
  } catch(e) { /* 略過 */ }

  if (!webAppUrl) {
    ui.alert('⚠️ 尚未設定 Web App URL',
      '請至「專案設定 → 指令碼屬性」新增：\n\n' +
      '屬性名稱：' + TP_PROP_WEB_APP_URL + '\n' +
      '值：https://script.google.com/macros/s/（部署ID）/exec',
      ui.ButtonSet.OK);
    return;
  }

  const optHtml = names
    .map(function(n) { return '<option value="' + n.replace(/"/g,'&quot;') + '">' + n + '</option>'; })
    .join('');

  const html = HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
    'body{font-family:Arial,sans-serif;background:#f8f9fa;padding:20px;color:#333}' +
    'h2{font-size:16px;color:#1a73e8;margin-bottom:14px}' +
    'label{font-size:12px;color:#555;display:block;margin-bottom:4px}' +
    'select{width:100%;padding:9px;font-size:14px;border:1px solid #ccc;border-radius:6px;background:#fff}' +
    '#qr-wrap{margin-top:18px;background:#fff;border:1px solid #e0e0e0;border-radius:10px;padding:18px;text-align:center}' +
    '#cfg-label{font-size:13px;font-weight:bold;color:#1a73e8;margin-bottom:8px}' +
    '#url-box{background:#f1f3f4;border-radius:6px;padding:8px;font-size:11px;color:#555;word-break:break-all;text-align:left;line-height:1.5}' +
    '.hint{margin-top:10px;font-size:11px;color:#888}' +
    '</style></head><body>' +
    '<h2>📱 設定檔 QR Code</h2>' +
    '<label>選擇設定檔名稱：</label>' +
    '<select id="sel" onchange="refresh()">' + optHtml + '</select>' +
    '<div id="qr-wrap"><div id="cfg-label"></div>' +
    '<img id="qr-img" src="" width="280" height="280" alt="QR Code"/>' +
    '<div id="url-box"></div>' +
    '<p class="hint">用 QRPWA 掃描此 QR Code 即可載入設定檔</p></div>' +
    '<script>var BASE=' + JSON.stringify(webAppUrl) + ';' +
    'function refresh(){' +
    'var n=document.getElementById("sel").value;' +
    'var u=BASE+"?action=getConfig&name="+encodeURIComponent(n);' +
    'document.getElementById("cfg-label").textContent=n;' +
    'document.getElementById("qr-img").src="https://api.qrserver.com/v1/create-qr-code/?size=500x500&margin=50&data="+encodeURIComponent(u);' +
    'document.getElementById("url-box").textContent=u;}' +
    'refresh();</script></body></html>'
  ).setWidth(380).setHeight(520);

  ui.showModalDialog(html, '📱 設定檔 QR Code');
}

// ====================================================================
// 診斷 & 測試函式
// ====================================================================

/**
 * tp_runSetupDiagnostic
 * 執行此函式確認所有設定正確，移植後第一步
 */
function tp_runSetupDiagnostic() {
  Logger.log('=== QRPWA API 移植診斷 ===');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let ok = true;

  // 1. 檢查 Sheet 是否存在
  Logger.log('\n【Sheet 存在性】');
  Object.entries(TP_SHEET).forEach(function(kv) {
    const key = kv[0], name = kv[1];
    const exists = !!ss.getSheetByName(name);
    Logger.log((exists ? '  ✅' : '  ❌') + ' ' + key + ' = 「' + name + '」');
    if (!exists) ok = false;
  });

  // 2. 檢查建置系統注意事項欄位
  Logger.log('\n【建置系統注意事項】');
  const bSheet = ss.getSheetByName(TP_SHEET.BUILD_INFO);
  if (bSheet) {
    Object.entries(TP_BUILD_CELL).forEach(function(kv) {
      const key = kv[0], cell = kv[1];
      const val = String(bSheet.getRange(cell).getValue() || '');
      Logger.log('  ' + key + ' (' + cell + ') = ' + (val || '(空白)'));
    });
  }

  // 3. 檢查 Named Ranges
  Logger.log('\n【Named Ranges】');
  Object.entries(TP_NR).forEach(function(kv) {
    const key = kv[0], nrName = kv[1];
    const val = tp_nr(nrName);
    const found = val !== null;
    Logger.log((found ? '  ✅' : '  ⚠️') + ' ' + key + ' (' + nrName + ') = ' +
      (found ? String(val).substring(0, 60) : '(未找到)'));
  });

  // 4. 檢查指令碼屬性
  Logger.log('\n【指令碼屬性】');
  const webUrl = (PropertiesService.getScriptProperties().getProperty(TP_PROP_WEB_APP_URL) || '');
  Logger.log((webUrl ? '  ✅' : '  ⚠️') + ' WEB_APP_URL = ' + (webUrl || '(未設定)'));

  // 5. 讀取 formParams 並顯示
  Logger.log('\n【表單參數解析】');
  const fp = tp_readFormParams();
  Logger.log('  baseName      = ' + fp.baseName);
  Logger.log('  attendanceMode= ' + fp.attendanceMode);
  Logger.log('  scanMode      = ' + fp.scanMode);
  Logger.log('  password      = ' + fp.password);
  Logger.log('  baseUrl       = ' + fp.baseUrl.substring(0, 70));
  Logger.log('  idEntry       = ' + fp.idEntry);
  Logger.log('  nameEntry     = ' + fp.nameEntry);
  Logger.log('  passEntry     = ' + fp.passEntry);
  Logger.log('  typeEntry     = ' + fp.typeEntry);

  // 6. 列出可用設定檔
  Logger.log('\n【可用設定檔】');
  const names = tp_getAllConfigNames();
  if (names.length > 0) {
    names.forEach(function(n, i) { Logger.log('  ' + (i+1) + '. ' + n); });
  } else {
    Logger.log('  ⚠️ 無可用設定檔（請確認 班程G/H欄 與 建置系統注意事項J1）');
    ok = false;
  }

  Logger.log('\n' + (ok ? '✅ 診斷通過！可以部署 Web App。' : '❌ 診斷未通過，請修正上方標示 ❌/⚠️ 的項目。'));
}

/** 測試：列出所有設定檔名稱 */
function tp_testListConfigs() {
  Logger.log('== tp_testListConfigs ==');
  const names = tp_getAllConfigNames();
  Logger.log('共 ' + names.length + ' 個設定檔:');
  names.forEach(function(n, i) { Logger.log('  ' + (i+1) + '. ' + n); });

  // 順便測試第一個 getConfig
  if (names.length > 0) {
    Logger.log('\n第一個設定檔內容:');
    const r = tp_handleConfigGet(names[0]);
    Logger.log(r.getContent());
  }
}

/** 測試：今日 getCheckinLog */
function tp_testCheckinLogToday() {
  const tz   = 'Asia/Taipei';
  const date = Utilities.formatDate(new Date(), tz, 'yyyy/M/d');
  Logger.log('== tp_testCheckinLogToday | 日期: ' + date + ' ==');
  const result = tp_apiGetCheckinLog({ date: date });
  Logger.log('success: ' + result.success);
  if (result.success) {
    const d = result.data;
    Logger.log('日期: ' + d.date + ' | 班別: ' + (d.classCode || '全部') + ' | 總筆數: ' + d.total);
    if (d.note) Logger.log('備註: ' + d.note);
    (d.records || []).slice(0, 5).forEach(function(r, i) {
      Logger.log((i+1) + '. [' + r.source + '] ' + r.time + '  ' + r.name + '(' + r.id + ')  ' + r.scheduleNote);
    });
  } else {
    Logger.log('錯誤: ' + result.error);
  }
}

// ====================================================================
// 共用工具函式
// ====================================================================

/** 讀取 Named Range 值，找不到回傳 null */
function tp_nr(rangeName) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const nr = ss.getRangeByName(rangeName);
    return nr ? nr.getValue() : null;
  } catch(e) {
    return null;
  }
}

/** 取得指定欄位最後一筆有資料的列號 */
function tp_getLastDataRow(sheet, col) {
  if (!sheet) return 1;
  const maxRow = sheet.getMaxRows();
  const lastCell = sheet.getRange(maxRow, col);
  return lastCell.isBlank()
    ? lastCell.getNextDataCell(SpreadsheetApp.Direction.UP).getRow()
    : maxRow;
}

/** 建立統一 API 回應物件 */
function tp_apiResp(success, data, error) {
  return {
    success:   success,
    data:      data  || null,
    error:     error || null,
    timestamp: Utilities.formatDate(new Date(), 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ssXXX")
  };
}

/** doGet JSON 回應 */
function tp_jsonResp(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** doPost JSON 回應 */
function tp_postResp(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
