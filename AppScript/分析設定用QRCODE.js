/**
 * ====================================================================
 * 分析設定用QRCODE.js — 診斷工具集
 * ====================================================================
 * 包含三組分析函式：
 *
 *  1. analyzeQrcodeSheet()       ← 分析「設定用QRCODE」Sheet 結構（原始）
 *  2. analyzeFormParams()        ← 分析 config-api 所需的所有關鍵參數
 *  3. analyzeScheduleClasses()   ← 分析「班程」Sheet 的班別名稱與密碼
 *
 * 建議執行順序：
 *   先執行 analyzeFormParams()，再執行 analyzeScheduleClasses()
 *   若有疑問再執行 analyzeQrcodeSheet() 確認 K1 完整結構
 * ====================================================================
 */

const QRCODE_SHEET_NAME = '設定用QRCODE';

// =====================================================================
// 【1】analyzeFormParams — 分析 config-api.js 所有必要參數來源
// =====================================================================
/**
 * 執行此函式可確認動態設定檔生成所需的關鍵欄位：
 * - prefUrl_Attend         → 解析 entry codes
 * - CheckInFormURL         → 表單回應基礎 URL
 * - CheckInFormIDCol       → ID entry code
 * - CheckInFormNameCol     → 名稱 entry code
 * - paramQRCodeType        → ScanMode
 * - paramQRCodePass        → 密碼
 * - 建置系統注意事項!B1     → 班別基礎名稱
 * - 建置系統注意事項!D5,F5  → 密碼/上課方式 entry code
 * - 建置系統注意事項!N1     → ScanMode
 * - 建置系統注意事項!E5     → AfterScan 跳轉 URL
 */
function analyzeFormParams() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log('═══════════════════════════════════════════════');
  Logger.log('【analyzeFormParams】config-api 關鍵參數診斷');
  Logger.log('═══════════════════════════════════════════════');

  // ── Named Ranges ────────────────────────────────────────────────────
  Logger.log('');
  Logger.log('── Named Ranges ──');
  const nrNames = [
    'CheckInFormURL', 'CheckInFormIDCol', 'CheckInFormNameCol',
    'prefUrl_Attend', 'paramQRCodeType', 'paramQRCodePass',
    'QRCodeURL', 'CheckPassToday'
  ];
  nrNames.forEach(name => {
    try {
      const nr = ss.getRangeByName(name);
      const val = nr ? String(nr.getValue()).substring(0, 120) : '（不存在）';
      Logger.log('  ' + name + ': ' + val);
    } catch (e) {
      Logger.log('  ' + name + ': 讀取錯誤 - ' + e.message);
    }
  });

  // ── 解析 prefUrl_Attend 取得 entry codes ──────────────────────────
  Logger.log('');
  Logger.log('── prefUrl_Attend 解析結果 ──');
  try {
    const nr = ss.getRangeByName('prefUrl_Attend');
    const prefUrl = nr ? String(nr.getValue()) : '';
    if (prefUrl) {
      const parsed = _parsePrefUrlInternal(prefUrl);
      Logger.log('  baseUrl: ' + parsed.baseUrl);
      Logger.log('  解析到的 entry codes:');
      Object.keys(parsed.entries).forEach(ph => {
        Logger.log('    ' + ph + ' → ' + parsed.entries[ph]);
      });
      if (Object.keys(parsed.entries).length === 0) {
        Logger.log('  ⚠️ 未解析到任何 entry code，請確認 prefUrl_Attend 格式');
        Logger.log('  原始值（前200字）: ' + prefUrl.substring(0, 200));
      }
    } else {
      Logger.log('  ⚠️ prefUrl_Attend 為空');
    }
  } catch (e) {
    Logger.log('  解析錯誤: ' + e.message);
  }

  // ── 建置系統注意事項 關鍵儲存格 ───────────────────────────────────
  Logger.log('');
  Logger.log('── 建置系統注意事項 關鍵儲存格 ──');
  const buildSheet = ss.getSheetByName('建置系統注意事項');
  if (!buildSheet) {
    Logger.log('  ❌ 找不到「建置系統注意事項」Sheet');
  } else {
    const cells = {
      'B1 (班別基礎名稱)': 'B1',
      'D5 (entry code #1)': 'D5',
      'E5 (AfterScan URL?)': 'E5',
      'F5 (entry code #2)': 'F5',
      'J1 (出勤方式?)':     'J1',
      'N1 (ScanMode?)':    'N1',
    };
    Object.entries(cells).forEach(([label, addr]) => {
      const val = String(buildSheet.getRange(addr).getValue()).substring(0, 120);
      const formula = buildSheet.getRange(addr).getFormula();
      Logger.log('  ' + label + ': "' + val + '"' + (formula ? '  [公式: ' + formula.substring(0, 80) + ']' : ''));
    });
  }

  // ── 設定用QRCODE K1 的完整 JSON ───────────────────────────────────
  Logger.log('');
  Logger.log('── 設定用QRCODE K1（完整設定檔文字）──');
  const qrSheet = ss.getSheetByName(QRCODE_SHEET_NAME);
  if (qrSheet) {
    const k1 = String(qrSheet.getRange('K1').getValue());
    Logger.log('  長度: ' + k1.length + ' 字元');
    Logger.log('  前綴: ' + k1.substring(0, 20) + '...');
    // 解析 JSON
    const PREFIX = 'QRCodeSignIn※';
    if (k1.startsWith(PREFIX)) {
      try {
        const obj = JSON.parse(k1.substring(PREFIX.length));
        Logger.log('  ✅ JSON 解析成功');
        Logger.log('  SettingName: ' + obj.SettingName);
        Logger.log('  ScanMode: ' + (obj.GoWebSiteByScan || {}).ScanMode);
        Logger.log('  SendHtml: ' + ((obj.GoWebSiteByScan || {}).SendHtml || '').substring(0, 80));
        Logger.log('  SettingField 清單:');
        (obj.SettingField || []).forEach((f, i) => {
          Logger.log('    [' + i + '] type=' + f.fieldType + '  name="' + f.fieldName + '"  entry="' + f.ColumnName + '"' + (f.ColumnValue ? '  value="' + f.ColumnValue + '"' : ''));
        });
      } catch (e) {
        Logger.log('  ❌ JSON 解析失敗: ' + e.message);
      }
    }
  }

  Logger.log('');
  Logger.log('═══════════════════════════════════════════════');
  Logger.log('執行完畢。請確認各 entry code 是否與 K1 的 SettingField 相符。');
}

// =====================================================================
// 【2】analyzeScheduleClasses — 分析「班程」Sheet 的班別資料
// =====================================================================
/**
 * 列出「班程」Sheet 中所有班別代碼 (G) 與班別名稱 (H)，
 * 以及每個班別對應的密碼 (D) 分布，
 * 確認 getAvailableClassTypes() 能正確讀到哪些班別。
 */
function analyzeScheduleClasses() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log('═══════════════════════════════════════════════');
  Logger.log('【analyzeScheduleClasses】班程班別診斷');
  Logger.log('═══════════════════════════════════════════════');

  const sheet = ss.getSheetByName('班程');
  if (!sheet) {
    Logger.log('❌ 找不到「班程」Sheet');
    return;
  }

  const lastRow = sheet.getLastRow();
  Logger.log('總列數（含標題）: ' + lastRow);

  if (lastRow < 2) {
    Logger.log('⚠️ 無班程資料');
    return;
  }

  // 讀取標題列
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  Logger.log('');
  Logger.log('── 標題列 ──');
  headers.forEach((h, i) => {
    if (h) Logger.log('  ' + String.fromCharCode(65 + i) + '(' + (i+1) + '): "' + h + '"');
  });

  // 讀取前30列資料（G=classCode, H=className, D=密碼）
  const dataRows = Math.min(lastRow - 1, 30);
  const data = sheet.getRange(2, 1, dataRows, Math.max(headers.length, 9)).getValues();

  Logger.log('');
  Logger.log('── 前 ' + dataRows + ' 列資料（A日期, D密碼, G班別代碼, H班別名稱）──');
  data.forEach((row, i) => {
    if (row[0]) {
      const date = row[0] instanceof Date
        ? Utilities.formatDate(row[0], 'Asia/Taipei', 'yyyy/M/d')
        : String(row[0]);
      Logger.log('  第' + (i+2) + '列 | 日期:' + date +
        ' | D密碼:"' + String(row[3] || '') + '"' +
        ' | G代碼:"' + String(row[6] || '') + '"' +
        ' | H名稱:"' + String(row[7] || '') + '"' +
        ' | B啟用:"' + String(row[1] || '') + '"');
    }
  });

  // 統計唯一班別（G+H 組合）
  const allData = sheet.getRange(2, 1, lastRow - 1, Math.max(headers.length, 9)).getValues();
  const classMap = {};
  allData.forEach(row => {
    if (!row[0]) return;
    const code = String(row[6] || '').trim();
    const name = String(row[7] || '').trim();
    const pass = String(row[3] || '').trim();
    const key  = code + '|' + name;
    if (code || name) {
      if (!classMap[key]) classMap[key] = { code, name, passwords: new Set(), count: 0 };
      classMap[key].count++;
      if (pass) classMap[key].passwords.add(pass);
    }
  });

  Logger.log('');
  Logger.log('── 唯一班別清單（' + Object.keys(classMap).length + ' 種）──');
  Object.values(classMap)
    .sort((a, b) => a.code.localeCompare(b.code))
    .forEach(c => {
      Logger.log('  代碼:"' + c.code + '"  名稱:"' + c.name + '"  次數:' + c.count +
        '  密碼集:[' + Array.from(c.passwords).join(',') + ']');
    });

  // 確認與 K1 SettingName 的對應關係
  const qrSheet = ss.getSheetByName(QRCODE_SHEET_NAME);
  if (qrSheet) {
    const k1 = String(qrSheet.getRange('K1').getValue());
    const PREFIX = 'QRCodeSignIn※';
    if (k1.startsWith(PREFIX)) {
      try {
        const obj = JSON.parse(k1.substring(PREFIX.length));
        Logger.log('');
        Logger.log('── K1 設定檔名稱對照 ──');
        Logger.log('  K1 SettingName: "' + obj.SettingName + '"');
        const typeField = (obj.SettingField || []).find(f => f.fieldName === '上課方式');
        if (typeField) Logger.log('  上課方式 ColumnValue: "' + typeField.ColumnValue + '"');
      } catch (e) {}
    }
  }

  Logger.log('');
  Logger.log('═══════════════════════════════════════════════');
  Logger.log('完成。請確認 H欄「班別名稱」格式以便 API 識別班別類型。');
}

// =====================================================================
// 【3】analyzeQrcodeSheet — 診斷「設定用QRCODE」Sheet 結構（原版）
// =====================================================================
function analyzeQrcodeSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(QRCODE_SHEET_NAME);

  if (!sheet) {
    Logger.log('❌ 找不到工作表：' + QRCODE_SHEET_NAME);
    return;
  }

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  Logger.log('=== 「設定用QRCODE」Sheet 診斷報告 ===');
  Logger.log('總列數（含標題）: ' + lastRow + ' | 總欄數: ' + lastCol);
  Logger.log('');

  // 標題列
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  Logger.log('── 標題列（第1列）──');
  headers.forEach((h, i) => {
    Logger.log('  ' + columnNumberToLetter(i + 1) + ': "' + String(h).substring(0, 100) + '"');
  });
  Logger.log('');

  // 前5列資料
  const dataRows = Math.min(lastRow - 1, 5);
  if (dataRows > 0) {
    Logger.log('── 資料列（前 ' + dataRows + ' 列）──');
    const data = sheet.getRange(2, 1, dataRows, lastCol).getValues();
    data.forEach((row, rowIdx) => {
      Logger.log('  第 ' + (rowIdx + 2) + ' 列:');
      row.forEach((cell, colIdx) => {
        if (cell !== '') Logger.log('    ' + columnNumberToLetter(colIdx + 1) + ': "' + String(cell).substring(0, 100) + '"');
      });
    });
    Logger.log('');
  }

  // 公式分析
  Logger.log('── 公式分析（第1~3列）──');
  const scanRows = Math.min(lastRow, 3);
  let foundFormulas = false;
  for (let r = 1; r <= scanRows; r++) {
    for (let c = 1; c <= lastCol; c++) {
      const formula = sheet.getRange(r, c).getFormula();
      if (formula && formula.startsWith('=')) {
        Logger.log('  [' + columnNumberToLetter(c) + r + '] ' + formula);
        foundFormulas = true;
      }
    }
  }
  if (!foundFormulas) Logger.log('  （前3列無公式）');
  Logger.log('');

  // Named Ranges
  Logger.log('── Named Ranges（含此 Sheet 的）──');
  let namedCount = 0;
  ss.getNamedRanges().forEach(nr => {
    try {
      if (nr.getRange().getSheet().getName() === QRCODE_SHEET_NAME) {
        Logger.log('  ' + nr.getName() + ' → ' + nr.getRange().getA1Notation());
        namedCount++;
      }
    } catch (e) {}
  });
  if (namedCount === 0) Logger.log('  （無）');
  Logger.log('');
  Logger.log('=== 診斷完成 ===');
}

// =====================================================================
// 內部工具（供 analyzeFormParams 使用，config-api.js 也有獨立版本）
// =====================================================================
function _parsePrefUrlInternal(prefUrl) {
  const result = { baseUrl: '', entries: {} };
  if (!prefUrl) return result;
  const qIdx = prefUrl.indexOf('?');
  if (qIdx !== -1) {
    result.baseUrl = prefUrl.substring(0, qIdx).replace('/viewform', '/formResponse') + '?usp=pp_url';
  }
  const queryStr = qIdx !== -1 ? prefUrl.substring(qIdx + 1) : prefUrl;
  queryStr.split('&').forEach(param => {
    const eqIdx = param.indexOf('=');
    if (eqIdx === -1) return;
    const key = decodeURIComponent(param.substring(0, eqIdx));
    const val = decodeURIComponent(param.substring(eqIdx + 1));
    if (key.startsWith('entry.') && val.startsWith('___')) {
      result.entries[val] = '&' + key;
    }
  });
  return result;
}

function columnNumberToLetter(n) {
  let result = '';
  while (n > 0) {
    n--;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}

// =====================================================================
// listConfigNames / inspectConfigRow（保留原版以供單獨使用）
// =====================================================================
function listConfigNames() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(QRCODE_SHEET_NAME);
  if (!sheet) { Logger.log('找不到 Sheet: ' + QRCODE_SHEET_NAME); return; }
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) { Logger.log('Sheet 無資料列'); return; }
  const data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  Logger.log('── 所有設定檔名稱（A欄）──');
  data.forEach((row, i) => { if (row[0]) Logger.log('  第 ' + (i+2) + ' 列: "' + row[0] + '"'); });
}

function inspectConfigRow(targetName) {
  targetName = targetName || '天達大班-實體3';
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(QRCODE_SHEET_NAME);
  if (!sheet) { Logger.log('找不到 Sheet'); return; }
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const data    = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const row = data.find(r => String(r[0]) === targetName);
  if (!row) { Logger.log('找不到設定檔: ' + targetName); return; }
  Logger.log('── 設定檔「' + targetName + '」欄位 ──');
  row.forEach((val, i) => Logger.log('  ' + columnNumberToLetter(i+1) + ' "' + headers[i] + '": "' + val + '"'));
}
