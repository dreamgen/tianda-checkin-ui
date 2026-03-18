// LocalStorage 持久化狀態管理

const STORAGE_KEY_SCHEDULE = 'tianda_current_schedule';
const STORAGE_KEY_SETTINGS = 'tianda_settings';

export const state = {
    // 當前班程資訊
    currentSchedule: null,
    // 系統設定
    settings: {
        largeText: false,
        legacyQR: false,
        theme: 'light'
    },
    
    // 初始化從 LocalStorage 讀取
    init() {
        try {
            const savedSchedule = localStorage.getItem(STORAGE_KEY_SCHEDULE);
            if (savedSchedule) {
                this.currentSchedule = JSON.parse(savedSchedule);
            }
            
            const savedSettings = localStorage.getItem(STORAGE_KEY_SETTINGS);
            if (savedSettings) {
                this.settings = { ...this.settings, ...JSON.parse(savedSettings) };
            }
        } catch (e) {
            console.error('Failed to load state from localStorage', e);
        }
        
        // 套用設定的 class
        this.applySettingsToDOM();
    },
    
    // 儲存當前班程設定
    setSchedule(schedule) {
        this.currentSchedule = schedule;
        localStorage.setItem(STORAGE_KEY_SCHEDULE, JSON.stringify(schedule));
    },
    
    // 更新設定
    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(this.settings));
        this.applySettingsToDOM();
    },
    
    applySettingsToDOM() {
        if (this.settings.largeText) {
            document.documentElement.classList.add('text-lg'); // Tailwind large text base
        } else {
            document.documentElement.classList.remove('text-lg');
        }
    },

    // 取得用於 API / Firebase 路徑的辨識碼 (e.g. "實體1")
    getScheduleNote() {
        if (!this.currentSchedule) return null;
        return `${this.currentSchedule.attendanceMode}${this.currentSchedule.classCode || ''}`;
    }
};

state.init();
