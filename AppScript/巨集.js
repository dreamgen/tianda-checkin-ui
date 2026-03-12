var CHECKING = false;
function checkQRCODE() {
  if (!CHECKING) {
    CHECKING = true;
    var spreadsheet = SpreadsheetApp.getActive();
    var currentCellName = spreadsheet.getCurrentCell().getA1Notation();
    var sheetName = spreadsheet.getActiveSheet().getName();
    var checkValues = spreadsheet.getRange('J6:J200').getValues();
    if (sheetName == "快速查詢" && currentCellName.substring(0, 1) == "J") {
      for (i = 6; i < 200; i++) {
        //if(spreadsheet.getRange('C'+i).getValue()==""){
        //  break;
        //}

        //currentCellName = spreadsheet.getCurrentCell().getA1Notation();
        //var A = i.toString();
        //var B = currentCellName.substring(1);
        //var C = i.toString()!=currentCellName.substring(1);
        //var D = spreadsheet.getRange('J'+i).getValue();
        //var E = spreadsheet.getRange('J'+i).getValue()==true;
        //if(i.toString()!=currentCellName.substring(1) && spreadsheet.getRange('J'+i).getValue()==true){
        if (i.toString() != currentCellName.substring(1) && checkValues[i - 6][0] == true) {
          spreadsheet.getRange('J' + i).setValue('FALSE');
        }
      }
    }
    CHECKING = false;
  }
};
function getAttendanceRecord() {
  return;
}

function recodeErrorCheckIn() {
  var spreadsheet = SpreadsheetApp.getActive();
  var NewCellAddr = spreadsheet.getSheetByName('誤打卡記錄').getRange('A1').getNextDataCell(SpreadsheetApp.Direction.DOWN).getA1Notation();
  var NewIDValue = spreadsheet.getRange('H2').getValue();
  var NewNameValue = spreadsheet.getRange('H1').getValue();
  var NewCheckTime = Utilities.formatDate(new Date(spreadsheet.getRange('F5').getValue().toString()), "GMT+8", "yyyy-M-d");//Utilities.formatDate(new Date(), "GMT+8", "yyyy-M-d");
  var ui = SpreadsheetApp.getUi(); // Same variations.
  if (spreadsheet.getSheetByName('誤打卡記錄').getRange('A2').getValue() == "") {
    NewCellAddr = "A1";
  }
  if (NewIDValue != '') {
    var ui = SpreadsheetApp.getUi();
    if (ui.alert('是否確定要移除打卡:' + NewIDValue + ' , ' + NewNameValue + ' , ' + NewCheckTime, ui.ButtonSet.OK_CANCEL) == ui.Button.OK) {
      spreadsheet.getSheetByName('誤打卡記錄').getRange(NewCellAddr).offset(1, 0).setValue(NewNameValue);
      spreadsheet.getSheetByName('誤打卡記錄').getRange(NewCellAddr).offset(1, 1).setValue(NewIDValue);
      spreadsheet.getSheetByName('誤打卡記錄').getRange(NewCellAddr).offset(1, 2).setValue(NewCheckTime);
      spreadsheet.getSheetByName('誤打卡記錄').getRange(NewCellAddr).offset(1, 3).setValue("[DEL]");


      var result = ui.alert(
        '已記錄誤打卡',
        '系統已經完成誤打卡移除 : ' + NewIDValue + ' , ' + NewNameValue + ' , ' + NewCheckTime,
        ui.ButtonSet.OK);
    }
  } else {
    var result = ui.alert(
      '失敗',
      '請先勾選學員',
      ui.ButtonSet.OK);
  }

}

function checkinManual() {
  var spreadsheet = SpreadsheetApp.getActive();
  var NewCellAddr = spreadsheet.getSheetByName('人工簽到表').getRange('A1').getNextDataCell(SpreadsheetApp.Direction.DOWN).getA1Notation();
  var NewIDValue = spreadsheet.getRange('H2').getValue();
  var NewNameValue = spreadsheet.getRange('H1').getValue();
  var NewDateValue = new Date( spreadsheet.getRange('N2').getValue());
  var NewPassValue = spreadsheet.getRange('O2').getValue();//spreadsheet.getRangeByName("CheckPassToday").getValue();
  var NewCheckinType = spreadsheet.getRange('N3').getValue();
  var ui = SpreadsheetApp.getUi(); // Same variations.
  if( NewDateValue > new Date() ){
    var result = ui.alert(
      '簽到失敗',
      '簽到日期不可為未來班程日期！',
      ui.ButtonSet.OK);
    return;
  }
  var NewCheckTime = Utilities.formatDate(NewDateValue, "GMT+8", "yyyy/M/d hh:mm:ss");
  var ui = SpreadsheetApp.getUi(); // Same variations.
  if (spreadsheet.getSheetByName('人工簽到表').getRange('A2').getValue() == "") {
    NewCellAddr = "A1";
  }
  if (NewIDValue != '') {
    if (ui.alert('是否確定要人工簽到:' + NewIDValue + ' , ' + NewNameValue + ' , ' + NewCheckTime, ui.ButtonSet.OK_CANCEL) == ui.Button.OK) {
      spreadsheet.getSheetByName('人工簽到表').getRange(NewCellAddr).offset(1, 0).setValue(NewCheckTime);
      spreadsheet.getSheetByName('人工簽到表').getRange(NewCellAddr).offset(1, 1).setValue(NewIDValue);
      spreadsheet.getSheetByName('人工簽到表').getRange(NewCellAddr).offset(1, 2).setValue(NewNameValue);
      spreadsheet.getSheetByName('人工簽到表').getRange(NewCellAddr).offset(1, 3).setValue(NewPassValue);
      spreadsheet.getSheetByName('人工簽到表').getRange(NewCellAddr).offset(1, 4).setValue(NewCheckinType);
      var ui = SpreadsheetApp.getUi(); // Same variations.

      var result = ui.alert(
        '已新增人工簽到',
        '系統已經完成人工簽到 : ' + NewIDValue + ' , ' + NewNameValue + ' , ' + NewCheckTime,
        ui.ButtonSet.OK);
    }
  } else {
    var result = ui.alert(
      '簽到失敗',
      '請先勾選學員',
      ui.ButtonSet.OK);
  }

};

function myFunction() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('A1:E223').activate();
  spreadsheet.setActiveSheet(spreadsheet.getSheetByName('人工簽到表'), true);
  spreadsheet.getActiveSheet().insertRowsAfter(spreadsheet.getActiveSheet().getMaxRows(), 223);
  spreadsheet.getRange('A1976').activate();
  spreadsheet.getCurrentCell().getNextDataCell(SpreadsheetApp.Direction.UP).activate();
  spreadsheet.getRange('A1766').activate();
  spreadsheet.getRange('\'寫入暫存區\'!A1:E223').copyTo(spreadsheet.getActiveRange(), SpreadsheetApp.CopyPasteType.PASTE_NORMAL, false);
};

function myFunction1() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('DR9').activate();
  spreadsheet.getRange('DQ9').copyTo(spreadsheet.getActiveRange(), SpreadsheetApp.CopyPasteType.PASTE_NORMAL, false);
};

function myFunction2() {
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.getRange('DR9').activate();
  var currentCell = spreadsheet.getCurrentCell();
  spreadsheet.getSelection().getNextDataRange(SpreadsheetApp.Direction.DOWN).activate();
  currentCell.activateAsCurrentCell();
  spreadsheet.getRange('DR9:DR1007').copyTo(spreadsheet.getActiveRange(), SpreadsheetApp.CopyPasteType.PASTE_VALUES, false);
};