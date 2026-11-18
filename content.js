// content.js
// Runs inside every web page. If the page belongs to a blocked domain, it
// covers the screen with a calm overlay, guides 60 seconds of box breathing,
// then asks "Go back" or "Continue". It also re-checks on in-page navigation.
(() => {
  const { DEFAULTS, matchDomain } = globalThis.PBYS;

  // ---- Settings for the breathing guide -----------------------------------
  const TOTAL_MS = 60 * 1000;  // length of the whole pause
  const PHASE_MS = 4 * 1000;   // each box-breathing step lasts 4 seconds
  const PHASES = ['Breathe in', 'Hold', 'Breathe out', 'Hold'];
  const MIN_SCALE = 0.45;      // how small the square gets when lungs are "empty"

  // ---- Overlay styling ----------------------------------------------------
  // This CSS lives inside a shadow root (see showOverlay), so it can't leak out
  // to the page and the page's own CSS can't break the overlay.
  const CSS = `
    :host { all: initial; }
    .wrap {
      position: fixed; inset: 0;
      display: flex; align-items: center; justify-content: center;
      background: radial-gradient(ellipse at 50% 40%, #16304a 0%, #0c1a2b 55%, #070f1a 100%);
      color: #dce8f2;
      font: 400 18px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      text-align: center;
      user-select: none;
      cursor: default;
    }
    .panel { display: flex; flex-direction: column; align-items: center; padding: 24px; }
    .panel[hidden] { display: none; }
    .stage {
      position: relative; width: min(46vmin, 300px); height: min(46vmin, 300px);
      display: flex; align-items: center; justify-content: center;
    }
    /* The dashed outline marks the "full lungs" size of the square. */
    .track {
      position: absolute; inset: 0; border-radius: 18px;
      border: 1px dashed rgba(160, 200, 230, 0.25);
    }
    /* The square that grows and shrinks; its size is set from JavaScript. */
    .box {
      width: 100%; height: 100%; border-radius: 18px;
      background: linear-gradient(145deg, #7fc4d8, #4f8fb8);
      box-shadow: 0 0 60px rgba(110, 180, 215, 0.35);
      transform: scale(${MIN_SCALE});
      will-change: transform;
    }
    .phase { margin: 40px 0 0; font-size: 30px; font-weight: 300; letter-spacing: 0.04em; }
    .count {
      margin: 10px 0 0; font-size: 22px; color: #8fb3cc;
      font-variant-numeric: tabular-nums;
    }
    .hint { margin: 28px 0 0; font-size: 14px; color: #6f8ea6; }
    h1 { margin: 0; font-size: 30px; font-weight: 300; line-height: 1.3; max-width: 22em; }
    .site { font-weight: 600; color: #9fd4e6; overflow-wrap: anywhere; }
    .buttons { margin-top: 36px; display: flex; gap: 16px; flex-wrap: wrap; justify-content: center; }
    button {
      font: inherit; font-size: 17px; padding: 12px 28px; border-radius: 999px;
      cursor: pointer; border: 1px solid transparent;
    }
    button:focus-visible { outline: 2px solid #dce8f2; outline-offset: 3px; }
    .back { background: #7fc4d8; color: #0c1a2b; font-weight: 600; }
    .back:hover { background: #99d3e4; }
    .go { background: transparent; color: #a9c2d6; border-color: rgba(160, 200, 230, 0.4); }
    .go:hover { background: rgba(160, 200, 230, 0.12); }
  `;

  // The overlay currently on screen, or null. Holds what we need to tear it down.
  let overlay = null; // { host, domain, buttons, stop() }

  // Small helper: create an element with an optional class and text.
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // Smooth start and end for the square's movement (t goes from 0 to 1).
  function easeInOut(t) {
    return 0.5 - Math.cos(Math.PI * t) / 2;
  }

  // Builds the overlay, starts the breathing animation and the countdown.
  function showOverlay(domain) {
    // `host` is the outer element added to the page. The !important flags and
    // the max z-index keep the overlay above everything the page may draw.
    const host = document.createElement('div');
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-modal', 'true');
    host.setAttribute('aria-label', 'Pause Before You Scroll');
    host.style.cssText =
      'all: initial !important; position: fixed !important; inset: 0 !important;' +
      'z-index: 2147483647 !important; display: block !important;' +
      'pointer-events: auto !important; opacity: 1 !important; visibility: visible !important;';

    // The content goes in a "closed" shadow root, isolating it from the page's
    // scripts and styles. It is built node by node and styled with a
    // constructed stylesheet because sites like YouTube forbid inserting HTML
    // strings (Trusted Types) and inline styles (CSP).
    const root = host.attachShadow({ mode: 'closed' });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(CSS);
    root.adoptedStyleSheets = [sheet];

    const wrap = el('div', 'wrap');

    // Screen 1: the breathing guide (square, phase text, countdown, hint).
    const breathe = el('div', 'panel');
    const stage = el('div', 'stage');
    const box = el('div', 'box');
    stage.append(el('div', 'track'), box);
    const phaseText = el('p', 'phase', PHASES[0]);
    phaseText.setAttribute('aria-live', 'polite'); // screen readers announce changes
    const countText = el('p', 'count', String(TOTAL_MS / 1000));
    breathe.append(stage, phaseText, countText, el('p', 'hint', 'Follow the square with your breath.'));

    // Screen 2: the question with Go back / Continue. Hidden until 60s pass.
    // Note there is deliberately no way to skip screen 1.
    const ask = el('div', 'panel');
    ask.hidden = true;
    const heading = el('h1');
    heading.append('Do you really want to go to ', el('span', 'site', domain), '?');
    const buttons = el('div', 'buttons');
    const backBtn = el('button', 'back', 'Go back');
    const goBtn = el('button', 'go', 'Continue');
    buttons.append(backBtn, goBtn);
    ask.append(heading, buttons);

    wrap.append(breathe, ask);
    root.append(wrap);

    // Block scrolling and the right-click menu on the overlay.
    for (const type of ['wheel', 'touchmove', 'contextmenu']) {
      wrap.addEventListener(type, (e) => e.preventDefault(), { passive: false });
    }

    // Stop the page behind from scrolling, remembering the old setting so we
    // can restore it afterwards.
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.setProperty('overflow', 'hidden', 'important');
    document.documentElement.appendChild(host);

    // If the page's own scripts remove the overlay, put it straight back.
    const guard = new MutationObserver(() => {
      if (!host.isConnected && document.documentElement) {
        document.documentElement.appendChild(host);
      }
    });
    guard.observe(document, { childList: true, subtree: false });
    guard.observe(document.documentElement, { childList: true });

    // Pause any video or audio so it doesn't keep playing behind the overlay.
    // We remember what was playing so "Continue" can resume it. The timer
    // catches media that starts later (YouTube autoplay).
    const paused = new Set();
    const pauseMedia = () => {
      for (const media of document.querySelectorAll('video, audio')) {
        if (!media.paused) {
          media.pause();
          paused.add(media);
        }
      }
    };
    pauseMedia();
    const mediaTimer = setInterval(pauseMedia, 400);

    // ---- Animation loop ---------------------------------------------------
    // `elapsed` counts only time the tab is visible, so switching to another
    // tab doesn't let you skip the breathing.
    let elapsed = 0;
    let last = null;
    let raf = 0;
    let lastPhase = -1;
    let lastSecs = -1;

    function frame(now) {
      if (last !== null && document.visibilityState === 'visible') {
        // Cap each step at 1s so a long freeze can't jump the clock ahead.
        elapsed += Math.min(now - last, 1000);
      }
      last = now;

      // Time's up: swap to the question screen and stop animating.
      if (elapsed >= TOTAL_MS) {
        breathe.hidden = true;
        ask.hidden = false;
        current.buttons = [backBtn, goBtn]; // lets the Tab-key handler cycle them
        backBtn.focus();
        return;
      }

      // Which of the four 4-second steps are we in, and how far through it?
      const phase = Math.floor(elapsed / PHASE_MS) % 4;
      const t = (elapsed % PHASE_MS) / PHASE_MS;
      let scale;
      if (phase === 0) scale = MIN_SCALE + (1 - MIN_SCALE) * easeInOut(t);      // breathe in: grow
      else if (phase === 1) scale = 1;                                          // hold: full size
      else if (phase === 2) scale = 1 - (1 - MIN_SCALE) * easeInOut(t);         // breathe out: shrink
      else scale = MIN_SCALE;                                                   // hold: small
      box.style.transform = `scale(${scale.toFixed(4)})`;

      // Only touch the text when it actually changes.
      if (phase !== lastPhase) {
        lastPhase = phase;
        phaseText.textContent = PHASES[phase];
      }
      const secs = Math.ceil((TOTAL_MS - elapsed) / 1000);
      if (secs !== lastSecs) {
        lastSecs = secs;
        countText.textContent = String(secs);
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    // Handle used by removeOverlay() to clean everything up.
    const current = {
      host,
      domain,
      buttons: [],
      stop(resumeMedia) {
        cancelAnimationFrame(raf);
        clearInterval(mediaTimer);
        guard.disconnect();
        host.remove();
        // Restore page scrolling.
        if (prevOverflow) document.documentElement.style.overflow = prevOverflow;
        else document.documentElement.style.removeProperty('overflow');
        // Resume whatever we paused (only when the user chose Continue).
        if (resumeMedia) {
          for (const media of paused) {
            if (media.isConnected) media.play().catch(() => {});
          }
        }
      }
    };

    // "Go back": ask the background script to redirect to the new tab page.
    backBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'pbys:go-back' }).catch(() => {
        // The extension was reloaded; still leave the site.
        location.replace('about:blank');
      });
    });

    // "Continue": have the background script store the pass, then close.
    goBtn.addEventListener('click', async () => {
      backBtn.disabled = goBtn.disabled = true;
      try {
        await chrome.runtime.sendMessage({ type: 'pbys:grant-pass', domain });
      } catch {}
      removeOverlay(true);
    });

    overlay = current;
  }

  // Closes the overlay if one is showing.
  function removeOverlay(resumeMedia) {
    if (!overlay) return;
    overlay.stop(resumeMedia);
    overlay = null;
  }

  // ---- Keyboard lock ------------------------------------------------------
  // While the overlay is up, keystrokes are stopped before the page can see
  // them (so YouTube shortcuts like Space or "k" do nothing). Browser shortcuts
  // such as Ctrl+W or Ctrl+L still work so you can always close the tab.
  // Registered at document_start in the capture phase so it runs first.
  function onKey(e) {
    if (!overlay) return;
    e.stopImmediatePropagation();
    if (e.ctrlKey || e.metaKey || e.altKey) return; // leave browser shortcuts alone
    if (e.key === 'Tab') {
      // Keep focus inside the overlay by cycling between its two buttons.
      e.preventDefault();
      const btns = overlay.buttons;
      if (e.type === 'keydown' && btns.length) {
        const focused = btns.findIndex((b) => b.matches(':focus'));
        btns[(focused + 1) % btns.length].focus();
      }
      return;
    }
    const onOverlay = e.target === overlay.host;
    if (onOverlay && (e.key === 'Enter' || e.key === ' ')) return; // activate the focused button
    e.preventDefault();
  }
  for (const type of ['keydown', 'keypress', 'keyup']) {
    window.addEventListener(type, onKey, true);
  }

  // ---- Deciding whether to show the overlay -------------------------------
  // Called on page load, on in-page navigation and when settings change.
  // `mayShow: false` means "only remove an overlay, never start a new one".
  async function check({ mayShow = true } = {}) {
    let settings, local;
    try {
      [settings, local] = await Promise.all([
        chrome.storage.sync.get(DEFAULTS),
        chrome.storage.local.get({ passes: {} })
      ]);
    } catch {
      return; // extension was reloaded or removed; nothing to do
    }
    const domain = matchDomain(location.hostname, settings.blockedDomains);
    const hasPass = !!domain && (local.passes?.[domain] || 0) > Date.now();

    // Not a blocked site, or a valid pass exists: make sure no overlay is up.
    if (!domain || hasPass) {
      removeOverlay(true);
      return;
    }
    if (overlay) {
      if (overlay.domain === domain) return; // already pausing; don't restart the timer
      removeOverlay(false);
    }
    if (mayShow) showOverlay(domain);
  }

  // Check as soon as the page starts loading.
  check();

  // Re-check when the URL changes without a reload (YouTube, Instagram...).
  // The background script forwards Chrome's navigation events as messages;
  // popstate and pageshow cover back/forward buttons and cached pages.
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'pbys:url-changed') check();
  });
  window.addEventListener('popstate', () => check());
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) check();
  });

  // React to settings changes made while the page is open.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
      check(); // the blocked list was edited
    } else if (area === 'local' && changes.passes) {
      // A pass granted in another tab dismisses this tab's overlay too. A pass
      // expiring never raises the overlay mid-page; that waits for the next
      // navigation, so it can't interrupt you.
      check({ mayShow: false });
    }
  });
})();
