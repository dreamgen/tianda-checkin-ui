/**
 * app.js
 * Core logic for the Prototype Layout (Navigation and View switching)
 */

document.addEventListener('DOMContentLoaded', () => {
    // State
    let currentView = 'student-dashboard'; // Default view
    let userRole = 'admin'; // 'student' or 'admin' - used to toggle sidebar items

    // DOM Elements
    const mainContent = document.getElementById('main-content');
    const navItems = document.querySelectorAll('.nav-item');
    const sidebarItems = document.querySelectorAll('.sidebar-item');
    const headerTitle = document.getElementById('header-title');

    // Title mapping for views
    const viewTitles = {
        'student-dashboard': '報到系統 - 天達大班',
        'admin-scanner': '掃描報到',
        'admin-manual-checkin': '匯入 / 簡易報到',
        'member-list': '班員資料',
        'member-detail': '個人詳細資料',
        'class-view': '班員資料 - 分班檢視',
        'quick-search': '快速查詢',
        'attendance-stats': '出席統計',
        'class-schedule': '班程資料',
        'tool-settings': '工具設定'
    };

    // Routing function
    async function loadView(viewName) {
        if (!viewName) return;
        
        try {
            // Attempt to fetch the HTML snippet for the view
            const response = await fetch(`views/${viewName}.html`);
            if (response.ok) {
                const html = await response.text();
                mainContent.innerHTML = `<div class="fade-in max-w-5xl mx-auto">${html}</div>`;
                
                // Update active state in UI
                updateActiveNav(viewName);
                
                // Update Header
                if(headerTitle) {
                    headerTitle.textContent = viewTitles[viewName] || '天達大班報到系統';
                }

                currentView = viewName;

                // Fire custom event for specific view initialization if needed
                document.dispatchEvent(new CustomEvent('viewLoaded', { detail: { view: viewName } }));

            } else {
                mainContent.innerHTML = `
                    <div class="flex flex-col items-center justify-center h-full p-8 text-center fade-in">
                        <div class="text-6xl mb-4">🚧</div>
                        <h2 class="text-xl font-bold mb-2">畫面建置中</h2>
                        <p class="text-[var(--color-subtext)]">The view <code>views/${viewName}.html</code> has not been created yet.</p>
                    </div>
                `;
                updateActiveNav(viewName);
                if(headerTitle) headerTitle.textContent = viewTitles[viewName] || '施工中';
            }
        } catch (error) {
            console.error("Error loading view:", error);
            mainContent.innerHTML = `<div class="p-8 text-red-500">Error loading view: ${error.message}</div>`;
        }
    }

    // Helper: Update active class on navigation elements
    function updateActiveNav(viewName) {
        // We map specific views to bottom nav tabs
        const mainTabMap = {
            'student-dashboard': 'home',
            'admin-scanner': 'scanner',
            'quick-search': 'search',
            'member-list': 'search',
            'attendance-stats': 'stats',
            // Default others to 'more'
        };

        const activeTab = mainTabMap[viewName] || 'more';

        navItems.forEach(item => {
            if (item.dataset.target === activeTab) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Sidebar items exactly match view names usually
        sidebarItems.forEach(item => {
            if (item.dataset.view === viewName) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    // Event Listeners for Navigation
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            // Map bottom nav to default views for that section
            const target = item.dataset.target;
            let viewToLoad = 'student-dashboard';
            
            if (target === 'scanner') viewToLoad = 'admin-scanner';
            if (target === 'search') viewToLoad = 'quick-search';
            if (target === 'stats') viewToLoad = 'attendance-stats';
            if (target === 'more') viewToLoad = 'tool-settings'; // Default for more

            loadView(viewToLoad);
        });
    });

    sidebarItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const viewName = item.dataset.view;
            loadView(viewName);
        });
    });
    
    // Simulate Login Role Toggle (For development preview)
    const roleToggleBtn = document.getElementById('dev-role-toggle');
    if(roleToggleBtn) {
        roleToggleBtn.addEventListener('click', () => {
            userRole = userRole === 'admin' ? 'student' : 'admin';
            alert(`Switched to ${userRole} view (Refresh logic to be fully implemented)`);
            // In a real app, this would hide/show admin items in sidebar
        });
    }

    // Initial Load
    // Generate empty placeholder files for testing setup, then load default
    loadView(currentView);
});
