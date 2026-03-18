import { systemAPI } from '../api.js';

export const classScheduleView = {
    schedules: [],
    
    async init() {
        await this.loadData();
    },
    
    async loadData() {
        try {
            this.schedules = await systemAPI.getSchedules('all');
            document.getElementById('cs-loading')?.classList.add('hidden');
            this.render();
        } catch(e) {
            const loadingEl = document.getElementById('cs-loading');
            if(loadingEl) loadingEl.innerHTML = `<p class="text-danger flex flex-col items-center"><i class="fa-solid fa-triangle-exclamation text-3xl mb-2"></i>暫無可用之歷史班程API支援。<br/><span class="text-sm text-gray-400 mt-2">${e.message}</span></p>`;
        }
    },
    
    render() {
        const listEl = document.getElementById('cs-content');
        if (!listEl) return;
        
        if (!this.schedules || this.schedules.length === 0) {
            listEl.innerHTML = `<div class="text-center py-8 text-gray-500">尚無班程維護資料。</div>`;
            return;
        }

        listEl.innerHTML = this.schedules.map(s => {
            // Assume isActive if date >= today or some marker. Here using checking active state simply
            const isLatest = true; // placeholder till API returns isActive flag
            return `
            <div class="card p-4 flex items-center justify-between hover:bg-gray-50 shadow-sm border-l-4 border-primary">
                <div>
                    <h3 class="font-bold text-gray-800 text-lg mb-1">${s.name || s.scheduleNote || '不分類班程'}</h3>
                    <div class="text-sm text-gray-500 flex gap-4">
                        <span><i class="fa-regular fa-calendar mr-1"></i> ${s.date || '無日期'}</span>
                    </div>
                </div>
                <div class="text-gray-300">
                    <i class="fa-solid fa-chevron-right"></i>
                </div>
            </div>`;
        }).join('');
    }
};
