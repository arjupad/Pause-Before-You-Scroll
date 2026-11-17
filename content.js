(() => {
  const { DEFAULTS, matchDomain } = globalThis.PBYS;

  const TOTAL_MS = 60 * 1000;
  const PHASE_MS = 4 * 1000;
  const PHASES = ['Breathe in', 'Hold', 'Breathe out', 'Hold'];
  const MIN_SCALE = 0.45;

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
    .track {
      position: absolute; inset: 0; border-radius: 18px;
      border: 1px dashed rgba(160, 200, 230, 0.25);
    }
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

  let overlay = null; // { host, domain, buttons, stop() }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function easeInOut(t) {
    return 0.5 - Math.cos(Math.PI * t) / 2;
  }

  function showOverlay(domain) {
    const host = document.createElement('div');
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-modal', 'true');
    host.setAttribute('aria-label', 'Pause Before You Scroll');
    host.style.cssText =
      'all: initial !important; position: fixed !important; inset: 0 !important;' +
      'z-index: 2147483647 !important; display: block !important;' +
      'pointer-events: auto !important; opacity: 1 !important; visibility: visible !important;';

    // DOM is built node by node and styled with a constructed stylesheet so
    // page CSP / Trusted Types (YouTube enforces both) can't interfere.
    const root = host.attachShadow({ mode: 'closed' });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(CSS);
    root.adoptedStyleSheets = [sheet];

    const wrap = el('div', 'wrap');

    const breathe = el('div', 'panel');
    const stage = el('div', 'stage');
    const box = el('div', 'box');
    stage.append(el('div', 'track'), box);
    const phaseText = el('p', 'phase', PHASES[0]);
    phaseText.setAttribute('aria-live', 'polite');
    const countText = el('p', 'count', String(TOTAL_MS / 1000));
    breathe.append(stage, phaseText, countText, el('p', 'hint', 'Follow the square with your breath.'));

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

    // Swallow pointer/scroll input so nothing reaches the page underneath.
    for (const type of ['wheel', 'touchmove', 'contextmenu']) {
      wrap.addEventListener(type, (e) => e.preventDefault(), { passive: false });
    }

    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.setProperty('overflow', 'hidden', 'important');
    document.documentElement.appendChild(host);

    // Put the overlay back if the page removes it.
    const guard = new MutationObserver(() => {
      if (!host.isConnected && document.documentElement) {
        document.documentElement.appendChild(host);
      }
    });
    guard.observe(document, { childList: true, subtree: false });
    guard.observe(document.documentElement, { childList: true });

    // Keep video/audio from playing behind the overlay.
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

    // Countdown only advances while the tab is visible.
    let elapsed = 0;
    let last = null;
    let raf = 0;
    let lastPhase = -1;
    let lastSecs = -1;

    function frame(now) {
      if (last !== null && document.visibilityState === 'visible') {
        elapsed += Math.min(now - last, 1000);
      }
      last = now;

      if (elapsed >= TOTAL_MS) {
        breathe.hidden = true;
        ask.hidden = false;
        current.buttons = [backBtn, goBtn];
        backBtn.focus();
        return;
      }

      const phase = Math.floor(elapsed / PHASE_MS) % 4;
      const t = (elapsed % PHASE_MS) / PHASE_MS;
      let scale;
      if (phase === 0) scale = MIN_SCALE + (1 - MIN_SCALE) * easeInOut(t);
      else if (phase === 1) scale = 1;
      else if (phase === 2) scale = 1 - (1 - MIN_SCALE) * easeInOut(t);
      else scale = MIN_SCALE;
      box.style.transform = `scale(${scale.toFixed(4)})`;

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

    const current = {
      host,
      domain,
      buttons: [],
      stop(resumeMedia) {
        cancelAnimationFrame(raf);
        clearInterval(mediaTimer);
        guard.disconnect();
        host.remove();
        if (prevOverflow) document.documentElement.style.overflow = prevOverflow;
        else document.documentElement.style.removeProperty('overflow');
        if (resumeMedia) {
          for (const media of paused) {
            if (media.isConnected) media.play().catch(() => {});
          }
        }
      }
    };

    backBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'pbys:go-back' }).catch(() => {
        // Extension was reloaded; still leave the site.
        location.replace('about:blank');
      });
    });

    goBtn.addEventListener('click', async () => {
      backBtn.disabled = goBtn.disabled = true;
      try {
        await chrome.runtime.sendMessage({ type: 'pbys:grant-pass', domain });
      } catch {}
      removeOverlay(true);
    });

    overlay = current;
  }

  function removeOverlay(resumeMedia) {
    if (!overlay) return;
    overlay.stop(resumeMedia);
    overlay = null;
  }

  // Keyboard lock. Registered at document_start so it runs before any page
  // listener; it only acts while the overlay is up.
  function onKey(e) {
    if (!overlay) return;
    e.stopImmediatePropagation();
    if (e.ctrlKey || e.metaKey || e.altKey) return; // leave browser shortcuts alone
    if (e.key === 'Tab') {
      e.preventDefault();
      const btns = overlay.buttons;
      if (e.type === 'keydown' && btns.length) {
        const focused = btns.findIndex((b) => b.matches(':focus'));
        btns[(focused + 1) % btns.length].focus();
      }
      return;
    }
    const onOverlay = e.target === overlay.host;
    if (onOverlay && (e.key === 'Enter' || e.key === ' ')) return; // activate button
    e.preventDefault();
  }
  for (const type of ['keydown', 'keypress', 'keyup']) {
    window.addEventListener(type, onKey, true);
  }

  async function check({ mayShow = true } = {}) {
    let settings, local;
    try {
      [settings, local] = await Promise.all([
        chrome.storage.sync.get(DEFAULTS),
        chrome.storage.local.get({ passes: {} })
      ]);
    } catch {
      return; // extension context gone (reloaded/uninstalled)
    }
    const domain = matchDomain(location.hostname, settings.blockedDomains);
    const hasPass = !!domain && (local.passes?.[domain] || 0) > Date.now();

    if (!domain || hasPass) {
      removeOverlay(true);
      return;
    }
    if (overlay) {
      if (overlay.domain === domain) return; // already pausing; don't restart
      removeOverlay(false);
    }
    if (mayShow) showOverlay(domain);
  }

  // Initial load.
  check();

  // SPA navigation (the service worker forwards webNavigation events), plus
  // history traversal and back/forward-cache restores.
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'pbys:url-changed') check();
  });
  window.addEventListener('popstate', () => check());
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) check();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
      check(); // block list edited
    } else if (area === 'local' && changes.passes) {
      // A pass granted in another tab dismisses this one too. A pass expiring
      // never raises the overlay mid-page; that waits for the next navigation.
      check({ mayShow: false });
    }
  });
})();
