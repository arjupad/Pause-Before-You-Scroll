// options.js
// Logic for the settings page (options.html): add or remove blocked domains
// and change the pass length. Everything is saved to chrome.storage.sync.
const { DEFAULTS, normalizeDomain } = globalThis.PBYS;

// Elements on the page.
const listEl = document.getElementById('domains');
const formEl = document.getElementById('add-form');
const inputEl = document.getElementById('new-domain');
const minutesEl = document.getElementById('pass-minutes');
const statusEl = document.getElementById('status');

let domains = [];   // the current blocked list, kept in sync with storage
let statusTimer = 0;

// Shows a short message under the form (red for errors) that fades after 3s.
function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', isError);
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => (statusEl.textContent = ''), 3000);
}

// Redraws the list of blocked domains, each with a Remove button.
// Elements are built with textContent (not innerHTML) so typed text can never
// be interpreted as HTML.
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
      // Save the list without this domain. The storage change listener at the
      // bottom of this file redraws the page.
      await chrome.storage.sync.set({ blockedDomains: domains.filter((d) => d !== domain) });
      setStatus(`Removed ${domain}.`);
    });
    li.append(name, remove);
    listEl.append(li);
  }
}

// Reads the saved settings and updates the page. Falls back to the defaults
// if nothing has been saved yet.
async function load() {
  const settings = await chrome.storage.sync.get(DEFAULTS);
  domains = Array.isArray(settings.blockedDomains) ? settings.blockedDomains : [];
  // Don't overwrite the number while the user is typing in the box.
  if (document.activeElement !== minutesEl) minutesEl.value = settings.passMinutes;
  render();
}

// "Add" form: clean up the input, reject bad or duplicate entries, then save.
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

// Pass length box: validate (1 to 1440 minutes, i.e. up to a day) and save.
minutesEl.addEventListener('change', async () => {
  const minutes = Math.round(Number(minutesEl.value));
  if (!(minutes >= 1 && minutes <= 1440)) {
    setStatus('Pass length must be between 1 and 1440 minutes.', true);
    load(); // put the last saved value back
    return;
  }
  minutesEl.value = minutes;
  await chrome.storage.sync.set({ passMinutes: minutes });
  setStatus('Pass length saved.');
});

// Redraw whenever settings change, including from another open settings tab
// or another device signed into the same Chrome profile.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') load();
});

load();
