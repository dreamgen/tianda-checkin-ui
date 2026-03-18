import { checkinAPI } from '../api.js';

export const attendanceStatsView = {
    members: [],
    
    async init() {
        await this.loadData();
    },
    
    async loadData() {
        try {
            this.members = await checkinAPI.getAttendanceList();
            document.getElementById('as-loading')?.classList.add('hidden');
            document.getElementById('as-content')?.classList.remove('hidden');
            this.render();
        } catch(e) {
            const loadingEl = document.getElementById('as-loading');
            if(loadingEl) loadingEl.innerHTML = `<p class="text-danger">載入失敗: ${e.message}</p>`;
        }
    },
    
    render() {
        const total = this.members.length;
        const checked = this.members.filter(m => m.status === '出席').length;
        const rate = total === 0 ? 0 : Math.round((checked / total) * 100);
        
        const cardsEl = document.getElementById('as-cards');
        if (cardsEl) {
            cardsEl.innerHTML = `
                <div class="card p-4 text-center shadow-sm">
                    <p class="text-xs text-gray-400 mb-1">應到人數</p>
                    <p class="text-3xl font-bold text-gray-800">${total}</p>
                </div>
                <div class="card p-4 text-center shadow-sm">
                    <p class="text-xs text-gray-400 mb-1">實到人數</p>
                    <p class="text-3xl font-bold text-success">${checked}</p>
                </div>
                <div class="card p-4 text-center shadow-sm">
                    <p class="text-xs text-gray-400 mb-1">未報到</p>
                    <p class="text-3xl font-bold text-danger">${total - checked}</p>
                </div>
                <div class="card p-4 text-center shadow-sm">
                    <p class="text-xs text-gray-400 mb-1">總出席率</p>
                    <p class="text-3xl font-bold text-primary">${rate}%</p>
                </div>
            `;
        }
        
        // Group by unit
        const units = {};
        this.members.forEach(m => {
            const u = m.unit || '無區別';
            if(!units[u]) units[u] = { total: 0, checked: 0 };
            units[u].total++;
            if(m.status === '出席') units[u].checked++;
        });
        
        const unitStatsEl = document.getElementById('as-unit-stats');
        if (unitStatsEl) {
            const unitHtml = Object.keys(units).sort().map(u => {
                const ut = units[u].total;
                const uc = units[u].checked;
                const ur = ut === 0 ? 0 : Math.round((uc / ut) * 100);
                
                return `
                <div class="card p-4 shadow-sm">
                    <div class="flex justify-between items-center mb-2">
                        <h4 class="font-bold text-gray-700">${u}</h4>
                        <span class="text-sm font-bold text-gray-500">${uc} / ${ut} <span class="pl-2 font-medium text-xs text-gray-400">(${ur}%)</span></span>
                    </div>
                    <div class="w-full bg-gray-100 rounded-full h-3 select-none">
                        <div class="bg-primary h-3 rounded-full transition-all duration-500 ease-out" style="width: ${ur}%"></div>
                    </div>
                </div>`;
            }).join('');
            
            unitStatsEl.innerHTML = unitHtml;
        }
    }
};
