// shared.js
// Small helpers and default settings used by every other script in the
// extension (the background service worker, the content script and the options
// page). Each one loads this file first, then reads what it needs from the
// global `PBYS` object ("Pause Before You Scroll").
globalThis.PBYS = {
  // Default settings. The background script writes these to
  // chrome.storage.sync the first time the extension is installed.
  DEFAULTS: {
    blockedDomains: ['youtube.com', 'instagram.com', 'roblox.com'],
    passMinutes: 10 // how long "Continue" lets you stay on a site
  },

  // Checks whether the current page's hostname is on the blocked list.
  // Returns the blocked-list entry that matches (so "m.youtube.com" gives back
  // "youtube.com"), or null if the site is not blocked.
  // A site matches if it is exactly the domain or any subdomain of it.
  matchDomain(hostname, blockedDomains) {
    const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
    if (!Array.isArray(blockedDomains)) return null;
    for (const domain of blockedDomains) {
      if (host === domain || host.endsWith('.' + domain)) return domain;
    }
    return null;
  },

  // Cleans up what the user types into the options page.
  // "https://www.YouTube.com/feed" becomes "youtube.com".
  // Returns null if the input isn't a valid domain.
  normalizeDomain(input) {
    let s = String(input || '').trim().toLowerCase();
    if (!s) return null;
    try {
      // Add "https://" if missing so the URL parser can extract the hostname.
      s = new URL(s.includes('://') ? s : 'https://' + s).hostname;
    } catch {
      return null;
    }
    s = s.replace(/^www\./, '').replace(/\.$/, '');
    // Must look like "name.tld": letters, digits and hyphens, with a dot.
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s) ? s : null;
  }
};
