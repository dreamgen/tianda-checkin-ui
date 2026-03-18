import { state } from '../state.js';
import { checkinAPI } from '../api.js';

export const dashboardView = {
    async init(params) {
        if (!state.currentSchedule) {
            console.warn("No active schedule, redirecting to settings");
            return;
        }
        
        this.renderScheduleInfo();
        await this.loadStats();
    },
    
    renderScheduleInfo() {
        const titleEl = document.getElementById('db-schedule-title');
        if (titleEl && state.currentSchedule) {
            titleEl.textContent = `${state.currentSchedule.date} ${state.currentSchedule.attendanceMode}${state.currentSchedule.classCode}班`;
        }
    },
    
    async loadStats() {
        try {
            const list = await checkinAPI.getAttendanceList();
            const total = list.length;
            const presentList = list.filter(m => m.status === '出席');
            const present = presentList.length;
            const male = presentList.filter(m => m.gender === '乾').length;
            const female = presentList.filter(m => m.gender === '坤').length;
            const rate = total > 0 ? Math.round((present / total) * 100) : 0;
            
            this.updateDOM('db-stat-total', total);
            this.updateDOM('db-stat-present', present);
            this.updateDOM('db-stat-rate', `${rate}%`);
            this.updateDOM('db-stat-male', male);
            this.updateDOM('db-stat-female', female);
            
        } catch(e) {
            console.error("Failed to load stats", e);
        }
    },
    
    updateDOM(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }
};
