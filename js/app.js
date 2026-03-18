import { state } from './state.js';
import { router } from './router.js';

// Import Views (Will be added as they are created)
import { dashboardView } from './views/dashboard.js';
import { settingsView } from './views/settings.js';
import { scannerView } from './views/scanner.js';
import { manualCheckinView } from './views/manual-checkin.js';
import { quickSearchView } from './views/quick-search.js';
import { memberListView } from './views/member-list.js';
import { classView } from './views/class-view.js';
import { attendanceStatsView } from './views/attendance-stats.js';
import { classScheduleView } from './views/class-schedule.js';

// Register views
router.register('dashboard', dashboardView);
router.register('settings', settingsView);
router.register('scanner', scannerView);
router.register('manual-checkin', manualCheckinView);
router.register('quick-search', quickSearchView);
router.register('member-list', memberListView);
router.register('class-view', classView);
router.register('attendance-stats', attendanceStatsView);
router.register('class-schedule', classScheduleView);

// Global app entry point
document.addEventListener('DOMContentLoaded', () => {
    console.log("App Initialized with Schedule:", state.currentSchedule);
    
    // Bind all navigation links (Sidebar and Bottom Nav)
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = e.currentTarget.closest('.nav-link').dataset.target;
            if (target) {
                router.navigate(target);
            }
        });
    });

    // Handle Route Initial Load
    const hash = window.location.hash.slice(1);
    
    // Default Route check: Must have settings configured
    if (!state.currentSchedule && hash !== 'settings') {
        console.warn('No active schedule set. We should redirect to settings, but defaulting to dashboard for scaffold.');
        router.navigate('dashboard', { replaceHistory: true }); 
        // Later: router.navigate('settings', { replaceHistory: true });
    } else if (hash) {
        router.navigate(hash, { replaceHistory: true });
    } else {
        router.navigate('dashboard', { replaceHistory: true });
    }
});
