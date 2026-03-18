export const router = {
    currentView: null,
    routes: {},

    // Register a view logic module
    register(name, module) {
        this.routes[name] = module;
    },

    // Navigate to view template ID name (e.g., 'dashboard')
    navigate(name, params = {}) {
        const tplId = `tpl-${name}`;
        if (!document.getElementById(tplId)) {
            console.error(`Template ${tplId} not found! Fallback to dashboard.`);
            name = 'dashboard';
        }

        const appView = document.getElementById('app-view');
        const tpl = document.getElementById(`tpl-${name}`);
        
        if(appView && tpl) {
            // Clone template content and replace
            appView.innerHTML = '';
            appView.appendChild(tpl.content.cloneNode(true));
        }
        
        // Update sidebar/bottom navigation active states
        document.querySelectorAll('.nav-link').forEach(el => {
            el.classList.remove('active', 'text-primary');
            if (el.dataset.target === name) el.classList.add('active', 'text-primary');
        });

        // Initialize view logic if registered
        if (this.routes[name] && typeof this.routes[name].init === 'function') {
            this.routes[name].init(params);
        }
        
        this.currentView = name;

        // Push to browser history stack
        if (!params.replaceHistory) {
            history.pushState({ view: name, ...params }, '', `#${name}`);
        }
    }
};

window.addEventListener('popstate', (event) => {
    if (event.state && event.state.view) {
        router.navigate(event.state.view, { replaceHistory: true });
    }
});
