importScripts('shared.js');

const { DEFAULTS, matchDomain } = globalThis.PBYS;

// Write the defaults on first install so the list exists in storage.sync.
chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.sync.get(null);
  const missing = {};
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (stored[key] === undefined) missing[key] = value;
  }
  if (Object.keys(missing).length) await chrome.storage.sync.set(missing);
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

async function grantPass(domain, tabUrl) {
  const { blockedDomains, passMinutes } = await chrome.storage.sync.get(DEFAULTS);
  // Only grant for a blocked domain the requesting tab is actually on.
  let host = '';
  try { host = new URL(tabUrl).hostname; } catch {}
  if (matchDomain(host, blockedDomains) !== domain) return false;

  const now = Date.now();
  const { passes } = await chrome.storage.local.get({ passes: {} });
  for (const key of Object.keys(passes)) {
    if (passes[key] <= now) delete passes[key];
  }
  const minutes = Number(passMinutes) > 0 ? Number(passMinutes) : DEFAULTS.passMinutes;
  passes[domain] = now + minutes * 60 * 1000;
  await chrome.storage.local.set({ passes });
  return true;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!sender.tab) return;

  if (message?.type === 'pbys:go-back') {
    chrome.tabs.update(sender.tab.id, { url: 'chrome://newtab' });
    return;
  }

  if (message?.type === 'pbys:grant-pass') {
    grantPass(message.domain, sender.tab.url)
      .then((ok) => sendResponse({ ok }))
      .catch(() => sendResponse({ ok: false }));
    return true; // async response
  }
});

// SPA navigation: tell the tab's content script to re-check its pass.
function notifyUrlChanged(details) {
  if (details.frameId !== 0) return;
  chrome.tabs
    .sendMessage(details.tabId, { type: 'pbys:url-changed' }, { frameId: 0 })
    .catch(() => {}); // no content script in that tab
}
chrome.webNavigation.onHistoryStateUpdated.addListener(notifyUrlChanged);
chrome.webNavigation.onReferenceFragmentUpdated.addListener(notifyUrlChanged);
