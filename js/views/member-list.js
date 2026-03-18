import { checkinAPI } from '../api.js';

export const memberListView = {
    members: [],
    
    async init() {
        this.bindEvents();
        await this.loadData();
    },
    
    bindEvents() {
        const input = document.getElementById('ml-search');
        if (input) {
            input.addEventListener('input', (e) => {
                this.render(e.target.value.trim().toLowerCase());
            });
        }
    },
    
    async loadData() {
        try {
            this.members = await checkinAPI.getAttendanceList();
            document.getElementById('ml-loading')?.classList.add('hidden');
            this.render();
        } catch(e) {
            const listEl = document.getElementById('ml-content');
            if(listEl) listEl.innerHTML = `<p class="text-danger text-center">載入失敗: ${e.message}</p>`;
        }
    },
    
    render(query = '') {
        const listEl = document.getElementById('ml-content');
        if (!listEl) return;
        
        let filtered = this.members;
        if (query) {
            filtered = this.members.filter(m => {
                const str = `${m.name} ${m.unit || ''} ${m.class || ''} ${m.title || ''}`.toLowerCase();
                return str.includes(query);
            });
        }
        
        if (filtered.length === 0) {
            listEl.innerHTML = `<div class="text-center py-8 text-gray-500">無資料</div>`;
            return;
        }

        listEl.innerHTML = filtered.map(m => {
            return `
            <div class="card p-3 flex items-center gap-4 hover:bg-gray-50">
                <div class="w-10 h-10 rounded-full bg-primary-light text-primary flex justify-center items-center font-bold flex-shrink-0">
                    ${m.name.charAt(0)}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                        <span class="font-bold text-gray-800">${m.name}</span>
                        ${m.title ? `<span class="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md">${m.title}</span>` : ''}
                    </div>
                    <div class="text-sm text-gray-500 truncate">
                        ${m.unit || '無區別'} &bull; ${m.class || '未編班'} &bull; ${m.gender || '未知'}
                    </div>
                </div>
            </div>`;
        }).join('');
    }
};
