/**
 * 出席總表結構分析工具
 * 用途：分析「出席總表」的欄位結構、公式、Named Ranges，供 API 設計使用
 * 執行方式：在 Apps Script 編輯器中選擇此函式後按「執行」，結果查看「執行記錄」
 */

function analyzeAttendanceSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('出席總表');

  if (!sheet) {
    Logger.log('❌ 找不到「出席總表」工作表！');
    return;
  }

  Logger.log('='.repeat(60));
  Logger.log('📊 出席總表 - 結構分析報告');
  Logger.log('='.repeat(60));

  // 1. 基本尺寸
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  Logger.log(`\n【基本尺寸】\n總列數: ${lastRow}\n總欄數: ${lastCol}`);

  // 2. 讀取前 10 列的值（找標題區域）
  const previewRows = Math.min(10, lastRow);
  const previewData = sheet.getRange(1, 1, previewRows, Math.min(20, lastCol)).getValues();
  Logger.log('\n【前 10 列 × 前 20 欄 - 值】');
  previewData.forEach((row, i) => {
    Logger.log(`Row ${i + 1}: ${JSON.stringify(row)}`);
  });

  // 3. 讀取前 10 列的公式（找公式結構）
  const previewFormulas = sheet.getRange(1, 1, previewRows, Math.min(20, lastCol)).getFormulas();
  Logger.log('\n【前 10 列 × 前 20 欄 - 公式】');
  previewFormulas.forEach((row, i) => {
    const hasFormula = row.some(cell => cell !== '');
    if (hasFormula) {
      Logger.log(`Row ${i + 1} 公式: ${JSON.stringify(row)}`);
    }
  });

  // 4. 分析欄標題（找到 "NO" 所在的 header 列）
  Logger.log('\n【尋找 Header 列（含 NO 的列）】');
  let headerRowIndex = -1;
  for (let r = 0; r < previewRows; r++) {
    for (let c = 0; c < previewData[r].length; c++) {
      if (previewData[r][c] === 'NO') {
        headerRowIndex = r;
        Logger.log(`找到 NO 在 Row ${r + 1}, Col ${c + 1}`);
        break;
      }
    }
    if (headerRowIndex >= 0) break;
  }

  // 5. 讀取橫軸欄位（日期欄位）- 前 30 欄
  Logger.log('\n【橫軸欄位 - 前 30 欄標題（Row 1~5 的所有欄位）】');
  const headerRange = sheet.getRange(1, 1, 5, Math.min(30, lastCol)).getValues();
  headerRange.forEach((row, i) => {
    Logger.log(`Row ${i + 1}: ${JSON.stringify(row)}`);
  });

  // 6. 讀取前 30 欄的公式（Row 1~5）
  Logger.log('\n【橫軸前 30 欄 - 公式（Row 1~5）】');
  const headerFormulas = sheet.getRange(1, 1, 5, Math.min(30, lastCol)).getFormulas();
  headerFormulas.forEach((row, i) => {
    const hasFormula = row.some(cell => cell !== '');
    if (hasFormula) {
      Logger.log(`Row ${i + 1} 公式: ${JSON.stringify(row)}`);
    }
  });

  // 7. 第一個資料列的完整內容（找到 header 後的第一列）
  if (headerRowIndex >= 0) {
    const firstDataRow = headerRowIndex + 3; // 通常 header 後有一空列再開始資料
    if (firstDataRow <= lastRow) {
      Logger.log(`\n【第一筆資料列 Row ${firstDataRow}（前 30 欄）- 值】`);
      const firstDataVals = sheet.getRange(firstDataRow, 1, 1, Math.min(30, lastCol)).getValues()[0];
      Logger.log(JSON.stringify(firstDataVals));

      Logger.log(`\n【第一筆資料列 Row ${firstDataRow}（前 30 欄）- 公式】`);
      const firstDataForms = sheet.getRange(firstDataRow, 1, 1, Math.min(30, lastCol)).getFormulas()[0];
      Logger.log(JSON.stringify(firstDataForms));
    }
  }

  // 8. Named Ranges 相關
  Logger.log('\n【Named Ranges（全部）】');
  const namedRanges = ss.getNamedRanges();
  namedRanges.forEach(nr => {
    Logger.log(`${nr.getName()}: ${nr.getRange().getA1Notation()} (Sheet: ${nr.getRange().getSheet().getName()})`);
  });

  // 9. 讀取 參數設定 的重要設定值
  Logger.log('\n【參數設定 - 出席總表相關參數】');
  const paramSheet = ss.getSheetByName('參數設定');
  if (paramSheet) {
    const paramData = paramSheet.getRange(1, 1, 30, 4).getValues();
    paramData.forEach((row, i) => {
      if (row[0] !== '' || row[1] !== '') {
        Logger.log(`Row ${i + 1}: ${JSON.stringify(row)}`);
      }
    });
  }

  // 10. 最後幾欄（找到年度最新日期）
  Logger.log(`\n【最末 10 欄（Col ${Math.max(1, lastCol - 9)}~${lastCol}）前 5 列】`);
  const tailRange = sheet.getRange(1, Math.max(1, lastCol - 9), 5, Math.min(10, lastCol)).getValues();
  tailRange.forEach((row, i) => {
    Logger.log(`Row ${i + 1}: ${JSON.stringify(row)}`);
  });

  Logger.log('\n' + '='.repeat(60));
  Logger.log('✅ 分析完畢，請複製執行記錄並回饋給 AI 進行 API 設計更新。');
  Logger.log('='.repeat(60));
}

/**
 * 分析特定欄位的公式結構（用於了解某一日期欄的計算邏輯）
 * 執行前請先在下方設定要分析的欄號（1-based）
 */
function analyzeColumnFormula() {
  const TARGET_COL = 15; // ← 修改此數字為要分析的欄號（例：15 = 第 15 欄）

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('出席總表');
  if (!sheet) {
    Logger.log('❌ 找不到「出席總表」工作表！');
    return;
  }

  const lastRow = sheet.getLastRow();
  Logger.log(`\n📋 分析 欄 ${TARGET_COL}（${lastRow} 列）前 15 列的公式：`);

  const colFormulas = sheet.getRange(1, TARGET_COL, Math.min(15, lastRow), 1).getFormulas();
  const colValues = sheet.getRange(1, TARGET_COL, Math.min(15, lastRow), 1).getValues();

  colFormulas.forEach((row, i) => {
    Logger.log(`Row ${i + 1} - 值: "${colValues[i][0]}" | 公式: "${row[0]}"`);
  });
}

/**
 * 快速確認「出席總表」中哪幾列有資料（非空白）
 * 用於了解資料起始列與結構分隔
 */
function scanNonEmptyRows() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('出席總表');
  if (!sheet) {
    Logger.log('❌ 找不到「出席總表」工作表！');
    return;
  }

  const lastRow = sheet.getLastRow();
  const scanRows = Math.min(20, lastRow);
  const data = sheet.getRange(1, 1, scanRows, 5).getValues();
  const formulas = sheet.getRange(1, 1, scanRows, 5).getFormulas();

  Logger.log('前 20 列（A~E 欄）- 值與公式：');
  data.forEach((row, i) => {
    const vals = JSON.stringify(row);
    const forms = JSON.stringify(formulas[i]);
    Logger.log(`Row ${i + 1}: 值=${vals} | 公式=${forms}`);
  });
}
