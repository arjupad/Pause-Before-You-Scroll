// background.js
// The extension's service worker. It runs in the background and handles things
// a web page's content script isn't allowed to do on its own: redirecting the
// tab, saving passes, and noticing in-page navigation.
importScripts('shared.js');

const { DEFAULTS, matchDomain } = globalThis.PBYS;

// On first install, save the default settings so the blocked list exists in
// chrome.storage.sync (which follows the user across their Chrome devices).
chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.sync.get(null);
  const missing = {};
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (stored[key] === undefined) missing[key] = value;
  }
  if (Object.keys(missing).length) await chrome.storage.sync.set(missing);
});

// Clicking the toolbar icon opens the settings page.
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

// Records a pass for `domain` so the overlay doesn't come back until it expires.
// Passes are stored as { "youtube.com": <expiry time in ms> } in
// chrome.storage.local, so they apply to every tab on this device.
async function grantPass(domain, tabUrl) {
  const { blockedDomains, passMinutes } = await chrome.storage.sync.get(DEFAULTS);

  // Safety check: only grant a pass for a blocked domain that the requesting
  // tab is actually on, so a page can't hand out passes for other sites.
  let host = '';
  try { host = new URL(tabUrl).hostname; } catch {}
  if (matchDomain(host, blockedDomains) !== domain) return false;

  const now = Date.now();
  const { passes } = await chrome.storage.local.get({ passes: {} });
  // Tidy up: drop any passes that have already expired.
  for (const key of Object.keys(passes)) {
    if (passes[key] <= now) delete passes[key];
  }
  const minutes = Number(passMinutes) > 0 ? Number(passMinutes) : DEFAULTS.passMinutes;
  passes[domain] = now + minutes * 60 * 1000;
  await chrome.storage.local.set({ passes });
  return true;
}

// Messages sent from the content script (the overlay).
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!sender.tab) return; // ignore anything not coming from a tab

  // "Go back" button: send that tab to Chrome's new tab page. A content script
  // can't open chrome:// pages itself, which is why this happens here.
  if (message?.type === 'pbys:go-back') {
    chrome.tabs.update(sender.tab.id, { url: 'chrome://newtab' });
    return;
  }

  // "Continue" button: store a pass for the site.
  if (message?.type === 'pbys:grant-pass') {
    grantPass(message.domain, sender.tab.url)
      .then((ok) => sendResponse({ ok }))
      .catch(() => sendResponse({ ok: false }));
    return true; // tells Chrome we will reply asynchronously
  }
});

// Sites like YouTube and Instagram change the URL without reloading the page
// ("single-page app" navigation), so the content script wouldn't normally run
// again. Chrome reports those URL changes here, and we tell the content script
// in that tab to re-check whether a pass is still valid.
function notifyUrlChanged(details) {
  if (details.frameId !== 0) return; // only the top-level page, not iframes
  chrome.tabs
    .sendMessage(details.tabId, { type: 'pbys:url-changed' }, { frameId: 0 })
    .catch(() => {}); // the tab may have no content script; that's fine
}
chrome.webNavigation.onHistoryStateUpdated.addListener(notifyUrlChanged);
chrome.webNavigation.onReferenceFragmentUpdated.addListener(notifyUrlChanged);
