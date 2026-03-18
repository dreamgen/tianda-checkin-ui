const FIREBASE_DB_URL = "https://jczs-checkin-default-rtdb.asia-southeast1.firebasedatabase.app/";
const FIREBASE_SECRET = "UTS0dyPXR6KvikvKL732WNO7QmmCnoPBiybBFxXy";

/**
 * 說明：時間驅動觸發器 (Time-driven Trigger)
 * 請在 GAS 專案中，設定一個每 1 分鐘或 5 分鐘執行的觸發器，綁定此函式
 */
function processFirebaseSyncQueue() {
  const queueUrl = `${FIREBASE_DB_URL}syncQueue.json?auth=${FIREBASE_SECRET}`;
  
  // 1. 取得隊列任務
  const response = UrlFetchApp.fetch(queueUrl, { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) {
    console.error("無法取得 SyncQueue: " + response.getContentText());
    return;
  }
  
  const queueData = JSON.parse(response.getContentText());
  if (!queueData) {
    console.log("沒有待處理的任務");
    return;
  }
  
  // 2. 處理每一個任務
  for (const syncId in queueData) {
    const task = queueData[syncId];
    if (task.status === 'pending') {
      try {
        console.log(`處理任務: ${syncId}, action: ${task.action}`);
        
        // 依照 action 轉發給原本的 GAS 處理函式 (假設有 handleCheckin 等)
        // 這裡直接模擬你的 app.gs 中的邏輯，或呼叫現有函式
        let result = processOriginalAction(task.action, task.payload);
        
        // 3. 標記處理完成 (或直接刪除)
        if (result.success) {
          const deleteUrl = `${FIREBASE_DB_URL}syncQueue/${syncId}.json?auth=${FIREBASE_SECRET}`;
          UrlFetchApp.fetch(deleteUrl, { method: 'delete' });
        } else {
          // 標記為失敗
          const updateUrl = `${FIREBASE_DB_URL}syncQueue/${syncId}.json?auth=${FIREBASE_SECRET}`;
          UrlFetchApp.fetch(updateUrl, {
            method: 'patch',
            payload: JSON.stringify({ status: 'error', errorMsg: result.error || '未知錯誤' }),
            contentType: 'application/json'
          });
        }
      } catch (e) {
        console.error(`處理任務 ${syncId} 發生例外: ${e.message}`);
      }
    }
  }
}

function processOriginalAction(action, payload) {
  // 這邊對接回原本的 sheet 處理邏輯
  // 實作上可與原本 doPost 內的流程共用
  try {
    switch (action) {
      case 'checkin':
        return apiCheckin(payload.id, payload.name, payload.verify, payload.classCode, payload.attendanceMode, payload.notes);
      case 'checkinTemp':
        return apiCheckinTemp(payload.name, payload.verify, payload.classCode, payload.attendanceMode, payload.relatedId, payload.notes);
      case 'checkinManualBatch':
        return apiCheckinManualBatch(payload.verify, payload.records, payload.attendanceMode);
      default:
        return { success: false, error: 'Unknown action' };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
}
