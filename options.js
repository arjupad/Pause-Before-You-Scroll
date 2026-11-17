const { DEFAULTS, normalizeDomain } = globalThis.PBYS;

const listEl = document.getElementById('domains');
const formEl = document.getElementById('add-form');
const inputEl = document.getElementById('new-domain');
const minutesEl = document.getElementById('pass-minutes');
const statusEl = document.getElementById('status');

let domains = [];
let statusTimer = 0;

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', isError);
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => (statusEl.textContent = ''), 3000);
}

function render() {
  listEl.replaceChildren();
  if (!domains.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No sites blocked.';
    listEl.append(li);
    return;
  }
  for (const domain of domains) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = domain;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove ${domain}`);
    remove.addEventListener('click', async () => {
      await chrome.storage.sync.set({ blockedDomains: domains.filter((d) => d !== domain) });
      setStatus(`Removed ${domain}.`);
    });
    li.append(name, remove);
    listEl.append(li);
  }
}

async function load() {
  const settings = await chrome.storage.sync.get(DEFAULTS);
  domains = Array.isArray(settings.blockedDomains) ? settings.blockedDomains : [];
  if (document.activeElement !== minutesEl) minutesEl.value = settings.passMinutes;
  render();
}

formEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  const domain = normalizeDomain(inputEl.value);
  if (!domain) {
    setStatus('Enter a domain like example.com.', true);
    return;
  }
  if (domains.includes(domain)) {
    setStatus(`${domain} is already blocked.`, true);
    return;
  }
  await chrome.storage.sync.set({ blockedDomains: [...domains, domain] });
  inputEl.value = '';
  setStatus(`Added ${domain}.`);
});

minutesEl.addEventListener('change', async () => {
  const minutes = Math.round(Number(minutesEl.value));
  if (!(minutes >= 1 && minutes <= 1440)) {
    setStatus('Pass length must be between 1 and 1440 minutes.', true);
    load();
    return;
  }
  minutesEl.value = minutes;
  await chrome.storage.sync.set({ passMinutes: minutes });
  setStatus('Pass length saved.');
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') load();
});

load();
