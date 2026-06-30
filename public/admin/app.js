const API = '/api/v1/admin';
const AUTH = '/api/v1/admin/auth';

let token = localStorage.getItem('adminToken') || '';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...options, headers });
  if (res.status === 401) {
    logout();
    throw new Error('Session expired');
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
  loadDashboard();
}

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
    err.textContent = ex.message || 'Login fehlgeschlagen';
    err.classList.remove('hidden');
  }
});

$('#logout-btn').addEventListener('click', logout);

$$('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('.nav-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    $$('.tab').forEach((t) => t.classList.add('hidden'));
    $(`#tab-${btn.dataset.tab}`).classList.remove('hidden');
    const loaders = {
      dashboard: loadDashboard,
      listings: loadListings,
      rules: loadRules,
      requests: loadRequests,
      logs: loadLogs,
      fonio: loadFonio,
    };
    loaders[btn.dataset.tab]?.();
  });
});

$('#sync-btn').addEventListener('click', async () => {
  const el = $('#sync-result');
  el.innerHTML = '<p>Sync läuft… (kann 1–2 Min. dauern)</p>';
  $('#sync-btn').disabled = true;
  try {
    const data = await api('/sync', { method: 'POST' });
    el.innerHTML = `<p class="success">✓ Sync abgeschlossen: ${data.listings} Unterkünfte, ${data.reservations} Reservierungen</p>`;
    loadDashboard();
  } catch (ex) {
    el.innerHTML = `<p class="error">Fehler: ${ex.message}</p>`;
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
    loadRules();
    alert('Regel gespeichert');
  } catch (ex) {
    alert('Fehler: ' + ex.message);
  }
});

async function loadDashboard() {
  const status = await api('/sync/status');
  const last = status.last;
  $('#stats').innerHTML = `
    <div class="stat-card"><div class="value">${status.listingCount}</div><div class="label">Unterkünfte</div></div>
    <div class="stat-card"><div class="value">${status.reservationCount}</div><div class="label">Reservierungen</div></div>
    <div class="stat-card"><div class="value">${last?.status || '–'}</div><div class="label">Letzter Sync</div></div>
    <div class="stat-card"><div class="value">${last?.finishedAt ? new Date(last.finishedAt).toLocaleString('de-DE') : '–'}</div><div class="label">Sync-Zeitpunkt</div></div>
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
      <td>${l.isBookable ? 'Ja' : 'Nein'}</td>
    </tr>
  `).join('');
  $('#listings-table').innerHTML = `
    <table><thead><tr><th>ID</th><th>Name</th><th>Stadt</th><th>Gäste</th><th>Status</th><th>Buchbar</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

async function loadRules() {
  const [rules, config] = await Promise.all([
    api('/rules'),
    api('/verification-config'),
  ]);
  const rows = rules.map((r) => `
    <tr>
      <td>${r.requestType}</td>
      <td><span class="badge ${r.mode === 'AUTO' ? 'auto' : 'manual'}">${r.mode}</span></td>
      <td>${r.listing?.name || 'Global'}</td>
      <td>${r.priority}</td>
      <td>${r.isActive ? 'Aktiv' : 'Inaktiv'}</td>
    </tr>
  `).join('');
  $('#rules-table').innerHTML = `
    <table><thead><tr><th>Typ</th><th>Modus</th><th>Unterkunft</th><th>Prio</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
  $('#verification-config').innerHTML = config ? `
    <h3>Verifizierung</h3>
    <p>Pflichtfelder: <code>${(config.requiredFields || []).join(', ')}</code></p>
    <p>Min. Treffer: <strong>${config.minMatchCount}</strong></p>
  ` : '<p>Keine Verifizierungskonfiguration</p>';
}

async function loadRequests() {
  const requests = await api('/guest-requests');
  const rows = requests.map((r) => `
    <tr>
      <td>${new Date(r.createdAt).toLocaleString('de-DE')}</td>
      <td>${r.requestType}</td>
      <td><span class="badge manual">${r.status}</span></td>
      <td>${r.reservation?.listing?.name || '–'}</td>
      <td>${r.forwardedToHostaway ? 'Ja' : 'Nein'}</td>
    </tr>
  `).join('');
  $('#requests-table').innerHTML = `
    <table><thead><tr><th>Zeit</th><th>Typ</th><th>Status</th><th>Unterkunft</th><th>→ Hostaway</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5">Keine Anfragen</td></tr>'}</tbody></table>`;
}

async function loadLogs() {
  const logs = await api('/logs');
  const rows = logs.map((l) => `
    <tr>
      <td>${new Date(l.createdAt).toLocaleString('de-DE')}</td>
      <td>${l.source}</td>
      <td>${l.action}</td>
      <td>${l.statusCode || '–'}</td>
    </tr>
  `).join('');
  $('#logs-table').innerHTML = `
    <table><thead><tr><th>Zeit</th><th>Quelle</th><th>Aktion</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

async function loadFonio() {
  const data = await api('/fonio-setup');
  const renderUrls = (title, urls) => {
    const rows = Object.entries(urls).map(([key, url]) => `
      <div class="url-row">
        <div><strong>${key}</strong><br><code>${esc(url)}</code></div>
        <button type="button" class="btn copy" data-copy="${esc(url)}">Kopieren</button>
      </div>
    `).join('');
    return `<h3>${title}</h3>${rows}`;
  };
  $('#fonio-setup').innerHTML = `
    ${renderUrls('Produktion (fonio eintragen)', data.production)}
    <hr style="border-color:var(--border);margin:1rem 0">
    ${renderUrls('Lokal / Entwicklung', data.local)}
    <p style="margin-top:1rem;color:var(--muted);font-size:0.85rem">
      Header für alle fonio-Anfragen: <code>x-api-key: &lt;FONIO_API_KEY&gt;</code>
    </p>
  `;
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-copy]');
  if (btn) navigator.clipboard.writeText(btn.dataset.copy);
});

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

if (token) {
  showApp();
}
