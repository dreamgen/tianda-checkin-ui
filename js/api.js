/**
 * js/api.js - AppScript API 服務層
 * 天達大班報到系統 PWA
 */

const API_BASE = 'https://script.google.com/macros/s/AKfycbwAIC1ZtWZVVtji1-dkozis8CFkyqx8m9h3_kP98wd53RzwSey634ZH98kWwESXXTMP/exec';

// 飛行中請求去重：相同 read 請求共用同一個 Promise，避免重複打 API
const _inflight = {};
const _WRITE_ACTIONS = new Set(['checkin', 'checkinManualBatch', 'checkinTemp']);

/**
 * 統一 API 呼叫函式（含飛行中請求去重）
 * @param {string} action - API action name
 * @param {Object} params - Additional parameters
 * @returns {Promise<Object>} API response
 */
async function callAPI(action, params = {}) {
  const isWrite = _WRITE_ACTIONS.has(action);
  const key = isWrite ? null : action + '|' + JSON.stringify(params);

  if (key && _inflight[key]) return _inflight[key];

  const promise = (async () => {
    const body = JSON.stringify({ action, ...params });
    const response = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data.success) throw new Error(data.error || '未知錯誤');
    return data.data;
  })().finally(() => { if (key) delete _inflight[key]; });

  if (key) _inflight[key] = promise;
  return promise;
}

// ── API 函式封裝 ──────────────────────────────────────────────────────────

/** 取得當前啟用班程 */
async function apiGetActiveSchedule() {
  return callAPI('getActiveSchedule');
}

/** 取得班員清單 */
async function apiGetMembers(params = {}) {
  return callAPI('getMembers', params);
}

/** 取得單一班員詳細資料 */
async function apiGetMemberById(id) {
  return callAPI('getMemberById', { id });
}

/** 取得指定日期出席名單 */
async function apiGetAttendanceByDate(date, scheduleNote, params = {}) {
  return callAPI('getAttendanceByDate', { date, scheduleNote, ...params });
}

/** 取得出席統計 KPI */
async function apiGetAttendanceStats(date, scheduleNote) {
  return callAPI('getAttendanceStats', { date, scheduleNote });
}

/** 單筆 QR 掃描 / 手動報到 */
async function apiCheckin(id, name, verify, classCode, attendanceMode = '實體', notes = '') {
  return callAPI('checkin', { id, name, verify, classCode, attendanceMode, notes });
}

/** 批次簡易報到 */
async function apiCheckinManualBatch(verify, records, attendanceMode = '實體') {
  return callAPI('checkinManualBatch', { verify, records, attendanceMode });
}

/** 臨時報到 */
async function apiCheckinTemp(name, verify, classCode, attendanceMode = '實體', relatedId = '', notes = '') {
  return callAPI('checkinTemp', { name, verify, classCode, attendanceMode, relatedId, notes });
}

/** 取得班程列表 */
async function apiGetSchedules(filter = 'all') {
  return callAPI('getSchedules', { filter });
}

/** 取得區別清單 */
async function apiGetUnits() {
  return callAPI('getUnits');
}

/** 取得班員出席歷程 */
async function apiGetMemberAttendanceHistory(id) {
  return callAPI('getMemberAttendanceHistory', { id });
}

// 匯出
window.API = {
  getActiveSchedule: apiGetActiveSchedule,
  getMembers: apiGetMembers,
  getMemberById: apiGetMemberById,
  getAttendanceByDate: apiGetAttendanceByDate,
  getAttendanceStats: apiGetAttendanceStats,
  checkin: apiCheckin,
  checkinManualBatch: apiCheckinManualBatch,
  checkinTemp: apiCheckinTemp,
  getSchedules: apiGetSchedules,
  getUnits: apiGetUnits,
  getMemberAttendanceHistory: apiGetMemberAttendanceHistory,
};
