import { db, ref, get, set, update } from './firebase-config.js';
import { state } from './state.js';

const API_BASE = 'https://script.google.com/macros/s/AKfycbwAIC1ZtWZVVtji1-dkozis8CFkyqx8m9h3_kP98wd53RzwSey634ZH98kWwESXXTMP/exec';

// -------------------------------------------------------------------------------- //
// GAS API HTTP Wrapper (For operations not suitable for caching, or initial load)
// -------------------------------------------------------------------------------- //
export async function callGAS(action, params = {}) {
    try {
        const response = await fetch(API_BASE, {
            method: 'POST',
            body: JSON.stringify({ action, ...params }),
            headers: { 'Content-Type': 'text/plain' } // bypass CORS
        });
        const result = await response.json();
        if (result.status === 'success') {
            return result.data;
        } else {
            throw new Error(result.message || 'API API Failed');
        }
    } catch (err) {
        console.error(`GAS API Error [${action}]:`, err);
        throw err;
    }
}

// -------------------------------------------------------------------------------- //
// 報到相關 API (前端極速快取層 - Firebase Realtime Database)
// -------------------------------------------------------------------------------- //
export const checkinAPI = {
    
    // 取得出勤名單 (從 Firebase)
    async getAttendanceList() {
        const scheduleNote = state.getScheduleNote();
        const dateStr = state.currentSchedule?.date;
        if (!scheduleNote || !dateStr) throw new Error("尚未設定當次班程資訊");

        // Firebase path: attendance/yyyy-mm-dd_scheduleNote
        const path = `attendance/${dateStr}_${scheduleNote}`;
        const snapshot = await get(ref(db, path));
        
        if (snapshot.exists()) {
            // Already initialized in Firebase
            return Object.values(snapshot.val());
        }
        
        // 如果 Firebase 沒有當日當班程資料，從 GAS 拉取大名單，並初始化到 Firebase
        console.log("Firebase cache empty for this schedule. Fetching from GAS...");
        const list = await callGAS('getAttendanceByDate', { date: dateStr, scheduleNote });
        
        // 批次寫入 Firebase 供後續快取與即時監聽使用
        const updates = {};
        list.forEach(member => {
            // 確保有 id
            if(member.id) {
                updates[`${path}/${member.id}`] = member;
            }
        });
        await update(ref(db), updates);
        
        return list;
    },

    // 進行報到打勾動作 (寫入 Firebase，由後端 GAS 觸發器非同步備份)
    async markCheckin(memberId, memberData = {}, isManualTemp = false) {
        const scheduleNote = state.getScheduleNote();
        const dateStr = state.currentSchedule.date;
        const verifyStatus = state.currentSchedule.verify || ""; 
        
        if (!scheduleNote || !dateStr) throw new Error("尚未設定當次班程資訊");

        const path = `attendance/${dateStr}_${scheduleNote}/${memberId}`;
        const queuePath = `syncQueue/${new Date().getTime()}_${memberId}`; 

        // 1. 本地快取名單狀態立即更新 (供即時 UI 監聽使用)
        await update(ref(db, path), {
            status: '出席',
            checkinTime: new Date().toISOString(),
            ...memberData // if any temp specific name/class/etc.
        });
        
        // 2. 寫入同步對列 (GAS 定期會消化它並寫回 Google Sheets)
        await set(ref(db, queuePath), {
            id: memberId,
            date: dateStr,
            scheduleNote,
            verify: verifyStatus,
            verifyMode: state.currentSchedule.attendanceMode, // '實體'/'線上'
            timestamp: new Date().getTime(),
            action: isManualTemp ? 'checkinTemp' : 'checkin',
            memberData: memberData
        });
        
        return true;
    }
};

// -------------------------------------------------------------------------------- //
// 一般靜態/較少異動的系統 API (直接走 GAS 抓取)
// -------------------------------------------------------------------------------- //
export const systemAPI = {
    // 取得當前啟用班程預設值
    async getActiveSchedule() {
        return await callGAS('getActiveSchedule');
    },
    
    // 取得所有支援的班程列表，用於設定下拉選單
    async getSchedules(filter = 'active') {
        return await callGAS('getSchedules', { filter });
    },
    
    // 取得單個成員所有的詳細資料
    async getMemberById(id) {
        return await callGAS('getMemberById', { id });
    },
    
    // 獲取成員所有考勤歷史
    async getMemberAttendanceHistory(id) {
        // ... (This might call getAttendanceHistory GAS api later point)
        return [];
    }
};
