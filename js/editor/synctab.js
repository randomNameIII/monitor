// Sync tab: GitHub Gist setup, the display link, and backup/restore.

import { state, prefs, publish, replaceConfig, onChange } from './state.js';
import { createGist, fetchGist } from '../core/sync.js';
import { defaultConfig } from '../core/config.js';
import { esc } from '../core/util.js';
import { toast } from './ui.js';

const root = document.getElementById('syncPage');
const baseUrl = () => new URL('.', location.href).href;
const displayUrl = () => `${baseUrl()}display.html?gist=${encodeURIComponent(prefs.gist)}`;

// "Connect another computer" links carry the gist and token after the #, which browsers never send
// to the server. Anyone with the link can edit the board, so it's shown only on request.
const b64 = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
const connectUrl = () => `${baseUrl()}editor.html#connect=${b64(JSON.stringify({ g: prefs.gist, t: prefs.token }))}`;

export function readConnectLink() {
  const m = location.hash.match(/^#connect=([\w-]+)/);
  if (!m) return null;
  try {
    const j = JSON.parse(unb64(m[1]));
    return j.g && j.t ? { gist: j.g, token: j.t } : null;
  } catch { return null; }
}
let showConnect = false;

function render() {
  const hasToken = !!prefs.token;
  const hasGist = !!prefs.gist;
  root.innerHTML = `
    <h1>Sync</h1>
    <p class="lead">The wall display reads your board from a private GitHub Gist. Your token stays in this browser; the display never needs it.</p>

    <section class="card form-section">
      <h2>Try it on this computer</h2>
      <p>Open the display in another tab or window. It updates instantly as you edit here, no GitHub needed.</p>
      <a class="btn" href="display.html?local" target="_blank" rel="noopener">Open local display</a>
    </section>

    <section class="card form-section steps">
      <h2>Connect the wall display</h2>
      <ol>
        <li class="${hasToken ? 'done' : ''}">
          <h3>Add a GitHub token</h3>
          <p>Create a classic token with only the <b>gist</b> scope, then paste it here.
            <a href="https://github.com/settings/tokens/new?scopes=gist&description=Dusk%20board" target="_blank" rel="noopener">Create a token on GitHub</a></p>
          ${hasToken
            ? `<div class="row"><span class="ok-text">Token saved in this browser</span><button class="link danger" id="forgetToken">Remove</button></div>`
            : `<div class="row"><input id="tokenInput" type="password" placeholder="ghp_…" autocomplete="off" spellcheck="false"><button class="btn" id="saveToken">Save token</button></div>`}
        </li>
        <li class="${hasGist ? 'done' : ''}">
          <h3>Choose where to store the board</h3>
          ${hasGist
            ? `<div class="row"><span class="ok-text">Using gist <a href="https://gist.github.com/${esc(prefs.gist)}" target="_blank" rel="noopener"><code>${esc(prefs.gist.slice(0, 10))}…</code></a></span>
                 <button class="link" id="pullGist">Load board from gist</button><button class="link danger" id="forgetGist">Disconnect</button></div>`
            : `<p>Make a new private gist, or reuse one you made earlier (for example when setting up a second computer).</p>
               <div class="row"><button class="btn primary" id="newGist" ${hasToken ? '' : 'disabled'}>Create a private gist</button></div>
               <div class="row"><input id="gistInput" placeholder="Existing gist ID" spellcheck="false"><button class="btn" id="useGist">Use this gist</button></div>`}
        </li>
        <li class="${hasGist ? '' : 'locked'}">
          <h3>Open this link on the wall computer</h3>
          ${hasGist
            ? `<div class="row"><input id="displayLink" readonly value="${esc(displayUrl())}"><button class="btn" id="copyLink">Copy</button></div>
               <p class="muted">The display remembers the gist after the first visit, so later you can open plain <code>display.html</code>.
                 It checks for changes every ${state.cfg.board.pollSeconds} seconds.</p>`
            : '<p class="muted">Available after step 2.</p>'}
        </li>
      </ol>
      <label class="toggle inline"><input type="checkbox" id="autoPub" ${prefs.autopublish ? 'checked' : ''}><span class="switch" aria-hidden="true"></span>
        <span>Publish automatically a few seconds after each change</span></label>
    </section>

    <section class="card form-section" id="otherComputers">
      <h2>Edit from other computers</h2>
      ${hasToken && hasGist ? `
        <p>Open the editor on a laptop or another desktop and add to your schedule there. Every computer edits the same board:
          changes are published to the gist and picked up by the others within about 30 seconds. If two computers change things at
          the same time, both sets of changes are kept.</p>
        ${showConnect ? `
          <div class="row"><input id="connectLink" readonly value="${esc(connectUrl())}"><button class="btn" id="copyConnect">Copy</button></div>
          <p class="warn-text">This link includes your GitHub token, so anyone who has it can change your board. Send it only to yourself
            (an email or note to yourself is fine), and don’t post it anywhere. You can revoke the token on GitHub at any time.</p>
          <button class="link" id="hideConnect">Hide link</button>`
        : '<div class="row"><button class="btn primary" id="makeConnect">Get a link for another computer</button></div>'}
        <p class="muted">Or, on the other computer, open <code>${esc(baseUrl())}editor.html</code>, go to Sync, and paste the same token and the gist ID <code>${esc(prefs.gist)}</code>.</p>`
      : '<p class="muted">Set up sync above first. Then you can open the editor on any computer and add things to your schedule there.</p>'}
    </section>

    <section class="card form-section">
      <h2>Backup</h2>
      <p>The whole board, panels, events and settings, is one JSON file.</p>
      <div class="row">
        <button class="btn" id="exportBtn">Download backup</button>
        <label class="btn file-btn">Restore from file<input type="file" id="importInput" accept="application/json,.json" hidden></label>
        <span class="spacer"></span>
        <button class="btn danger" id="resetBtn">Start over with the sample board</button>
      </div>
    </section>`;

  const on = (id, ev, fn) => document.getElementById(id)?.addEventListener(ev, fn);

  on('saveToken', 'click', () => {
    const v = document.getElementById('tokenInput').value.trim();
    if (!v) return toast('Paste a token first', true);
    prefs.token = v; render(); toast('Token saved');
  });
  on('tokenInput', 'keydown', (e) => { if (e.key === 'Enter') document.getElementById('saveToken').click(); });
  on('forgetToken', 'click', () => { prefs.token = ''; render(); toast('Token removed from this browser'); });

  on('newGist', 'click', async (e) => {
    e.target.disabled = true; e.target.textContent = 'Creating…';
    try {
      prefs.gist = await createGist(prefs.token, state.cfg);
      prefs.publishedAt = state.cfg.updatedAt;
      render(); toast('Gist created and board published');
    } catch (err) { toast(err.message, true); render(); }
  });
  on('useGist', 'click', async () => {
    const v = document.getElementById('gistInput').value.trim().replace(/^.*gist\.github\.com\/(?:[^/]+\/)?/, '').replace(/[/#?].*$/, '');
    if (!v) return toast('Paste a gist ID or link first', true);
    try {
      const cfg = await fetchGist(v, prefs.token);
      prefs.gist = v;
      if (confirm('Load the board stored in this gist? This replaces the board in the editor (you can undo).')) {
        replaceConfig(cfg); prefs.publishedAt = state.cfg.updatedAt;
      }
      render(); toast('Gist connected');
    } catch (err) { toast(err.message, true); }
  });
  on('pullGist', 'click', async () => {
    try {
      const cfg = await fetchGist(prefs.gist, prefs.token);
      replaceConfig(cfg); prefs.publishedAt = state.cfg.updatedAt;
      toast('Loaded the board from the gist');
    } catch (err) { toast(err.message, true); }
  });
  on('forgetGist', 'click', () => { prefs.gist = ''; render(); toast('Disconnected. The gist itself is untouched.'); });

  on('makeConnect', 'click', () => { showConnect = true; render(); document.getElementById('connectLink')?.select(); });
  on('hideConnect', 'click', () => { showConnect = false; render(); });
  on('copyConnect', 'click', async () => {
    const input = document.getElementById('connectLink');
    try { await navigator.clipboard.writeText(input.value); } catch { input.select(); document.execCommand('copy'); }
    toast('Link copied. Open it on the other computer.');
  });

  on('copyLink', 'click', async () => {
    const input = document.getElementById('displayLink');
    try { await navigator.clipboard.writeText(input.value); } catch { input.select(); document.execCommand('copy'); }
    toast('Display link copied');
  });
  on('autoPub', 'change', (e) => {
    prefs.autopublish = e.target.checked;
    if (e.target.checked && prefs.token && prefs.gist) publish().catch(() => {});
  });

  on('exportBtn', 'click', () => {
    const blob = new Blob([JSON.stringify(state.cfg, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dusk-board-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  on('importInput', 'change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try { replaceConfig(JSON.parse(await f.text())); toast('Board restored from file'); }
    catch { toast('That file isn’t a valid board backup', true); }
  });
  on('resetBtn', 'click', () => {
    if (confirm('Replace everything with the sample board? You can undo this.')) { replaceConfig(defaultConfig()); toast('Started over with the sample board'); }
  });
}

export function initSyncTab() {
  render();
  onChange((reason) => { if (reason === 'board' && document.getElementById('displayLink')) render(); });
}
export { render as renderSync };
