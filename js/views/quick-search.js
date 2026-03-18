import { checkinAPI } from '../api.js';

export const quickSearchView = {
    members: [],
    
    async init() {
        this.bindEvents();
        try {
            // For MVP search among the cached attendance list
            this.members = await checkinAPI.getAttendanceList();
        } catch(e) {
            console.error(e);
        }
    },
    
    bindEvents() {
        const input = document.getElementById('qs-search');
        const clearBtn = document.getElementById('qs-clear');
        
        if (input) {
            input.addEventListener('input', (e) => {
                const val = e.target.value.trim();
                clearBtn.classList.toggle('hidden', val.length === 0);
                this.performSearch(val);
            });
            input.focus();
        }
        
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if(input) input.value = '';
                clearBtn.classList.add('hidden');
                this.performSearch('');
            });
        }
        
        const closeDetail = document.getElementById('btn-close-detail');
        if (closeDetail) {
            closeDetail.addEventListener('click', () => {
                document.getElementById('dialog-member-detail').classList.add('hidden');
            });
        }
    },
    
    performSearch(query) {
        const emptyState = document.getElementById('qs-empty-state');
        const resultsEl = document.getElementById('qs-results');
        
        if (!query) {
            emptyState.classList.remove('hidden');
            resultsEl.classList.add('hidden');
            resultsEl.innerHTML = '';
            return;
        }
        
        emptyState.classList.add('hidden');
        resultsEl.classList.remove('hidden');
        
        const q = query.toLowerCase();
        const results = this.members.filter(m => {
            const str = `${m.name} ${m.unit || ''} ${m.class || ''} ${m.title || ''} ${m.phone || ''}`.toLowerCase();
            return str.includes(q);
        });
        
        if (results.length === 0) {
            resultsEl.innerHTML = `<div class="text-center py-8 text-gray-500">找不到符合「${query}」的人員</div>`;
            return;
        }
        
        resultsEl.innerHTML = results.map(m => {
            const isChecked = m.status === '出席';
            const badgeClass = isChecked ? 'badge-success' : 'badge-neutral';
            const badgeText = isChecked ? '已簽' : '未簽';
            
            const dataStr = encodeURIComponent(JSON.stringify(m));
            
            return `
            <div class="card p-4 cursor-pointer hover:bg-gray-50 transition-colors flex items-center justify-between" onclick="window.showMemberDetail('${dataStr}')">
                <div class="flex-1 min-w-0 pr-4">
                    <div class="flex items-center gap-2 mb-1">
                        <span class="font-bold text-gray-800 text-lg md:text-xl truncate">${m.name}</span>
                        ${m.title ? `<span class="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md shrink-0">${m.title}</span>` : ''}
                    </div>
                    <div class="text-sm text-gray-500 truncate">
                        ${m.unit || '無區別'} &bull; ${m.class || '未編班'}
                    </div>
                </div>
                <div class="text-right flex flex-col items-end">
                    <span class="badge ${badgeClass} mb-1">${badgeText}</span>
                    <div class="text-gray-300 text-sm"><i class="fa-solid fa-chevron-right"></i></div>
                </div>
            </div>
            `;
        }).join('');
        
        window.showMemberDetail = (dataStr) => {
            const m = JSON.parse(decodeURIComponent(dataStr));
            const content = document.getElementById('qs-detail-content');
            
            const isChecked = m.status === '出席';
            const checkStatusStr = isChecked 
                ? `<div class="flex items-center gap-2 text-success font-bold"><i class="fa-solid fa-check-circle text-xl"></i> 已報到 <span class="pl-2 font-normal text-sm text-gray-500">${m.checkinTime ? new Date(m.checkinTime).toLocaleTimeString() : ''}</span></div>` 
                : `<div class="flex items-center gap-2 text-gray-400 font-bold"><i class="fa-solid fa-clock text-xl"></i> 尚未報到</div>`;
            
            content.innerHTML = `
                <div class="text-center mb-6">
                    <div class="w-20 h-20 bg-primary-light text-primary rounded-full flex items-center justify-center text-3xl mx-auto mb-3 font-bold border-4 border-white shadow-sm">
                        ${m.name.charAt(0)}
                    </div>
                    <h2 class="text-2xl font-bold text-gray-800">${m.name}</h2>
                    <p class="text-gray-500 mt-1">${m.title || '學長'} &bull; ${m.gender || '未知'}</p>
                </div>
                
                <div class="bg-gray-50 rounded-lg p-4 mb-6 text-base tracking-wide border border-gray-100">
                    ${checkStatusStr}
                </div>
                
                <div class="space-y-4 text-base">
                    <div class="flex py-3 border-b border-gray-100">
                        <span class="w-1/3 text-gray-400 font-medium">區別</span>
                        <span class="w-2/3 text-gray-800 font-medium">${m.unit || '-'}</span>
                    </div>
                    <div class="flex py-3 border-b border-gray-100">
                        <span class="w-1/3 text-gray-400 font-medium">實體班級</span>
                        <span class="w-2/3 text-gray-800 font-medium">${m.class || '-'}</span>
                    </div>
                    <div class="flex py-3">
                        <span class="w-1/3 text-gray-400 font-medium">系統 ID</span>
                        <span class="w-2/3 text-gray-500 break-all font-mono text-sm">${m.id}</span>
                    </div>
                </div>
                
                ${!isChecked ? `
                <button class="w-full mt-8 btn-primary py-4 rounded-xl font-bold shadow-md text-lg active:scale-[0.98] transition-transform" onclick="window.quickCheckin('${m.id}')">
                    <i class="fa-solid fa-check mr-2"></i> 幫他報到
                </button>
                ` : ''}
            `;
            
            window.quickCheckin = async (id) => {
                if(confirm(`確定要將 ${m.name} 標記為已報到？`)) {
                    try {
                        await checkinAPI.markCheckin(id);
                        document.getElementById('dialog-member-detail').classList.add('hidden');
                        alert("報到成功");
                        // re-trigger search to update ui
                        const input = document.getElementById('qs-search');
                        if(input) quickSearchView.performSearch(input.value.trim());
                    } catch(e) {
                        alert("報到失敗: " + e.message);
                    }
                }
            };
            
            document.getElementById('dialog-member-detail').classList.remove('hidden');
        };
    }
};
