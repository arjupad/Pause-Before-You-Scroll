# Pause Before You Scroll

A Chrome extension (Manifest V3) that adds a moment of calm before distracting
websites. When you open a blocked site, a full-screen overlay guides you through
60 seconds of box breathing, then asks whether you still want to go there.

Plain HTML, CSS and JavaScript. No build step, no dependencies.

## How it works

1. You open a blocked site. The defaults are `youtube.com`, `instagram.com` and
   `roblox.com`, and subdomains are included (for example `m.youtube.com`).
2. A dark, full-screen overlay covers the page and blocks clicks, scrolling and
   typing. Video and audio on the page are paused.
3. A square expands and shrinks to guide your breathing, with the text
   **Breathe in / Hold / Breathe out / Hold** (4 seconds each) and a visible
   60-second countdown. There is no skip button, and the countdown only runs
   while the tab is visible.
4. After 60 seconds it asks **"Do you really want to go to \<site\>?"**
   - **Go back** sends the tab to the new tab page.
   - **Continue** removes the overlay and gives you a pass for that domain
     (10 minutes by default), shared across all your tabs.

Passes are re-checked on every page load and on in-page (SPA) navigation, so
YouTube and Instagram can't be used past the pass without the pause coming back.
An expiring pass won't interrupt the page you're already on. The pause returns on
your next navigation.

## Setup

1. Get the code: click **Code > Download ZIP** on GitHub and unzip it, or run
   `git clone https://github.com/arjupad/Pause-Before-You-Scroll.git`.
   Keep the folder somewhere permanent, because Chrome loads the extension from it.
2. Open `chrome://extensions` in Chrome (or any Chromium browser such as Edge or Brave).
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the folder that contains `manifest.json`.
5. Reload any tabs that were already open.

Chrome may show a "disable developer mode extensions" prompt at startup. You can
dismiss it.

## Settings

Click the extension's toolbar icon (pin it from the puzzle-piece menu), or go to
`chrome://extensions` > Pause Before You Scroll > **Details** > **Extension options**.
You can:

- add or remove blocked domains
- set the pass length in minutes

The block list and pass length are stored in `chrome.storage.sync`, so they follow
your Chrome profile. Active passes are stored per device in `chrome.storage.local`.

## Project layout

| File | Purpose |
| --- | --- |
| `manifest.json` | Extension manifest |
| `shared.js` | Defaults and domain helpers shared by all scripts |
| `content.js` | Overlay, breathing guide, pass checks |
| `background.js` | Service worker: "Go back" redirect, pass storage, SPA navigation events |
| `options.html`, `options.js` | Settings page |

## Permissions

- `storage`: the block list, pass length and active passes.
- `webNavigation`: detects URL changes that happen without a page reload.
- A content script on all `http`/`https` pages: needed because the block list is
  editable. On sites that aren't in your list it only reads the list and does nothing.

## Limitations

This is a self-control aid, not an enforcement tool. You can disable or remove the
extension at any time.
