import { checkinAPI } from '../api.js';

export const classView = {
    members: [],
    
    async init() {
        await this.loadData();
    },
    
    async loadData() {
        try {
            this.members = await checkinAPI.getAttendanceList();
            document.getElementById('cv-loading')?.classList.add('hidden');
            this.render();
        } catch(e) {
            const listEl = document.getElementById('cv-content');
            if(listEl) listEl.innerHTML = `<p class="text-danger text-center">載入失敗: ${e.message}</p>`;
        }
    },
    
    render() {
        const listEl = document.getElementById('cv-content');
        if (!listEl) return;
        
        // Group by class
        const groups = {};
        this.members.forEach(m => {
            const className = m.class || '未編班';
            if (!groups[className]) groups[className] = [];
            groups[className].push(m);
        });
        
        const sortedClasses = Object.keys(groups).sort()
        
        if (sortedClasses.length === 0) {
            listEl.innerHTML = `<div class="text-center py-8 text-gray-500">無資料</div>`;
            return;
        }

        listEl.innerHTML = sortedClasses.map(className => {
            const classMembers = groups[className];
            const checkedCount = classMembers.filter(m => m.status === '出席').length;
            
            const memberHtml = classMembers.map(m => {
                const isChecked = m.status === '出席';
                const textClass = isChecked ? 'text-gray-900 font-medium' : 'text-gray-400';
                const iconHtml = isChecked ? '<i class="fa-solid fa-check text-success"></i>' : '';
                
                return `
                <div class="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                    <span class="${textClass}">${m.name}</span>
                    <span class="text-sm w-5">${iconHtml}</span>
                </div>
                `;
            }).join('');
            
            return `
            <div class="card p-4">
                <div class="flex justify-between items-center mb-3">
                    <h3 class="font-bold text-lg text-primary">${className}</h3>
                    <span class="badge ${checkedCount === classMembers.length ? 'badge-success' : 'badge-neutral'}">
                        ${checkedCount} / ${classMembers.length}
                    </span>
                </div>
                <div class="text-base text-gray-500 pl-1">
                    ${memberHtml}
                </div>
            </div>`;
        }).join('');
    }
};
