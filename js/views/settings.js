import { state } from '../state.js';
import { systemAPI } from '../api.js';

export const settingsView = {
    init(params) {
        this.bindEvents();
        this.loadCurrentState();
        if(!state.currentSchedule) {
            this.fetchAutoSettings();
        }
    },
    
    bindEvents() {
        const form = document.getElementById('settings-form');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveSettings();
            });
        }
        
        const largeTextToggle = document.getElementById('setting-large-text');
        if (largeTextToggle) {
            largeTextToggle.addEventListener('change', (e) => {
                state.updateSettings({ largeText: e.target.checked });
            });
        }
    },
    
    loadCurrentState() {
        if (state.currentSchedule) {
            document.getElementById('setting-date').value = state.currentSchedule.date || '';
            document.getElementById('setting-mode').value = state.currentSchedule.attendanceMode || '實體';
            document.getElementById('setting-class').value = state.currentSchedule.classCode || '';
            document.getElementById('setting-verify').value = state.currentSchedule.verify || '';
        }
        
        const largeTextToggle = document.getElementById('setting-large-text');
        if (largeTextToggle) {
            largeTextToggle.checked = state.settings.largeText;
        }
    },
    
    async fetchAutoSettings() {
        try {
            const btn = document.getElementById('btn-save-settings');
            if(btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 載入建議中...';
            
            const autoConfig = await systemAPI.getActiveSchedule();
            if (autoConfig) {
                document.getElementById('setting-date').value = autoConfig.date || '';
                document.getElementById('setting-class').value = autoConfig.classCode || '';
                document.getElementById('setting-verify').value = autoConfig.verify || '';
                document.getElementById('setting-mode').value = autoConfig.attendanceMode || '實體';
            }
        } catch(e) {
            console.warn("Could not fetch active schedule automatically", e);
        } finally {
            const btn = document.getElementById('btn-save-settings');
            if(btn) btn.innerHTML = '<i class="fa-solid fa-save"></i> 儲存設定';
        }
    },
    
    saveSettings() {
        const schedule = {
            date: document.getElementById('setting-date').value,
            attendanceMode: document.getElementById('setting-mode').value,
            classCode: document.getElementById('setting-class').value,
            verify: document.getElementById('setting-verify').value
        };
        
        state.setSchedule(schedule);
        alert("設定已儲存！");
    }
};
