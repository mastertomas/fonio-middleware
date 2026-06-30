const API = '/api/v1/admin';
const AUTH = '/api/v1/admin/auth';

let token = localStorage.getItem('adminToken') || '';
let activeTab = 'dashboard';
let cachedRules = [];

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
  const loaders = {
    dashboard: loadDashboard,
    listings: loadListings,
    rules: loadRules,
    requests: loadRequests,
    logs: loadLogs,
    fonio: loadFonio,
  };
  updateRuleSelects();
  loaders[activeTab]?.();
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

$('#sync-btn').addEventListener('click', async () => {
  const el = $('#sync-result');
  el.innerHTML = `<p>${t('dashboard.syncRunning')}</p>`;
  $('#sync-btn').disabled = true;
  try {
    const data = await api('/sync', { method: 'POST' });
    el.innerHTML = `<p class="success">✓ ${t('dashboard.syncDone', { listings: data.listings, reservations: data.reservations })}</p>`;
    loadDashboard();
  } catch (ex) {
    el.innerHTML = `<p class="error">${t('dashboard.syncError', { message: ex.message })}</p>`;
  } finally {
    $('#sync-btn').disabled = false;
  }
});

$('#rule-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/rules', {
      method: 'POST',
      body: JSON.stringify({
        requestType: $('#rule-type').value,
        mode: $('#rule-mode').value,
        priority: Number($('#rule-priority').value),
        isActive: true,
      }),
    });
    await loadRules();
    alert(t('rules.saved'));
  } catch (ex) {
    alert(t('rules.error', { message: ex.message }));
  }
});

$('#rule-type').addEventListener('change', syncRuleFormFromType);

function syncRuleFormFromType() {
  const type = $('#rule-type').value;
  const global = cachedRules
    .filter((r) => !r.listingId && r.requestType === type)
    .sort((a, b) => b.priority - a.priority || new Date(a.createdAt) - new Date(b.createdAt))[0];
  if (global) {
    $('#rule-mode').value = global.mode;
    $('#rule-priority').value = global.priority;
  } else {
    $('#rule-priority').value = 0;
  }
  highlightSelectedRule(type);
}

function highlightSelectedRule(requestType) {
  $$('#rules-table tbody tr').forEach((row) => {
    row.classList.toggle('selected', row.dataset.requestType === requestType);
  });
}

function bindRuleRowClicks() {
  $$('#rules-table tbody tr[data-request-type]').forEach((row) => {
    row.addEventListener('click', () => {
      $('#rule-type').value = row.dataset.requestType;
      syncRuleFormFromType();
    });
  });
}

async function loadDashboard() {
  const status = await api('/sync/status');
  const last = status.last;
  $('#stats').innerHTML = `
    <div class="stat-card"><div class="value">${status.listingCount}</div><div class="label">${t('dashboard.listings')}</div></div>
    <div class="stat-card"><div class="value">${status.reservationCount}</div><div class="label">${t('dashboard.reservations')}</div></div>
    <div class="stat-card"><div class="value">${last?.status || '–'}</div><div class="label">${t('dashboard.lastSync')}</div></div>
    <div class="stat-card"><div class="value">${last?.finishedAt ? new Date(last.finishedAt).toLocaleString(locale()) : '–'}</div><div class="label">${t('dashboard.syncTime')}</div></div>
  `;
}

async function loadListings() {
  const listings = await api('/listings');
  const rows = listings.map((l) => `
    <tr>
      <td>${l.hostawayId}</td>
      <td>${esc(l.name)}</td>
      <td>${esc(l.city || '–')}</td>
      <td>${l.personCapacity}</td>
      <td><span class="badge live">${l.status}</span></td>
      <td>${l.isBookable ? t('common.yes') : t('common.no')}</td>
    </tr>
  `).join('');
  $('#listings-table').innerHTML = `
    <table><thead><tr>
      <th>${t('listings.id')}</th><th>${t('listings.name')}</th><th>${t('listings.city')}</th>
      <th>${t('listings.guests')}</th><th>${t('listings.status')}</th><th>${t('listings.bookable')}</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
}

async function loadRules() {
  const [rules, config] = await Promise.all([
    api('/rules'),
    api('/verification-config'),
  ]);
  cachedRules = rules;

  const globalByType = new Map();
  for (const r of rules.filter((rule) => !rule.listingId)) {
    const prev = globalByType.get(r.requestType);
    if (!prev || r.priority > prev.priority) {
      globalByType.set(r.requestType, r);
    }
  }
  const displayRules = [
    ...globalByType.values(),
    ...rules.filter((r) => r.listingId),
  ].sort((a, b) => {
    const typeOrder = a.requestType.localeCompare(b.requestType);
    if (typeOrder !== 0) return typeOrder;
    return b.priority - a.priority;
  });

  const rows = displayRules.map((r) => `
    <tr data-request-type="${r.requestType}" data-listing-id="${r.listingId || ''}">
      <td>${t(`requestType.${r.requestType}`) || r.requestType}</td>
      <td><span class="badge ${r.mode === 'AUTO' ? 'auto' : 'manual'}">${t(`mode.${r.mode}`) || r.mode}</span></td>
      <td>${r.listing?.name || t('rules.global')}</td>
      <td>${r.priority}</td>
      <td>${r.isActive ? t('rules.active') : t('rules.inactive')}</td>
    </tr>
  `).join('');
  $('#rules-table').innerHTML = `
    <table><thead><tr>
      <th>${t('rules.col.type')}</th><th>${t('rules.col.mode')}</th><th>${t('rules.col.listing')}</th>
      <th>${t('rules.col.priority')}</th><th>${t('rules.col.status')}</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
  $('#verification-config').innerHTML = config ? `
    <h3>${t('rules.verification')}</h3>
    <p>${t('rules.requiredFields')} <code>${(config.requiredFields || []).join(', ')}</code></p>
    <p>${t('rules.minMatches')} <strong>${config.minMatchCount}</strong></p>
  ` : `<p>${t('rules.noConfig')}</p>`;
  syncRuleFormFromType();
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
