/**
 * js/app.js - 主應用程式邏輯
 * 天達大班報到系統 PWA
 */

// ── Global state ────────────────────────────────────────────────────────────
let _html5QrCode = null;
let _scannerFacingMode = 'environment';
let _currentAttendance = {};   // id -> {isCheckedIn, isLeave, status}
let _allMembers = [];
let _mcChecked = new Set();     // manually checked IDs in manual-checkin
let _selectedAttendanceMode = '實體';

// ── Sidebar Config ──────────────────────────────────────────────────────────
const SIDEBAR_ITEMS = [
  { view: 'dashboard',       icon: 'fa-house',        label: '即時主頁' },
  { divider: true },
  { view: 'scanner',         icon: 'fa-qrcode',       label: 'QR 掃描報到' },
  { view: 'manual-checkin',  icon: 'fa-list-check',   label: '簡易報到' },
  { divider: true },
  { view: 'quick-search',    icon: 'fa-magnifying-glass', label: '快速查詢' },
  { view: 'member-list',     icon: 'fa-users',        label: '班員資料' },
  { view: 'class-view',      icon: 'fa-layer-group',  label: '分班檢視' },
  { divider: true },
  { view: 'attendance-stats',icon: 'fa-chart-bar',    label: '出席統計' },
  { view: 'class-schedule',  icon: 'fa-calendar-days',label: '班程資料' },
  { divider: true },
  { view: 'settings',        icon: 'fa-gear',         label: '工具設定' },
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

// ── Toast ───────────────────────────────────────────────────────────────────
function showToast(msg, type = 'info', duration = 3000) {
  const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-xmark-circle' : 'fa-circle-info';
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fa-solid ${icon}"></i> ${msg}`;
  const container = document.getElementById('toast-container');
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity .3s'; setTimeout(() => toast.remove(), 300); }, duration);
}

// ── Loading ─────────────────────────────────────────────────────────────────
function showLoading(msg = '載入中...') {
  const el = document.getElementById('loading-overlay');
  el.querySelector('p').textContent = msg;
  el.classList.add('show');
}
function hideLoading() { document.getElementById('loading-overlay').classList.remove('show'); }

// ── Mobile Sidebar ──────────────────────────────────────────────────────────
function openMobileSidebar() {
  document.getElementById('mobile-sidebar-panel').classList.add('open');
  document.getElementById('mobile-sidebar-overlay').classList.add('open');
}
function closeMobileSidebar() {
  document.getElementById('mobile-sidebar-panel').classList.remove('open');
  document.getElementById('mobile-sidebar-overlay').classList.remove('open');
}

// ── Schedule Info ────────────────────────────────────────────────────────────
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

// ── DASHBOARD ───────────────────────────────────────────────────────────────
Router.register('dashboard', async () => {
  const schedule = State.getSchedule();
  if (!schedule || !schedule.date) {
    document.getElementById('dash-setup-prompt').classList.remove('hidden');
    return;
  }
  document.getElementById('dash-schedule-card').classList.remove('hidden');
  document.getElementById('dash-kpi-row').classList.remove('hidden');
  document.getElementById('dash-progress-card').classList.remove('hidden');
  document.getElementById('dash-actions').classList.remove('hidden');
  document.getElementById('dash-schedule-title').textContent = schedule.className || '班程';
  document.getElementById('dash-schedule-date').textContent = `${schedule.date} | ${schedule.attendanceMode || '實體'}`;
  document.getElementById('dash-mode-badge').textContent = schedule.attendanceMode || '實體';
  try {
    const data = await API.getAttendanceStats(schedule.date, schedule.classCode);
    const { present = 0, absent = 0, leave = 0, total = 0, byUnit = [] } = data;
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;
    document.getElementById('kpi-present').textContent = present;
    document.getElementById('kpi-absent').textContent = absent;
    document.getElementById('kpi-leave').textContent = leave;
    document.getElementById('kpi-rate').textContent = rate + '%';
    document.getElementById('dash-progress-text').textContent = `${present} / ${total}`;
    document.getElementById('dash-progress-fill').style.width = rate + '%';
    if (byUnit.length > 0) {
      document.getElementById('dash-by-unit').classList.remove('hidden');
      document.getElementById('dash-unit-list').innerHTML = byUnit.slice(0, 8).map(u => {
        const r = u.total > 0 ? Math.round((u.present / u.total) * 100) : 0;
        return `<div class="p-3 flex items-center gap-3">
          <div class="flex-1 min-w-0">
            <div class="flex justify-between text-sm mb-1">
              <span class="font-medium text-gray-700 truncate">${u.unit}</span>
              <span class="text-gray-500 ml-2 shrink-0">${u.present}/${u.total} (${r}%)</span>
            </div>
            <div class="progress-bar"><div class="progress-fill" style="width:${r}%"></div></div>
          </div>
        </div>`;
      }).join('');
    }
    document.getElementById('dash-updated').textContent = '資料更新時間: ' + new Date().toLocaleTimeString('zh-TW');
  } catch (e) {
    showToast('載入統計失敗: ' + e.message, 'error');
  }
});

// ── SCANNER ─────────────────────────────────────────────────────────────────
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
  if (_html5QrCode) { stopScanner(); }
  _html5QrCode = new Html5Qrcode('reader');
  const config = { fps: 10, qrbox: { width: 220, height: 220 }, aspects: 1 };
  _html5QrCode.start({ facingMode: _scannerFacingMode }, config, onQRSuccess, () => {}).catch(err => {
    showToast('無法啟動相機: ' + err, 'error');
  });
}

function stopScanner() {
  if (_html5QrCode) { _html5QrCode.stop().catch(() => {}); _html5QrCode = null; }
}

async function onQRSuccess(decodedText) {
  stopScanner();
  const schedule = State.getSchedule();
  const resultEl = document.getElementById('scanner-result');
  if (!resultEl) return;
  resultEl.classList.remove('hidden');
  resultEl.innerHTML = `<div class="flex items-center gap-3"><div class="spinner"></div><span class="text-gray-600">查詢中…</span></div>`;
  try {
    // QR Code 格式可能是 URL 含 ID，或直接是 ID
    let memberId = decodedText.trim();
    // 嘗試解析 URL 中的 ID 參數
    try { const u = new URL(memberId); memberId = u.searchParams.get('id') || u.searchParams.get('ID') || memberId; } catch {}
    const member = await API.getMemberById(memberId);
    resultEl.innerHTML = `
      <div class="flex items-center gap-4 mb-4">
        <div class="member-avatar w-14 h-14 text-xl">${member.name[0]}</div>
        <div><h3 class="text-lg font-bold text-gray-800">${member.name}</h3>
          <p class="text-sm text-gray-500">${member.id} | ${member.unit} ${member.class}</p></div>
      </div>
      <div class="flex gap-2">
        <button onclick="confirmCheckin('${member.id}','${member.name}')" class="btn-primary flex-1">
          <i class="fa-solid fa-check"></i> 確認報到
        </button>
        <button onclick="startScanner()" class="btn-secondary px-4">重新掃描</button>
      </div>`;
  } catch (e) {
    resultEl.innerHTML = `<div class="text-red-600 text-sm mb-2"><i class="fa-solid fa-xmark-circle"></i> ${e.message}</div>
      <button onclick="startScanner()" class="btn-secondary text-sm w-full">重新掃描</button>`;
  }
}

async function confirmCheckin(id, name) {
  const schedule = State.getSchedule();
  showLoading('報到中...');
  try {
    await API.checkin(id, name, schedule.verify, schedule.classCode, schedule.attendanceMode || '實體');
    hideLoading();
    showToast(`✓ ${name} 報到成功！`, 'success');
    startScanner();
    document.getElementById('scanner-result').classList.add('hidden');
  } catch (e) { hideLoading(); showToast('報到失敗: ' + e.message, 'error'); }
}

async function manualLookup() {
  const id = document.getElementById('manual-id-input').value.trim();
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

// ── MANUAL CHECKIN ───────────────────────────────────────────────────────────
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

    // Load members
    let members = State.getMemberCache();
    if (!members) {
      const res = await API.getMembers({ status: 'active' });
      members = res.members || [];
      State.setMemberCache(members);
    }
    _allMembers = members;

    // Populate unit filter
    const units = [...new Set(members.map(m => m.unit).filter(Boolean))].sort();
    const unitSel = document.getElementById('mc-filter-unit');
    if (unitSel) {
      unitSel.innerHTML = '<option value="">所有區別</option>' + units.map(u => `<option value="${u}">${u}</option>`).join('');
    }
    document.getElementById('mc-count').textContent = `共 ${members.length} 位`;
    renderMemberList();
  } catch (e) {
    const listEl = document.getElementById('mc-member-list');
    if (listEl) listEl.innerHTML = `<div class="p-6 text-center text-red-500">${e.message}</div>`;
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
    listEl.innerHTML = '<div class="p-6 text-center text-gray-400">無符合結果</div>';
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
    const disabled = isAlreadyIn ? 'opacity-50 cursor-not-allowed' : '';
    return `<div class="member-item ${disabled}" onclick="${isAlreadyIn ? '' : `toggleMcCheck('${m.id}')`}">
      <div class="checkin-check ${checkClass}" id="chk-${m.id}"><i class="fa-solid fa-check text-xs"></i></div>
      <div class="member-avatar">${m.name[0]}</div>
      <div class="flex-1 min-w-0">
        <div class="text-base font-medium text-gray-800">${m.name}</div>
        <div class="text-sm text-gray-500">${m.unit} · ${m.class}</div>
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
    hideLoading(); showToast(res.message || '報到成功', 'success');
    records.forEach(r => {
      _currentAttendance[r.id] = { isCheckedIn: true, statusRaw: '○', status: 'present' };
    });
    _mcChecked.clear();
    renderMemberList();
  } catch (e) { hideLoading(); showToast('批次報到失敗: ' + e.message, 'error'); }
}

async function submitTempCheckin() {
  const name = document.getElementById('temp-name')?.value.trim();
  if (!name) { showToast('請輸入姓名', 'error'); return; }
  const schedule = State.getSchedule();
  if (!schedule?.verify) { showToast('請先設定班程', 'error'); return; }
  showLoading('臨時報到...');
  try {
    const res = await API.checkinTemp(name, schedule.verify, schedule.classCode, schedule.attendanceMode || '實體');
    hideLoading(); showToast(res.message || '臨時報到成功', 'success');
    if (document.getElementById('temp-name')) document.getElementById('temp-name').value = '';
  } catch (e) { hideLoading(); showToast('臨時報到失敗: ' + e.message, 'error'); }
}

function toggleLargeText() {
  document.body.classList.toggle('large-text');
  State.updateSettings({ largeText: document.body.classList.contains('large-text') });
}

// ── QUICK SEARCH ─────────────────────────────────────────────────────────────
Router.register('quick-search', async () => {
  let members = State.getMemberCache();
  if (!members) {
    try {
      const res = await API.getMembers({ status: 'active' });
      members = res.members || [];
      State.setMemberCache(members);
    } catch {}
  }
  // Populate unit filter
  if (members) {
    const units = [...new Set(members.map(m => m.unit).filter(Boolean))].sort();
    const sel = document.getElementById('qs-filter-unit');
    if (sel) sel.innerHTML = '<option value="">所有區別</option>' + units.map(u => `<option>${u}</option>`).join('');
  }
  // Load attendance if schedule set
  const schedule = State.getSchedule();
  if (schedule?.date && Object.keys(_currentAttendance).length === 0) {
    try {
      const res = await API.getAttendanceByDate(schedule.date, schedule.classCode);
      (res.records || []).forEach(r => { _currentAttendance[r.id] = r; });
    } catch {}
  }
});

function quickSearch(term) {
  term = term.toLowerCase().trim();
  const unitFilter = document.getElementById('qs-filter-unit')?.value || '';
  const statusFilter = document.getElementById('qs-filter-status')?.value || '';
  const resultsEl = document.getElementById('qs-results');
  if (!resultsEl) return;
  const members = State.getMemberCache() || _allMembers;
  if (!members.length) { resultsEl.innerHTML = '<div class="p-6 text-center text-gray-400">無班員資料</div>'; return; }
  if (!term && !unitFilter && !statusFilter) {
    resultsEl.innerHTML = '<div class="p-8 text-center text-gray-400"><i class="fa-solid fa-magnifying-glass text-3xl mb-2 block opacity-30"></i>輸入姓名開始搜尋</div>';
    return;
  }
  let filtered = members.filter(m => {
    if (term && !m.name.toLowerCase().includes(term) && !m.id.toLowerCase().includes(term)) return false;
    if (unitFilter && m.unit !== unitFilter) return false;
    if (statusFilter) {
      const att = _currentAttendance[m.id];
      if (statusFilter === 'present' && !att?.isCheckedIn) return false;
      if (statusFilter === 'absent' && (att?.isCheckedIn || att?.isLeave)) return false;
      if (statusFilter === 'leave' && !att?.isLeave) return false;
    }
    return true;
  }).slice(0, 50);

  if (!filtered.length) { resultsEl.innerHTML = '<div class="p-6 text-center text-gray-400">查無結果</div>'; return; }
  resultsEl.innerHTML = filtered.map(m => {
    const att = _currentAttendance[m.id];
    let badge = '<span class="badge badge-unknown text-xs">未知</span>';
    if (att?.isCheckedIn) badge = `<span class="badge badge-present text-xs">${att.statusRaw || '已到'}</span>`;
    else if (att?.isLeave) badge = `<span class="badge badge-leave text-xs">${att.statusRaw || '請假'}</span>`;
    else if (att) badge = '<span class="badge badge-absent text-xs">未到</span>';
    return `<div class="member-item" onclick="viewMemberDetail('${m.id}')">
      <div class="member-avatar">${m.name[0]}</div>
      <div class="flex-1 min-w-0">
        <div class="font-medium text-gray-800">${m.name}</div>
        <div class="text-sm text-gray-500">${m.id} · ${m.unit} · ${m.class}</div>
      </div>
      ${badge}
    </div>`;
  }).join('');
}

// ── MEMBER LIST ──────────────────────────────────────────────────────────────
Router.register('member-list', async () => {
  let members = State.getMemberCache();
  if (!members) {
    try {
      const res = await API.getMembers({ status: 'active' });
      members = res.members || [];
      State.setMemberCache(members);
    } catch (e) {
      document.getElementById('ml-list').innerHTML = `<div class="p-6 text-center text-red-500">${e.message}</div>`;
      return;
    }
  }
  _allMembers = members;
  const units = [...new Set(members.map(m => m.unit).filter(Boolean))].sort();
  const classes = [...new Set(members.map(m => m.class).filter(Boolean))].sort();
  const unitSel = document.getElementById('ml-unit');
  const classSel = document.getElementById('ml-class');
  if (unitSel) unitSel.innerHTML = '<option value="">所有區別</option>' + units.map(u => `<option>${u}</option>`).join('');
  if (classSel) classSel.innerHTML = '<option value="">所有班別</option>' + classes.map(c => `<option>${c}</option>`).join('');
  filterMemberListView();
});

function filterMemberListView() {
  const term = (document.getElementById('ml-search')?.value || '').toLowerCase();
  const unit = document.getElementById('ml-unit')?.value || '';
  const cls = document.getElementById('ml-class')?.value || '';
  const filtered = _allMembers.filter(m => {
    if (term && !m.name.toLowerCase().includes(term) && !m.id.includes(term)) return false;
    if (unit && m.unit !== unit) return false;
    if (cls && m.class !== cls) return false;
    return true;
  });
  document.getElementById('ml-count').textContent = `共 ${filtered.length} 位`;
  const listEl = document.getElementById('ml-list');
  if (!listEl) return;
  listEl.innerHTML = filtered.map(m => `
    <div class="member-item" onclick="viewMemberDetail('${m.id}')">
      <div class="member-avatar">${m.name[0]}</div>
      <div class="flex-1 min-w-0">
        <div class="font-medium text-gray-800">${m.name}</div>
        <div class="text-sm text-gray-500">${m.id} · ${m.unit} · ${m.class}</div>
      </div>
      <i class="fa-solid fa-chevron-right text-gray-300"></i>
    </div>`).join('');
}

function viewMemberDetail(id) {
  const member = (_allMembers.length > 0 ? _allMembers : (State.getMemberCache() || [])).find(m => m.id === id);
  Router.navigateTo('member-detail', { member });
}

// ── MEMBER DETAIL ─────────────────────────────────────────────────────────────
Router.register('member-detail', async (params) => {
  let member = params?.member || Router.getMemberDetailData();
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
    if (link) { link.href = member.qrCodeUrl; link.textContent = '查看 QR Code'; }
  }
  const att = _currentAttendance[member.id];
  if (att && !att.isCheckedIn && !att.isLeave) {
    document.getElementById('md-checkin-btn').classList.remove('hidden');
    document.getElementById('md-checkin-btn').dataset.memberId = member.id;
    document.getElementById('md-checkin-btn').dataset.memberName = member.name;
  }
  // Load history
  try {
    const hist = await API.getMemberAttendanceHistory(member.id);
    const records = (hist?.records || hist || []).slice(0, 20);
    const histEl = document.getElementById('md-history-list');
    if (histEl && records.length) {
      histEl.innerHTML = records.map(r => `
        <div class="card p-3 flex items-center gap-3">
          <div class="text-2xl">${r.statusRaw || '?'}</div>
          <div class="flex-1">
            <div class="text-sm font-medium text-gray-700">${r.date || ''}</div>
            <div class="text-xs text-gray-400">${r.className || ''} ${r.status || ''}</div>
          </div>
        </div>`).join('');
    } else if (histEl) histEl.innerHTML = '<div class="p-4 text-center text-gray-400">無出席記錄</div>';
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
  const id = btn.dataset.memberId; const name = btn.dataset.memberName;
  const schedule = State.getSchedule();
  if (!schedule?.verify) { showToast('請先設定班程', 'error'); return; }
  showLoading();
  try {
    await API.checkin(id, name, schedule.verify, schedule.classCode, schedule.attendanceMode || '實體');
    hideLoading(); showToast(`${name} 報到成功`, 'success');
    btn.classList.add('hidden');
    _currentAttendance[id] = { isCheckedIn: true, statusRaw: '○', status: 'present' };
  } catch (e) { hideLoading(); showToast('報到失敗: ' + e.message, 'error'); }
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
      document.getElementById('cv-class-list').innerHTML = `<div class="p-6 text-center text-red-500">${e.message}</div>`;
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
  listEl.innerHTML = Object.entries(byClass).map(([cls, members]) => `
    <div class="card">
      <div class="card-header cursor-pointer" onclick="toggleClassSection(this)">
        <i class="fa-solid fa-users text-brand"></i> ${cls}
        <span class="ml-auto text-xs text-gray-400">${members.length} 位</span>
        <i class="fa-solid fa-chevron-down ml-2 text-gray-400 transition-transform"></i>
      </div>
      <div class="divide-y divide-gray-100">
        ${members.map(m => {
          const att = _currentAttendance[m.id];
          let badge = '';
          if (att?.isCheckedIn) badge = `<span class="badge badge-present text-xs">${att.statusRaw || '已到'}</span>`;
          else if (att?.isLeave) badge = `<span class="badge badge-leave text-xs">${att.statusRaw}</span>`;
          return `<div class="member-item" onclick="viewMemberDetail('${m.id}')">
            <div class="member-avatar w-9 h-9 text-sm">${m.name[0]}</div>
            <div class="flex-1 min-w-0"><div class="text-sm font-medium text-gray-800">${m.name}</div>
            <div class="text-xs text-gray-400">${m.unit}</div></div>${badge}</div>`;
        }).join('')}
      </div>
    </div>`).join('');
}

function filterClassView() {
  const term = (document.getElementById('cv-search')?.value || '').toLowerCase();
  const filtered = _allMembers.filter(m => !term || m.name.toLowerCase().includes(term) || m.id.includes(term));
  renderClassView(filtered);
}

function toggleClassSection(header) {
  const body = header.nextElementSibling;
  body.classList.toggle('hidden');
  header.querySelector('.fa-chevron-down').style.transform = body.classList.contains('hidden') ? 'rotate(-90deg)' : '';
}

// ── ATTENDANCE STATS ──────────────────────────────────────────────────────────
Router.register('attendance-stats', async () => {
  const schedule = State.getSchedule();
  if (!schedule?.date) { document.getElementById('stats-no-schedule').classList.remove('hidden'); return; }
  document.getElementById('stats-main').classList.remove('hidden');
  try {
    const data = await API.getAttendanceStats(schedule.date, schedule.classCode);
    const { present = 0, absent = 0, leave = 0, total = 0, male = 0, female = 0, byUnit = [] } = data;
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;
    document.getElementById('stats-present').textContent = present;
    document.getElementById('stats-rate').textContent = rate + '%';
    document.getElementById('stats-fill').style.width = rate + '%';
    document.getElementById('stats-male').textContent = male;
    document.getElementById('stats-female').textContent = female;
    document.getElementById('stats-leave').textContent = leave;
    document.getElementById('stats-absent').textContent = absent;
    document.getElementById('stats-unit-list').innerHTML = byUnit.map(u => {
      const r = u.total > 0 ? Math.round((u.present / u.total) * 100) : 0;
      return `<div>
        <div class="flex justify-between text-sm mb-1">
          <span class="font-medium text-gray-700">${u.unit}</span>
          <span class="text-gray-500">${u.present}/${u.total} <span class="text-brand font-semibold">${r}%</span></span>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${r}%"></div></div>
      </div>`;
    }).join('');
  } catch (e) { showToast('載入統計失敗: ' + e.message, 'error'); }
});

// ── CLASS SCHEDULE ────────────────────────────────────────────────────────────
Router.register('class-schedule', () => { loadScheduleView(); });

async function loadScheduleView() {
  const filter = document.getElementById('cs-filter')?.value || 'all';
  try {
    const schedules = await API.getSchedules(filter);
    const listEl = document.getElementById('cs-list');
    if (!listEl) return;
    if (!schedules.length) { listEl.innerHTML = '<div class="p-6 text-center text-gray-400">無班程資料</div>'; return; }
    listEl.innerHTML = schedules.map(s => {
      const isPast = new Date(s.date) < new Date();
      const activeBadge = s.isActive ? '<span class="badge badge-present text-xs">啟用</span>' : '<span class="badge badge-unknown text-xs">未啟用</span>';
      return `<div class="card p-4 flex items-center gap-3 ${isPast ? 'opacity-70' : ''}">
        <div class="w-12 h-12 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
          <i class="fa-solid fa-calendar-day text-brand"></i>
        </div>
        <div class="flex-1 min-w-0">
          <div class="font-medium text-gray-800">${s.dateFormatted || s.date}</div>
          <div class="text-sm text-gray-500">${s.className || ''} · 班別 ${s.classCode}</div>
        </div>
        <div class="flex flex-col items-end gap-1">
          ${activeBadge}
          <button onclick="applySchedule(${JSON.stringify(s).replace(/"/g,'&quot;')})" class="text-xs text-brand underline mt-1">套用</button>
        </div>
      </div>`;
    }).join('');
  } catch (e) { showToast('載入班程失敗: ' + e.message, 'error'); }
}

function applySchedule(s) {
  const schedule = State.getSchedule() || {};
  State.setSchedule({ ...schedule, date: s.date, classCode: s.classCode, className: s.className, verify: s.verify || schedule.verify });
  updateScheduleDisplay();
  showToast('已套用班程: ' + (s.dateFormatted || s.date), 'success');
  Router.navigateTo('settings');
}

// ── SETTINGS ──────────────────────────────────────────────────────────────────
Router.register('settings', () => {
  const schedule = State.getSchedule() || {};
  const settings = State.getSettings();
  if (schedule.date) document.getElementById('st-date').value = schedule.date;
  if (schedule.classCode) document.getElementById('st-classcode').value = schedule.classCode;
  if (schedule.className) document.getElementById('st-classname').value = schedule.className;
  if (schedule.verify) document.getElementById('st-verify').value = schedule.verify;
  _selectedAttendanceMode = schedule.attendanceMode || settings.attendanceMode || '實體';
  updateModeButtons();
  // Large text toggle
  const toggle = document.getElementById('toggle-large-text');
  if (toggle) {
    const isLarge = settings.largeText;
    toggle.classList.toggle('bg-brand', isLarge);
    toggle.querySelector('div').style.transform = isLarge ? 'translateX(24px)' : '';
  }
  renderSettingsDisplay();
});

function setMode(mode) {
  _selectedAttendanceMode = mode;
  updateModeButtons();
}

function updateModeButtons() {
  const phys = document.getElementById('btn-mode-physical');
  const online = document.getElementById('btn-mode-online');
  if (!phys) return;
  phys.className = `flex-1 py-2 text-sm rounded-xl border-2 font-medium ${_selectedAttendanceMode === '實體' ? 'border-brand bg-brand text-white' : 'border-gray-200 text-gray-600'}`;
  online.className = `flex-1 py-2 text-sm rounded-xl border-2 font-medium ${_selectedAttendanceMode === '線上' ? 'border-brand bg-brand text-white' : 'border-gray-200 text-gray-600'}`;
}

function saveSettings() {
  const date = document.getElementById('st-date').value;
  const classCode = document.getElementById('st-classcode').value.trim();
  const className = document.getElementById('st-classname').value.trim();
  const verify = document.getElementById('st-verify').value.trim();
  if (!date || !classCode || !verify) { showToast('請填寫日期、班別代碼和驗證密碼', 'error'); return; }
  State.setSchedule({ date, classCode, className, verify, attendanceMode: _selectedAttendanceMode });
  State.updateSettings({ attendanceMode: _selectedAttendanceMode });
  _currentAttendance = {};
  State.clearMemberCache();
  updateScheduleDisplay();
  showToast('設定已儲存', 'success');
  renderSettingsDisplay();
}

function renderSettingsDisplay() {
  const schedule = State.getSchedule();
  const el = document.getElementById('current-settings-display');
  if (!el) return;
  if (!schedule) { el.innerHTML = '<p class="text-gray-400">尚未設定班次</p>'; return; }
  el.innerHTML = `
    <div class="flex gap-2"><span class="text-gray-400 w-20">日期</span><span class="font-medium">${schedule.date || '-'}</span></div>
    <div class="flex gap-2"><span class="text-gray-400 w-20">班別</span><span class="font-medium">${schedule.className || ''} (${schedule.classCode || '-'})</span></div>
    <div class="flex gap-2"><span class="text-gray-400 w-20">出勤</span><span class="font-medium">${schedule.attendanceMode || '-'}</span></div>
    <div class="flex gap-2"><span class="text-gray-400 w-20">密碼</span><span class="font-medium">${schedule.verify ? '已設定 (' + schedule.verify + ')' : '未設定'}</span></div>`;
}

async function fetchActiveSchedule() {
  showLoading('取得班程中...');
  try {
    const data = await API.getActiveSchedule();
    hideLoading();
    if (data.date) {
      if (document.getElementById('st-date')) document.getElementById('st-date').value = data.date;
      if (data.classCode && document.getElementById('st-classcode')) document.getElementById('st-classcode').value = data.classCode;
      if (data.className && document.getElementById('st-classname')) document.getElementById('st-classname').value = data.className;
      if (data.verify && document.getElementById('st-verify')) document.getElementById('st-verify').value = data.verify;
      showToast('已自動填入班程資料', 'success');
    } else showToast('目前無啟用班程', 'error');
  } catch (e) { hideLoading(); showToast('取得失敗: ' + e.message, 'error'); }
}

function toggleLargeTextSetting() {
  const settings = State.getSettings();
  const newVal = !settings.largeText;
  State.updateSettings({ largeText: newVal });
  document.body.classList.toggle('large-text', newVal);
  const toggle = document.getElementById('toggle-large-text');
  if (toggle) {
    toggle.classList.toggle('bg-brand', newVal);
    toggle.querySelector('div').style.transform = newVal ? 'translateX(24px)' : '';
  }
}

// ── APP INIT ─────────────────────────────────────────────────────────────────
function initApp() {
  State.init();
  buildSidebar('desktop-sidebar-nav');
  buildSidebar('mobile-sidebar-nav');
  updateScheduleDisplay();

  // Apply saved settings
  const settings = State.getSettings();
  if (settings.largeText) document.body.classList.add('large-text');

  // Initial route
  if (!State.hasSchedule()) {
    Router.navigateTo('settings');
  } else {
    Router.navigateTo('dashboard');
  }

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
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
