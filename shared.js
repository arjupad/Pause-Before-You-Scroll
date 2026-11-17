// Shared by the service worker, the content script and the options page.
globalThis.PBYS = {
  // Settings live in chrome.storage.sync under these keys.
  DEFAULTS: {
    blockedDomains: ['youtube.com', 'instagram.com', 'roblox.com'],
    passMinutes: 10
  },

  // Returns the blocked-list entry that covers `hostname` (exact match or any
  // subdomain), or null.
  matchDomain(hostname, blockedDomains) {
    const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
    if (!Array.isArray(blockedDomains)) return null;
    for (const domain of blockedDomains) {
      if (host === domain || host.endsWith('.' + domain)) return domain;
    }
    return null;
  },

  // Turns user input ("https://www.YouTube.com/feed") into a bare domain
  // ("youtube.com"), or null if it isn't one.
  normalizeDomain(input) {
    let s = String(input || '').trim().toLowerCase();
    if (!s) return null;
    try {
      s = new URL(s.includes('://') ? s : 'https://' + s).hostname;
    } catch {
      return null;
    }
    s = s.replace(/^www\./, '').replace(/\.$/, '');
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s) ? s : null;
  }
};
