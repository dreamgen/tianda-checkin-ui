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
let _selectedAttendanceMode = '實體';
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

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
Router.register('dashboard', async () => {
  const schedule = State.getSchedule();
  if (!schedule || !schedule.date) {
    document.getElementById('dash-setup-prompt').classList.remove('hidden');
    return;
  }

  ['dash-schedule-card','dash-kpi-row','dash-gender-row','dash-progress-card','dash-actions'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  });

  document.getElementById('dash-schedule-title').textContent = schedule.className || '班程';
  document.getElementById('dash-schedule-date').textContent = schedule.date;
  document.getElementById('dash-mode-badge').textContent = schedule.attendanceMode || '實體';

  try {
    const data = await API.getAttendanceStats(schedule.date, schedule.classCode);
    const { present = 0, absent = 0, leave = 0, total = 0, male = 0, female = 0, byUnit = [] } = data;
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;

    document.getElementById('kpi-present').textContent = present;
    document.getElementById('kpi-absent').textContent = absent;
    document.getElementById('kpi-leave').textContent = leave;
    document.getElementById('kpi-rate').textContent = rate + '%';
    document.getElementById('dash-progress-text').textContent = `${present} / ${total}`;
    document.getElementById('dash-progress-fill').style.width = rate + '%';

    if (male !== undefined) {
      document.getElementById('kpi-male').textContent = male;
      document.getElementById('kpi-female').textContent = female;
    }

    if (byUnit.length > 0) {
      document.getElementById('dash-by-unit').classList.remove('hidden');
      document.getElementById('dash-unit-list').innerHTML = byUnit.slice(0, 8).map(u => {
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

    document.getElementById('dash-updated').textContent = '資料更新時間: ' + new Date().toLocaleTimeString('zh-TW');
  } catch (e) {
    showToast('載入統計失敗: ' + e.message, 'error');
  }
});

// ── SCANNER ───────────────────────────────────────────────────────────────────
Router.register('scanner', () => {
  const schedule = State.getSchedule();
  if (!schedule || !schedule.verify) {
    document.getElementById('scanner-setup-warn').classList.remove('hidden');
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
    await API.checkin(id, name, schedule.verify, schedule.classCode, schedule.attendanceMode || '實體');
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
  await loadMCData();
});

async function loadMCData() {
  const schedule = State.getSchedule();
  if (!schedule || !schedule.date) return;
  try {
    const result = await API.getAttendanceByDate(schedule.date, schedule.classCode);
    const records = result.records || [];
    _currentAttendance = {};
    records.forEach(r => { _currentAttendance[r.id] = r; });

    let members = State.getMemberCache();
    if (!members) {
      const res = await API.getMembers({ status: 'active' });
      members = res.members || [];
      State.setMemberCache(members);
    }
    _allMembers = members;

    const units = [...new Set(members.map(m => m.unit).filter(Boolean))].sort();
    const unitSel = document.getElementById('mc-filter-unit');
    if (unitSel) {
      unitSel.innerHTML = '<option value="">所有區別</option>' + units.map(u => `<option value="${u}">${u}</option>`).join('');
    }
    document.getElementById('mc-count').textContent = `共 ${members.length} 位`;
    renderMemberList();
  } catch (e) {
    const listEl = document.getElementById('mc-member-list');
    if (listEl) listEl.innerHTML = `<div class="p-6 text-center text-red-500"><i class="fa-solid fa-triangle-exclamation mr-1"></i>${e.message}</div>`;
  }
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
  if (!schedule?.verify) { showToast('請先設定驗證密碼', 'error'); return; }
  if (_mcChecked.size === 0) return;
  const records = [..._mcChecked].map(id => {
    const m = _allMembers.find(x => x.id === id);
    return { id, name: m?.name || id, classCode: schedule.classCode };
  });
  showLoading(`批次報到 ${records.length} 位…`);
  try {
    const res = await API.checkinManualBatch(schedule.verify, records, schedule.attendanceMode || '實體');
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
  if (!schedule?.verify) { showToast('請先設定班程', 'error'); return; }
  showLoading('臨時報到...');
  try {
    const res = await API.checkinTemp(name, schedule.verify, schedule.classCode, schedule.attendanceMode || '實體');
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
  let members = State.getMemberCache();
  if (!members) {
    try {
      const res = await API.getMembers({ status: 'active' });
      members = res.members || [];
      State.setMemberCache(members);
    } catch {}
  }
  if (members) {
    const units = [...new Set(members.map(m => m.unit).filter(Boolean))].sort();
    const classes = [...new Set(members.map(m => m.class).filter(Boolean))].sort();
    ['qs-adv-unit'].forEach(id => {
      const sel = document.getElementById(id);
      if (sel) sel.innerHTML = '<option value="">所有區別</option>' + units.map(u => `<option value="${u}">${u}</option>`).join('');
    });
    const classSel = document.getElementById('qs-adv-class');
    if (classSel) classSel.innerHTML = '<option value="">所有班別</option>' + classes.map(c => `<option value="${c}">${c}</option>`).join('');
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
  let members = State.getMemberCache();
  if (!members) {
    try {
      const res = await API.getMembers({ status: 'active' });
      members = res.members || [];
      State.setMemberCache(members);
    } catch (e) {
      document.getElementById('ml-list').innerHTML = `<div class="card p-8 text-center text-red-500">${e.message}</div>`;
      return;
    }
  }
  _allMembers = members;
  const units   = [...new Set(members.map(m => m.unit).filter(Boolean))].sort();
  const classes = [...new Set(members.map(m => m.class).filter(Boolean))].sort();
  const unitSel  = document.getElementById('ml-unit');
  const classSel = document.getElementById('ml-class');
  if (unitSel)  unitSel.innerHTML  = '<option value="">所有區別</option>' + units.map(u => `<option value="${u}">${u}</option>`).join('');
  if (classSel) classSel.innerHTML = '<option value="">所有班別</option>' + classes.map(c => `<option value="${c}">${c}</option>`).join('');
  filterMemberListView();
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
  if (!schedule?.verify) { showToast('請先設定班程', 'error'); return; }
  showLoading();
  try {
    await API.checkin(id, name, schedule.verify, schedule.classCode, schedule.attendanceMode || '實體');
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
  let members = State.getMemberCache();
  if (!members) {
    try {
      const res = await API.getMembers({ status: 'active' });
      members = res.members || [];
      State.setMemberCache(members);
    } catch (e) {
      document.getElementById('cv-class-list').innerHTML = `<div class="card p-8 text-center text-red-500">${e.message}</div>`;
      return;
    }
  }
  _allMembers = members;
  renderClassView(members);
});

function renderClassView(members) {
  const byClass = {};
  members.forEach(m => {
    const cls = m.class || '未分班';
    if (!byClass[cls]) byClass[cls] = [];
    byClass[cls].push(m);
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
Router.register('attendance-stats', async () => {
  const schedule = State.getSchedule();
  if (!schedule?.date) {
    document.getElementById('stats-no-schedule').classList.remove('hidden');
    return;
  }
  document.getElementById('stats-main').classList.remove('hidden');
  try {
    const data = await API.getAttendanceStats(schedule.date, schedule.classCode);
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

    const maxPresent = byUnit.length > 0 ? Math.max(...byUnit.map(u => u.total || 0)) : 1;
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
        <div class="progress-bar">
          <div class="progress-fill" style="width:${r}%"></div>
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    showToast('載入統計失敗: ' + e.message, 'error');
  }
});

// ── CLASS SCHEDULE ────────────────────────────────────────────────────────────
Router.register('class-schedule', () => { loadScheduleView(); });

async function loadScheduleView() {
  const filter = document.getElementById('cs-filter')?.value || 'all';
  try {
    const schedules = await API.getSchedules(filter);
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
  } catch (e) {
    showToast('載入班程失敗: ' + e.message, 'error');
  }
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
Router.register('settings', () => {
  const schedule = State.getSchedule() || {};
  const settings = State.getSettings();

  if (schedule.date)      document.getElementById('st-date').value = schedule.date;
  if (schedule.classCode) document.getElementById('st-classcode').value = schedule.classCode;
  if (schedule.className) document.getElementById('st-classname').value = schedule.className;
  if (schedule.verify)    document.getElementById('st-verify').value = schedule.verify;

  _selectedAttendanceMode = schedule.attendanceMode || settings.attendanceMode || '實體';
  updateModeButtons();

  // Large text toggle
  const toggle = document.getElementById('toggle-large-text');
  if (toggle) toggle.classList.toggle('on', !!settings.largeText);

  renderSettingsDisplay();
});

function setMode(mode) {
  _selectedAttendanceMode = mode;
  updateModeButtons();
}

function updateModeButtons() {
  const phys   = document.getElementById('btn-mode-physical');
  const online = document.getElementById('btn-mode-online');
  if (!phys) return;
  const activeClass = 'flex-1 py-2.5 text-sm rounded-xl border-2 border-brand bg-brand text-white font-semibold';
  const inactiveClass = 'flex-1 py-2.5 text-sm rounded-xl border-2 border-gray-200 text-gray-600 font-semibold';
  phys.className   = `${_selectedAttendanceMode === '實體' ? activeClass : inactiveClass}`;
  online.className = `${_selectedAttendanceMode === '線上' ? activeClass : inactiveClass}`;
  // Re-add icons since className replaces innerHTML
  phys.innerHTML   = `<i class="fa-solid fa-person-walking mr-1"></i>實體`;
  online.innerHTML = `<i class="fa-solid fa-video mr-1"></i>線上`;
}

function saveSettings() {
  const date      = document.getElementById('st-date')?.value;
  const classCode = document.getElementById('st-classcode')?.value.trim();
  const className = document.getElementById('st-classname')?.value.trim();
  const verify    = document.getElementById('st-verify')?.value.trim();

  if (!date || !classCode || !verify) {
    showToast('請填寫日期、班別代碼和驗證密碼', 'error');
    return;
  }

  State.setSchedule({ date, classCode, className, verify, attendanceMode: _selectedAttendanceMode });
  State.updateSettings({ attendanceMode: _selectedAttendanceMode });
  _currentAttendance = {};
  State.clearMemberCache();
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

async function fetchActiveSchedule() {
  showLoading('取得班程中...');
  try {
    const data = await API.getActiveSchedule();
    hideLoading();
    if (data.date) {
      const fields = { 'st-date': data.date, 'st-classcode': data.classCode, 'st-classname': data.className, 'st-verify': data.verify };
      Object.entries(fields).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el && val) el.value = val;
      });
      showToast('已自動填入班程資料', 'success');
    } else {
      showToast('目前無啟用班程', 'error');
    }
  } catch (e) {
    hideLoading();
    showToast('取得失敗: ' + e.message, 'error');
  }
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
  if (!State.hasSchedule()) {
    Router.navigateTo('settings');
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
}

document.addEventListener('DOMContentLoaded', initApp);
