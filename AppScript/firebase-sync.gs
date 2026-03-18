const FIREBASE_DB_URL = "https://jczs-checkin-default-rtdb.asia-southeast1.firebasedatabase.app/";
const FIREBASE_SECRET = "UTS0dyPXR6KvikvKL732WNO7QmmCnoPBiybBFxXy";

/**
 * 說明：時間驅動觸發器 (Time-driven Trigger)
 * 請在 GAS 專案中設定每 5 或是 10 分鐘自動執行此函數。
 * 目的：把 Firebase syncQueue 中的資料批次寫回 Google Sheets，並清空 Queue。
 */
function syncFirebaseToSheets() {
  const queuePath = "syncQueue";
  const authUrl = `${FIREBASE_DB_URL}${queuePath}.json?auth=${FIREBASE_SECRET}`;
  
  try {
    const response = UrlFetchApp.fetch(authUrl);
    const queueDataRaw = response.getContentText();
    
    if (!queueDataRaw || queueDataRaw === "null") {
      Logger.log("No new checkins to sync.");
      return;
    }
    
    const queueData = JSON.parse(queueDataRaw);
    
    // queueData is an object with timestamps as keys
    const items = Object.values(queueData);
    Logger.log(`Found ${items.length} records to sync.`);
    
    // Sort items by timestamp mostly to maintain check-in order
    items.sort((a, b) => a.timestamp - b.timestamp);
    
    // 取得 Google Sheets
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const manualSheet = ss.getSheetByName('人工簽到表');
    if(!manualSheet) throw new Error("Sheet '人工簽到表' not found");
    
    // 準備批次寫入的資料
    const rowsToAdd = [];
    
    items.forEach(item => {
        // Timestamp format like "2023/10/24 15:30:00"
        let timeObj = new Date(item.timestamp);
        let timestampStr = Utilities.formatDate(timeObj, Session.getScriptTimeZone(), "yyyy/MM/dd HH:mm:ss");

        // Format to write: [時間, 報到者(名前或ID), 驗證碼, 報到模式班程代號(例如 實體1)]
        let name = item.action === 'checkinTemp' ? (item.memberData?.name || item.id) : item.id;
        
        rowsToAdd.push([
           timestampStr, 
           name, 
           item.verify || "已驗證", 
           item.scheduleNote || "" // "實體1" etc.
        ]);
        
        // 此處如果想直接寫入當日點名表 (例如 崇德區點名表)，也可以依據 scheduleNote 去找特定 Sheet 寫入。
        // 但為了簡化，先統一寫入「人工簽到表」，原先 GAS 架構就可以透過 query / vlookup 取用。
    });

    if (rowsToAdd.length > 0) {
        // 批次 Append
        const startRow = manualSheet.getLastRow() + 1;
        manualSheet.getRange(startRow, 1, rowsToAdd.length, 4).setValues(rowsToAdd);
        Logger.log(`Successfully synced ${rowsToAdd.length} records to Sheets.`);
    }

    // 成功同步後，清除 Firebase 的 Queue (避免重複寫入)
    const clearOptions = { method: 'delete' };
    UrlFetchApp.fetch(authUrl, clearOptions);
    Logger.log("Firebase syncQueue cleared.");

  } catch (err) {
    Logger.log("Sync Error: " + err.toString());
  }
}
