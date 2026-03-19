/**
 * js/app.js - 主應用程式邏輯
 * 天達大班報到系統 PWA v1.1
 */

// ── Global state ─────────────────────────────────────────────────────────────
let _html5QrCode = null;
let _scannerFacingMode = 'environment';
let _currentAttendance = {};   // id -> {isCheckedIn, isLeave, status}
let _allMembers = [];
let _mcChecked = new Set();    // manually checked IDs in manual-checkin
let _mlViewMode = 'list';      // 'list' or 'grid'
let _qsActiveFilters = {};     // active filters for quick-search
let _shareUrl = '';            // generated share URL

// ── Sidebar Config ────────────────────────────────────────────────────────────
const SIDEBAR_ITEMS = [
  { view: 'dashboard',        icon: 'fa-house',          label: '即時主頁' },
  { divider: true },
  { view: 'scanner',          icon: 'fa-qrcode',         label: 'QR 掃描報到' },
  { view: 'manual-checkin',   icon: 'fa-list-check',     label: '簡易報到' },
  { divider: true },
  { view: 'quick-search',     icon: 'fa-magnifying-glass', label: '快速查詢' },
  { view: 'member-list',      icon: 'fa-users',          label: '班員資料' },
  { view: 'class-view',       icon: 'fa-layer-group',    label: '分班檢視' },
  { divider: true },
  { view: 'attendance-stats', icon: 'fa-chart-bar',      label: '出席統計' },
  { view: 'class-schedule',   icon: 'fa-calendar-days',  label: '班程資料' },
  { divider: true },
  { view: 'settings',         icon: 'fa-gear',           label: '工具設定' },
];

function buildSidebar(navId) {
  const nav = document.getElementById(navId);
  if (!nav) return;
  nav.innerHTML = SIDEBAR_ITEMS.map(item => {
    if (item.divider) return `<div class="sidebar-divider"></div>`;
    return `<div class="sidebar-item" data-view="${item.view}" onclick="Router.navigateTo('${item.view}')">
      <i class="fa-solid ${item.icon}"></i> ${item.label}
    </div>`;
  }).join('');
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, type = 'info', duration = 3000) {
  const icons = { success: 'fa-check-circle', error: 'fa-circle-xmark', info: 'fa-circle-info' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i> ${msg}`;
  const container = document.getElementById('toast-container');
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity .3s';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ── Loading ───────────────────────────────────────────────────────────────────
function showLoading(msg = '載入中...') {
  const el = document.getElementById('loading-overlay');
  const msgEl = document.getElementById('loading-msg');
  if (msgEl) msgEl.textContent = msg;
  el.classList.add('show');
}
function hideLoading() {
  document.getElementById('loading-overlay').classList.remove('show');
}

// ── Background loading (non-blocking spinner) ──────────────────────────────
let _bgLoadingCount = 0;
function showBgLoading() {
  _bgLoadingCount++;
  const el = document.getElementById('bg-loading');
  if (el) el.classList.remove('hidden');
}
function hideBgLoading() {
  if (--_bgLoadingCount <= 0) {
    _bgLoadingCount = 0;
    const el = document.getElementById('bg-loading');
    if (el) el.classList.add('hidden');
  }
}

// ── Verify helper ─────────────────────────────────────────────────────────
function getVerify() {
  return State.getSchedule()?.verify || 'passf';
}

// ── Schedules fetch with daily cache ──────────────────────────────────────
async function fetchSchedules(filter = 'all', forceRefresh = false) {
  if (!forceRefresh) {
    const cached = State.getSchedulesCache(filter);
    if (cached) return cached;
  }
  const data = await API.getSchedules(filter);
  State.setSchedulesCache(filter, data);
  return data;
}

// ── Mobile Sidebar ────────────────────────────────────────────────────────────
function openMobileSidebar() {
  document.getElementById('mobile-sidebar-panel').classList.add('open');
  document.getElementById('mobile-sidebar-overlay').classList.add('open');
}
function closeMobileSidebar() {
  document.getElementById('mobile-sidebar-panel').classList.remove('open');
  document.getElementById('mobile-sidebar-overlay').classList.remove('open');
}

// ── Schedule Info ─────────────────────────────────────────────────────────────
function updateScheduleDisplay() {
  const schedule = State.getSchedule();
  const badge = document.getElementById('schedule-badge');
  const info = document.getElementById('sidebar-schedule-info');
  const infoMobile = document.getElementById('sidebar-schedule-info-mobile');
  if (schedule && schedule.date) {
    const txt = `${schedule.date} ${schedule.className || ''} ${schedule.attendanceMode || ''}`;
    if (badge) { badge.textContent = schedule.date; badge.classList.remove('hidden'); }
    if (info) info.textContent = txt;
    if (infoMobile) infoMobile.textContent = txt;
  } else {
    if (badge) badge.classList.add('hidden');
    if (info) info.textContent = '尚未設定班次';
    if (infoMobile) infoMobile.textContent = '尚未設定班次';
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function genderBadge(gender) {
  if (!gender) return '';
  if (gender === '男' || gender === '乾') return '<span class="badge badge-male">乾</span>';
  if (gender === '女' || gender === '坤') return '<span class="badge badge-female">坤</span>';
  return `<span class="badge badge-unknown">${gender}</span>`;
}

function statusBadge(att) {
  if (!att) return '<span class="badge badge-unknown">未知</span>';
  if (att.isCheckedIn) return `<span class="badge badge-present">${att.statusRaw || '已到'}</span>`;
  if (att.isLeave) return `<span class="badge badge-leave">${att.statusRaw || '請假'}</span>`;
  return '<span class="badge badge-absent">未到</span>';
}

function avatarColor(name) {
  const colors = [
    'linear-gradient(135deg,#2F6783,#3d8aa8)',
    'linear-gradient(135deg,#10B97A,#059669)',
    'linear-gradient(135deg,#7C3AED,#6D28D9)',
    'linear-gradient(135deg,#DC2626,#B91C1C)',
    'linear-gradient(135deg,#D97706,#B45309)',
    'linear-gradient(135deg,#0891B2,#0E7490)',
  ];
  const code = (name || '?').charCodeAt(0);
  return colors[code % colors.length];
}

// ── WELCOME ───────────────────────────────────────────────────────────────────
let _welcomeSchedules = [];
let _welcomeSelectedClass = null;

Router.register('welcome', async () => {
  _welcomeSchedules = [];
  _welcomeSelectedClass = null;

  // Start fetching schedules with 3-second timeout
  const schedulesPromise = fetchSchedules('all');
  const timeout = new Promise((_, rej) => setTimeout(() => rej('timeout'), 3000));

  try {
    const schedules = await Promise.race([schedulesPromise, timeout]);
    _welcomeSchedules = Array.isArray(schedules) ? schedules : [];

    const loadingEl = document.getElementById('welcome-loading');
    if (loadingEl) loadingEl.classList.add('hidden');

    const classes = [...new Set(_welcomeSchedules.map(s => s.className).filter(Boolean))];
    if (classes.length === 1) {
      await selectWelcomeClass(classes[0]);
    } else if (classes.length > 1) {
      const section = document.getElementById('welcome-class-section');
      const chips = document.getElementById('welcome-class-chips');
      if (section && chips) {
        chips.innerHTML = classes.map(c =>
          `<button class="class-chip" onclick="selectWelcomeClass('${c}')">${c}</button>`
        ).join('');
        section.classList.remove('hidden');
      }
    }
  } catch {
    // Timeout or error — hide spinner, show start button
    const loadingEl = document.getElementById('welcome-loading');
    if (loadingEl) loadingEl.classList.add('hidden');
  }
});

async function selectWelcomeClass(className) {
  _welcomeSelectedClass = className;
  State.setPreferredClass(className);

  // Mark chip selected
  document.querySelectorAll('.class-chip').forEach(chip => {
    chip.classList.toggle('selected', chip.textContent.trim() === className);
  });

  const previewEl = document.getElementById('welcome-schedule-preview');
  if (!previewEl) return;

  const today = new Date().toISOString().split('T')[0];
  const classSchedules = _welcomeSchedules.filter(s => s.className === className);

  // Find most recent past schedule
  const pastSchedules = classSchedules.filter(s => s.date <= today).sort((a, b) => b.date.localeCompare(a.date));
  const futureSchedules = classSchedules.filter(s => s.date > today).sort((a, b) => a.date.localeCompare(b.date));

  previewEl.classList.remove('hidden');

  if (pastSchedules.length > 0) {
    const last = pastSchedules[0];
    try {
      showBgLoading();
      const stats = await API.getAttendanceStats(last.date, last.classCode);
      hideBgLoading();
      const { present = 0, absent = 0, leave = 0, total = 0 } = stats;
      const rate = total > 0 ? Math.round((present / total) * 100) : 0;
      const statsCard = document.getElementById('welcome-stats-card');
      if (statsCard) {
        document.getElementById('wkpi-present').textContent = present;
        document.getElementById('wkpi-absent').textContent = absent;
        document.getElementById('wkpi-leave').textContent = leave;
        document.getElementById('wkpi-rate').textContent = rate + '%';
        document.getElementById('wkpi-fill').style.width = rate + '%';
        statsCard.classList.remove('hidden');
      }
    } catch { hideBgLoading(); }
  } else if (futureSchedules.length > 0) {
    const next = futureSchedules[0];
    const nextCard = document.getElementById('welcome-next-card');
    if (nextCard) {
      document.getElementById('welcome-next-date').textContent = next.dateFormatted || next.date;
      document.getElementById('welcome-next-name').textContent = next.className || '';
      nextCard.classList.remove('hidden');
    }
  }
}

function startFromWelcome() {
  State.setOnboarded();
  Router.navigateTo('dashboard');
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function formatUpdateTime(d = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function renderDashStats(data, timestamp) {
  const { present = 0, absent = 0, leave = 0, total = 0, male = 0, female = 0, byUnit = [] } = data;
  const rate = total > 0 ? Math.round((present / total) * 100) : 0;

  document.getElementById('kpi-present').textContent = present;
  document.getElementById('kpi-absent').textContent = absent;
  document.getElementById('kpi-leave').textContent = leave;
  document.getElementById('kpi-rate').textContent = rate + '%';
  document.getElementById('dash-progress-text').textContent = `${present} / ${total}`;
  document.getElementById('dash-progress-fill').style.width = rate + '%';
  document.getElementById('kpi-male').textContent = male;
  document.getElementById('kpi-female').textContent = female;

  const noData = document.getElementById('dash-no-data');
  if (noData) noData.classList.toggle('hidden', total > 0);

  if (byUnit.length > 0) {
    const byUnitEl = document.getElementById('dash-by-unit');
    if (byUnitEl) byUnitEl.classList.remove('hidden');
    const listEl = document.getElementById('dash-unit-list');
    if (listEl) listEl.innerHTML = byUnit.slice(0, 8).map(u => {
      const r = u.total > 0 ? Math.round((u.present / u.total) * 100) : 0;
      return `<div>
        <div class="flex justify-between text-sm mb-1.5">
          <span class="font-medium text-gray-700">${u.unit}</span>
          <span class="text-gray-500">${u.present}/${u.total}
            <span class="text-brand font-semibold ml-1">${r}%</span>
          </span>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${r}%"></div></div>
      </div>`;
    }).join('');
  }

  const updEl = document.getElementById('dash-updated');
  if (updEl) updEl.textContent = '資料更新時間: ' + formatUpdateTime(new Date(timestamp));
}

Router.register('dashboard', async () => {
  const schedule = State.getSchedule();
  if (!schedule || !schedule.date) {
    document.getElementById('dash-setup-prompt').classList.remove('hidden');
    return;
  }

  // Always show schedule card
  const schedCard = document.getElementById('dash-schedule-card');
  if (schedCard) schedCard.classList.remove('hidden');
  document.getElementById('dash-schedule-title').textContent = schedule.className || '班程';
  document.getElementById('dash-schedule-date').textContent = schedule.date;
  document.getElementById('dash-mode-badge').textContent = schedule.attendanceMode || '實體';

  const today = new Date().toISOString().split('T')[0];

  // Future schedule — show info card only
  if (new Date(schedule.date) > new Date(today)) {
    const futureCard = document.getElementById('dash-future-card');
    if (futureCard) futureCard.classList.remove('hidden');
    const infoEl = document.getElementById('dash-future-info');
    if (infoEl) infoEl.textContent = `${schedule.date}  ${schedule.className || ''}  ${schedule.attendanceMode || '實體'}`;
    return;
  }

  // Past or today — show KPI containers
  ['dash-kpi-row','dash-gender-row','dash-progress-card','dash-actions'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  });

  // Stale-while-revalidate for stats
  const cached = State.getStatsCache(schedule.date, schedule.classCode);
  if (cached) {
    renderDashStats(cached.data, cached.timestamp);
  }

  showBgLoading();
  try {
    const fresh = await API.getAttendanceStats(schedule.date, schedule.classCode);
    State.setStatsCache(schedule.date, schedule.classCode, fresh);
    renderDashStats(fresh, Date.now());
    if (cached) showToast('資料已更新', 'info', 2000);
  } catch (e) {
    if (!cached) showToast('載入統計失敗: ' + e.message, 'error');
  } finally {
    hideBgLoading();
  }
});

// ── Auto Schedule Prompt ──────────────────────────────────────────────────────
let _autoScheduleConfirmCallback = null;
let _autoSchedulePendingData = null;

async function promptAutoSchedule(onConfirm) {
  showBgLoading();
  try {
    const schedules = await fetchSchedules('future');
    hideBgLoading();
    if (!schedules || schedules.length === 0) {
      showToast('找不到未來班程，請手動設定', 'error');
      Router.navigateTo('settings');
      return;
    }
    const nearest = schedules[0];
    _autoSchedulePendingData = nearest;
    _autoScheduleConfirmCallback = onConfirm;

    const dateEl = document.getElementById('auto-schedule-date');
    const nameEl = document.getElementById('auto-schedule-name');
    if (dateEl) dateEl.textContent = nearest.dateFormatted || nearest.date;
    if (nameEl) nameEl.textContent = `${nearest.className || ''} · ${nearest.attendanceMode || '實體'}`;

    document.getElementById('auto-schedule-overlay').classList.add('open');
    document.getElementById('auto-schedule-sheet').classList.add('open');
  } catch (e) {
    hideBgLoading();
    showToast('無法取得班程: ' + e.message, 'error');
    Router.navigateTo('settings');
  }
}

function confirmAutoSchedule() {
  const s = _autoSchedulePendingData;
  if (s) {
    State.setSchedule({
      date: s.date,
      classCode: s.classCode,
      className: s.className,
      attendanceMode: s.attendanceMode || '實體',
      verify: s.verify || '',
    });
    updateScheduleDisplay();
    showToast('已套用班程: ' + (s.dateFormatted || s.date), 'success');
  }
  document.getElementById('auto-schedule-overlay').classList.remove('open');
  document.getElementById('auto-schedule-sheet').classList.remove('open');
  if (_autoScheduleConfirmCallback) {
    _autoScheduleConfirmCallback();
    _autoScheduleConfirmCallback = null;
  }
}

function cancelAutoSchedule() {
  _autoScheduleConfirmCallback = null;
  _autoSchedulePendingData = null;
  document.getElementById('auto-schedule-overlay').classList.remove('open');
  document.getElementById('auto-schedule-sheet').classList.remove('open');
  Router.navigateTo('settings');
}

// ── SCANNER ───────────────────────────────────────────────────────────────────
Router.register('scanner', () => {
  if (!State.hasSchedule()) {
    promptAutoSchedule(() => {
      document.getElementById('scanner-main').classList.remove('hidden');
      startScanner();
    });
    return;
  }
  document.getElementById('scanner-main').classList.remove('hidden');
  startScanner();
});

function startScanner() {
  if (_html5QrCode) stopScanner();
  _html5QrCode = new Html5Qrcode('reader');
  const config = { fps: 10, qrbox: { width: 200, height: 200 }, aspectRatio: 1 };
  _html5QrCode.start({ facingMode: _scannerFacingMode }, config, onQRSuccess, () => {}).catch(err => {
    showToast('無法啟動相機: ' + err, 'error');
  });
}

function stopScanner() {
  if (_html5QrCode) {
    _html5QrCode.stop().catch(() => {});
    _html5QrCode = null;
  }
}

async function onQRSuccess(decodedText) {
  stopScanner();
  const schedule = State.getSchedule();
  const resultEl = document.getElementById('scanner-result');
  if (!resultEl) return;
  resultEl.classList.remove('hidden');
  resultEl.innerHTML = `<div class="flex items-center gap-3"><div class="spinner"></div><span class="text-gray-600">查詢中…</span></div>`;

  try {
    let memberId = decodedText.trim();
    try {
      const u = new URL(memberId);
      memberId = u.searchParams.get('id') || u.searchParams.get('ID') || memberId;
    } catch {}

    const member = await API.getMemberById(memberId);
    resultEl.innerHTML = `
      <div class="flex items-center gap-4 mb-4">
        <div class="member-avatar w-14 h-14 text-xl shrink-0"
             style="background:${avatarColor(member.name)}">${member.name[0]}</div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <h3 class="text-lg font-bold text-gray-800">${member.name}</h3>
            ${genderBadge(member.gender)}
          </div>
          <p class="text-sm text-gray-500 mt-0.5">${member.id} | ${member.unit || ''} ${member.class || ''}</p>
        </div>
      </div>
      <div class="flex gap-2">
        <button onclick="confirmCheckin('${member.id}','${member.name}')" class="btn-primary flex-1">
          <i class="fa-solid fa-check"></i> 確認報到
        </button>
        <button onclick="startScanner(); document.getElementById('scanner-result').classList.add('hidden')"
                class="btn-secondary px-4">重新掃描</button>
      </div>`;
  } catch (e) {
    resultEl.innerHTML = `
      <div class="text-red-600 text-sm mb-3 flex items-center gap-2">
        <i class="fa-solid fa-circle-xmark"></i> ${e.message}
      </div>
      <button onclick="startScanner(); document.getElementById('scanner-result').classList.add('hidden')"
              class="btn-secondary text-sm w-full">重新掃描</button>`;
  }
}

async function confirmCheckin(id, name) {
  const schedule = State.getSchedule();
  showLoading('報到中...');
  try {
    await API.checkin(id, name, getVerify(), schedule.classCode, schedule.attendanceMode || '實體');
    hideLoading();

    // Show success overlay briefly
    const overlay = document.getElementById('scanner-success');
    if (overlay) {
      document.getElementById('scanner-success-name').textContent = name;
      document.getElementById('scanner-success-info').textContent = '報到成功！';
      overlay.classList.add('show');
      setTimeout(() => {
        overlay.classList.remove('show');
        startScanner();
        const resultEl = document.getElementById('scanner-result');
        if (resultEl) resultEl.classList.add('hidden');
      }, 2000);
    } else {
      showToast(`✓ ${name} 報到成功！`, 'success');
      startScanner();
      const resultEl = document.getElementById('scanner-result');
      if (resultEl) resultEl.classList.add('hidden');
    }

    _currentAttendance[id] = { isCheckedIn: true, statusRaw: '○', status: 'present' };
  } catch (e) {
    hideLoading();
    showToast('報到失敗: ' + e.message, 'error');
  }
}

async function manualLookup() {
  const id = document.getElementById('manual-id-input')?.value.trim();
  if (!id) return;
  await onQRSuccess(id);
}

function switchCamera() {
  _scannerFacingMode = _scannerFacingMode === 'environment' ? 'user' : 'environment';
  startScanner();
}

async function toggleFlashlight() {
  try {
    if (_html5QrCode) await _html5QrCode.applyVideoConstraints({ advanced: [{ torch: true }] });
  } catch {}
}

// ── MANUAL CHECKIN ────────────────────────────────────────────────────────────
Router.register('manual-checkin', async () => {
  _mcChecked = new Set();
  if (!State.hasSchedule()) {
    promptAutoSchedule(() => loadMCData());
    return;
  }
  await loadMCData();
});

async function loadMCData() {
  const schedule = State.getSchedule();
  if (!schedule || !schedule.date) return;

  // Load attendance records
  try {
    const cached = State.getAttendanceCache(schedule.date, schedule.classCode);
    if (cached) {
      _currentAttendance = {};
      cached.forEach(r => { _currentAttendance[r.id] = r; });
    }
    // Fetch fresh attendance in background
    API.getAttendanceByDate(schedule.date, schedule.classCode).then(result => {
      const records = result.records || [];
      _currentAttendance = {};
      records.forEach(r => { _currentAttendance[r.id] = r; });
      State.setAttendanceCache(schedule.date, schedule.classCode, records);
      renderMemberList();
    }).catch(() => {});
  } catch {}

  // Load members with stale-while-revalidate
  const cachedMembers = State.getMemberCache();
  if (cachedMembers) {
    _allMembers = cachedMembers;
    _populateMcFilters(_allMembers);
    renderMemberList();
    // 快取仍新鮮（2 分鐘內）則跳過背景更新，避免不必要的 GAS 請求與「更新中」提示
    if (!State.isMemberCacheFresh(2 * 60 * 1000)) {
      showBgLoading();
      API.getMembers({ status: 'active' }).then(res => {
        const fresh = res.members || [];
        State.setMemberCache(fresh);
        _allMembers = fresh;
        _populateMcFilters(fresh);
        renderMemberList();
        showToast('資料已更新', 'info', 2000);
        hideBgLoading();
      }).catch(() => hideBgLoading());
    }
  } else {
    showBgLoading();
    try {
      const res = await API.getMembers({ status: 'active' });
      _allMembers = res.members || [];
      State.setMemberCache(_allMembers);
      _populateMcFilters(_allMembers);
      renderMemberList();
    } catch (e) {
      const listEl = document.getElementById('mc-member-list');
      if (listEl) listEl.innerHTML = `<div class="p-6 text-center text-red-500"><i class="fa-solid fa-triangle-exclamation mr-1"></i>${e.message}</div>`;
    } finally {
      hideBgLoading();
    }
  }
}

function _populateMcFilters(members) {
  const units = [...new Set(members.map(m => m.unit).filter(Boolean))].sort();
  const unitSel = document.getElementById('mc-filter-unit');
  if (unitSel) {
    unitSel.innerHTML = '<option value="">所有區別</option>' + units.map(u => `<option value="${u}">${u}</option>`).join('');
  }
  const countEl = document.getElementById('mc-count');
  if (countEl) countEl.textContent = `共 ${members.length} 位`;
}

function renderMemberList() {
  const searchTerm = (document.getElementById('mc-search')?.value || '').toLowerCase();
  const unitFilter = document.getElementById('mc-filter-unit')?.value || '';
  const statusFilter = document.getElementById('mc-filter-status')?.value || '';

  let filtered = _allMembers.filter(m => {
    if (searchTerm && !m.name.includes(searchTerm) && !m.id.includes(searchTerm)) return false;
    if (unitFilter && m.unit !== unitFilter) return false;
    if (statusFilter) {
      const att = _currentAttendance[m.id];
      if (statusFilter === 'unchecked' && (att?.isCheckedIn || att?.isLeave)) return false;
      if (statusFilter === 'checked' && !(_mcChecked.has(m.id) || att?.isCheckedIn)) return false;
      if (statusFilter === 'leave' && !att?.isLeave) return false;
    }
    return true;
  });

  const listEl = document.getElementById('mc-member-list');
  if (!listEl) return;

  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="p-8 text-center text-gray-400">無符合結果</div>';
    return;
  }

  listEl.innerHTML = filtered.map(m => {
    const att = _currentAttendance[m.id];
    const isAlreadyIn = att?.isCheckedIn;
    const isLeave = att?.isLeave;
    const isChecked = _mcChecked.has(m.id);
    let badgeHtml = '';
    if (isChecked) badgeHtml = `<span class="badge badge-present">✓ 報到</span>`;
    else if (isAlreadyIn) badgeHtml = `<span class="badge badge-present">${att.statusRaw || '已到'}</span>`;
    else if (isLeave) badgeHtml = `<span class="badge badge-leave">${att.statusRaw || '請假'}</span>`;
    else badgeHtml = `<span class="badge badge-absent">未到</span>`;

    const checkClass = (isChecked || isAlreadyIn) ? 'checked' : '';
    const disabledClass = isAlreadyIn ? 'opacity-60 cursor-not-allowed' : '';
    const clickHandler = isAlreadyIn ? '' : `onclick="toggleMcCheck('${m.id}')"`;

    return `<div class="member-item ${disabledClass}" ${clickHandler}>
      <div class="checkin-check ${checkClass}" id="chk-${m.id}"><i class="fa-solid fa-check text-xs"></i></div>
      <div class="member-avatar shrink-0" style="background:${avatarColor(m.name)}">${m.name[0]}</div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="text-base font-medium text-gray-800">${m.name}</span>
          ${genderBadge(m.gender)}
        </div>
        <div class="text-sm text-gray-500">${m.unit || ''} · ${m.class || ''}</div>
      </div>
      ${badgeHtml}
    </div>`;
  }).join('');

  updateMcSelectedCount();
}

function toggleMcCheck(id) {
  if (_mcChecked.has(id)) _mcChecked.delete(id);
  else _mcChecked.add(id);
  const chk = document.getElementById(`chk-${id}`);
  if (chk) chk.classList.toggle('checked', _mcChecked.has(id));
  updateMcSelectedCount();
}

function updateMcSelectedCount() {
  const count = _mcChecked.size;
  const countEl = document.getElementById('mc-selected-count');
  const submitBtn = document.getElementById('mc-submit-btn');
  if (count > 0) {
    if (countEl) { countEl.textContent = `已選 ${count} 位`; countEl.classList.remove('hidden'); }
    if (submitBtn) submitBtn.classList.remove('hidden');
  } else {
    if (countEl) countEl.classList.add('hidden');
    if (submitBtn) submitBtn.classList.add('hidden');
  }
}

function filterMemberList() { renderMemberList(); }

async function submitCheckins() {
  const schedule = State.getSchedule();
  if (!schedule) { showToast('請先設定班程', 'error'); return; }
  if (_mcChecked.size === 0) return;
  const records = [..._mcChecked].map(id => {
    const m = _allMembers.find(x => x.id === id);
    return { id, name: m?.name || id, classCode: schedule.classCode };
  });
  showLoading(`批次報到 ${records.length} 位…`);
  try {
    const res = await API.checkinManualBatch(getVerify(), records, schedule.attendanceMode || '實體');
    hideLoading();
    showToast(res.message || `已為 ${records.length} 位班員報到`, 'success');
    records.forEach(r => {
      _currentAttendance[r.id] = { isCheckedIn: true, statusRaw: '○', status: 'present' };
    });
    _mcChecked.clear();
    renderMemberList();
  } catch (e) {
    hideLoading();
    showToast('批次報到失敗: ' + e.message, 'error');
  }
}

async function submitTempCheckin() {
  const name = document.getElementById('temp-name')?.value.trim();
  if (!name) { showToast('請輸入姓名', 'error'); return; }
  const schedule = State.getSchedule();
  if (!schedule) { showToast('請先設定班程', 'error'); return; }
  showLoading('臨時報到...');
  try {
    const res = await API.checkinTemp(name, getVerify(), schedule.classCode, schedule.attendanceMode || '實體');
    hideLoading();
    showToast(res.message || '臨時報到成功', 'success');
    const nameEl = document.getElementById('temp-name');
    if (nameEl) nameEl.value = '';
  } catch (e) {
    hideLoading();
    showToast('臨時報到失敗: ' + e.message, 'error');
  }
}

function toggleLargeText() {
  document.body.classList.toggle('large-text');
  State.updateSettings({ largeText: document.body.classList.contains('large-text') });
}

// ── QUICK SEARCH ──────────────────────────────────────────────────────────────
Router.register('quick-search', async () => {
  _qsActiveFilters = {};

  function populateQsFilters(members) {
    const units = [...new Set(members.map(m => m.unit).filter(Boolean))].sort();
    const classes = [...new Set(members.flatMap(m => (m.class || '').split(',').map(c => c.trim()).filter(Boolean)))].sort();
    const unitSel = document.getElementById('qs-adv-unit');
    if (unitSel) unitSel.innerHTML = '<option value="">所有區別</option>' + units.map(u => `<option value="${u}">${u}</option>`).join('');
    const classSel = document.getElementById('qs-adv-class');
    if (classSel) classSel.innerHTML = '<option value="">所有班別</option>' + classes.map(c => `<option value="${c}">${c}</option>`).join('');
  }

  const cached = State.getMemberCache();
  if (cached) {
    populateQsFilters(cached);
    showBgLoading();
    API.getMembers({ status: 'active' }).then(res => {
      const fresh = res.members || [];
      State.setMemberCache(fresh);
      populateQsFilters(fresh);
      hideBgLoading();
    }).catch(() => hideBgLoading());
  } else {
    showBgLoading();
    try {
      const res = await API.getMembers({ status: 'active' });
      const members = res.members || [];
      State.setMemberCache(members);
      populateQsFilters(members);
    } catch {} finally {
      hideBgLoading();
    }
  }

  const schedule = State.getSchedule();
  if (schedule?.date && Object.keys(_currentAttendance).length === 0) {
    try {
      const res = await API.getAttendanceByDate(schedule.date, schedule.classCode);
      (res.records || []).forEach(r => { _currentAttendance[r.id] = r; });
    } catch {}
  }
});

function quickSearch(term) {
  const searchTerm = (term || '').toLowerCase().trim();
  const unitFilter = _qsActiveFilters.unit || '';
  const classFilter = _qsActiveFilters.cls || '';
  const statusFilter = _qsActiveFilters.status || '';
  const resultsEl = document.getElementById('qs-results');
  if (!resultsEl) return;

  const members = State.getMemberCache() || _allMembers;
  if (!members.length) {
    resultsEl.innerHTML = '<div class="p-8 text-center text-gray-400">無班員資料</div>';
    return;
  }
  if (!searchTerm && !unitFilter && !classFilter && !statusFilter) {
    resultsEl.innerHTML = `<div class="p-10 text-center text-gray-400">
      <i class="fa-solid fa-magnifying-glass text-3xl mb-2 block opacity-30"></i>
      輸入姓名開始搜尋
    </div>`;
    return;
  }

  let filtered = members.filter(m => {
    if (searchTerm && !m.name.toLowerCase().includes(searchTerm) && !m.id.toLowerCase().includes(searchTerm)) return false;
    if (unitFilter && m.unit !== unitFilter) return false;
    if (classFilter && m.class !== classFilter) return false;
    if (statusFilter) {
      const att = _currentAttendance[m.id];
      if (statusFilter === 'present' && !att?.isCheckedIn) return false;
      if (statusFilter === 'absent' && (att?.isCheckedIn || att?.isLeave)) return false;
      if (statusFilter === 'leave' && !att?.isLeave) return false;
    }
    return true;
  }).slice(0, 60);

  if (!filtered.length) {
    resultsEl.innerHTML = '<div class="p-8 text-center text-gray-400">查無結果</div>';
    return;
  }

  resultsEl.innerHTML = filtered.map(m => {
    const att = _currentAttendance[m.id];
    return `<div class="member-item" onclick="viewMemberDetail('${m.id}')">
      <div class="member-avatar shrink-0" style="background:${avatarColor(m.name)}">${m.name[0]}</div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-medium text-gray-800">${m.name}</span>
          ${genderBadge(m.gender)}
        </div>
        <div class="text-sm text-gray-500">${m.id} · ${m.unit || ''} · ${m.class || ''}</div>
      </div>
      ${statusBadge(att)}
    </div>`;
  }).join('');
}

// Quick Search bottom sheet
function openQsSheet() {
  document.getElementById('qs-sheet-overlay').classList.add('open');
  document.getElementById('qs-bottom-sheet').classList.add('open');
}
function closeQsSheet() {
  document.getElementById('qs-sheet-overlay').classList.remove('open');
  document.getElementById('qs-bottom-sheet').classList.remove('open');
}
function applyQsFilter() {
  _qsActiveFilters.unit   = document.getElementById('qs-adv-unit')?.value || '';
  _qsActiveFilters.cls    = document.getElementById('qs-adv-class')?.value || '';
  _qsActiveFilters.status = document.getElementById('qs-adv-status')?.value || '';
  renderQsActivePills();
  closeQsSheet();
  quickSearch(document.getElementById('qs-input')?.value || '');
}
function clearQsFilter() {
  _qsActiveFilters = {};
  ['qs-adv-unit','qs-adv-class','qs-adv-status'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  renderQsActivePills();
  closeQsSheet();
  quickSearch(document.getElementById('qs-input')?.value || '');
}
function renderQsActivePills() {
  const container = document.getElementById('qs-active-pills');
  if (!container) return;
  const pills = [];
  if (_qsActiveFilters.unit)   pills.push({ label: _qsActiveFilters.unit, key: 'unit' });
  if (_qsActiveFilters.cls)    pills.push({ label: _qsActiveFilters.cls,  key: 'cls'  });
  if (_qsActiveFilters.status) {
    const map = { present: '已報到', absent: '未報到', leave: '請假' };
    pills.push({ label: map[_qsActiveFilters.status] || _qsActiveFilters.status, key: 'status' });
  }
  if (pills.length === 0) { container.classList.add('hidden'); container.innerHTML = ''; return; }
  container.classList.remove('hidden');
  container.innerHTML = pills.map(p => `
    <span class="filter-pill">
      ${p.label}
      <button onclick="removeQsFilter('${p.key}')"><i class="fa-solid fa-xmark text-xs"></i></button>
    </span>`).join('');
}
function removeQsFilter(key) {
  delete _qsActiveFilters[key];
  renderQsActivePills();
  quickSearch(document.getElementById('qs-input')?.value || '');
}

// ── MEMBER LIST ───────────────────────────────────────────────────────────────
Router.register('member-list', async () => {
  _mlViewMode = 'list';

  function populateMlFilters(members) {
    const units   = [...new Set(members.map(m => m.unit).filter(Boolean))].sort();
    const classes = [...new Set(members.flatMap(m => (m.class || '').split(',').map(c => c.trim()).filter(Boolean)))].sort();
    const unitSel  = document.getElementById('ml-unit');
    const classSel = document.getElementById('ml-class');
    if (unitSel)  unitSel.innerHTML  = '<option value="">所有區別</option>' + units.map(u => `<option value="${u}">${u}</option>`).join('');
    if (classSel) classSel.innerHTML = '<option value="">所有班別</option>' + classes.map(c => `<option value="${c}">${c}</option>`).join('');
  }

  const cached = State.getMemberCache();
  if (cached) {
    _allMembers = cached;
    populateMlFilters(cached);
    filterMemberListView();
    showBgLoading();
    API.getMembers({ status: 'active' }).then(res => {
      const fresh = res.members || [];
      State.setMemberCache(fresh);
      _allMembers = fresh;
      populateMlFilters(fresh);
      filterMemberListView();
      showToast('資料已更新', 'info', 2000);
      hideBgLoading();
    }).catch(() => hideBgLoading());
  } else {
    showBgLoading();
    try {
      const res = await API.getMembers({ status: 'active' });
      _allMembers = res.members || [];
      State.setMemberCache(_allMembers);
      populateMlFilters(_allMembers);
      filterMemberListView();
    } catch (e) {
      document.getElementById('ml-list').innerHTML = `<div class="card p-8 text-center text-red-500">${e.message}</div>`;
    } finally {
      hideBgLoading();
    }
  }
});

function setMlView(mode) {
  _mlViewMode = mode;
  document.getElementById('ml-btn-list')?.classList.toggle('bg-brand', mode === 'list');
  document.getElementById('ml-btn-list')?.classList.toggle('text-white', mode === 'list');
  document.getElementById('ml-btn-grid')?.classList.toggle('bg-brand', mode === 'grid');
  document.getElementById('ml-btn-grid')?.classList.toggle('text-white', mode === 'grid');
  filterMemberListView();
}

function filterMemberListView() {
  const term = (document.getElementById('ml-search')?.value || '').toLowerCase();
  const unit = document.getElementById('ml-unit')?.value || '';
  const cls  = document.getElementById('ml-class')?.value || '';

  const filtered = _allMembers.filter(m => {
    if (term && !m.name.toLowerCase().includes(term) && !m.id.includes(term)) return false;
    if (unit && m.unit !== unit) return false;
    if (cls  && m.class !== cls)  return false;
    return true;
  });

  document.getElementById('ml-count').textContent = `共 ${filtered.length} 位`;
  const listEl = document.getElementById('ml-list');
  if (!listEl) return;

  if (_mlViewMode === 'grid') {
    listEl.innerHTML = `<div class="member-grid">${filtered.map(m => {
      const att = _currentAttendance[m.id];
      let dotClass = 'absent';
      if (att?.isCheckedIn) dotClass = 'present';
      else if (att?.isLeave) dotClass = 'leave';
      return `<div class="member-card" onclick="viewMemberDetail('${m.id}')">
        <div class="member-card-avatar" style="background:${avatarColor(m.name)}">
          ${m.name[0]}
          <span class="status-dot ${dotClass}"></span>
        </div>
        <div class="member-card-name">${m.name}</div>
        <div class="member-card-meta">${m.unit || ''} · ${m.class || ''}</div>
        ${genderBadge(m.gender)}
      </div>`;
    }).join('')}</div>`;
  } else {
    listEl.innerHTML = `<div class="card divide-y divide-gray-100">${filtered.map(m => `
      <div class="member-item" onclick="viewMemberDetail('${m.id}')">
        <div class="member-avatar shrink-0" style="background:${avatarColor(m.name)}">${m.name[0]}</div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-medium text-gray-800">${m.name}</span>
            ${genderBadge(m.gender)}
          </div>
          <div class="text-sm text-gray-500">${m.id} · ${m.unit || ''} · ${m.class || ''}</div>
        </div>
        <i class="fa-solid fa-chevron-right text-gray-300"></i>
      </div>`).join('')}</div>`;
  }
}

function viewMemberDetail(id) {
  const source = _allMembers.length > 0 ? _allMembers : (State.getMemberCache() || []);
  const member = source.find(m => m.id === id);
  Router.navigateTo('member-detail', { member });
}

// ── MEMBER DETAIL ─────────────────────────────────────────────────────────────
Router.register('member-detail', async (params) => {
  const member = params?.member || Router.getMemberDetailData?.();
  if (!member) { showToast('找不到班員資料', 'error'); return; }

  document.getElementById('md-avatar').textContent = member.name[0];
  document.getElementById('md-name').textContent = member.name;
  document.getElementById('md-id').textContent = member.id;
  document.getElementById('md-unit').textContent = member.unit || '-';
  document.getElementById('md-class').textContent = member.class || '-';
  document.getElementById('md-gender').textContent = member.gender || '-';
  document.getElementById('md-note').textContent = member.specialNote || '-';
  document.getElementById('md-group').textContent = member.group || '-';
  document.getElementById('md-remarks').textContent = member.notes || '-';

  if (member.qrCodeUrl) {
    const link = document.getElementById('md-qr-link');
    if (link) { link.href = member.qrCodeUrl; link.textContent = '查看名牌 QR Code'; }
  }

  const att = _currentAttendance[member.id];
  if (att && !att.isCheckedIn && !att.isLeave) {
    const btn = document.getElementById('md-checkin-btn');
    if (btn) {
      btn.classList.remove('hidden');
      btn.dataset.memberId = member.id;
      btn.dataset.memberName = member.name;
    }
  }

  // Load attendance history
  try {
    const hist = await API.getMemberAttendanceHistory(member.id);
    const records = (hist?.records || hist || []).slice(0, 30);
    const histEl = document.getElementById('md-history-list');
    if (histEl && records.length) {
      histEl.innerHTML = records.map((r, i) => {
        let dotClass = 'past';
        let badgeHtml = '';
        if (r.isCheckedIn || r.statusRaw === '○') {
          dotClass = 'past';
          badgeHtml = '<span class="badge badge-present text-xs">出席</span>';
        } else if (r.isLeave) {
          badgeHtml = '<span class="badge badge-leave text-xs">請假</span>';
        } else {
          badgeHtml = '<span class="badge badge-absent text-xs">缺席</span>';
        }
        return `<div class="timeline-item">
          <div class="timeline-dot ${dotClass}"></div>
          <div class="flex items-center justify-between gap-2 pb-1">
            <div>
              <div class="text-sm font-semibold text-gray-800">${r.date || ''}</div>
              <div class="text-xs text-gray-400">${r.className || ''} ${r.attendanceMode || ''}</div>
            </div>
            ${badgeHtml}
          </div>
        </div>`;
      }).join('');
    } else if (histEl) {
      histEl.innerHTML = '<div class="p-6 text-center text-gray-400">無出席記錄</div>';
    }
  } catch {}
});

function switchMdTab(btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const target = btn.dataset.tabTarget;
  ['md-basic','md-history'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', id !== target);
  });
}

async function checkinThisMember() {
  const btn = document.getElementById('md-checkin-btn');
  const id = btn.dataset.memberId;
  const name = btn.dataset.memberName;
  const schedule = State.getSchedule();
  if (!schedule) { showToast('請先設定班程', 'error'); return; }
  showLoading();
  try {
    await API.checkin(id, name, getVerify(), schedule.classCode, schedule.attendanceMode || '實體');
    hideLoading();
    showToast(`${name} 報到成功`, 'success');
    btn.classList.add('hidden');
    _currentAttendance[id] = { isCheckedIn: true, statusRaw: '○', status: 'present' };
  } catch (e) {
    hideLoading();
    showToast('報到失敗: ' + e.message, 'error');
  }
}

// ── CLASS VIEW ────────────────────────────────────────────────────────────────
Router.register('class-view', async () => {
  const cached = State.getMemberCache();
  if (cached) {
    _allMembers = cached;
    renderClassView(cached);
    showBgLoading();
    API.getMembers({ status: 'active' }).then(res => {
      const fresh = res.members || [];
      State.setMemberCache(fresh);
      _allMembers = fresh;
      renderClassView(fresh);
      showToast('資料已更新', 'info', 2000);
      hideBgLoading();
    }).catch(() => hideBgLoading());
  } else {
    showBgLoading();
    try {
      const res = await API.getMembers({ status: 'active' });
      _allMembers = res.members || [];
      State.setMemberCache(_allMembers);
      renderClassView(_allMembers);
    } catch (e) {
      document.getElementById('cv-class-list').innerHTML = `<div class="card p-8 text-center text-red-500">${e.message}</div>`;
    } finally {
      hideBgLoading();
    }
  }
});

function renderClassView(members) {
  const byClass = {};
  members.forEach(m => {
    const classes = (m.class || '').split(',').map(c => c.trim()).filter(Boolean);
    if (classes.length === 0) classes.push('未分班');
    classes.forEach(cls => {
      if (!byClass[cls]) byClass[cls] = [];
      byClass[cls].push(m);
    });
  });

  const listEl = document.getElementById('cv-class-list');
  if (!listEl) return;

  listEl.innerHTML = Object.entries(byClass).sort((a, b) => a[0].localeCompare(b[0], 'zh')).map(([cls, members]) => {
    const presentCount = members.filter(m => _currentAttendance[m.id]?.isCheckedIn).length;
    const rateStr = members.length > 0 ? `${presentCount}/${members.length}` : '';
    return `<div class="card overflow-hidden">
      <div class="card-header cursor-pointer select-none" onclick="toggleClassSection(this)">
        <i class="fa-solid fa-users text-brand"></i>
        <span class="flex-1">${cls}</span>
        <span class="text-xs text-gray-400 font-normal">${rateStr}</span>
        <i class="fa-solid fa-chevron-down text-gray-400 transition-transform duration-200 ml-2"></i>
      </div>
      <div class="divide-y divide-gray-100">
        ${members.map(m => {
          const att = _currentAttendance[m.id];
          return `<div class="member-item" onclick="viewMemberDetail('${m.id}')">
            <div class="member-avatar w-9 h-9 text-sm shrink-0" style="background:${avatarColor(m.name)}">${m.name[0]}</div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="text-sm font-medium text-gray-800">${m.name}</span>
                ${genderBadge(m.gender)}
              </div>
              <div class="text-xs text-gray-400">${m.unit || ''}</div>
            </div>
            ${statusBadge(att)}
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');
}

function filterClassView() {
  const term = (document.getElementById('cv-search')?.value || '').toLowerCase();
  const filtered = _allMembers.filter(m => !term || m.name.toLowerCase().includes(term) || m.id.includes(term));
  renderClassView(filtered);
}

function toggleClassSection(header) {
  const body = header.nextElementSibling;
  const icon = header.querySelector('.fa-chevron-down');
  body.classList.toggle('hidden');
  if (icon) icon.style.transform = body.classList.contains('hidden') ? 'rotate(-90deg)' : '';
}

// ── ATTENDANCE STATS ──────────────────────────────────────────────────────────
let _statsSchedules = [];  // all past+today schedules (sorted newest first)

function renderStatsData(data) {
  const { present = 0, absent = 0, leave = 0, total = 0, male = 0, female = 0, byUnit = [] } = data;
  const rate = total > 0 ? Math.round((present / total) * 100) : 0;

  document.getElementById('stats-present').textContent = present;
  document.getElementById('stats-total-label').textContent = `/ ${total}`;
  document.getElementById('stats-rate').textContent = rate + '%';
  document.getElementById('stats-fill').style.width = rate + '%';
  document.getElementById('stats-male').textContent = male;
  document.getElementById('stats-female').textContent = female;
  document.getElementById('stats-leave').textContent = leave;
  document.getElementById('stats-absent').textContent = absent;

  document.getElementById('stats-unit-list').innerHTML = byUnit.map(u => {
    const r = u.total > 0 ? Math.round((u.present / u.total) * 100) : 0;
    return `<div>
      <div class="flex justify-between text-sm mb-1.5">
        <span class="font-medium text-gray-700">${u.unit}</span>
        <span class="text-gray-500">
          ${u.present}/${u.total}
          <span class="font-semibold text-brand ml-1">${r}%</span>
        </span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${r}%"></div></div>
    </div>`;
  }).join('');

  document.getElementById('stats-main').classList.remove('hidden');
}

function _populateStatsSchedSel(schedules) {
  const sel = document.getElementById('stats-sched-sel');
  if (!sel) return;
  sel.innerHTML = schedules.length
    ? schedules.map((s, i) =>
        `<option value="${_statsSchedules.indexOf(s)}">${s.dateFormatted || s.date} ${s.className || ''}</option>`
      ).join('')
    : '<option value="">-- 無可用班程 --</option>';
}

Router.register('attendance-stats', async () => {
  _statsSchedules = [];

  showBgLoading();
  try {
    const all = await fetchSchedules('all');
    const today = new Date().toISOString().split('T')[0];
    _statsSchedules = (Array.isArray(all) ? all : [])
      .filter(s => new Date(s.date) <= new Date(today))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    hideBgLoading();

    if (_statsSchedules.length === 0) {
      document.getElementById('stats-no-schedule').classList.remove('hidden');
      return;
    }

    // Populate class selector
    const classes = [...new Set(_statsSchedules.flatMap(s =>
      (s.className || '').split(',').map(c => c.trim()).filter(Boolean)
    ))];
    const classSel = document.getElementById('stats-class-sel');
    if (classSel) {
      classSel.innerHTML = '<option value="">所有班別</option>' +
        classes.map(c => `<option value="${c}">${c}</option>`).join('');
    }

    // Populate schedule selector (all)
    _populateStatsSchedSel(_statsSchedules);

    // Pre-select current schedule if it's in the past list
    const cur = State.getSchedule();
    const sel = document.getElementById('stats-sched-sel');
    if (cur && sel) {
      const idx = _statsSchedules.findIndex(s => s.date === cur.date && s.classCode === cur.classCode);
      if (idx >= 0) sel.value = String(idx);
    }

    await loadStatsForSchedule();
  } catch (e) {
    hideBgLoading();
    showToast('載入班程失敗: ' + e.message, 'error');
  }
});

function onStatsClassChange() {
  const cls = document.getElementById('stats-class-sel')?.value || '';
  const filtered = cls
    ? _statsSchedules.filter(s => (s.className || '').split(',').map(c => c.trim()).includes(cls))
    : _statsSchedules;
  _populateStatsSchedSel(filtered);
  loadStatsForSchedule();
}

async function loadStatsForSchedule() {
  const sel = document.getElementById('stats-sched-sel');
  const idx = parseInt(sel?.value, 10);
  if (isNaN(idx) || !_statsSchedules[idx]) {
    document.getElementById('stats-main').classList.add('hidden');
    return;
  }
  const s = _statsSchedules[idx];

  const cached = State.getStatsCache(s.date, s.classCode);
  if (cached) renderStatsData(cached.data);

  showBgLoading();
  try {
    const fresh = await API.getAttendanceStats(s.date, s.classCode);
    State.setStatsCache(s.date, s.classCode, fresh);
    renderStatsData(fresh);
  } catch (e) {
    if (!cached) showToast('載入統計失敗: ' + e.message, 'error');
  } finally {
    hideBgLoading();
  }
}

// ── CLASS SCHEDULE ────────────────────────────────────────────────────────────
let _allSchedules = [];

Router.register('class-schedule', () => { loadScheduleView(); });

async function loadScheduleView() {
  const filter = document.getElementById('cs-filter')?.value || 'all';
  showBgLoading();
  try {
    const schedules = await fetchSchedules(filter);
    _allSchedules = Array.isArray(schedules) ? schedules : [];

    // Populate class filter dropdown
    const classes = [...new Set(_allSchedules.flatMap(s =>
      (s.className || '').split(',').map(c => c.trim()).filter(Boolean)
    ))];
    const classSel = document.getElementById('cs-class-filter');
    if (classSel) {
      const prev = classSel.value;
      classSel.innerHTML = '<option value="">所有班別</option>' +
        classes.map(c => `<option value="${c}">${c}</option>`).join('');
      if (prev && classes.includes(prev)) classSel.value = prev;
    }

    filterScheduleByClass();
  } catch (e) {
    showToast('載入班程失敗: ' + e.message, 'error');
  } finally {
    hideBgLoading();
  }
}

function filterScheduleByClass() {
  const cls = document.getElementById('cs-class-filter')?.value || '';
  const filtered = cls
    ? _allSchedules.filter(s => (s.className || '').split(',').map(c => c.trim()).includes(cls))
    : _allSchedules;
  renderScheduleList(filtered);
}

function renderScheduleList(schedules) {
  const listEl = document.getElementById('cs-list');
  if (!listEl) return;
  if (!schedules.length) {
    listEl.innerHTML = '<div class="card p-8 text-center text-gray-400">無班程資料</div>';
    return;
  }

  const currentSchedule = State.getSchedule();
  const today = new Date().toISOString().split('T')[0];

  listEl.innerHTML = `<div class="timeline">${schedules.map(s => {
    const d = s.date || '';
    let dotClass = 'past';
    let statusLabel = '';
    if (d === today) {
      dotClass = 'current';
      statusLabel = '<span class="badge badge-present text-xs">今日</span>';
    } else if (d > today) {
      dotClass = 'future';
      statusLabel = '<span class="badge badge-mode text-xs">未來</span>';
    } else {
      statusLabel = '<span class="badge badge-unknown text-xs">已結束</span>';
    }
    if (s.isActive) statusLabel = '<span class="badge badge-active text-xs">啟用中</span>';

    const isCurrent = currentSchedule?.date === s.date && currentSchedule?.classCode === s.classCode;

    return `<div class="timeline-item">
      <div class="timeline-dot ${dotClass}"></div>
      <div class="card p-4 ${isCurrent ? 'ring-2 ring-brand' : ''}">
        <div class="flex items-start justify-between gap-2">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap mb-1">
              <span class="font-semibold text-gray-800">${s.dateFormatted || s.date}</span>
              ${statusLabel}
            </div>
            <div class="text-sm text-gray-500">${s.className || ''} · 班別 ${s.classCode || ''} · ${s.attendanceMode || '實體'}</div>
          </div>
          <button onclick="applySchedule(${JSON.stringify(s).replace(/"/g,'&quot;')})"
                  class="btn-secondary text-xs px-3 py-1.5 shrink-0">套用</button>
        </div>
      </div>
    </div>`;
  }).join('')}</div>`;
}

function applySchedule(s) {
  const schedule = State.getSchedule() || {};
  State.setSchedule({
    ...schedule,
    date: s.date,
    classCode: s.classCode,
    className: s.className,
    verify: s.verify || schedule.verify,
    attendanceMode: s.attendanceMode || schedule.attendanceMode
  });
  updateScheduleDisplay();
  showToast('已套用班程: ' + (s.dateFormatted || s.date), 'success');
  Router.navigateTo('settings');
}

// ── SETTINGS ──────────────────────────────────────────────────────────────────
let _settingsFutureSchedules = [];

async function _populateSettingsScheduleSelect() {
  const select = document.getElementById('st-schedule-select');
  if (!select) return;

  const schedule = State.getSchedule() || {};
  select.innerHTML = '<option value="">-- 載入中... --</option>';
  showBgLoading();
  try {
    const schedules = await fetchSchedules('future');
    _settingsFutureSchedules = Array.isArray(schedules) ? schedules : [];
    hideBgLoading();

    if (_settingsFutureSchedules.length === 0) {
      select.innerHTML = '<option value="">-- 無未來班程 --</option>';
      return;
    }

    select.innerHTML = '<option value="">-- 請選擇班程 --</option>' +
      _settingsFutureSchedules.map((s, i) =>
        `<option value="${i}">${s.dateFormatted || s.date} ${s.className || ''}</option>`
      ).join('');

    // Pre-select if current schedule matches
    if (schedule.date && schedule.classCode) {
      const idx = _settingsFutureSchedules.findIndex(
        s => s.date === schedule.date && s.classCode === schedule.classCode
      );
      if (idx >= 0) {
        select.value = String(idx);
        onScheduleSelectChange();
        const verifyEl = document.getElementById('st-verify');
        if (verifyEl) verifyEl.value = schedule.verify || '';
      }
    }
  } catch (e) {
    hideBgLoading();
    select.innerHTML = '<option value="">-- 載入失敗，請重試 --</option>';
    showToast('載入班程失敗: ' + e.message, 'error');
  }
}

async function refreshAllScheduleOptions() {
  State.clearSchedulesCache();
  showBgLoading();
  try {
    await Promise.all([
      fetchSchedules('all', true),
      fetchSchedules('future', true),
    ]);
    showToast('班程選項已重新整理', 'success');
    if (document.getElementById('st-schedule-select')) {
      await _populateSettingsScheduleSelect();
    }
  } catch (e) {
    showToast('重新整理失敗: ' + e.message, 'error');
  } finally {
    hideBgLoading();
  }
}

Router.register('settings', async () => {
  const settings = State.getSettings();

  // Large text toggle
  const toggle = document.getElementById('toggle-large-text');
  if (toggle) toggle.classList.toggle('on', !!settings.largeText);

  renderSettingsDisplay();

  await _populateSettingsScheduleSelect();
});

function onScheduleSelectChange() {
  const select = document.getElementById('st-schedule-select');
  const detailEl = document.getElementById('st-schedule-detail');
  if (!select || !detailEl) return;

  const idx = parseInt(select.value, 10);
  if (isNaN(idx) || !_settingsFutureSchedules[idx]) {
    detailEl.classList.add('hidden');
    return;
  }

  const s = _settingsFutureSchedules[idx];
  detailEl.classList.remove('hidden');
  document.getElementById('st-detail-date').textContent = s.dateFormatted || s.date;
  document.getElementById('st-detail-name').textContent = `${s.className || ''} (${s.classCode || '-'})`;
  document.getElementById('st-detail-mode').textContent = s.attendanceMode || '實體';
}

function autoFillVerify() {
  const select = document.getElementById('st-schedule-select');
  const idx = parseInt(select?.value, 10);
  const s = _settingsFutureSchedules[idx];
  const verifyEl = document.getElementById('st-verify');
  if (verifyEl && s) verifyEl.value = s.verify || '';
}

function saveSettings() {
  const select = document.getElementById('st-schedule-select');
  const idx = parseInt(select?.value, 10);

  if (isNaN(idx) || !_settingsFutureSchedules[idx]) {
    showToast('請先選擇一個班程', 'error');
    return;
  }

  const s = _settingsFutureSchedules[idx];
  const verify = document.getElementById('st-verify')?.value.trim() || '';

  State.setSchedule({
    date: s.date,
    classCode: s.classCode,
    className: s.className,
    attendanceMode: s.attendanceMode || '實體',
    verify,
  });
  State.updateSettings({ attendanceMode: s.attendanceMode || '實體' });
  _currentAttendance = {};
  updateScheduleDisplay();
  showToast('設定已儲存 ✓', 'success');
  renderSettingsDisplay();
}

function renderSettingsDisplay() {
  const schedule = State.getSchedule();
  const el = document.getElementById('current-settings-display');
  if (!el) return;
  if (!schedule) {
    el.innerHTML = '<p class="text-gray-400 text-sm py-2">尚未設定班次</p>';
    return;
  }
  const rows = [
    { label: '日期',   value: schedule.date || '-' },
    { label: '班別',   value: `${schedule.className || ''} (${schedule.classCode || '-'})` },
    { label: '出勤',   value: schedule.attendanceMode || '-' },
    { label: '密碼',   value: schedule.verify ? `已設定 (${schedule.verify})` : '未設定' },
  ];
  el.innerHTML = rows.map(r => `
    <div class="flex gap-2 py-1.5 border-b border-gray-50 last:border-0">
      <span class="text-gray-400 w-14 shrink-0 text-sm">${r.label}</span>
      <span class="font-medium text-sm">${r.value}</span>
    </div>`).join('');
}


function toggleLargeTextSetting() {
  const settings = State.getSettings();
  const newVal = !settings.largeText;
  State.updateSettings({ largeText: newVal });
  document.body.classList.toggle('large-text', newVal);
  const toggle = document.getElementById('toggle-large-text');
  if (toggle) toggle.classList.toggle('on', newVal);
}

// ── Settings: QR Share ────────────────────────────────────────────────────────
function generateShareQR() {
  const schedule = State.getSchedule();
  if (!schedule?.date) { showToast('請先儲存班程設定', 'error'); return; }

  const base = window.location.origin + window.location.pathname;
  const params = new URLSearchParams({
    date: schedule.date,
    classCode: schedule.classCode || '',
    className: schedule.className || '',
    mode: schedule.attendanceMode || '實體',
  });
  _shareUrl = `${base}?${params.toString()}`;

  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(_shareUrl)}`;
  const qrImg = document.getElementById('st-qr-img');
  const qrArea = document.getElementById('st-qr-area');
  const urlDisplay = document.getElementById('st-share-url');

  if (qrImg) qrImg.src = qrApiUrl;
  if (urlDisplay) urlDisplay.textContent = _shareUrl;
  if (qrArea) qrArea.classList.remove('hidden');
}

function copyShareUrl() {
  if (!_shareUrl) return;
  navigator.clipboard.writeText(_shareUrl).then(() => {
    showToast('連結已複製到剪貼簿', 'success');
  }).catch(() => {
    showToast('請手動複製連結', 'error');
  });
}

// ── URL Param Auto-fill ───────────────────────────────────────────────────────
function checkUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const date      = params.get('date');
  const classCode = params.get('classCode');
  const className = params.get('className');
  const mode      = params.get('mode');

  if (date && classCode) {
    const existing = State.getSchedule() || {};
    State.setSchedule({
      ...existing,
      date,
      classCode,
      className: className || existing.className,
      attendanceMode: mode || existing.attendanceMode || '實體',
    });
    showToast('已套用分享設定，請填入驗證密碼', 'info', 5000);
    return true;
  }
  return false;
}

// ── APP INIT ──────────────────────────────────────────────────────────────────
function initApp() {
  State.init();
  buildSidebar('desktop-sidebar-nav');
  buildSidebar('mobile-sidebar-nav');
  updateScheduleDisplay();

  const settings = State.getSettings();
  if (settings.largeText) document.body.classList.add('large-text');

  // Check URL params for share link
  const hadParams = checkUrlParams();

  // Initial route
  if (!State.isOnboarded()) {
    Router.navigateTo('welcome');
  } else if (hadParams) {
    Router.navigateTo('settings');
  } else {
    Router.navigateTo('dashboard');
  }

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  // Stop scanner when navigating away
  document.addEventListener('click', (e) => {
    if (e.target.closest('.nav-item') || e.target.closest('.sidebar-item')) {
      stopScanner();
    }
  });

  document.addEventListener('scheduleChanged', updateScheduleDisplay);

  // Background preload: warm up caches so pages feel instant
  setTimeout(preloadData, 200);
}

function preloadData() {
  fetchSchedules('all').catch(() => {});
  fetchSchedules('future').catch(() => {});
  if (!State.getMemberCache()) {
    API.getMembers({ status: 'active' })
       .then(r => State.setMemberCache(Array.isArray(r) ? r : (r?.members || [])))
       .catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', initApp);
