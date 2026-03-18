import { checkinAPI } from '../api.js';
import { db, ref, onValue } from '../firebase-config.js';
import { state } from '../state.js';

export const manualCheckinView = {
    members: [],
    currentFilter: 'all',
    searchQuery: '',
    dbListenerRef: null,

    async init() {
        if (!state.currentSchedule) {
            console.warn("No active schedule, redirecting to settings");
            return;
        }
        this.bindEvents();
        await this.loadData();
        this.setupRealtimeListener();
    },

    bindEvents() {
        const searchInput = document.getElementById('mc-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.toLowerCase().trim();
                this.renderList();
            });
        }

        const filters = document.getElementById('mc-filters');
        if (filters) {
            filters.addEventListener('click', (e) => {
                const btn = e.target.closest('.filter-btn');
                if (btn) {
                    document.querySelectorAll('.filter-btn').forEach(b => {
                        b.classList.remove('badge-primary');
                        b.classList.add('badge-neutral');
                        b.classList.replace('text-white', 'text-neutral'); // adjust tailwind
                    });
                    btn.classList.add('badge-primary');
                    btn.classList.remove('badge-neutral');
                    
                    this.currentFilter = btn.dataset.filter;
                    this.renderList();
                }
            });
        }
        
        // Temp Modal
        const btnAddTemp = document.getElementById('btn-add-temp');
        const dialogAddTemp = document.getElementById('dialog-add-temp');
        const btnCancelTemp = document.getElementById('btn-cancel-temp');
        const btnSubmitTemp = document.getElementById('btn-submit-temp');
        
        if(btnAddTemp) btnAddTemp.onclick = () => dialogAddTemp.classList.remove('hidden');
        if(btnCancelTemp) btnCancelTemp.onclick = () => dialogAddTemp.classList.add('hidden');
        if(btnSubmitTemp) btnSubmitTemp.onclick = () => this.addTempMember();
    },

    async loadData() {
        try {
            this.members = await checkinAPI.getAttendanceList();
            document.getElementById('mc-loading')?.classList.add('hidden');
            this.renderList();
        } catch(e) {
            const listEl = document.getElementById('mc-list');
            if(listEl) listEl.innerHTML = `<p class="text-danger text-center">載入失敗: ${e.message}</p>`;
        }
    },

    setupRealtimeListener() {
        const scheduleNote = state.getScheduleNote();
        const dateStr = state.currentSchedule?.date;
        if(!scheduleNote || !dateStr) return;
        
        const path = `attendance/${dateStr}_${scheduleNote}`;
        this.dbListenerRef = ref(db, path);
        
        onValue(this.dbListenerRef, (snapshot) => {
            if (snapshot.exists()) {
                this.members = Object.values(snapshot.val());
                this.renderList();
            }
        });
    },

    renderList() {
        const listEl = document.getElementById('mc-list');
        if (!listEl) return;

        let filtered = this.members.filter(m => {
            if (this.currentFilter === 'pending' && m.status === '出席') return false;
            if (this.currentFilter === 'checked' && m.status !== '出席') return false;
            if (this.currentFilter === 'temp' && !m.isTemp) return false;
            
            if (this.searchQuery) {
                const searchStr = `${m.name} ${m.unit || ''} ${m.class || ''} ${m.title || ''}`.toLowerCase();
                if (!searchStr.includes(this.searchQuery)) return false;
            }
            return true;
        });
        
        this.updateFilterCounts();

        if (filtered.length === 0) {
            listEl.innerHTML = `<div class="text-center py-8 text-gray-500">無符合名單</div>`;
            return;
        }

        // Generate HTML list
        const html = filtered.map(m => {
            const isChecked = m.status === '出席';
            const checkIcon = isChecked 
                ? `<div class="w-8 h-8 rounded-full bg-success text-white flex justify-center items-center shadow-sm"><i class="fa-solid fa-check"></i></div>`
                : `<div class="w-8 h-8 rounded-full border-2 border-gray-300 flex justify-center items-center text-transparent hover:border-gray-400"><i class="fa-solid fa-check"></i></div>`;
            
            return `
            <div class="card p-3 flex items-center gap-4 cursor-pointer hover:bg-gray-50 transition-colors" onclick="window.toggleCheckin('${m.id}', ${!isChecked})">
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                        <span class="font-bold text-gray-800 text-lg sm:text-base large-text:text-xl">${m.name}</span>
                        ${m.title ? `<span class="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md truncate">${m.title}</span>` : ''}
                        ${m.isTemp ? `<span class="text-xs px-2 py-0.5 bg-warning bg-opacity-20 text-warning rounded-md">臨時</span>` : ''}
                    </div>
                    <div class="flex items-center gap-2 text-sm text-gray-500 truncate mt-1">
                        <span>${m.unit || '無區別'}</span>
                        <span>&bull;</span>
                        <span>${m.gender || '-'}</span>
                    </div>
                </div>
                <div>${checkIcon}</div>
            </div>`;
        }).join('');
        
        listEl.innerHTML = html;
        
        window.toggleCheckin = async (id, toCheckin) => {
            if(toCheckin) {
                try {
                    await checkinAPI.markCheckin(id); 
                } catch(e) { alert("報到寫入失敗"); }
            } else {
                alert("取消報到功能尚在規劃中。");
            }
        };
    },
    
    updateFilterCounts() {
        const total = this.members.length;
        const checked = this.members.filter(m=>m.status === '出席').length;
        const pending = total - checked;
        const temp = this.members.filter(m=>m.isTemp).length;
        
        const btns = document.querySelectorAll('.filter-btn');
        if(btns.length > 3) {
            btns[0].textContent = `全部 (${total})`;
            btns[1].textContent = `未簽 (${pending})`;
            btns[2].textContent = `已簽 (${checked})`;
            btns[3].textContent = `臨時 (${temp})`;
        }
    },
    
    async addTempMember() {
        const name = document.getElementById('temp-name').value.trim();
        const unit = document.getElementById('temp-unit').value.trim();
        
        if(!name) { alert("請輸入姓名"); return; }
        
        const tempId = 'temp_' + new Date().getTime();
        try {
            await checkinAPI.markCheckin(tempId, {
                id: tempId,
                name: name,
                unit: unit || '臨時報到',
                isTemp: true,
                gender: '未知'
            }, true);
            
            document.getElementById('dialog-add-temp').classList.add('hidden');
            document.getElementById('temp-name').value = '';
            document.getElementById('temp-unit').value = '';
            
        } catch(e) {
            alert("新增臨時報到失敗: " + e.message);
        }
    }
};
