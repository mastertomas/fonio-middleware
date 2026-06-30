const I18N = {
  en: {
    'app.title': 'brainions Vermietung',
    'login.subtitle': 'Middleware Admin',
    'login.email': 'Email',
    'login.password': 'Password',
    'login.submit': 'Sign in',
    'login.failed': 'Login failed',
    'lang.label': 'Language',
    'nav.dashboard': 'Dashboard',
    'nav.listings': 'Listings',
    'nav.rules': 'Rules',
    'nav.requests': 'Guest requests',
    'nav.logs': 'Audit log',
    'nav.fonio': 'fonio Setup',
    'nav.logout': 'Sign out',
    'dashboard.syncBtn': 'Hostaway Sync',
    'dashboard.listings': 'Listings',
    'dashboard.reservations': 'Reservations',
    'dashboard.lastSync': 'Last sync',
    'dashboard.syncTime': 'Sync time',
    'dashboard.syncRunning': 'Sync in progress… (may take 1–2 min)',
    'dashboard.syncDone': 'Sync complete: {listings} listings, {reservations} reservations',
    'dashboard.syncError': 'Error: {message}',
    'listings.title': 'Listings',
    'listings.id': 'ID',
    'listings.name': 'Name',
    'listings.city': 'City',
    'listings.guests': 'Guests',
    'listings.status': 'Status',
    'listings.bookable': 'Bookable',
    'rules.title': 'Approval rules',
    'rules.newRule': 'New rule',
    'rules.editRule': 'Edit rule',
    'rules.newRuleBtn': '+ New rule',
    'rules.type': 'Type',
    'rules.mode': 'Mode',
    'rules.listing': 'Listing',
    'rules.priority': 'Priority',
    'rules.priorityHint': 'Higher number wins when several rules apply (e.g. listing-specific vs global).',
    'rules.addRule': 'Add rule',
    'rules.updateRule': 'Update rule',
    'rules.delete': 'Delete',
    'rules.created': 'Rule added',
    'rules.updated': 'Rule updated',
    'rules.deleted': 'Rule deleted',
    'rules.deleteConfirm': 'Delete this rule?',
    'rules.none': 'No rules yet',
    'rules.error': 'Error: {message}',
    'rules.global': 'Global',
    'rules.active': 'Active',
    'rules.inactive': 'Inactive',
    'rules.verification': 'Verification',
    'rules.requiredFields': 'Required fields:',
    'rules.minMatches': 'Min. matches:',
    'rules.noConfig': 'No verification configuration',
    'rules.col.type': 'Type',
    'rules.col.mode': 'Mode',
    'rules.col.listing': 'Listing',
    'rules.col.priority': 'Prio',
    'rules.col.status': 'Status',
    'requestType.ADD_GUEST': 'Additional guest',
    'requestType.ADD_PET': 'Pet',
    'requestType.CANCELLATION': 'Cancellation',
    'requestType.MODIFICATION': 'Modification',
    'requestType.EARLY_CHECKIN': 'Early check-in',
    'requestType.LATE_CHECKOUT': 'Late check-out',
    'requestType.RESERVATION_QUESTION': 'Booking question',
    'mode.AUTO': 'Automatic',
    'mode.MANUAL': 'Manual',
    'mode.DENY': 'Deny',
    'requests.title': 'Guest requests',
    'requests.time': 'Time',
    'requests.type': 'Type',
    'requests.status': 'Status',
    'requests.listing': 'Listing',
    'requests.hostaway': '→ Hostaway',
    'requests.none': 'No requests',
    'logs.title': 'API audit log',
    'logs.time': 'Time',
    'logs.source': 'Source',
    'logs.action': 'Action',
    'logs.status': 'Status',
    'fonio.title': 'fonio.ai integration',
    'fonio.production': 'Production (configure in fonio)',
    'fonio.local': 'Local / development',
    'fonio.headerNote': 'Header for all fonio requests:',
    'fonio.promptTemplates': 'Prompt templates (in project)',
    'fonio.doc.start': '→ fonio greeting',
    'fonio.doc.system': '→ fonio system prompt',
    'fonio.doc.tools': '→ API tool reference',
    'fonio.doc.setup': '→ Detailed setup guide',
    'common.yes': 'Yes',
    'common.no': 'No',
    'common.copy': 'Copy',
    'common.copied': 'Copied',
    'common.confirm': 'Confirm',
    'common.cancel': 'Cancel',
    'notify.confirmTitle': 'Please confirm',
    'rules.deleteTitle': 'Delete rule',
    'session.expired': 'Session expired',
  },
  de: {
    'app.title': 'brainions Vermietung',
    'login.subtitle': 'Middleware Admin',
    'login.email': 'E-Mail',
    'login.password': 'Passwort',
    'login.submit': 'Anmelden',
    'login.failed': 'Login fehlgeschlagen',
    'lang.label': 'Sprache',
    'nav.dashboard': 'Dashboard',
    'nav.listings': 'Unterkünfte',
    'nav.rules': 'Regeln',
    'nav.requests': 'Gästeanfragen',
    'nav.logs': 'Protokoll',
    'nav.fonio': 'fonio Setup',
    'nav.logout': 'Abmelden',
    'dashboard.syncBtn': 'Hostaway Sync',
    'dashboard.listings': 'Unterkünfte',
    'dashboard.reservations': 'Reservierungen',
    'dashboard.lastSync': 'Letzter Sync',
    'dashboard.syncTime': 'Sync-Zeitpunkt',
    'dashboard.syncRunning': 'Sync läuft… (kann 1–2 Min. dauern)',
    'dashboard.syncDone': 'Sync abgeschlossen: {listings} Unterkünfte, {reservations} Reservierungen',
    'dashboard.syncError': 'Fehler: {message}',
    'listings.title': 'Unterkünfte',
    'listings.id': 'ID',
    'listings.name': 'Name',
    'listings.city': 'Stadt',
    'listings.guests': 'Gäste',
    'listings.status': 'Status',
    'listings.bookable': 'Buchbar',
    'rules.title': 'Freigabe-Regeln',
    'rules.newRule': 'Neue Regel',
    'rules.editRule': 'Regel bearbeiten',
    'rules.newRuleBtn': '+ Neue Regel',
    'rules.type': 'Typ',
    'rules.mode': 'Modus',
    'rules.listing': 'Unterkunft',
    'rules.priority': 'Priorität',
    'rules.priorityHint': 'Höhere Zahl gewinnt, wenn mehrere Regeln greifen (z. B. unterkunftsspezifisch vs. global).',
    'rules.addRule': 'Regel hinzufügen',
    'rules.updateRule': 'Regel aktualisieren',
    'rules.delete': 'Löschen',
    'rules.created': 'Regel hinzugefügt',
    'rules.updated': 'Regel aktualisiert',
    'rules.deleted': 'Regel gelöscht',
    'rules.deleteConfirm': 'Diese Regel löschen?',
    'rules.none': 'Noch keine Regeln',
    'rules.error': 'Fehler: {message}',
    'rules.global': 'Global',
    'rules.active': 'Aktiv',
    'rules.inactive': 'Inaktiv',
    'rules.verification': 'Verifizierung',
    'rules.requiredFields': 'Pflichtfelder:',
    'rules.minMatches': 'Min. Treffer:',
    'rules.noConfig': 'Keine Verifizierungskonfiguration',
    'rules.col.type': 'Typ',
    'rules.col.mode': 'Modus',
    'rules.col.listing': 'Unterkunft',
    'rules.col.priority': 'Prio',
    'rules.col.status': 'Status',
    'requestType.ADD_GUEST': 'Zusätzlicher Gast',
    'requestType.ADD_PET': 'Haustier',
    'requestType.CANCELLATION': 'Storno',
    'requestType.MODIFICATION': 'Änderung',
    'requestType.EARLY_CHECKIN': 'Früher Check-in',
    'requestType.LATE_CHECKOUT': 'Später Check-out',
    'requestType.RESERVATION_QUESTION': 'Buchungsfrage',
    'mode.AUTO': 'Automatisch',
    'mode.MANUAL': 'Manuell',
    'mode.DENY': 'Ablehnen',
    'requests.title': 'Gästeanfragen',
    'requests.time': 'Zeit',
    'requests.type': 'Typ',
    'requests.status': 'Status',
    'requests.listing': 'Unterkunft',
    'requests.hostaway': '→ Hostaway',
    'requests.none': 'Keine Anfragen',
    'logs.title': 'API-Protokoll',
    'logs.time': 'Zeit',
    'logs.source': 'Quelle',
    'logs.action': 'Aktion',
    'logs.status': 'Status',
    'fonio.title': 'fonio.ai Integration',
    'fonio.production': 'Produktion (fonio eintragen)',
    'fonio.local': 'Lokal / Entwicklung',
    'fonio.headerNote': 'Header für alle fonio-Anfragen:',
    'fonio.promptTemplates': 'Prompt-Vorlagen (im Projekt)',
    'fonio.doc.start': '→ fonio Startnachricht',
    'fonio.doc.system': '→ fonio System-Prompt',
    'fonio.doc.tools': '→ API-Tool Referenz',
    'fonio.doc.setup': '→ Ausführliche Anleitung',
    'common.yes': 'Ja',
    'common.no': 'Nein',
    'common.copy': 'Kopieren',
    'common.copied': 'Kopiert',
    'common.confirm': 'Bestätigen',
    'common.cancel': 'Abbrechen',
    'notify.confirmTitle': 'Bitte bestätigen',
    'rules.deleteTitle': 'Regel löschen',
    'session.expired': 'Sitzung abgelaufen',
  },
};

const LANG_KEY = 'adminLang';
const DEFAULT_LANG = 'en';

function getLang() {
  const stored = localStorage.getItem(LANG_KEY);
  return stored && I18N[stored] ? stored : DEFAULT_LANG;
}

function setLang(lang) {
  if (!I18N[lang]) return;
  localStorage.setItem(LANG_KEY, lang);
  document.documentElement.lang = lang;
  applyI18n();
  document.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
}

function t(key, vars = {}) {
  const dict = I18N[getLang()] || I18N[DEFAULT_LANG];
  let text = dict[key] ?? I18N[DEFAULT_LANG][key] ?? key;
  for (const [k, v] of Object.entries(vars)) {
    text = text.replace(`{${k}}`, String(v));
  }
  return text;
}

function locale() {
  return getLang() === 'de' ? 'de-DE' : 'en-GB';
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll('[data-i18n-hint]').forEach((el) => {
    el.textContent = t(el.dataset.i18nHint);
  });
  document.querySelectorAll('.lang-select').forEach((sel) => {
    sel.value = getLang();
  });
  document.title = `${t('app.title')} – Admin`;
}

applyI18n();
