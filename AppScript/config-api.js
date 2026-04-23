/**
 * ====================================================================
 * config-api.js — 設定檔 API：動態依班別生成 SettingProfile
 * ====================================================================
 * 版本: 4.0.0
 * 策略: 不依賴靜態登錄表，由系統現有資料動態組合
 *
 * ── 班別清單生成邏輯（v4 修正重點）────────────────────────────────────
 *
 *   classType = attendanceMode + G班別代碼
 *     attendanceMode = 建置系統注意事項!J1 去除尾部數字
 *                      例："實體3" → "實體"
 *     G班別代碼      = 班程 Sheet G欄（index 6）不重複值
 *                      例："1", "2", "3", ..., "7"
 *   → classType 例："實體1", "實體2", "實體3", ..., "實體7"
 *   → 與現有 K1 SettingName="天達大班-實體3" 完全吻合
 *
 * ── 資料來源 ─────────────────────────────────────────────────────────
 *
 *  A. 表單 entry code（四個欄位）
 *     主要：解析 Named Range「prefUrl_Attend」（預填網址）
 *       ___ID   → fieldType:1  fieldName:"檢核ID"
 *       ___NAME → fieldType:1  fieldName:"檢核名稱"
 *       ___PASS → fieldType:2  fieldName:"檢核密碼"
 *       ___TYPE → fieldType:2  fieldName:"上課方式"
 *     備援：Named Range CheckInFormIDCol / CheckInFormNameCol
 *     ⚠️ 建置系統注意事項!D5/F5 不使用（標籤錯誤，且 prefUrl_Attend 已完整涵蓋）
 *
 *  B. 表單回應基礎 URL（SendHtml）
 *     主要：CheckInFormURL Named Range
 *     備援：由 prefUrl_Attend 路徑轉換（/viewform → /formResponse）
 *
 *  C. 班別清單 → 見上方邏輯
 *
 *  D. 其他參數
 *     attendanceMode: 建置系統注意事項!J1 去尾數字（例："實體3" → "實體"）
 *     ScanMode:       建置系統注意事項!N1 → 預設 2
 *     密碼值:         paramQRCodePass Named Range（值含 "..."，需去除引號）→ 預設 "pass"
 *     ActionMode:     固定 1
 *     ToHtml:         固定 ""（K1 JSON 確認）
 *     baseName:       建置系統注意事項!B1（例："天達大班"）
 *
 * ── API 呼叫格式 ─────────────────────────────────────────────────────
 *
 *   GET ?action=verify&name=天達大班-實體3
 *   GET ?action=getConfig&name=天達大班-實體3
 *   GET ?action=listConfigs                    ← 列出所有可用設定檔名稱
 *
 * ── 執行診斷確認 ─────────────────────────────────────────────────────
 *   testReadFormParams()       → 確認所有參數讀取正確
 *   analyzeFormParams()        → 深度確認 entry codes 對應
 *   analyzeScheduleClasses()   → 確認 G欄班別代碼
 *   testListConfigs()          → 確認產生的設定檔名稱清單
 *   testConfigGetAll()         → 完整測試所有班別
 * ====================================================================
 */

// ─────────────────────────────────────────────────────────────────────
// Named Range 常數
// ─────────────────────────────────────────────────────────────────────
const NR_PREF_URL    = 'prefUrl_Attend';     // 含所有欄位的預填表單 URL（主要 entry code 來源）
const NR_FORM_URL    = 'CheckInFormURL';     // 表單回應基礎 URL（SendHtml）
const NR_ID_ENTRY    = 'CheckInFormIDCol';   // ID entry 備援（可能含尾部 = 號）
const NR_NAME_ENTRY  = 'CheckInFormNameCol'; // NAME entry 備援（可能含尾部 = 號）
const NR_QRCODE_PASS = 'paramQRCodePass';    // 密碼值（含 "..." 引號，需去除）

// ─────────────────────────────────────────────────────────────────────
// 「建置系統注意事項」Sheet 常數
// ─────────────────────────────────────────────────────────────────────
const BUILD_SHEET       = '建置系統注意事項';
const BUILD_BASE_NAME   = 'B1';  // 班別基礎名稱（例："天達大班"）
const BUILD_ATTEND_MODE = 'J1';  // 出勤模式字串（例："實體3" → 去尾數字 → "實體"）
const BUILD_SCAN_MODE   = 'N1';  // ScanMode 數值（例：2）
// E5 = formResponseURL（作為 CheckInFormURL 的備援）
// D5/F5 不使用 — 標籤有誤且 prefUrl_Attend 已完整涵蓋所有 entry codes

// ─────────────────────────────────────────────────────────────────────
// 「班程」Sheet 欄位（0-indexed）
// ─────────────────────────────────────────────────────────────────────
const SCHED_COL_CODE = 6;   // G欄：班別代碼（"1"~"7"，同日多班用）
// H欄 (index 7)：顯示班別名稱（例："第三週日"）— 不用於 classType 組合

// ─────────────────────────────────────────────────────────────────────
// prefUrl_Attend 預填佔位符（解析 entry code 用）
// ─────────────────────────────────────────────────────────────────────
const PH = {
  ID:   '___ID',    // → fieldType:1  fieldName:"檢核ID"
  NAME: '___NAME',  // → fieldType:1  fieldName:"檢核名稱"
  PASS: '___PASS',  // → fieldType:2  fieldName:"檢核密碼"
  TYPE: '___TYPE'   // → fieldType:2  fieldName:"上課方式"
};

// ─────────────────────────────────────────────────────────────────────
// 主要 API 處理函式（由 doGet 呼叫）
// ─────────────────────────────────────────────────────────────────────

/**
 * handleConfigVerify — 驗證設定檔（班別）是否存在
 * GET ?action=verify&name={設定檔名稱}
 */
function handleConfigVerify(name) {
  if (!name) {
    return configJsonResponse({ status: 'error', message: '缺少參數：name' });
  }
  const available = getAllAvailableConfigNames();
  if (!available.includes(name)) {
    return configJsonResponse({ status: 'error', message: '找不到設定檔：' + name });
  }
  return configJsonResponse({
    status:     'ok',
    configName: name,
    updatedAt:  Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd'),
    version:    '1'
  });
}

/**
 * handleConfigGet — 取得完整設定檔 JSON
 * GET ?action=getConfig&name={設定檔名稱}
 */
function handleConfigGet(name) {
  if (!name) {
    return configJsonResponse({ status: 'error', message: '缺少參數：name' });
  }
  const config = buildDynamicConfig(name);
  if (!config) {
    return configJsonResponse({ status: 'error', message: '找不到設定檔：' + name });
  }
  // 移除內部欄位後回傳
  const output = Object.assign({}, config);
  delete output._classType;
  return configJsonResponse({ status: 'ok', config: output });
}

/**
 * handleConfigList — 列出所有可用的設定檔名稱
 * GET ?action=listConfigs
 */
function handleConfigList() {
  const names = getAllAvailableConfigNames();
  return configJsonResponse({
    status:  'ok',
    configs: names,
    total:   names.length
  });
}

// ─────────────────────────────────────────────────────────────────────
// 核心：動態生成 SettingProfile
// ─────────────────────────────────────────────────────────────────────

/**
 * buildDynamicConfig — 依設定檔名稱動態生成完整 SettingProfile
 *
 * 流程：
 * 1. 讀取系統參數（baseName、attendanceMode、entry codes 等）
 * 2. 從名稱提取 classType（去除 "baseName-" 前綴）
 * 3. 驗證 classType 存在於可用班別清單
 * 4. 組合 SettingProfile JSON
 *
 * @param  {string} name  設定檔名稱，例："天達大班-實體3"
 * @returns {Object|null}
 */
function buildDynamicConfig(name) {
  // 1. 讀取系統參數
  const fp = readFormParams_();

  // 2. 從名稱提取 classType
  //    "天達大班-實體3" + baseName="天達大班" → classType="實體3"
  const classType = extractClassType_(name, fp.baseName);

  // 3. 驗證 classType 存在
  const availableTypes = getAvailableClassTypes_(fp.attendanceMode);
  if (availableTypes.length > 0 && !availableTypes.includes(classType)) {
    Logger.log('buildDynamicConfig: 班別「' + classType + '」不在可用清單中');
    Logger.log('  可用班別: [' + availableTypes.join(', ') + ']');
    return null;
  }

  // 4. 組合 SettingField
  //    順序：上課方式（固定值）→ 檢核密碼（固定值）→ 檢核ID（掃描）→ 檢核名稱（掃描）
  const fields = [];

  if (fp.typeEntry) {
    fields.push({
      fieldType:   2,
      fieldName:   '上課方式',
      ColumnName:  fp.typeEntry,
      ColumnValue: classType       // 例："實體3"
    });
  }

  if (fp.passEntry) {
    fields.push({
      fieldType:   2,
      fieldName:   '檢核密碼',
      ColumnName:  fp.passEntry,
      ColumnValue: fp.password     // 例："pass"
    });
  }

  if (fp.idEntry) {
    fields.push({
      fieldType:  1,
      fieldName:  '檢核ID',
      ColumnName: fp.idEntry
    });
  }

  if (fp.nameEntry) {
    fields.push({
      fieldType:  1,
      fieldName:  '檢核名稱',
      ColumnName: fp.nameEntry
    });
  }

  return {
    SettingName:     name,
    AfterScanAction: {
      ActionMode: fp.actionMode,
      ToHtml:     ''          // K1 JSON 確認固定為空字串
    },
    GoWebSiteByScan: {
      ScanMode: fp.scanMode,
      SendHtml: fp.baseUrl
    },
    SettingField: fields,
    _classType: classType     // 內部用，回傳前移除
  };
}

// ─────────────────────────────────────────────────────────────────────
// 班別清單（來源：班程 Sheet G欄 × 建置系統注意事項!J1）
// ─────────────────────────────────────────────────────────────────────

/**
 * getAllAvailableConfigNames
 * 返回所有可用設定檔完整名稱（格式：{baseName}-{classType}）
 * @returns {string[]}
 */
function getAllAvailableConfigNames() {
  const fp    = readFormParams_();
  const types = getAvailableClassTypes_(fp.attendanceMode);
  return types.map(type => (fp.baseName ? fp.baseName + '-' + type : type));
}

/**
 * getAvailableClassTypes_ (private)
 *
 * 從「班程」Sheet G欄讀取不重複的班別代碼，
 * 與 attendanceMode 組合產生完整 classType。
 *
 * 範例：
 *   attendanceMode = "實體"（由 J1="實體3" 去尾數字得到）
 *   G欄唯一值      = ["1","2","3","4","5","6","7"]
 *   → classType    = ["實體1","實體2","實體3","實體4","實體5","實體6","實體7"]
 *
 * @param  {string} attendanceMode  已去除尾部數字的模式字串（例："實體"）
 * @returns {string[]}
 */
function getAvailableClassTypes_(attendanceMode) {
  const mode = (attendanceMode || '').trim();

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('班程');
  if (!sheet || sheet.getLastRow() < 2) return [];

  const lastRow = sheet.getLastRow();
  // 只讀到 G欄（index 6 → 第7欄）
  const data = sheet.getRange(2, 1, lastRow - 1, SCHED_COL_CODE + 1).getValues();

  const codes = new Set();
  data.forEach(row => {
    // 跳過空列（以第一欄是否有值判斷）
    if (!row[0] && !row[SCHED_COL_CODE]) return;
    const codeG = String(row[SCHED_COL_CODE] || '').trim();
    if (codeG) codes.add(codeG);
  });

  // 依代碼排序後拼接模式：mode + code
  return Array.from(codes)
    .sort()
    .map(code => mode + code);
}

// ─────────────────────────────────────────────────────────────────────
// 表單參數讀取（entry codes、URL、密碼、ScanMode、attendanceMode）
// ─────────────────────────────────────────────────────────────────────

/**
 * readFormParams_ (private)
 *
 * 讀取並整合所有表單相關參數，供 buildDynamicConfig 使用。
 *
 * 優先順序：
 *   entry codes:     prefUrl_Attend 解析（主）> CheckInFormIDCol/NameCol Named Range（備）
 *   baseUrl:         CheckInFormURL Named Range（主）> prefUrl_Attend 路徑轉換（備）
 *   attendanceMode:  建置系統注意事項!J1 去尾數字
 *   scanMode:        建置系統注意事項!N1 > 預設 2
 *   password:        paramQRCodePass Named Range 去引號 > 預設 "pass"
 *   baseName:        建置系統注意事項!B1
 *   actionMode:      固定 1
 *   toHtml:          固定 ""（K1 JSON 確認）
 *
 * @returns {{
 *   baseUrl: string,
 *   idEntry: string, nameEntry: string, passEntry: string, typeEntry: string,
 *   password: string, scanMode: number, attendanceMode: string,
 *   baseName: string, actionMode: number, toHtml: string
 * }}
 */
function readFormParams_() {
  // ── Step 1: 解析 prefUrl_Attend（主要 entry code 來源）────────────
  const prefUrl = String(getNamedRangeValue_(NR_PREF_URL) || '').trim();
  const parsed  = parsePrefUrl_(prefUrl);

  // ── Step 2: Named Range 備援 entry codes ──────────────────────────
  const formUrl  = String(getNamedRangeValue_(NR_FORM_URL)    || '').trim();
  const idNR     = normalizeEntry_(String(getNamedRangeValue_(NR_ID_ENTRY)   || ''));
  const nameNR   = normalizeEntry_(String(getNamedRangeValue_(NR_NAME_ENTRY) || ''));

  // paramQRCodePass 含 "..." 引號 → 去除
  const passRaw  = String(getNamedRangeValue_(NR_QRCODE_PASS) || '').trim();
  let password   = passRaw.replace(/^['"]+|['"]+$/g, '');
  if (!password) password = 'pass';

  // ── Step 3: 讀取「建置系統注意事項」────────────────────────────────
  const ss         = SpreadsheetApp.getActiveSpreadsheet();
  const buildSheet = ss.getSheetByName(BUILD_SHEET);

  let baseName       = '';
  let attendanceMode = '';   // 去除尾數後的模式，例 "實體"
  let scanMode       = 2;    // 預設值

  if (buildSheet) {
    baseName = String(buildSheet.getRange(BUILD_BASE_NAME).getValue() || '').trim();

    // J1: 出勤模式完整字串 → 去除尾部連續數字
    const j1Raw = String(buildSheet.getRange(BUILD_ATTEND_MODE).getValue() || '').trim();
    attendanceMode = j1Raw.replace(/\d+$/, '');   // "實體3" → "實體"

    // N1: ScanMode 數值
    const n1Val = Number(buildSheet.getRange(BUILD_SCAN_MODE).getValue() || 0);
    if (n1Val > 0) scanMode = n1Val;
  }

  // ── Step 4: 整合（各欄位獨立 fallback）──────────────────────────
  const baseUrl   = formUrl || parsed.baseUrl;
  const idEntry   = parsed.entries[PH.ID]   || idNR;
  const nameEntry = parsed.entries[PH.NAME] || nameNR;
  const passEntry = parsed.entries[PH.PASS] || '';    // 僅來自 prefUrl_Attend
  const typeEntry = parsed.entries[PH.TYPE] || '';    // 僅來自 prefUrl_Attend

  const actionMode = 1;   // AfterScanAction.ActionMode 固定為 1
  const toHtml     = '';  // K1 JSON 確認固定為空字串

  Logger.log([
    'readFormParams_:',
    '  baseName=' + baseName,
    '  attendanceMode=' + attendanceMode,
    '  scanMode=' + scanMode,
    '  password=' + password,
    '  baseUrl=' + baseUrl.substring(0, 70),
    '  idEntry=' + idEntry,
    '  nameEntry=' + nameEntry,
    '  passEntry=' + passEntry,
    '  typeEntry=' + typeEntry
  ].join('\n'));

  return {
    baseUrl, idEntry, nameEntry, passEntry, typeEntry,
    password, scanMode, attendanceMode, baseName,
    actionMode, toHtml
  };
}

/**
 * parsePrefUrl_ (private)
 *
 * 解析 prefUrl_Attend（含 ___PLACEHOLDER 的預填 Google 表單 URL）
 * 取得 baseUrl 與 entry code → placeholder 對應表。
 *
 * 輸入範例:
 *   https://.../viewform?usp=pp_url&entry.630960409=___ID&entry.2000621713=___NAME&...
 * 輸出:
 *   {
 *     baseUrl: "https://.../formResponse?usp=pp_url",
 *     entries: {
 *       "___ID":   "&entry.630960409",
 *       "___NAME": "&entry.2000621713",
 *       "___PASS": "&entry.2128549517",
 *       "___TYPE": "&entry.1907408482"
 *     }
 *   }
 *
 * @param  {string} prefUrl
 * @returns {{ baseUrl: string, entries: Object.<string,string> }}
 */
function parsePrefUrl_(prefUrl) {
  const result = { baseUrl: '', entries: {} };
  if (!prefUrl) return result;

  // 提取 baseUrl（/viewform → /formResponse）
  const qIdx = prefUrl.indexOf('?');
  if (qIdx !== -1) {
    result.baseUrl = prefUrl.substring(0, qIdx)
      .replace('/viewform', '/formResponse') + '?usp=pp_url';
  }

  // 解析 query string
  const qs = qIdx !== -1 ? prefUrl.substring(qIdx + 1) : prefUrl;
  qs.split('&').forEach(param => {
    const eqIdx = param.indexOf('=');
    if (eqIdx === -1) return;
    let key, val;
    try {
      key = decodeURIComponent(param.substring(0, eqIdx));
      val = decodeURIComponent(param.substring(eqIdx + 1));
    } catch (e) {
      key = param.substring(0, eqIdx);
      val = param.substring(eqIdx + 1);
    }
    // 只取 entry.xxx = ___PLACEHOLDER 格式
    if (key.startsWith('entry.') && val.startsWith('___')) {
      result.entries[val] = '&' + key;
    }
  });

  return result;
}

/**
 * extractClassType_ (private)
 *
 * 從設定檔名稱中提取 classType（去除 baseName 前綴）
 *   "天達大班-實體3" + baseName="天達大班" → "實體3"
 *   "實體3"          + baseName=""         → "實體3"（直接使用）
 */
function extractClassType_(name, baseName) {
  const prefix = baseName ? baseName + '-' : '';
  if (prefix && name.startsWith(prefix)) {
    return name.substring(prefix.length);
  }
  // 不含 baseName 前綴 → 取最後一個 "-" 後的部分（容錯）
  const dashIdx = name.lastIndexOf('-');
  if (dashIdx !== -1 && baseName) {
    return name.substring(dashIdx + 1);
  }
  return name;
}

/**
 * normalizeEntry_ (private)
 * 標準化 entry code：去除尾部 = 號，確保格式為 &entry.xxx 或 entry.xxx
 */
function normalizeEntry_(entry) {
  if (!entry) return '';
  return entry.replace(/=+$/, '').trim();
}

/**
 * getNamedRangeValue_ (private)
 * 安全讀取 Named Range 值；找不到時回傳 null
 */
function getNamedRangeValue_(rangeName) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const nr = ss.getRangeByName(rangeName);
    return nr ? nr.getValue() : null;
  } catch (e) {
    Logger.log('getNamedRangeValue_(' + rangeName + ') 錯誤: ' + e.message);
    return null;
  }
}

/**
 * configJsonResponse — 輸出 JSON ContentService 回應
 */
function configJsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─────────────────────────────────────────────────────────────────────
// 測試函式（在 Apps Script 編輯器直接執行）
// ─────────────────────────────────────────────────────────────────────

/**
 * 測試1：確認所有系統參數讀取正確
 */
function testReadFormParams() {
  Logger.log('== testReadFormParams ==');
  const fp = readFormParams_();
  Logger.log('baseName:       ' + fp.baseName);
  Logger.log('attendanceMode: ' + fp.attendanceMode);
  Logger.log('scanMode:       ' + fp.scanMode);
  Logger.log('password:       ' + fp.password);
  Logger.log('baseUrl:        ' + fp.baseUrl);
  Logger.log('idEntry:        ' + fp.idEntry);
  Logger.log('nameEntry:      ' + fp.nameEntry);
  Logger.log('passEntry:      ' + fp.passEntry);
  Logger.log('typeEntry:      ' + fp.typeEntry);
  Logger.log('actionMode:     ' + fp.actionMode);
  Logger.log('toHtml:         "' + fp.toHtml + '"');
  Logger.log('');
  Logger.log('可用班別類型: [' + getAvailableClassTypes_(fp.attendanceMode).join(', ') + ']');
  Logger.log('可用設定檔名: [' + getAllAvailableConfigNames().join(', ') + ']');
}

/**
 * 測試2：列出所有可用的設定檔名稱
 */
function testListConfigs() {
  Logger.log('== testListConfigs ==');
  const names = getAllAvailableConfigNames();
  Logger.log('共 ' + names.length + ' 個設定檔:');
  names.forEach((n, i) => Logger.log('  ' + (i + 1) + '. ' + n));
}

/**
 * 測試3：逐一測試所有設定檔的 getConfig
 */
function testConfigGetAll() {
  Logger.log('== testConfigGetAll ==');
  const names = getAllAvailableConfigNames();
  if (names.length === 0) {
    Logger.log('⚠️ 無可用設定檔 — 請確認「班程」G欄有班別代碼，且 J1 有出勤模式');
    return;
  }
  names.forEach(name => {
    const result = handleConfigGet(name);
    try {
      const parsed = JSON.parse(result.getContent());
      if (parsed.status === 'ok') {
        const c = parsed.config;
        const gws = c.GoWebSiteByScan || {};
        const asa = c.AfterScanAction || {};
        Logger.log('✅ 「' + name + '」');
        Logger.log('   ScanMode=' + gws.ScanMode +
          ' | ActionMode=' + asa.ActionMode +
          ' | ToHtml="' + asa.ToHtml + '"');
        Logger.log('   SendHtml=' + (gws.SendHtml || '').substring(0, 70));
        Logger.log('   SettingField(' + (c.SettingField || []).length + '個): ' +
          (c.SettingField || []).map(f =>
            f.fieldName +
            (f.ColumnValue !== undefined ? '="' + f.ColumnValue + '"' : '') +
            '@' + f.ColumnName
          ).join(', '));
      } else {
        Logger.log('❌ 「' + name + '」 → ' + parsed.message);
      }
    } catch (e) {
      Logger.log('❌ 「' + name + '」 → JSON解析失敗: ' + e.message);
    }
  });
}

/**
 * 測試4：完整模擬 API 呼叫（listConfigs → verify → getConfig）
 */
function testFullApiFlow() {
  Logger.log('== testFullApiFlow ==');

  Logger.log('─ Step0: listConfigs ─');
  const lResult = handleConfigList();
  Logger.log(lResult.getContent());

  const names = getAllAvailableConfigNames();
  if (names.length === 0) {
    Logger.log('⚠️ 無可用設定檔，流程結束');
    return;
  }

  // 挑選第一個（通常是 "天達大班-實體1"）與「天達大班-實體3"（對應現有 K1）
  const testCandidates = names.filter(n => n.includes('3')).concat(names);
  const testName = testCandidates[0];
  Logger.log('\n使用設定檔: ' + testName);

  Logger.log('\n─ Step1: verify ─');
  Logger.log(handleConfigVerify(testName).getContent());

  Logger.log('\n─ Step2: getConfig ─');
  Logger.log(handleConfigGet(testName).getContent());
}

/**
 * 測試5：testConfigList（API 格式的 listConfigs）
 */
function testConfigList() {
  Logger.log('== testConfigList (API) ==');
  const result = handleConfigList();
  Logger.log(result.getContent());
}
