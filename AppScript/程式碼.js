function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('班程報到系統設定')
      .addItem('快速查詢', 'showSearchForm')
      .addItem('備份出席總表', 'downloadReportDrive')
      .addItem('執行封存', 'updateArchive')
      .addSeparator()
      .addItem('初始化設定', 'newFormSetting')
      .addItem('設定自動更新簡單報到程序', 'setTriggerForcheckEasyAttendUpdate')
      .addItem('設定自動執行封存', 'setTriggerForupdateArchiveStatus')
      .addToUi();
  ui.createMenu('📊 簽到管理')
    .addItem('🔄 更新簽到彙整', 'consolidateAttendanceData')
    .addSeparator()
    .addItem('📋 查看執行記錄', 'showLogs')
    .addItem('⚙️ 設定自動更新', 'setupTrigger')
    .addToUi();
}

function checkDataSize() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetNames = ['INDATA_電子簽到', '人工簽到表', 'INDATA_請假單', '班程', '班員資料'];
  
  let report = '📊 資料量統計：\n\n';
  
  sheetNames.forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (sheet) {
      const lastRow = sheet.getLastRow();
      report += `${name}: ${lastRow} 列\n`;
    }
  });
  
  SpreadsheetApp.getUi().alert(report);
  Logger.log(report);
}

/**
 * 優化版本：三維透視（日期,檢核密碼,班程註記）
 */
function consolidateAttendanceData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const startTime = new Date().getTime();
  
  try {
    Logger.log('開始執行...');
    
    const sourceData = readAllSources(ss);
    Logger.log('資料讀取完成，耗時：' + ((new Date().getTime() - startTime) / 1000) + '秒');
    
    const consolidatedData = processData(sourceData);
    Logger.log('資料處理完成，共 ' + consolidatedData.length + ' 筆，耗時：' + ((new Date().getTime() - startTime) / 1000) + '秒');
    
    const pivotData = createPivotTableOptimized(consolidatedData);
    Logger.log('透視表建立完成，' + pivotData.length + ' 列 x ' + (pivotData[0] ? pivotData[0].length : 0) + ' 欄，耗時：' + ((new Date().getTime() - startTime) / 1000) + '秒');
    
    writeOutputInBatches(ss, pivotData);
    Logger.log('寫入完成！總耗時：' + ((new Date().getTime() - startTime) / 1000) + '秒');
    
    SpreadsheetApp.getUi().alert('✅ 資料更新完成！\n共處理 ' + consolidatedData.length + ' 筆記錄');
    
  } catch (error) {
    Logger.log('錯誤：' + error.toString());
    SpreadsheetApp.getUi().alert('❌ 執行錯誤：\n' + error.toString());
  }
}

/**
 * 一次性讀取所有來源資料
 */
function readAllSources(ss) {
  const sources = {};
  const sheetNames = ['INDATA_電子簽到', '人工簽到表', 'INDATA_請假單', '班程', '班員資料'];
  
  sheetNames.forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (sheet) {
      const lastRow = sheet.getLastRow();
      const lastCol = sheet.getLastColumn();
      
      if (lastRow > 0 && lastCol > 0) {
        sources[name] = sheet.getRange(1, 1, lastRow, lastCol).getValues();
        Logger.log(name + '：' + lastRow + ' 列');
      } else {
        sources[name] = [];
        Logger.log(name + '：無資料');
      }
    } else {
      Logger.log('⚠️ 找不到工作表：' + name);
      sources[name] = [];
    }
  });
  
  return sources;
}

/**
 * 處理資料
 */
function processData(sourceData) {
  const consolidated = [];
  
  // 1. 電子簽到資料 (A,B,C,G,E)
  const electronicData = sourceData['INDATA_電子簽到'] || [];
  for (let i = 1; i < electronicData.length; i++) {
    const row = electronicData[i];
    if (row[1]) {
      consolidated.push({
        timestamp: row[0],
        id: String(row[1]),
        name: String(row[2] || ''),
        verify: String(row[6] || ''),
        scheduleNote: String(row[4] || '')
      });
    }
  }
  
  // 2. 人工簽到資料 (F,B,C,I,E)
  const manualData = sourceData['人工簽到表'] || [];
  for (let i = 1; i < manualData.length; i++) {
    const row = manualData[i];
    if (row[1]) {
      consolidated.push({
        timestamp: row[5],
        id: String(row[1]),
        name: String(row[2] || ''),
        verify: String(row[8] || ''),
        scheduleNote: String(row[4] || '')
      });
    }
  }
  
  // 3. 請假單資料 (G,J,B,K,I)
  const leaveData = sourceData['INDATA_請假單'] || [];
  for (let i = 1; i < leaveData.length; i++) {
    const row = leaveData[i];
    if (row[9]) {
      consolidated.push({
        timestamp: row[6],
        id: String(row[9]),
        name: String(row[1] || ''),
        verify: String(row[10] || ''),
        scheduleNote: String(row[8] || '')
      });
    }
  }
  
  // 4. 班程資料
  const scheduleData = sourceData['班程'] || [];
  if (scheduleData.length < 10000) {
    for (let i = 1; i < Math.min(scheduleData.length, 1000); i++) {
      const row = scheduleData[i];
      if (row[0]) {
        consolidated.push({
          timestamp: row[0],
          id: 'ID',
          name: 'Name',
          verify: 'TRUE',
          scheduleNote: 'TYPE'
        });
      }
    }
  }
  
  // 5. 班員資料
  const staffData = sourceData['班員資料'] || [];
  if (staffData.length < 10000) {
    const baseDate = new Date('3000-01-01');
    for (let i = 1; i < Math.min(staffData.length, 1000); i++) {
      const row = staffData[i];
      if (row[0]) {
        consolidated.push({
          timestamp: baseDate,
          id: String(row[0]),
          name: String(row[1] || ''),
          verify: ' ',
          scheduleNote: 'TYPE'
        });
      }
    }
  }
  
  return consolidated;
}

/**
 * 建立三維透視表
 * 欄位格式：YYYY-M-D,檢核密碼,班程註記
 */
function createPivotTableOptimized(data) {
  const pivotMap = {};
  const columnSet = new Set();
  const idSet = new Set();
  
  // 只處理最近 6 個月（可調整）
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - 6);
  
  data.forEach(item => {
    try {
      const timestamp = new Date(item.timestamp);
      if (isNaN(timestamp.getTime())) return;
      
      // 跳過舊資料
      if (timestamp < cutoffDate) return;
      
      // ⭐ 日期格式：YYYY-M-D
      const year = timestamp.getFullYear();
      const month = timestamp.getMonth() + 1; // 不補零
      const day = timestamp.getDate(); // 不補零
      const dateStr = `${year}-${month}-${day}`;
      
      const timeStr = Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'HH:mm:ss');
      const id = item.id;
      const verify = item.verify || '';
      const scheduleNote = item.scheduleNote || '';
      
      // ⭐ 欄位名稱：日期,檢核密碼,班程註記
      const columnKey = `${dateStr},${verify},${scheduleNote}`;
      
      idSet.add(id);
      columnSet.add(columnKey);
      
      if (!pivotMap[id]) {
        pivotMap[id] = {};
      }
      
      // 保留最早的時間
      if (!pivotMap[id][columnKey] || timeStr < pivotMap[id][columnKey]) {
        pivotMap[id][columnKey] = timeStr;
      }
    } catch (e) {
      // 跳過錯誤資料
    }
  });
  
  // 排序欄位
  const columns = Array.from(columnSet).sort((a, b) => {
    const [dateA, verifyA, noteA] = a.split(',');
    const [dateB, verifyB, noteB] = b.split(',');
    
    // 先比較日期（轉換為 Date 物件進行比較）
    const dateObjA = parseDateString(dateA);
    const dateObjB = parseDateString(dateB);
    
    if (dateObjA.getTime() !== dateObjB.getTime()) {
      return dateObjA.getTime() - dateObjB.getTime();
    }
    
    // 再比較檢核密碼
    if (verifyA !== verifyB) return verifyA.localeCompare(verifyB);
    
    // 最後比較班程註記
    return noteA.localeCompare(noteB);
  });
  
  const ids = Array.from(idSet).sort();
  
  Logger.log('透視表維度：' + ids.length + ' 個ID x ' + columns.length + ' 個欄位組合');
  
  // 建立結果陣列
  const result = [['ID', ...columns]];
  
  ids.forEach(id => {
    const row = [id];
    const idData = pivotMap[id] || {};
    columns.forEach(col => {
      row.push(idData[col] || '');
    });
    result.push(row);
  });
  
  return result;
}

/**
 * 輔助函數：解析日期字串 YYYY-M-D
 */
function parseDateString(dateStr) {
  const parts = dateStr.split('-');
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
}

/**
 * 分批寫入
 */
function writeOutputInBatches(ss, pivotData) {
  let outputSheet = ss.getSheetByName('出席計算1_Script');
  
  if (!outputSheet) {
    outputSheet = ss.insertSheet('出席計算1_Script');
  }
  
  outputSheet.clear();
  
  if (pivotData.length === 0) {
    outputSheet.getRange('A1').setValue('無資料');
    return;
  }
  
  const numRows = pivotData.length;
  const numCols = pivotData[0].length;
  
  Logger.log('準備寫入：' + numRows + ' 列 x ' + numCols + ' 欄');
  
  const BATCH_SIZE = 100;
  const COL_BATCH_SIZE = 50;
  
  // 分批寫入
  if (numCols > COL_BATCH_SIZE) {
    for (let colStart = 0; colStart < numCols; colStart += COL_BATCH_SIZE) {
      const colEnd = Math.min(colStart + COL_BATCH_SIZE, numCols);
      const colCount = colEnd - colStart;
      
      Logger.log('寫入欄位 ' + (colStart + 1) + ' 到 ' + colEnd);
      
      for (let rowStart = 0; rowStart < numRows; rowStart += BATCH_SIZE) {
        const rowEnd = Math.min(rowStart + BATCH_SIZE, numRows);
        const rowCount = rowEnd - rowStart;
        
        const batchData = [];
        for (let i = rowStart; i < rowEnd; i++) {
          batchData.push(pivotData[i].slice(colStart, colEnd));
        }
        
        outputSheet.getRange(rowStart + 1, colStart + 1, rowCount, colCount).setValues(batchData);
        SpreadsheetApp.flush();
        
        if (rowStart % 500 === 0) {
          Logger.log('已寫入 ' + rowEnd + ' / ' + numRows + ' 列');
        }
      }
    }
  } else {
    for (let rowStart = 0; rowStart < numRows; rowStart += BATCH_SIZE) {
      const rowEnd = Math.min(rowStart + BATCH_SIZE, numRows);
      const rowCount = rowEnd - rowStart;
      
      const batchData = pivotData.slice(rowStart, rowEnd);
      outputSheet.getRange(rowStart + 1, 1, rowCount, numCols).setValues(batchData);
      SpreadsheetApp.flush();
      
      if (rowStart % 500 === 0) {
        Logger.log('已寫入 ' + rowEnd + ' / ' + numRows + ' 列');
      }
    }
  }
  
  Logger.log('資料寫入完成');
  
  // 格式化標題
  try {
    outputSheet.setFrozenRows(1);
    outputSheet.setFrozenColumns(1);
    
    const headerRange = outputSheet.getRange(1, 1, 1, Math.min(numCols, 100));
    headerRange.setFontWeight('bold')
                .setBackground('#4285f4')
                .setFontColor('#ffffff')
                .setHorizontalAlignment('center')
                .setVerticalAlignment('middle');
    
    Logger.log('格式化完成');
  } catch (e) {
    Logger.log('格式化時發生錯誤：' + e.toString());
  }
}


function showLogs() {
  const ui = SpreadsheetApp.getUi();
  ui.alert('請點選：檢視 → 執行記錄\n查看詳細記錄');
}

/**
 * 設定定時觸發器
 */
function setupTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'consolidateAttendanceData') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  ScriptApp.newTrigger('consolidateAttendanceData')
    .timeBased()
    .atHour(2)
    .everyDays(1)
    .create();
  
  SpreadsheetApp.getUi().alert('✅ 已設定每天凌晨2點自動更新！');
}

function doGet(e){
  let doMethod = e.parameter["executeMethod"];
  switch(doMethod){
    case "setTriggerForcheckEasyAttendUpdate":
      var trigger =  ScriptApp.newTrigger('setTriggerForcheckEasyAttendUpdate')
      .timeBased()
      .after(1000)
      .create();
    break;
    default:
      Logger.log("No Match Method!");
  }  

}

function uuid() {
  return Utilities.getUuid();
}

function showSheet(){
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName("出席表");
  sheet.showSheet();

}

function newFormSetting(){
  var ui = SpreadsheetApp.getUi(); // Same variations.
  var result = ui.alert(
    '即將開始自動設定',
    '將會新增簽到表單及請假表單，若您沒有要重新建置新的班程請停止此功能！\n是否繼續執行自動設定功能？',
    ui.ButtonSet.YES_NO);

  if( result == ui.Button.NO){
    var result = ui.alert(
      '已停止',
      '已停止自動設定功能',
      ui.ButtonSet.OK);
    return;
  }

  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  var formLeave = creatForm("請假單表單");
  var prefUrlLeave = settingLeaveForm(formLeave);
  var formAttend = creatForm("簽到表單");
  var prefUrlAttend = settingAttendForm(formAttend);

  var sheetSetting = spreadsheet.getSheetByName("建置系統注意事項");
  var rangePrefUrlLeave = spreadsheet.getRangeByName("prefUrl_Leave");
  var rangePrefUrlAttend = spreadsheet.getRangeByName("prefUrl_Attend");
  var rangeSheetLeave = spreadsheet.getRangeByName("sheetURL_Leave");
  var rangeSheetAttend = spreadsheet.getRangeByName("sheetURL_Attend");
  rangePrefUrlLeave.setValue(prefUrlLeave);
  rangePrefUrlAttend.setValue(prefUrlAttend);

  var sheetLeave =  setDestSheet(formLeave,"請假單回應");
  rangeSheetLeave.setValue(sheetLeave.getParent().getUrl());
  var sheetAttend = setDestSheet(formAttend,"簽到單回應");
  rangeSheetAttend.setValue(sheetAttend.getParent().getUrl());
  
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("自動寫入簡易報到資料");
  var protect = sheet.protect();
  if(!protect.canEdit()){
    var resultProtect = ui.alert(
    '您沒有人工簽到的授權',
    '如果您有需要使用簡易報到, 先請管理者提供人工簽到表的寫入權限後再進行設定自動更新簡單報到程序。',
    ui.ButtonSet.OK);
  }else{
      setTriggerForcheckEasyAttendUpdate();
  }




  var result = ui.alert(
    '已完成自動設定',
    '已經完成自動設定並自動填入下方設定，請在下方確認是否需要授權即可。',
    ui.ButtonSet.OK);

}

function upgradeFormSetting(){
  var ui = SpreadsheetApp.getUi(); // Same variations.
  var result = ui.alert(
    '即將開始昇版設定',
    '將會延用舊的簽到表單及新增新的請假表單，若您沒有要昇版請停止此功能！\n是否繼續執行自動昇版設定功能？',
    ui.ButtonSet.YES_NO);

  if( result == ui.Button.NO){
    var result = ui.alert(
      '已停止',
      '已停止自動設定功能',
      ui.ButtonSet.OK);
    return;
  }

  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var formLeave = creatForm("請假單表單");
  var prefUrlLeave = settingLeaveForm(formLeave);
  var urlOldForm = spreadsheet.getRangeByName("upgradeOldFormUrl").getValue();
  var formAttend = getOldForm(urlOldForm);
  var prefUrlAttend = upgradeAttendForm(formAttend);

  var sheetSetting = spreadsheet.getSheetByName("建置系統注意事項");
  var rangePrefUrlLeave = spreadsheet.getRangeByName("prefUrl_Leave");
  var rangePrefUrlAttend = spreadsheet.getRangeByName("prefUrl_Attend");
  var rangeSheetLeave = spreadsheet.getRangeByName("sheetURL_Leave");
  var rangeSheetAttend = spreadsheet.getRangeByName("sheetURL_Attend");
  rangePrefUrlLeave.setValue(prefUrlLeave);
  rangePrefUrlAttend.setValue(prefUrlAttend);

  var sheetLeave =  setDestSheet(formLeave,"請假單回應");
  rangeSheetLeave.setValue(sheetLeave.getParent().getUrl());
  var sheetAttend = setDestSheet(formAttend,"簽到單回應");
  rangeSheetAttend.setValue(sheetAttend.getParent().getUrl());
  
  updateAttendData();

  var result = ui.alert(
    '已完成自動設定',
    '已經完成自動設定並自動填入下方設定，請在下方確認是否需要授權即可。',
    ui.ButtonSet.OK);

}

function updateAttendData(){
  var sheetAttend = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("簽到單回應");
  var newDataRange = sheetAttend.getRange("E:E");
  var timeRangeData = sheetAttend.getRange("A:A").getValues();
  var newData = newDataRange.getValues();
  for (var d=1; d<newData.length; d++){
    if(timeRangeData[d]!=""){
      if(newData[d]==""){
        newData[d]=["實體1"];
      }else if(newData[d]=="實體"){
        newData[d]=["實體1"];
      }else if(newData[d]=="線上"){
        newData[d]=["線上1"];
      }

    }
  }
  newDataRange.setValues(newData);

  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var urlOldPackage = spreadsheet.getRangeByName("upgradeOldPackage").getValue();
  if(urlOldPackage!=""){
    var sheetManual = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("人工簽到表");
    var sheetOldSheet = SpreadsheetApp.openByUrl(urlOldPackage);
    sheetManual.getRange("A2:E").clear();
    var dataManual = sheetOldSheet.getRange("人工簽到表!A2:E").getValues();
    var newManualData =[];
    for (var d=0; d<dataManual.length; d++){
      if(dataManual[d][0]!=""){
        if(dataManual[d][4]==""){
          dataManual[d][4]="實體1";
        }else if(dataManual[d][4]=="實體"){
          dataManual[d][4]="實體1";
        }else if(dataManual[d][4]=="線上"){
          dataManual[d][4]="線上1";
        }
        newManualData.push(dataManual[d]);
      }else{
        
      }
    }
    
    var lastRow = sheetManual.getLastRow();
    if(newManualData.length>(lastRow-1)){
      sheetManual.insertRowsAfter(lastRow,newManualData.length-lastRow+1);
    }
    
    sheetManual.getRange("A2:E" + (newManualData.length+1)).setValues(newManualData);
        
  }
}

function getOldForm(url){
  var form = FormApp.openByUrl(url);
  var id = form.getId();
  var file = DriveApp.createShortcut(id)
  file.moveTo(getCurrFolder());
  return form;
}

function creatForm(formName){
  var form = FormApp.create(formName);
  var id = form.getId();
  var url = form.getEditUrl();
  Logger.log("id: %s ; url: %s",id,url);
  getFile(id).moveTo(getCurrFolder());
  return form;
}

function settingAttendForm(form){
  //var form = FormApp.openById("1Yq5q7KNOv6hH_NQ47W6DyN57AubSzGmhQozh9pHXNgY");
  form.setTitle("簽到表單");
  try{
    form.setRequireLogin(false);
  }catch(e){
    Logger.log("設定無須登入失敗!"+ e.message );
  }
  var response = form.createResponse();
  var textItem =form.addTextItem().setTitle("ID").setRequired(true);
  var itemResponse = textItem.createResponse("___ID")
  response.withItemResponse(itemResponse);
  var textItem =form.addTextItem().setTitle("NAME").setRequired(true);
  var itemResponse = textItem.createResponse("___NAME")
  response.withItemResponse(itemResponse);
  var textItem =form.addTextItem().setTitle("檢核密碼").setRequired(true);
  var itemResponse = textItem.createResponse("___PASS")
  response.withItemResponse(itemResponse);
  var textItem =form.addTextItem().setTitle("班程註記").setRequired(true);
  var itemResponse = textItem.createResponse("___TYPE")
  response.withItemResponse(itemResponse);

  var prefURL = response.toPrefilledUrl();
  Logger.log(prefURL);
  return prefURL;
}

function upgradeAttendForm(form){
  var items = form.getItems();
  var hasClassType = false;
  var response = form.createResponse();
  for(var i=0; i<items.length; i++){
    if(items[i].getTitle()==="ID"){
      var textItem = items[i].asTextItem();
      var itemResponse = textItem.createResponse("___ID")
      response.withItemResponse(itemResponse);
    }else if(items[i].getTitle()==="NAME"){
      var textItem = items[i].asTextItem();
      var itemResponse = textItem.createResponse("___NAME")
      response.withItemResponse(itemResponse);
    }else if(items[i].getTitle()==="檢核密碼"){
      var textItem = items[i].asTextItem();
      var itemResponse = textItem.createResponse("___PASS")
      response.withItemResponse(itemResponse);
    }else if(items[i].getTitle()==="檢核"){
      var textItem = items[i].asTextItem();
      var itemResponse = textItem.createResponse("___PASS")
      response.withItemResponse(itemResponse);
    }else if(items[i].getTitle()==="班程註記"){
      hasClassType=true;
      var textItem = items[i].asTextItem();
      var itemResponse = textItem.createResponse("___TYPE")
      response.withItemResponse(itemResponse);
    }else if(items[i].getTitle()==="上課方式"){
      hasClassType=true;
      var textItem = items[i].asTextItem();
      textItem.setTitle("班程註記").setRequired(true);
      var itemResponse = textItem.createResponse("___TYPE")
      response.withItemResponse(itemResponse);
    }
  }
  if(!hasClassType){
    var textItem =form.addTextItem().setTitle("班程註記").setRequired(true);
    var itemResponse = textItem.createResponse("___TYPE")
    response.withItemResponse(itemResponse);    
  }
  var prefURL = response.toPrefilledUrl();
  Logger.log(prefURL);
  return prefURL;  

}

function settingLeaveForm(form){
  //var form = FormApp.openById("1JmTg-B8K2O1oXwvsQnZzn-zy90Gge1khOP12EA0sdz8");
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var rangeClassKind = spreadsheet.getRangeByName("ClassKind");
  var classKindName = rangeClassKind.getValues();
  var classKindItem = [];
  for(var j=0; j<classKindName[0].length; j++){
    if(classKindName[0][j]!=""){
      classKindItem.push(classKindName[0][j]);
    }else{
      break;
    }
  }


  form.setTitle("請假單表單");
  form.setDescription("班級名稱");
  try{
    form.setRequireLogin(false);
  }catch(e){
    Logger.log("設定無須登入失敗!"+ e.message );
  }
  var response = form.createResponse();
  var textItem =form.addTextItem().setTitle("姓名").setRequired(true);
  var itemResponse = textItem.createResponse("___NAME")
  response.withItemResponse(itemResponse);
  var dateItem =form.addDateItem().setTitle("請假日期").setRequired(true);
  var itemResponse = dateItem.createResponse(new Date("2019-01-01"));
  response.withItemResponse(itemResponse);
  var boleanClassKindReq = (classKindItem.length>1);
  var choiceItemClass =form.addMultipleChoiceItem().setTitle("班別").setRequired(boleanClassKindReq);
  choiceItemClass.setChoiceValues(["___Class"]);
  var itemResponse = choiceItemClass.createResponse("___Class")
  response.withItemResponse(itemResponse);
  choiceItemClass.setChoiceValues(classKindItem);
  var choiceItem =form.addMultipleChoiceItem().setTitle("請假別").setRequired(true);
  choiceItem.setChoiceValues(["公假","事假","病假","婚假","喪假","產假"]);
  var textItem2 =form.addTextItem().setTitle("事由說明(非必填)");
  var section = form.addPageBreakItem().setTitle("請繼續填寫下方資料");
  var textItem3 =form.addTextItem().setTitle("ID(編號)").setRequired(true);
  var itemResponse = textItem3.createResponse("___ID")
  response.withItemResponse(itemResponse);


  var prefURL = response.toPrefilledUrl();
  Logger.log(prefURL);
  return prefURL;
}

function getFile(fileID)
{
  var file = DriveApp.getFileById(fileID);
  return file;
  //Logger.log(file.getName());
}

function getCurrFolder(){
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var file = getFile(spreadsheet.getId());
  return file.getParents().next();
}

function findDestSheet(formUrl){
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = spreadsheet.getSheets();
  var strUrl = formUrl.replace("/edit","/viewform");
  for(s=0; s< sheets.length; s++){
    Logger.log(sheets[s].getFormUrl());
    if(sheets[s].getFormUrl()==strUrl){
      return sheets[s];
    }
  }
  return null;
}

function setDestSheet(form,sheetName){
  var urlForm = form.setDestination(FormApp.DestinationType.SPREADSHEET,SpreadsheetApp.getActiveSpreadsheet().getId());
  SpreadsheetApp.flush();
  var sheet = findDestSheet(urlForm.getEditUrl());
  var destSheet = sheet.getParent().getSheetByName(sheetName);
  if(destSheet!=null){
    destSheet.setName(sheetName + "_" + Utilities.formatDate(new Date(),"GMT+8","yyyyMMddHHmmss") );
  }
  sheet.setName(sheetName);
  sheet.hideSheet();
  return sheet;
}

function getUniqueUnits() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("常用清單");
  var data = sheet.getRange("$B2:$B").getValues();
  var units = {};
  
  for (var i = 0; i < data.length; i++) {
    units[data[i][0]] = true;
  }
  
  return Object.keys(units);
}
function getStatus() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("參數設定");
  var data = sheet.getRange("$B$11:$B$23").getValues();
  var units = {};
  
  for (var i = 0; i < data.length; i++) {
    units[data[i][0]] = true;
  }
  
  return Object.keys(units);
}

function getUniqueFirstName(unit) {
  var sheet = SpreadsheetApp.getActiveSheet();
  var data = sheet.getDataRange().getValues();
  var firstName = {};
  
  for (var i = 0; i < data.length; i++) {
    if(data[i][0] == unit){
      var name = data[i][1].split(' ');
      firstName[name[0]] = true;
    }
  }
  return Object.keys(firstName);
}

function searchDataInSheet(searchText, unit, stauts) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("出席總表");
  var dateSearch = Utilities.formatDate(new Date(SpreadsheetApp.getActiveSpreadsheet().getRange("快速查詢!$B$1").getValue()), "UTC", "yyyy/M/d");
  var dateLeave = Utilities.formatDate(new Date(SpreadsheetApp.getActiveSpreadsheet().getRange("快速查詢!$B$1").getValue()), "UTC", "yyyy-MM-dd");
  var countMember = SpreadsheetApp.getActiveSpreadsheet().getRangeByName("countMember").getValue();
  var countClass = SpreadsheetApp.getActiveSpreadsheet().getRangeByName("countClass").getValue();
  var checkInFormURL = SpreadsheetApp.getActiveSpreadsheet().getRangeByName("CheckInFormURL").getValue();
  var checkInFormIDCol = SpreadsheetApp.getActiveSpreadsheet().getRangeByName("CheckInFormIDCol").getValue();
  var checkInFormNameCol = SpreadsheetApp.getActiveSpreadsheet().getRangeByName("CheckInFormNameCol").getValue();
  var genQRCodeURL = SpreadsheetApp.getActiveSpreadsheet().getRangeByName("QRCodeURL").getValue();
  var urlLeaveForm = SpreadsheetApp.getActiveSpreadsheet().getRangeByName("LeaveFormURL").getValue();
  var colLeaveFormName = SpreadsheetApp.getActiveSpreadsheet().getRangeByName("LeaveFormNameCol").getValue();
  var colLeaveFormDate = SpreadsheetApp.getActiveSpreadsheet().getRangeByName("LeaveFormDateCol").getValue();
  var colLeaveFormID = SpreadsheetApp.getActiveSpreadsheet().getRangeByName("LeaveFormIDCol").getValue();
  var data = sheet.getRange(1,1,4+countMember,10+countClass).getValues();
  var results = [];
  var headerRow = 0;
  var nameIndex = 0;
  var codeIndex = 0;
  var unitIndex = 0;
  var statusIndex = 0;
  
  for (var i = 0; i < data.length; i++) {
    if(data[i][0] == "NO"){
      headerRow = i;
      break;
    }
  }
  for (var i = 0; i < data[headerRow].length; i++) {
    if(data[headerRow][i] == "姓名"){
      nameIndex = i;
    }else if(data[headerRow][i] == "編號"){
      codeIndex = i;
    }else if(data[headerRow][i] == "區域"){
      unitIndex = i;
    }else if(Utilities.formatDate(new Date(data[headerRow][i]), "UTC", "yyyy/M/d") == dateSearch){
      statusIndex = i;
    }
  }
  for (var i = headerRow+2; i < data.length; i++) {
    if(data[i][0]==""){
      break;
    }
    if(unit=="" || data[i][unitIndex] == unit){
      if (searchText == "" || data[i][nameIndex].toString().indexOf(searchText) != -1) {
        //QRCodeURL & SUBSTITUTE(CheckInFormURL & CheckInFormIDCol &$A2& CheckInFormNameCol,"&","%26") & ENCODEURL( $B2)
        var urlQRCode = checkInFormURL + checkInFormIDCol + data[i][codeIndex] + checkInFormNameCol ;
        urlQRCode = genQRCodeURL + urlQRCode.replace(/&/g,"%26")+ encodeURIComponent(data[i][nameIndex]);
        //LeaveFormURL & LeaveFormNameCol & E6 & LeaveFormDateCol & TEXT( F$5,"yyyy-mm-dd") & LeaveFormIDCol & D6
        var urlLeave = urlLeaveForm + colLeaveFormName + encodeURIComponent(data[i][nameIndex]) + colLeaveFormDate + dateLeave + colLeaveFormID + data[i][codeIndex];
        results.push({ "Name":data[i][nameIndex],"Code":data[i][codeIndex], "Unit": data[i][unitIndex], "Status": data[i][statusIndex],"QRCode":urlQRCode, "LeaveForm":urlLeave });
      }
    }
  }

  
  return results;
}
function searchData(searchText, unit, stauts) {
  var results = searchDataInSheet(searchText, unit, stauts);
  return results;
}
function showSearchForm() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName("快速查詢");
  var correctDate = true;
  if(spreadsheet.getActiveSheet().getName()!=sheet.getName()){
    sheet.activate();
    var ui = SpreadsheetApp.getUi(); // Same variations.
  correctDate = ui.alert(
    '快速查詢',
    '將以日期 [' +
    Utilities.formatDate(new Date(spreadsheet.getRange("快速查詢!$B$1").getValue()), "GMT+8", "yyyy/M/d")
    + '] 進行查詢，是否正確？\n若不正確，請於「查詢日期」輸入正確日期。',
    ui.ButtonSet.YES_NO)==ui.Button.YES;
  }
  if(correctDate){

    var html = HtmlService.createHtmlOutputFromFile('SearchForm')
        .setTitle('快速查詢')
        .setSandboxMode(HtmlService.SandboxMode.IFRAME)
        .setWidth(800).setHeight(800);
    SpreadsheetApp.getUi().showModalDialog(html, '快速查詢');
  }
}

function downloadReport(){
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName("出席總表");
  var countMember = spreadsheet.getRangeByName("countMember").getValue();
  var countClass = spreadsheet.getRangeByName("countClass").getValue();
  var originSheetRange = sheet.getRange(1,1,4+countMember,10+countClass);

  var tempSheet = spreadsheet.insertSheet();
  originSheetRange.copyTo( tempSheet.getRange(1,1), SpreadsheetApp.CopyPasteType.PASTE_VALUES, false);
  originSheetRange.copyTo( tempSheet.getRange(1,1), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);

  var url = UrlFetchApp.fetch("https://docs.google.com/spreadsheets/d/" + spreadsheet.getId() + "/export?gid=" + sheet.getSheetId() + "&format=xls", {
        headers: {
          'Authorization': 'Bearer ' +  ScriptApp.getOAuthToken(),
          'Content-Type': 'application/vnd.ms-excel'
        },
        method: "GET",
        followRedirects: true,
        muteHttpExceptions: true
  });


  //var url = "https://docs.google.com/spreadsheets/d/" + spreadsheet.getId() + "/export?gid=" + tempSheet.getSheetId() + "&format=xlsx";
  //var response = UrlFetchApp.fetch(url, {headers: {Authorization: "Bearer " + ScriptApp.getOAuthToken()}});
  var blob = url.getBlob().setName("出席總表_" + Utilities.formatDate(new Date(),"GMT+8","yyyyMMdd") + ".xlsx");
  //var file = blob;
  var html = "<a href='" + blob.getAs('application/vnd.ms-excel').getDownloadUrl() + "' target='_blank'>點擊下載</a>";
  var output = HtmlService.createHtmlOutput(html);
  SpreadsheetApp.getUi().showModalDialog(output, "下載檔案");
  //var app = UiApp.createApplication().setTitle("下載檔案").setHeight(50).setWidth(250);
  //var form = app.createFormPanel().setId("downloadForm");
  //var flow = app.createFlowPanel();
  //var link = app.createAnchor('點擊下載',blob.getAs('application/vnd.ms-excel').getDownloadUrl()).setId("downloadLink");
  //flow.add(link);

  //var button = app.createButton("點擊下載",form.createServerClickHandler("downloadFile")).setId("downloadButton");
  //form.add(flow.add(button));
  //app.add(form);
  //SpreadsheetApp.getUi().showModalDialog(app, "下載檔案");
  spreadsheet.deleteSheet(tempSheet);

}
  function downloadFile(e) {
    var app = UiApp.getActiveApplication();
    var form = app.getElementById("downloadForm");
    var file = e.parameter.file;
    var blob = Utilities.newBlob(file, 'application/vnd.ms-excel', '工作表名稱.xlsx');
    var app = UiApp.createApplication().setTitle("下載檔案");
    var form = app.createFormPanel().setId("downloadForm").setEncoding("multipart/form-data");
    var flow = app.createFlowPanel();
    
    var button = app.createButton("點擊下載",form.createServerClickHandler("downloadFile")).setId("downloadButton");
    var hidden = app.createHidden("file", blob);
    form.add(flow.add(hidden).add(button));
    app.add(form);
    form.submit();
    return app;
  }

function setTriggerForcheckEasyAttendUpdate(){
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("自動寫入簡易報到資料");
  var protect = sheet.protect();
  if(!protect.canEdit()){
    var resultProtect = ui.alert(
    '您沒有人工簽到的授權',
    '如果您有需要使用簡易報到, 先請管理者提供人工簽到表的寫入權限後再進行設定自動更新簡單報到程序。',
    ui.ButtonSet.OK);
  }else{
    delTrigger("checkEasyAttendUpdate");
    ScriptApp.newTrigger('checkEasyAttendUpdate')
      .timeBased()
      .after(10*60*1000)//.everyMinutes(5)
      .create();
    delTrigger("checkEsayUpdateHourly");
    ScriptApp.newTrigger('checkEsayUpdateHourly')
      .timeBased()
      //.everyMinutes(30)
      .everyHours(1)
      .create();

  }  
}

function setTriggerForupdateArchiveStatus(){
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("出席總表");
  var protect = sheet.protect();
  if(!protect.canEdit()){
    var resultProtect = ui.alert(
    '您沒有出席總表的授權',
    '如果您有需要使用自動執行封存, 先請管理者提供出席總表的寫入權限後再進行設定程序。',
    ui.ButtonSet.OK);
  }else{

    delTrigger("updateArchiveStatus");
    ScriptApp.newTrigger('updateArchiveStatus')
      .timeBased()
      //.everyMinutes(30)
      .everyWeeks(1)
      .onWeekDay(ScriptApp.WeekDay.MONDAY)
      .create();

  }  
}


function delTrigger(strFunctionName){
  const allTriggers = ScriptApp.getProjectTriggers();
  for (let index = 0; index < allTriggers.length; index++) {
    // If the current trigger is the correct one, delete it.
    if (allTriggers[index].getHandlerFunction() === strFunctionName) {
      try{
      ScriptApp.deleteTrigger(allTriggers[index]);
      }catch(e){
        Logger.log("deleteTrigger Error" + e.message);
      }
      //break;
    }
  }
}

function checkEasyAttendUpdate(){
  delTrigger("checkEasyAttendUpdate");

  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName("自動寫入簡易報到資料");
  var data = sheet.getRange(2,1,sheet.getLastRow(),4).getValues();

  for(var r=0; r<data.length; r++){
    if(data[r][1]!=="" && data[r][3]===""){
      sheet.getRange(r+2,4).setValue("處理中");
      addnewEasyAttendData("["+data[r][1]+"]",sheet.getRange(r+2,4));
      sheet.getRange(r+2,4).setValue("已新增");
    }else if(data[r][1]!=="" && data[r][3].toString().substring(0,3)=="處理中"){
      addnewEasyAttendDataContinue("["+data[r][1]+"]",sheet.getRange(r+2,4));
      sheet.getRange(r+2,4).setValue("已新增");
    }
  }

  
  ScriptApp.newTrigger('checkEasyAttendUpdate')
    .timeBased()
    .after(10*60*1000)//.everyMinutes(5)
    .create();
}

function checkEsayUpdateHourly(){
  const allTriggers = ScriptApp.getUserTriggers(SpreadsheetApp.getActive());//.getProjectTriggers();
  if (allTriggers.length==0){
    ScriptApp.newTrigger('checkEasyAttendUpdate')
    .timeBased()
    .after(10*60*1000)//.everyMinutes(5)
    .create();
  }else{
    var count = 0 ;
    delTrigger("checkEasyAttendUpdate");
    for (let index = 0; index < allTriggers.length; index++) {
      // If the current trigger is the correct one, delete it.
      if (allTriggers[index].getHandlerFunction() === "checkEasyAttendUpdate") {
        //ScriptApp.deleteTrigger(allTriggers[index]);
        //break;
        count++;
      }
    }    
    if(count==0){
      ScriptApp.newTrigger('checkEasyAttendUpdate')
      .timeBased()
      .after(10*60*1000)//.everyMinutes(5)
      .create();      
    }
  }
}

function writeDataTemp(newData){
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("寫入暫存區");
  sheet.clear();
  sheet.insertRows(newData.length);
  sheet.getRange(1,1,newData.length,5).setValues(newData);
}


function addnewEasyAttendData(strJSONData,range){
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheetSave = spreadsheet.getSheetByName("人工簽到表");
  var sheet = spreadsheet.getSheetByName("寫入暫存區");
  var data = JSON.parse(strJSONData);
  
  sheet.clear();
  var lastRow = sheet.getLastRow();
  if(sheet.getMaxRows()<data.length)
    sheet.insertRows(data.length-sheet.getMaxRows());
  var newData = [];
  for (var i = 0; i < data.length; i++) {
    var arrValue = Object.values(data[i]);
    newData.push(arrValue);
    if(newData.length>=50){
      sheet.getRange(lastRow+1,1,newData.length,5).setValues(newData);
      lastRow = lastRow+newData.length;
      range.setValue("處理中"+ (i+1));
      newData = [];
      SpreadsheetApp.flush();
    }
    //sheet.appendRow(arrValue);
  }
  if(newData.length>0){
    sheet.getRange(lastRow+1,1,newData.length,5).setValues(newData);
    range.setValue("處理中"+ i);
  }

  //回寫人工簽到
  var newRow = sheet.getLastRow();
  var saveData = sheet.getRange(1,1,newRow,5);
  var saveRow = sheetSave.getMaxRows();

  sheetSave.insertRowsAfter(saveRow,newRow);
  saveData.copyTo(sheetSave.getRange(saveRow+1,1),SpreadsheetApp.CopyPasteType.PASTE_VALUES, false);
  //SpreadsheetApp.flush();
}

function addnewEasyAttendDataContinue(strJSONData,range){
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheetSave = spreadsheet.getSheetByName("人工簽到表");
  var sheet = spreadsheet.getSheetByName("寫入暫存區");
  var data = JSON.parse(strJSONData);
  var indexStr = range.getValue();
  var lastSave = Number( indexStr.toString().substring(3,indexStr.length));
  //if(lastSave==0){
  //  return;
  //}
  var lastRow = lastSave;
  //if(lastRow==0){
  //  sheet.insertRows(data.length-lastSave);
  //}else{
  //  sheet.insertRowsAfter(lastRow,data.length-lastSave);
  //}
  
  var newData = [];
  for (var i = lastSave; i < data.length; i++) {
    var arrValue = Object.values(data[i]);
    newData.push(arrValue);
    if(newData.length>=50){
      sheet.getRange(lastRow+1,1,newData.length,5).setValues(newData);
      lastRow = lastRow+newData.length;
      range.setValue("處理中"+ (i+1));
      newData = [];
      SpreadsheetApp.flush();
    }
    //sheet.appendRow(arrValue);
  }
  if(newData.length>0){
    sheet.getRange(lastRow+1,1,newData.length,5).setValues(newData);
    range.setValue("處理中"+ i);
  }
  //回寫人工簽到
  var newRow = sheet.getLastRow();
  var saveData = sheet.getRange(1,1,newRow,5);
  var saveRow = sheetSave.getMaxRows();

  sheetSave.insertRowsAfter(saveRow,newRow);
  saveData.copyTo(sheetSave.getRange(saveRow+1,1),SpreadsheetApp.CopyPasteType.PASTE_VALUES, false);
  //SpreadsheetApp.flush();
}

function downloadReportDrive(){
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName("出席總表");
  var countMember = spreadsheet.getRangeByName("countMember").getValue();
  var countClass = spreadsheet.getRangeByName("countClass").getValue();
  var originSheetRange = sheet.getRange(1,1,4+countMember,10+countClass);

  var tempSheet = spreadsheet.insertSheet();
  originSheetRange.copyTo( tempSheet.getRange(1,1), SpreadsheetApp.CopyPasteType.PASTE_VALUES, false);
  originSheetRange.copyTo( tempSheet.getRange(1,1), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  originSheetRange.copyTo( tempSheet.getRange(1,1), SpreadsheetApp.CopyPasteType.PASTE_COLUMN_WIDTHS, false);
  SpreadsheetApp.flush();

  var url = "https://docs.google.com/spreadsheets/d/" + spreadsheet.getId() + "/export?gid=" + tempSheet.getSheetId() + "&format=xlsx";
  var response = UrlFetchApp.fetch(url, {headers: {Authorization: "Bearer " + ScriptApp.getOAuthToken()}});
  var blob = response.getBlob();
  var file = DriveApp.createFile(blob).setName("出席總表_" + Utilities.formatDate(new Date(),"GMT+8","yyyyMMdd") + ".xlsx");

  var html = "<a href='" + file.getDownloadUrl() + "' target='_blank'>點擊下載</a>";
  var output = HtmlService.createHtmlOutput(html);
  SpreadsheetApp.getUi().showModalDialog(output, "下載檔案");

  sheet.activate();
  spreadsheet.deleteSheet(tempSheet);
}
function testArchiveData(){
  resetAutoData(1);
}

function updateArchiveStatus()
{
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName("班程");
  var countClass = spreadsheet.getRangeByName("countClass").getValue();
  var dateSetting = sheet.getRange(2,9,countClass,1);
  var dateSettingData = dateSetting.getValues();
  var dateValue = sheet.getRange(2,1,countClass,1);
  var dateValueData = dateValue.getValues();
  var dToday = new Date();
  var lastMonth = new Date();
  lastMonth.setMonth(lastMonth.getMonth()-1);
  var nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth()+1);
  
  for(var i=0; i<dateSettingData.length; i++){
    if(dateValueData[i][0]< lastMonth && dateSettingData[i][0]!="重新計算"){
      archiveData(i+1);
      dateSettingData[i]=["已封存"];
    }else if(dateValueData[i][0]> nextMonth){
      archiveData(i+1);
      dateSettingData[i]=["待啟用"];
    }else{
      if(dateSettingData[i][0]=="已封存"){
        archiveData(i+1);
      }else{
        resetAutoData(i+1);
      }
      
      if(dateSettingData[i][0]!="重新計算" && dateSettingData[i][0]!="已封存"){
        dateSettingData[i]=["自動更新"];
      }

    }
  }
  dateSetting.setValues(dateSettingData);

}

function updateArchive()
{
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName("班程");
  var countClass = spreadsheet.getRangeByName("countClass").getValue();
  var dateSetting = sheet.getRange(2,9,countClass,1);
  var dateSettingData = dateSetting.getValues();
  for(var i=0; i<dateSettingData.length; i++){
    if(dateSettingData[i]=="已封存"){
      archiveData(i+1);
    }else if(dateSettingData[i]=="重新計算"||dateSettingData[i]=="自動更新"){
      resetAutoData(i+1);
    }else if(dateSettingData[i]==""){
      dateSettingData[i]=["自動更新"];
    }
  }
  dateSetting.setValues(dateSettingData);
}
function archiveData(keyDate){
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName("出席總表");
  var countMember = spreadsheet.getRangeByName("countMember").getValue();
  var rangeFormula = spreadsheet.getRangeByName("SummaryFormula");
  if(sheet.getRange(9,rangeFormula.getColumn()+keyDate).getFormula()!=""){
    var originSheetRange = sheet.getRange(9,rangeFormula.getColumn()+keyDate,countMember,1);
    originSheetRange.copyTo( sheet.getRange(9,rangeFormula.getColumn()+keyDate), SpreadsheetApp.CopyPasteType.PASTE_VALUES, false);
  }
  //spreadsheet.setActiveSelection( originSheetRange);
}

function resetAutoData(keyDate){
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName("出席總表");
  var countMember = spreadsheet.getRangeByName("countMember").getValue();
  var rangeFormula = spreadsheet.getRangeByName("SummaryFormula");
  if(sheet.getRange(9,rangeFormula.getColumn()+keyDate).getFormula()==""){
    var originSheetRange = sheet.getRange(9,rangeFormula.getColumn()+keyDate,countMember,1);
    originSheetRange.clear();
    rangeFormula.copyTo(sheet.getRange(9,rangeFormula.getColumn()+keyDate), SpreadsheetApp.CopyPasteType.PASTE_NORMAL, false)
  }  
}
