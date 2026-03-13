/**
 * js/state.js - 應用程式狀態管理 v2
 * 使用 localStorage 持久化設定、班員快取、出席快取
 */

const STATE_KEY       = 'tianda_checkin_state';
const SETTINGS_KEY    = 'tianda_checkin_settings';
const MEMBER_CACHE_KEY = 'tianda_member_cache';
const ONBOARD_KEY     = 'tianda_onboarded';
const MEMBER_CACHE_TTL = 10 * 60 * 1000; // 10 分鐘

const defaultState = {
  currentSchedule: null, // { date, classCode, className, verify, attendanceMode }
  currentView: 'dashboard',
  units: [],
  preferredClass: null,  // 歡迎畫面選擇的班別名稱
};

const defaultSettings = {
  largeText: false,
  legacyQR: true,
  attendanceMode: '實體',
};

let _state    = { ...defaultState };
let _settings = { ...defaultSettings };
let _memberCacheMem = null; // { data, timestamp }

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

// Attendance cache key: tianda_att_YYYY-MM-DD_classCode
function attCacheKey(date, classCode) {
  return `tianda_att_${date}_${classCode}`;
}

// Check if attendance cache is valid for today
function isAttCacheValid(date) {
  const today = new Date().toISOString().split('T')[0];
  return date === today;
}

// ── Public API ─────────────────────────────────────────────────────────────

const State = {
  // ── Schedule ─────────────────────────────────────────────────────────────
  getSchedule() { return _state.currentSchedule; },

  setSchedule(schedule) {
    _state.currentSchedule = schedule;
    saveState();
    document.dispatchEvent(new CustomEvent('scheduleChanged', { detail: schedule }));
  },

  /** 檢查是否已設定班程（verify 可為空，不作要求） */
  hasSchedule() {
    return !!(
      _state.currentSchedule &&
      _state.currentSchedule.date &&
      _state.currentSchedule.classCode
    );
  },

  // ── Settings ──────────────────────────────────────────────────────────────
  getSettings() { return { ..._settings }; },

  updateSettings(partial) {
    _settings = { ..._settings, ...partial };
    saveState();
    document.dispatchEvent(new CustomEvent('settingsChanged', { detail: _settings }));
  },

  // ── Member Cache (持久化 + 記憶體，TTL 10 分鐘) ────────────────────────────
  getMemberCache() {
    // 先查記憶體
    if (_memberCacheMem) {
      const age = Date.now() - _memberCacheMem.timestamp;
      if (age <= MEMBER_CACHE_TTL) return _memberCacheMem.data;
      _memberCacheMem = null;
    }
    // 再查 localStorage
    try {
      const raw = localStorage.getItem(MEMBER_CACHE_KEY);
      if (!raw) return null;
      const cached = JSON.parse(raw);
      const age = Date.now() - cached.timestamp;
      if (age > MEMBER_CACHE_TTL) {
        localStorage.removeItem(MEMBER_CACHE_KEY);
        return null;
      }
      _memberCacheMem = cached; // 回填記憶體
      return cached.data;
    } catch {
      return null;
    }
  },

  setMemberCache(data) {
    const entry = { data, timestamp: Date.now() };
    _memberCacheMem = entry;
    try {
      localStorage.setItem(MEMBER_CACHE_KEY, JSON.stringify(entry));
    } catch {
      // localStorage 滿了也沒關係，記憶體有就好
    }
  },

  clearMemberCache() {
    _memberCacheMem = null;
    try { localStorage.removeItem(MEMBER_CACHE_KEY); } catch {}
  },

  // ── Attendance Cache (依日期/班別，當天有效) ──────────────────────────────
  getAttendanceCache(date, classCode) {
    if (!isAttCacheValid(date)) return null;
    try {
      const raw = localStorage.getItem(attCacheKey(date, classCode));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  setAttendanceCache(date, classCode, records) {
    try {
      localStorage.setItem(attCacheKey(date, classCode), JSON.stringify(records));
    } catch {}
  },

  clearAttendanceCache(date, classCode) {
    try { localStorage.removeItem(attCacheKey(date, classCode)); } catch {}
  },

  // ── Onboarding ────────────────────────────────────────────────────────────
  isOnboarded() {
    try {
      return localStorage.getItem(ONBOARD_KEY) === 'true';
    } catch {
      return false;
    }
  },

  setOnboarded() {
    try {
      localStorage.setItem(ONBOARD_KEY, 'true');
    } catch {}
  },

  // ── Preferred Class ───────────────────────────────────────────────────────
  getPreferredClass() { return _state.preferredClass || null; },

  setPreferredClass(className) {
    _state.preferredClass = className;
    saveState();
  },

  // ── Init ──────────────────────────────────────────────────────────────────
  init() { loadState(); }
};

window.State = State;
