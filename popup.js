// popup.js - SERP Tracker Pro
const exportBtn      = document.getElementById('exportBtn');
const checkBtn       = document.getElementById('checkBtn');
const domainInput    = document.getElementById('domainInput');
const progressArea   = document.getElementById('progressArea');
const progressBar    = document.getElementById('progressBar');
const statusText     = document.getElementById('statusText');
const progressPercent= document.getElementById('progressPercent');
const spinner        = document.getElementById('spinner');
const output         = document.getElementById('output');
const dropdown       = document.getElementById('domainDropdown');

// License UI
const freeView       = document.getElementById('freeView');
const proView        = document.getElementById('proView');
const licenseInput   = document.getElementById('licenseInput');
const licenseForm    = document.getElementById('licenseForm');
const showLicenseBtn = document.getElementById('showLicenseBtn');
const activateBtn    = document.getElementById('activateBtn');
const activateStatus = document.getElementById('activateStatus');
const deactivateBtn  = document.getElementById('deactivateBtn');
const licenseDisplay = document.getElementById('licenseDisplay');

let running = false;

// ── LICENSE ───────────────────────────────────────────────────────────
const VARIANT_ID  = '1628778';
const LICENSE_KEY = 'serp_license_key';
const LICENSE_INS = 'serp_license_instance';
const IS_PRO      = 'serp_is_pro';

function isPro() {
  return localStorage.getItem(IS_PRO) === 'true';
}

const PRODUCT_SECRET = 'prod_sk_VvA5J_e8b7f500d75b1ce72d8620c27526366f61ce2ffb';

async function activateLicense(key) {
  try {
    const res = await chrome.runtime.sendMessage({ action: 'verifyLicense', key });
    if (res.ok) {
      localStorage.setItem(LICENSE_KEY, key);
      localStorage.setItem(IS_PRO, 'true');
      return { ok: true };
    }
    return { ok: false, error: res.error || 'Invalid or disabled license key.' };
  } catch (e) {
    return { ok: false, error: 'Connection error. Please try again.' };
  }
}

async function deactivateLicense() {
  const key = localStorage.getItem(LICENSE_KEY);
  if (key) {
    try {
      await chrome.runtime.sendMessage({ action: 'deactivateLicense', key });
    } catch (e) {}
  }
  localStorage.removeItem(LICENSE_KEY);
  localStorage.removeItem(LICENSE_INS);
  localStorage.removeItem(IS_PRO);
}

function renderLicenseUI() {
  if (isPro()) {
    freeView.classList.add('hidden');
    proView.classList.remove('hidden');
    const key = localStorage.getItem(LICENSE_KEY) || '';
    licenseDisplay.textContent = key.slice(0, 8) + '••••••••••••••••' + key.slice(-4);
    document.getElementById('domainHistorySection').classList.remove('hidden');
  } else {
    freeView.classList.remove('hidden');
    proView.classList.add('hidden');
    document.getElementById('domainHistorySection').classList.add('hidden');
  }
}

showLicenseBtn.addEventListener('click', () => {
  licenseForm.classList.remove('hidden');
  showLicenseBtn.classList.add('hidden');
  licenseInput.focus();
});

activateBtn.addEventListener('click', async () => {
  const key = (licenseInput.value || '').trim();
  if (!key) { activateStatus.textContent = 'Please enter a license key.'; activateStatus.style.color = '#c0614a'; return; }
  activateBtn.disabled = true;
  activateStatus.style.color = '#8a8070';
  activateStatus.textContent = 'Validating...';
  const result = await activateLicense(key);
  if (result.ok) {
    activateStatus.style.color = '#6b8f71';
    activateStatus.textContent = '✓ Pro activated!';
    setTimeout(() => renderLicenseUI(), 800);
  } else {
    activateStatus.style.color = '#c0614a';
    activateStatus.textContent = result.error;
    activateBtn.disabled = false;
  }
});

deactivateBtn.addEventListener('click', async () => {
  if (!confirm('Deactivate your Pro license on this device?')) return;
  await deactivateLicense();
  renderLicenseUI();
});

// ── HISTORIAL DE POSICIONES (Pro) ────────────────────────────────────
const POS_HISTORY_KEY = 'serp_pos_history';

function getPosHistory() {
  try { return JSON.parse(localStorage.getItem(POS_HISTORY_KEY) || '{}'); } catch { return {}; }
}
function savePosHistory(domain, keyword, position, url, title) {
  const history = getPosHistory();
  const key = `${domain}||${keyword}`;
  history[key] = { position, url, title: title || '', date: new Date().toISOString() };
  localStorage.setItem(POS_HISTORY_KEY, JSON.stringify(history));
}
function getPrevPos(domain, keyword) {
  const history = getPosHistory();
  return history[`${domain}||${keyword}`] || null;
}
const HISTORY_KEY     = 'hundredranks_history';
const HISTORY_ALL_KEY = 'hundredranks_history_all';
const MAX_QUICK = 7;
const MAX_QUICK_FREE = 3;

function getQuickHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}
function getAllHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_ALL_KEY) || '[]'); } catch { return []; }
}
function saveToHistory(domain) {
  if (!domain) return;
  const limit = isPro() ? MAX_QUICK : MAX_QUICK_FREE;
  let quick = getQuickHistory().filter(d => d !== domain);
  quick.unshift(domain);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(quick.slice(0, limit)));
  if (isPro()) {
    let all = getAllHistory().filter(d => d !== domain);
    all.unshift(domain);
    localStorage.setItem(HISTORY_ALL_KEY, JSON.stringify(all));
  }
}
function removeFromHistory(domain) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(getQuickHistory().filter(d => d !== domain)));
  localStorage.setItem(HISTORY_ALL_KEY, JSON.stringify(getAllHistory().filter(d => d !== domain)));
}

// ── DROPDOWN (solo Pro) ───────────────────────────────────────────────
function renderDropdown(items) {
  dropdown.innerHTML = '';
  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'no-results';
    li.textContent = 'No history yet';
    dropdown.appendChild(li);
  } else {
    items.forEach(domain => {
      const li = document.createElement('li');
      li.dataset.domain = domain;
      const domainSpan = document.createElement('span');
      domainSpan.className = 'domain-text';
      domainSpan.textContent = domain;
      domainSpan.addEventListener('mousedown', (e) => {
        e.preventDefault();
        selectDomain(domain);
      });
      const delBtn = document.createElement('button');
      delBtn.className = 'domain-del';
      delBtn.textContent = '×';
      delBtn.title = 'Remove';
      delBtn.style.display = isPro() ? '' : 'none';
      delBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        removeFromHistory(domain);
        const val = domainInput.value.trim().toLowerCase();
        renderDropdown(val
          ? getAllHistory().filter(d => d.toLowerCase().includes(val))
          : getQuickHistory()
        );
      });
      li.appendChild(domainSpan);
      li.appendChild(delBtn);
      dropdown.appendChild(li);
    });
  }
  dropdown.classList.remove('hidden');
}

function hideDropdown() { dropdown.classList.add('hidden'); }

function selectDomain(domain) {
  domainInput.value = domain;
  localStorage.setItem('hundredranks_domain', domain);
  hideDropdown();
  output.innerHTML = '';
  checkBtn.click();
}

// ── IMPORT DOMAINS ────────────────────────────────────────────────────
const importDomainsBtn = document.getElementById('importDomainsBtn');
const importFileInput  = document.getElementById('importFileInput');
const importStatus     = document.getElementById('importStatus');

importDomainsBtn.addEventListener('click', () => importFileInput.click());

importFileInput.addEventListener('change', () => {
  const file = importFileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const lines = e.target.result.split(/\r?\n/);
    let added = 0;
    lines.forEach(line => {
      const domain = line.trim().toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .split('/')[0];
      if (!domain || domain.length < 3 || !domain.includes('.')) return;
      // Añadir al historial completo
      let all = getAllHistory().filter(d => d !== domain);
      all.unshift(domain);
      localStorage.setItem(HISTORY_ALL_KEY, JSON.stringify(all));
      added++;
    });
    // Actualizar quick history con los primeros 7 del historial completo
    const all = getAllHistory();
    localStorage.setItem(HISTORY_KEY, JSON.stringify(all.slice(0, MAX_QUICK)));
    importStatus.textContent = `✓ ${added} domain${added !== 1 ? 's' : ''} imported`;
    setTimeout(() => { importStatus.textContent = ''; }, 3000);
    importFileInput.value = '';
  };
  reader.readAsText(file);
});
domainInput.addEventListener('click', () => {
  domainInput.value = '';
  localStorage.setItem('hundredranks_domain', '');
  renderDropdown(getQuickHistory());
});
domainInput.addEventListener('blur', () => setTimeout(hideDropdown, 150));
domainInput.addEventListener('input', () => {
  output.innerHTML = '';
  const val = domainInput.value.trim();
  localStorage.setItem('hundredranks_domain', val);
  if (isPro()) {
    const lower = val.toLowerCase();
    renderDropdown(lower
      ? getAllHistory().filter(d => d.toLowerCase().includes(lower))
      : getQuickHistory()
    );
  } else {
    renderDropdown(getQuickHistory());
  }
});
domainInput.addEventListener('keydown', (e) => {
  if (isPro()) {
    const items = [...dropdown.querySelectorAll('li:not(.no-results)')];
    const activeEl = dropdown.querySelector('li.active');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = activeEl ? activeEl.nextElementSibling : items[0];
      if (activeEl) activeEl.classList.remove('active');
      if (next && items.includes(next)) { next.classList.add('active'); domainInput.value = next.dataset.domain || ''; }
      return;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = activeEl ? activeEl.previousElementSibling : items[items.length - 1];
      if (activeEl) activeEl.classList.remove('active');
      if (prev && items.includes(prev)) { prev.classList.add('active'); domainInput.value = prev.dataset.domain || ''; }
      return;
    } else if (e.key === 'Escape') {
      hideDropdown(); return;
    } else if (e.key === 'Enter' && activeEl) {
      e.preventDefault();
      selectDomain(activeEl.dataset.domain || '');
      return;
    }
  }
  // Enter sin dropdown activo → lanzar check
  if (e.key === 'Enter') {
    e.preventDefault();
    checkBtn.click();
  }
});

// Recuperar último dominio (free + pro)
const savedDomain = localStorage.getItem('hundredranks_domain');
if (savedDomain) domainInput.value = savedDomain;

// ── HELPERS ───────────────────────────────────────────────────────────
async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs && tabs[0];
}

function setRunning(state, initialText = '') {
  running = state;
  exportBtn.disabled = state;
  checkBtn.disabled = state;
  domainInput.disabled = state;
  if (state) {
    progressArea.classList.remove('hidden');
    spinner.classList.remove('hidden');
    progressBar.style.width = '0%';
    progressPercent.textContent = '0%';
    statusText.textContent = initialText || 'Working...';
  } else {
    progressArea.classList.add('hidden');
    spinner.classList.add('hidden');
    progressBar.style.width = '0%';
    progressPercent.textContent = '0%';
  }
}

// ── MENSAJES DESDE CONTENT.JS ─────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || !msg.type) return;

  if (msg.type === 'progress') {
    const pct = Math.max(0, Math.min(100, Number(msg.percent || 0)));
    progressBar.style.width = pct + '%';
    progressPercent.textContent = pct + '%';
    statusText.textContent = msg.text || 'Working...';
    spinner.classList.remove('hidden');
    progressArea.classList.remove('hidden');
  }

  if (msg.type === 'result') {
    output.innerHTML = '';
    const { position, keyword, url, title, description, text } = msg;
    if (url) {
      if (isPro()) {
        const domain = (domainInput.value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
        const prev = getPrevPos(domain, keyword);

        // ── Resultado actual ──
        let color = '#2c2c2c', arrow = '';
        if (prev) {
          if (position < prev.position)      { color = '#4a7c59'; arrow = ' ↑'; }
          else if (position > prev.position) { color = '#c0614a'; arrow = ' ↓'; }
        }

        const posEl = document.createElement('div');
        posEl.style.cssText = `font-size:14px;font-weight:700;color:${color};margin-bottom:5px;`;
        posEl.textContent = `Position #${position}${arrow}`;
        output.appendChild(posEl);

        const link = document.createElement('a');
        link.href = url;
        link.textContent = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        const urlChanged = prev && prev.url && prev.url !== url;
        link.style.cssText = `color:${urlChanged ? '#c0614a' : '#6b8f71'};word-break:break-all;display:block;margin-bottom:5px;font-size:12px;font-weight:400;white-space:normal;`;
        output.appendChild(link);

        if (title) {
          const titleEl = document.createElement('div');
          titleEl.style.cssText = 'font-size:12px;color:#2c2c2c;margin-bottom:4px;font-weight:400;white-space:normal;word-break:break-word;';
          const lbl = document.createElement('span');
          lbl.style.cssText = 'font-weight:700;color:#8a8070;margin-right:4px;';
          lbl.textContent = 'Title:';
          titleEl.appendChild(lbl);
          titleEl.appendChild(document.createTextNode(title));
          output.appendChild(titleEl);
        }

        // ── Resultado anterior ──
        if (prev) {
          const sep = document.createElement('div');
          sep.style.cssText = 'margin:10px 0 8px;font-size:11px;font-weight:600;color:#8a8070;letter-spacing:1px;border-top:1px solid #ddd8d0;padding-top:8px;';
          sep.textContent = 'PREVIOUS';
          output.appendChild(sep);

          const prevPos = document.createElement('div');
          prevPos.style.cssText = 'font-size:13px;font-weight:600;color:#8a8070;margin-bottom:5px;';
          prevPos.textContent = `Position #${prev.position}`;
          output.appendChild(prevPos);

          if (prev.url) {
            const prevLink = document.createElement('a');
            prevLink.href = prev.url;
            prevLink.textContent = prev.url;
            prevLink.target = '_blank';
            prevLink.style.cssText = 'color:#b5aea5;word-break:break-all;display:block;margin-bottom:5px;font-size:12px;font-weight:400;white-space:normal;';
            output.appendChild(prevLink);
          }

          if (prev.title) {
            const prevTitle = document.createElement('div');
            prevTitle.style.cssText = 'font-size:12px;color:#8a8070;font-weight:400;white-space:normal;word-break:break-word;';
            const lbl = document.createElement('span');
            lbl.style.cssText = 'font-weight:700;margin-right:4px;';
            lbl.textContent = 'Title:';
            prevTitle.appendChild(lbl);
            prevTitle.appendChild(document.createTextNode(prev.title));
            output.appendChild(prevTitle);
          }
        }

        // Guardar resultado actual para próxima consulta
        savePosHistory(domain, keyword, position, url, title);

      } else {
        // Free: solo posición
        const info = document.createElement('div');
        info.style.cssText = 'margin-bottom:6px;font-size:13px;font-weight:600;';
        info.textContent = `Position #${position} for '${keyword}'`;
        output.appendChild(info);

        const upsell = document.createElement('div');
        upsell.style.cssText = 'margin-top:8px;font-size:11px;color:#8a8070;border-top:1px solid #ddd8d0;padding-top:6px;';
        upsell.innerHTML = '⭐ <a href="https://payhip.com/b/VvA5J" target="_blank" style="color:#6b8f71;font-weight:600;">Upgrade to Pro</a> to see URL, Title & position tracking';
        output.appendChild(upsell);
      }
    } else {
      output.textContent = text || '';
    }
    spinner.classList.add('hidden');
    progressArea.classList.add('hidden');
    running = false;
    exportBtn.disabled = false;
    checkBtn.disabled = false;
    domainInput.disabled = false;
  }

  if (msg.type === 'done') {
    spinner.classList.add('hidden');
    statusText.textContent = msg.text || 'Done';
    progressBar.style.width = '100%';
    progressPercent.textContent = '100%';
    setTimeout(() => setRunning(false), 800);
  }

  if (msg.type === 'error') {
    spinner.classList.add('hidden');
    statusText.textContent = 'Error: ' + (msg.text || 'Something went wrong');
    setTimeout(() => setRunning(false), 1200);
  }
});

// ── EXPORT SERP ───────────────────────────────────────────────────────
exportBtn.addEventListener('click', async () => {
  if (running) return;
  setRunning(true, 'Starting export...');
  try {
    const tab = await getActiveTab();
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    chrome.tabs.sendMessage(tab.id, { action: 'export' });
  } catch (err) {
    console.error(err);
    setRunning(false);
    alert('Make sure you are on a Google search results page (desktop).');
  }
});

// ── CHECK RANK ────────────────────────────────────────────────────────
checkBtn.addEventListener('click', async () => {
  if (running) return;
  const domain = (domainInput.value || '').trim();
  if (!domain) { output.textContent = 'Please enter a domain.'; return; }
  saveToHistory(domain);
  output.innerHTML = '';
  setRunning(true, 'Checking domain...');
  try {
    const tab = await getActiveTab();
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    chrome.tabs.sendMessage(tab.id, { action: 'checkDomain', domain });
  } catch (err) {
    console.error(err);
    setRunning(false);
    alert('Make sure you are on a Google search results page (desktop).');
  }
});

// ── INIT ──────────────────────────────────────────────────────────────
renderLicenseUI();
