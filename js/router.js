/**
 * js/router.js - SPA 路由器
 * 管理 View 切換與生命週期
 */

const VIEWS = {
  'welcome': {
    title: '歡迎使用',
    navTab: 'home',
    sidebarItem: 'dashboard',
    init: null,
  },
  'dashboard': {
    title: '即時主頁',
    navTab: 'home',
    sidebarItem: 'dashboard',
    init: null, // 由 views/dashboard.js 設定
  },
  'scanner': {
    title: '掃描報到',
    navTab: 'scanner',
    sidebarItem: 'scanner',
    init: null,
  },
  'manual-checkin': {
    title: '簡易報到',
    navTab: 'scanner',
    sidebarItem: 'manual-checkin',
    init: null,
  },
  'quick-search': {
    title: '快速查詢',
    navTab: 'search',
    sidebarItem: 'quick-search',
    init: null,
  },
  'member-list': {
    title: '班員資料',
    navTab: 'search',
    sidebarItem: 'member-list',
    init: null,
  },
  'member-detail': {
    title: '班員詳細',
    navTab: 'search',
    sidebarItem: 'member-list',
    init: null,
  },
  'class-view': {
    title: '分班檢視',
    navTab: 'search',
    sidebarItem: 'class-view',
    init: null,
  },
  'attendance-stats': {
    title: '出席統計',
    navTab: 'stats',
    sidebarItem: 'attendance-stats',
    init: null,
  },
  'class-schedule': {
    title: '班程資料',
    navTab: 'more',
    sidebarItem: 'class-schedule',
    init: null,
  },
  'settings': {
    title: '工具設定',
    navTab: 'more',
    sidebarItem: 'settings',
    init: null,
  },
};

let _currentView = null;
let _viewInitFns = {};
let _memberDetailData = null; // 傳遞給 member-detail 的資料

const Router = {
  /** 註冊 View 初始化函式 */
  register(viewName, initFn) {
    _viewInitFns[viewName] = initFn;
  },

  /** 導航到指定 View */
  navigateTo(viewName, params = {}) {
    if (viewName === 'member-detail' && params.member) {
      _memberDetailData = params.member;
    }

    const viewConfig = VIEWS[viewName];
    if (!viewConfig) {
      console.error('Unknown view:', viewName);
      return;
    }

    // 更新 header 標題
    const headerTitle = document.getElementById('header-title');
    if (headerTitle) headerTitle.textContent = viewConfig.title;

    // 更新 desktop sidebar 活躍狀態
    document.querySelectorAll('.sidebar-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === viewConfig.sidebarItem);
    });

    // 更新 bottom nav 活躍狀態
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.tab === viewConfig.navTab);
    });

    // 渲染 view template
    const template = document.getElementById(`tpl-${viewName}`);
    const container = document.getElementById('app-view');
    if (!template || !container) {
      console.error('Template not found:', `tpl-${viewName}`);
      return;
    }

    container.innerHTML = '';
    const clone = template.content.cloneNode(true);
    const wrapper = document.createElement('div');
    wrapper.className = 'view-container fade-in';
    wrapper.appendChild(clone);
    container.appendChild(wrapper);

    _currentView = viewName;

    // 執行 init 函式
    const initFn = _viewInitFns[viewName];
    if (initFn) {
      try { initFn(params); } catch (e) { console.error(`View init error [${viewName}]:`, e); }
    }

    // 關閉 mobile sidebar（如果開著）
    const mobileSidebar = document.getElementById('mobile-sidebar');
    if (mobileSidebar) closeMobileSidebar();
  },

  /** 取得目前 View */
  current() { return _currentView; },

  /** 取得 member-detail 資料 */
  getMemberDetailData() { return _memberDetailData; },
};

window.Router = Router;
