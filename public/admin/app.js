const API = '/api/v1/admin';
const AUTH = '/api/v1/admin/auth';

let token = localStorage.getItem('adminToken') || '';
let activeTab = 'dashboard';
let cachedRules = [];
let cachedListings = [];
let editingRuleId = null;
let dashboardPoll = null;
const pageState = { listings: 1, groups: 1, reservations: 1, conversations: 1 };

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...options, headers });
  if (res.status === 401) {
    logout();
    throw new Error(t('session.expired'));
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data;
}

function logout() {
  token = '';
  localStorage.removeItem('adminToken');
  $('#app-screen').classList.add('hidden');
  $('#login-screen').classList.remove('hidden');
}

function showApp() {
  $('#login-screen').classList.add('hidden');
  $('#app-screen').classList.remove('hidden');
  refreshActiveTab();
}

function refreshActiveTab() {
  manageDashboardPoll();
  const loaders = {
    dashboard: loadDashboard,
    listings: loadListings,
    groups: loadGroups,
    reservations: loadReservations,
    conversations: loadConversations,
    rules: loadRules,
    requests: loadRequests,
    logs: loadLogs,
    fonio: loadFonio,
  };
  updateRuleSelects();
  loaders[activeTab]?.();
}

function manageDashboardPoll() {
  if (dashboardPoll) clearInterval(dashboardPoll);
  dashboardPoll = null;
  if (activeTab === 'dashboard' && token) {
    dashboardPoll = setInterval(() => {
      if (activeTab === 'dashboard') loadDashboard();
    }, 15000);
  }
}

function renderPagination(containerId, data, tabKey, loader) {
  const el = $(containerId);
  if (!el || !data) return;
  const { page, totalPages, total } = data;
  el.innerHTML = `
    <button type="button" class="btn ghost" data-page="prev" ${page <= 1 ? 'disabled' : ''}>←</button>
    <span class="page-info">${t('pagination.info', { page, totalPages, total })}</span>
    <button type="button" class="btn ghost" data-page="next" ${page >= totalPages ? 'disabled' : ''}>→</button>
  `;
  el.querySelector('[data-page="prev"]')?.addEventListener('click', () => {
    if (page > 1) { pageState[tabKey] = page - 1; loader(); }
  });
  el.querySelector('[data-page="next"]')?.addEventListener('click', () => {
    if (page < totalPages) { pageState[tabKey] = page + 1; loader(); }
  });
}

function updateRuleSelects() {
  const types = [
    'ADD_GUEST', 'ADD_PET', 'CANCELLATION', 'MODIFICATION',
    'EARLY_CHECKIN', 'LATE_CHECKOUT', 'RESERVATION_QUESTION',
  ];
  const modes = ['AUTO', 'MANUAL', 'DENY'];
  const typeSel = $('#rule-type');
  const modeSel = $('#rule-mode');
  if (!typeSel || !modeSel) return;
  const curType = typeSel.value;
  const curMode = modeSel.value;
  typeSel.innerHTML = types.map((v) =>
    `<option value="${v}">${t(`requestType.${v}`)}</option>`,
  ).join('');
  modeSel.innerHTML = modes.map((v) =>
    `<option value="${v}">${t(`mode.${v}`)}</option>`,
  ).join('');
  typeSel.value = types.includes(curType) ? curType : types[0];
  modeSel.value = modes.includes(curMode) ? curMode : modes[0];
}

$$('.lang-select').forEach((sel) => {
  sel.addEventListener('change', () => setLang(sel.value));
});

document.addEventListener('langchange', () => {
  refreshActiveTab();
  updateRuleFormUI();
});

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#login-error');
  err.classList.add('hidden');
  try {
    const res = await fetch(`${AUTH}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: $('#email').value,
        password: $('#password').value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(Array.isArray(data.message) ? data.message.join(', ') : data.message);
    token = data.accessToken;
    localStorage.setItem('adminToken', token);
    showApp();
  } catch (ex) {
    err.textContent = ex.message || t('login.failed');
    err.classList.remove('hidden');
  }
});

$('#logout-btn').addEventListener('click', logout);

$$('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    activeTab = btn.dataset.tab;
    $$('.nav-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    $$('.tab').forEach((tab) => tab.classList.add('hidden'));
    $(`#tab-${btn.dataset.tab}`).classList.remove('hidden');
    refreshActiveTab();
  });
});

$('#sync-settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/sync/settings', {
      method: 'PATCH',
      body: JSON.stringify({
        autoSyncEnabled: $('#auto-sync-enabled').checked,
        intervalMinutes: Number($('#auto-sync-interval').value),
      }),
    });
    notify.success(t('dashboard.autoSyncSaved'));
    loadDashboard();
  } catch (ex) {
    notify.error(ex.message);
  }
});

$('#sync-btn').addEventListener('click', async () => {
  const el = $('#sync-result');
  el.innerHTML = `<p>${t('dashboard.syncRunning')}</p>`;
  $('#sync-btn').disabled = true;
  try {
    const data = await api('/sync', { method: 'POST' });
    el.innerHTML = `<p class="success">✓ ${t('dashboard.syncDone', { listings: data.listings, reservations: data.reservations })}</p>`;
    notify.success(t('dashboard.syncDone', { listings: data.listings, reservations: data.reservations }));
    loadDashboard();
  } catch (ex) {
    el.innerHTML = `<p class="error">${t('dashboard.syncError', { message: ex.message })}</p>`;
    notify.error(t('dashboard.syncError', { message: ex.message }));
  } finally {
    $('#sync-btn').disabled = false;
  }
});

$('#rule-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    requestType: $('#rule-type').value,
    mode: $('#rule-mode').value,
    listingId: $('#rule-listing').value || null,
    priority: Number($('#rule-priority').value),
    isActive: true,
  };
  try {
    if (editingRuleId) {
      await api(`/rules/${editingRuleId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      notify.success(t('rules.updated'));
    } else {
      await api('/rules', { method: 'POST', body: JSON.stringify(payload) });
      notify.success(t('rules.created'));
    }
    await loadRules();
  } catch (ex) {
    notify.error(t('rules.error', { message: ex.message }));
  }
});

$('#rule-new-btn').addEventListener('click', resetRuleForm);

$('#rule-delete-btn').addEventListener('click', async () => {
  if (!editingRuleId) return;
  const ok = await notify.confirm(t('rules.deleteConfirm'), {
    title: t('rules.deleteTitle'),
    okLabel: t('rules.delete'),
    danger: true,
  });
  if (!ok) return;
  try {
    await api(`/rules/${editingRuleId}`, { method: 'DELETE' });
    notify.success(t('rules.deleted'));
    resetRuleForm();
    await loadRules();
  } catch (ex) {
    notify.error(t('rules.error', { message: ex.message }));
  }
});

function updateRuleFormUI() {
  const title = $('#rule-form-title');
  const submit = $('#rule-submit-btn');
  if (title) title.textContent = editingRuleId ? t('rules.editRule') : t('rules.newRule');
  if (submit) submit.textContent = editingRuleId ? t('rules.updateRule') : t('rules.addRule');
  $('#rule-delete-btn')?.classList.toggle('hidden', !editingRuleId);
}

function resetRuleForm() {
  editingRuleId = null;
  $('#rule-id').value = '';
  $('#rule-type').value = 'ADD_GUEST';
  $('#rule-mode').value = 'MANUAL';
  $('#rule-listing').value = '';
  $('#rule-priority').value = 0;
  updateRuleFormUI();
  highlightSelectedRule(null);
}

function loadRuleIntoForm(rule) {
  editingRuleId = rule.id;
  $('#rule-id').value = rule.id;
  $('#rule-type').value = rule.requestType;
  $('#rule-mode').value = rule.mode;
  $('#rule-listing').value = rule.listingId || '';
  $('#rule-priority').value = rule.priority;
  updateRuleFormUI();
  highlightSelectedRule(rule.id);
}

function populateListingSelect() {
  const sel = $('#rule-listing');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = `<option value="">${t('rules.global')}</option>` +
    cachedListings.map((l) => `<option value="${l.id}">${esc(l.name)}</option>`).join('');
  sel.value = current;
}

function highlightSelectedRule(ruleId) {
  $$('#rules-table tbody tr').forEach((row) => {
    row.classList.toggle('selected', ruleId && row.dataset.ruleId === ruleId);
  });
}

function bindRuleRowClicks() {
  $$('#rules-table tbody tr[data-rule-id]').forEach((row) => {
    row.addEventListener('click', () => {
      const rule = cachedRules.find((r) => r.id === row.dataset.ruleId);
      if (rule) loadRuleIntoForm(rule);
    });
  });
}

async function loadDashboard() {
  const [status, webhooks] = await Promise.all([
    api('/sync/status'),
    api('/sync/webhook-activity'),
  ]);
  const last = status.last;
  const settings = status.settings;
  $('#stats').innerHTML = `
    <div class="stat-card"><div class="value">${status.listingCount}</div><div class="label">${t('dashboard.listings')}</div></div>
    <div class="stat-card"><div class="value">${status.reservationCount}</div><div class="label">${t('dashboard.reservations')}</div></div>
    <div class="stat-card"><div class="value">${last?.status || '–'}</div><div class="label">${t('dashboard.lastSync')}</div></div>
    <div class="stat-card"><div class="value">${last?.finishedAt ? new Date(last.finishedAt).toLocaleString(locale()) : '–'}</div><div class="label">${t('dashboard.syncTime')}</div></div>
  `;
  $('#auto-sync-enabled').checked = settings?.autoSyncEnabled ?? true;
  $('#auto-sync-interval').value = settings?.intervalMinutes ?? 30;
  $('#auto-sync-hint').textContent = settings?.autoSyncEnabled
    ? t('dashboard.autoSyncNext', { minutes: settings.intervalMinutes })
    : t('dashboard.autoSyncOff');
  const whRows = webhooks.map((w) => {
    const meta = w.metadata || {};
    const result = w.status === 'completed'
      ? `${meta.listings ?? 0} ${t('dashboard.listings')}, ${meta.reservations ?? 0} ${t('dashboard.reservations')}`
      : w.error || w.status;
    return `<tr>
      <td>${new Date(w.startedAt).toLocaleString(locale())}</td>
      <td>${esc(w.jobType.replace('webhook:', ''))}</td>
      <td>${esc(String(result))}</td>
    </tr>`;
  }).join('');
  $('#webhook-activity').innerHTML = `
    <table><thead><tr>
      <th>${t('dashboard.webhookCol.time')}</th>
      <th>${t('dashboard.webhookCol.event')}</th>
      <th>${t('dashboard.webhookCol.result')}</th>
    </tr></thead>
    <tbody>${whRows || `<tr><td colspan="3">${t('dashboard.webhookEmpty')}</td></tr>`}</tbody></table>`;
}

async function loadListings() {
  const data = await api(`/listings?page=${pageState.listings}&pageSize=25`);
  const rows = data.items.map((l) => `
    <tr>
      <td>${l.hostawayId}</td>
      <td>${esc(l.name)}</td>
      <td>${esc(l.city || '–')}</td>
      <td>${esc(l.listingGroup?.name || '–')}</td>
      <td>${l.personCapacity}</td>
      <td><span class="badge live">${l.status}</span></td>
      <td>${l.isBookable ? t('common.yes') : t('common.no')}</td>
    </tr>
  `).join('');
  $('#listings-table').innerHTML = `
    <table><thead><tr>
      <th>${t('listings.id')}</th><th>${t('listings.name')}</th><th>${t('listings.city')}</th>
      <th>${t('listings.group')}</th><th>${t('listings.guests')}</th><th>${t('listings.status')}</th><th>${t('listings.bookable')}</th>
    </tr></thead><tbody>${rows || `<tr><td colspan="7">–</td></tr>`}</tbody></table>`;
  renderPagination('#listings-pagination', data, 'listings', loadListings);
}

async function loadGroups() {
  const data = await api(`/listing-groups?page=${pageState.groups}&pageSize=25`);
  const rows = data.items.map((g) => `
    <tr>
      <td>${g.hostawayParentId}</td>
      <td>${esc(g.name)}</td>
      <td>${esc(g.city || '–')}</td>
      <td>${g.availabilityMode}</td>
      <td>${g.listings?.length ?? 0}</td>
      <td>${(g.listings || []).map((l) => esc(l.name)).join(', ') || '–'}</td>
    </tr>
  `).join('');
  $('#listing-groups-table').innerHTML = `
    <table><thead><tr>
      <th>ID</th><th>${t('listings.name')}</th><th>${t('listings.city')}</th>
      <th>Mode</th><th>#</th><th>${t('listings.title')}</th>
    </tr></thead><tbody>${rows || `<tr><td colspan="6">–</td></tr>`}</tbody></table>`;
  renderPagination('#groups-pagination', data, 'groups', loadGroups);
}

async function loadReservations() {
  const data = await api(`/reservations?page=${pageState.reservations}&pageSize=25`);
  const rows = data.items.map((r) => `
    <tr>
      <td>${r.hostawayId}</td>
      <td>${esc(r.guestName || r.guestNameMasked || '–')}</td>
      <td>${esc(r.guestPhone || '–')}</td>
      <td>${esc(r.guestEmail || '–')}</td>
      <td>${esc(r.listing?.name || '–')}</td>
      <td>${esc(r.listing?.listingGroup?.name || '–')}</td>
      <td>${r.arrivalDate?.slice(0, 10)}</td>
      <td>${r.departureDate?.slice(0, 10)}</td>
      <td>${r.status}</td>
    </tr>
  `).join('');
  $('#reservations-table').innerHTML = `
    <table><thead><tr>
      <th>ID</th><th>${t('listings.guest')}</th><th>${t('listings.phone')}</th><th>${t('listings.email')}</th>
      <th>${t('listings.name')}</th><th>${t('listings.group')}</th>
      <th>${t('listings.arrival')}</th><th>${t('listings.departure')}</th><th>${t('listings.status')}</th>
    </tr></thead><tbody>${rows || `<tr><td colspan="9">–</td></tr>`}</tbody></table>`;
  renderPagination('#reservations-pagination', data, 'reservations', loadReservations);
}

async function loadConversations() {
  const data = await api(`/reservations?page=${pageState.conversations}&pageSize=25`);
  const rows = data.items.map((r) => `
    <tr>
      <td>${r.hostawayId}</td>
      <td>${esc(r.guestName || '–')}</td>
      <td>${esc(r.listing?.name || '–')}</td>
      <td>${r.hostawayConversationId ?? '–'}</td>
      <td>${r.lastSyncedAt ? new Date(r.lastSyncedAt).toLocaleString(locale()) : '–'}</td>
      <td>
        <button type="button" class="btn ghost btn-sm" data-view-conv="${r.hostawayId}">${t('conversations.view')}</button>
        <button type="button" class="btn ghost btn-sm" data-refresh-conv="${r.hostawayId}">${t('conversations.refresh')}</button>
      </td>
    </tr>
  `).join('');
  $('#conversations-table').innerHTML = `
    <table><thead><tr>
      <th>ID</th><th>${t('listings.guest')}</th><th>${t('listings.name')}</th>
      <th>${t('listings.conversation')}</th><th>${t('conversations.synced')}</th><th></th>
    </tr></thead><tbody>${rows || `<tr><td colspan="6">–</td></tr>`}</tbody></table>`;
  renderPagination('#conversations-pagination', data, 'conversations', loadConversations);
  bindConversationButtons();
}

function bindConversationButtons() {
  $$('[data-view-conv]').forEach((btn) => {
    btn.addEventListener('click', () => openConversationModal(btn.dataset.viewConv));
  });
  $$('[data-refresh-conv]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const result = await api(`/reservations/${btn.dataset.refreshConv}/refresh-conversation`, { method: 'POST' });
        notify.success(t('conversations.refreshed', { id: result.hostawayConversationId || '–' }));
        loadConversations();
      } catch (ex) {
        notify.error(ex.message);
      }
    });
  });
}

async function openConversationModal(hostawayId) {
  const modal = $('#conversation-modal');
  const body = $('#conversation-modal-body');
  $('#conversation-modal-title').textContent = `${t('nav.conversations')} #${hostawayId}`;
  body.innerHTML = `<p>${t('dashboard.syncRunning')}</p>`;
  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');
  try {
    const result = await api(`/reservations/${hostawayId}/conversation`);
    if (!result.hostawayConversationId) {
      body.innerHTML = `<p class="field-hint">${t('conversations.none')}</p>`;
      return;
    }
    const msgs = (result.messages || []).map((m) => `
      <div class="conversation-msg">
        <div class="meta">${m.communicationType || 'channel'} · ${m.insertedOn || ''}</div>
        <div>${esc(m.body || '')}</div>
      </div>
    `).join('');
    body.innerHTML = `<p><strong>${t('listings.conversation')}:</strong> ${result.hostawayConversationId}</p>${msgs || `<p>${t('conversations.noMessages')}</p>`}`;
  } catch (ex) {
    body.innerHTML = `<p class="error">${esc(ex.message)}</p>`;
  }
}

$('#conversation-modal-close').addEventListener('click', () => {
  $('#conversation-modal').classList.add('hidden');
  document.body.classList.remove('modal-open');
});
$('#conversation-modal').addEventListener('click', (e) => {
  if (e.target.id === 'conversation-modal') {
    $('#conversation-modal').classList.add('hidden');
    document.body.classList.remove('modal-open');
  }
});

async function loadRules() {
  const [rules, config, listingsData] = await Promise.all([
    api('/rules'),
    api('/verification-config'),
    api('/listings?pageSize=100'),
  ]);
  cachedRules = rules;
  cachedListings = listingsData.items || listingsData;
  populateListingSelect();

  const rows = rules.map((r) => `
    <tr data-rule-id="${r.id}">
      <td>${t(`requestType.${r.requestType}`) || r.requestType}</td>
      <td><span class="badge ${r.mode === 'AUTO' ? 'auto' : r.mode === 'DENY' ? 'manual' : 'manual'}">${t(`mode.${r.mode}`) || r.mode}</span></td>
      <td>${r.listing?.name || t('rules.global')}</td>
      <td>${r.priority}</td>
      <td>${r.isActive ? t('rules.active') : t('rules.inactive')}</td>
    </tr>
  `).join('');
  $('#rules-table').innerHTML = `
    <table><thead><tr>
      <th>${t('rules.col.type')}</th><th>${t('rules.col.mode')}</th><th>${t('rules.col.listing')}</th>
      <th>${t('rules.col.priority')}</th><th>${t('rules.col.status')}</th>
    </tr></thead><tbody>${rows || `<tr><td colspan="5">${t('rules.none')}</td></tr>`}</tbody></table>`;
  $('#verification-config').innerHTML = config ? `
    <h3>${t('rules.verification')}</h3>
    <p>${t('rules.requiredFields')} <code>${(config.requiredFields || []).join(', ')}</code></p>
    <p>${t('rules.minMatches')} <strong>${config.minMatchCount}</strong></p>
  ` : `<p>${t('rules.noConfig')}</p>`;
  if (editingRuleId) {
    const current = rules.find((r) => r.id === editingRuleId);
    if (current) loadRuleIntoForm(current);
    else resetRuleForm();
  } else {
    updateRuleFormUI();
  }
  bindRuleRowClicks();
}

async function loadRequests() {
  const requests = await api('/guest-requests');
  const rows = requests.map((r) => `
    <tr>
      <td>${new Date(r.createdAt).toLocaleString(locale())}</td>
      <td>${t(`requestType.${r.requestType}`) || r.requestType}</td>
      <td><span class="badge manual">${r.status}</span></td>
      <td>${r.reservation?.listing?.name || '–'}</td>
      <td>${r.forwardedToHostaway ? t('common.yes') : t('common.no')}</td>
    </tr>
  `).join('');
  $('#requests-table').innerHTML = `
    <table><thead><tr>
      <th>${t('requests.time')}</th><th>${t('requests.type')}</th><th>${t('requests.status')}</th>
      <th>${t('requests.listing')}</th><th>${t('requests.hostaway')}</th>
    </tr></thead>
    <tbody>${rows || `<tr><td colspan="5">${t('requests.none')}</td></tr>`}</tbody></table>`;
}

async function loadLogs() {
  const logs = await api('/logs');
  const rows = logs.map((l) => `
    <tr>
      <td>${new Date(l.createdAt).toLocaleString(locale())}</td>
      <td>${l.source}</td>
      <td>${l.action}</td>
      <td>${l.statusCode || '–'}</td>
    </tr>
  `).join('');
  $('#logs-table').innerHTML = `
    <table><thead><tr>
      <th>${t('logs.time')}</th><th>${t('logs.source')}</th><th>${t('logs.action')}</th><th>${t('logs.status')}</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
}

async function loadFonio() {
  const data = await api('/fonio-setup');
  const renderUrls = (title, urls) => {
    const rows = Object.entries(urls).map(([key, url]) => `
      <div class="url-row">
        <div><strong>${key}</strong><br><code>${esc(url)}</code></div>
        <div class="copy-wrap">
          <span class="copy-toast">${t('common.copied')}</span>
          <button type="button" class="btn copy" data-copy="${esc(url)}">${t('common.copy')}</button>
        </div>
      </div>
    `).join('');
    return `<h3>${title}</h3>${rows}`;
  };
  $('#fonio-setup').innerHTML = `
    ${renderUrls(t('fonio.production'), data.production)}
    <hr style="border-color:var(--border);margin:1rem 0">
    ${renderUrls(t('fonio.local'), data.local)}
    <p style="margin-top:1rem;color:var(--muted);font-size:0.85rem">
      ${t('fonio.headerNote')} <code>x-api-key: &lt;FONIO_API_KEY&gt;</code>
    </p>
  `;
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-copy]');
  if (!btn) return;
  navigator.clipboard.writeText(btn.dataset.copy);
  const toast = btn.parentElement?.querySelector('.copy-toast');
  if (!toast) return;
  toast.textContent = t('common.copied');
  toast.classList.add('show');
  clearTimeout(btn._copyTimer);
  btn._copyTimer = setTimeout(() => toast.classList.remove('show'), 2000);
});

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

if (token) {
  showApp();
}
