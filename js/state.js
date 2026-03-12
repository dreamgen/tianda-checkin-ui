/**
 * js/state.js - 應用程式狀態管理
 * 使用 localStorage 持久化設定
 */

const STATE_KEY = 'tianda_checkin_state';
const SETTINGS_KEY = 'tianda_checkin_settings';

const defaultState = {
  currentSchedule: null, // { date, classCode, className, verify, attendanceMode, weekNumber }
  currentView: 'dashboard',
  memberCache: null,      // { data, timestamp }
  units: [],
};

const defaultSettings = {
  largeText: false,
  legacyQR: true,
  attendanceMode: '實體',
};

let _state = { ...defaultState };
let _settings = { ...defaultSettings };

function loadState() {
  try {
    const saved = localStorage.getItem(STATE_KEY);
    if (saved) _state = { ...defaultState, ...JSON.parse(saved) };
    const savedSettings = localStorage.getItem(SETTINGS_KEY);
    if (savedSettings) _settings = { ...defaultSettings, ...JSON.parse(savedSettings) };
  } catch (e) {
    console.warn('Failed to load state:', e);
  }
}

function saveState() {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(_state));
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(_settings));
  } catch (e) {
    console.warn('Failed to save state:', e);
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

const State = {
  /** 取得當前班程設定 */
  getSchedule() { return _state.currentSchedule; },

  /** 設定當前班程 */
  setSchedule(schedule) {
    _state.currentSchedule = schedule;
    saveState();
    // 通知所有監聽者
    document.dispatchEvent(new CustomEvent('scheduleChanged', { detail: schedule }));
  },

  /** 檢查是否已設定班程 */
  hasSchedule() {
    return !!(
      _state.currentSchedule &&
      _state.currentSchedule.date &&
      _state.currentSchedule.classCode &&
      _state.currentSchedule.verify
    );
  },

  /** 取得設定 */
  getSettings() { return { ..._settings }; },

  /** 更新設定 */
  updateSettings(partial) {
    _settings = { ..._settings, ...partial };
    saveState();
    document.dispatchEvent(new CustomEvent('settingsChanged', { detail: _settings }));
  },

  /** 快取班員資料 (5分鐘有效) */
  getMemberCache() {
    if (!_state.memberCache) return null;
    const age = Date.now() - _state.memberCache.timestamp;
    if (age > 5 * 60 * 1000) return null; // 5 min TTL
    return _state.memberCache.data;
  },

  setMemberCache(data) {
    _state.memberCache = { data, timestamp: Date.now() };
    // don't persist to localStorage (too large)
  },

  clearMemberCache() {
    _state.memberCache = null;
  },

  /** 初始化 */
  init() {
    loadState();
  }
};

window.State = State;
