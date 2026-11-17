// ATS Apply Helper: floating panel + watch loop. Fills each page as it appears, asks you only for unknown questions,
// remembers your answers, auto-clicks Next/Save and Continue. HARD RULE: it never clicks anything submit-like.
(async () => {
  if (window.top !== window) return;
  if (window.__atsLoaded) return; window.__atsLoaded = true;
  const E = ATS.engine; const { sleep, txt, vis } = E;
  let S = await chrome.storage.local.get(['profile', 'learned', 'settings', 'profileLoadedAt', 'profileMissing']);
  if (!S.profile) { await chrome.runtime.sendMessage({ type: 'reseed' }).catch(() => {}); S = await chrome.storage.local.get(['profile', 'learned', 'settings', 'profileLoadedAt', 'profileMissing']); }
  S.learned = S.learned || []; S.settings = S.settings || {};
  const answers = new ATS.Answers(S.profile || {}, S.learned);
  const escapeRe = s => s.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const adapter = () => Object.values(ATS.adapters).find(a => a.matches(location.href)) || ATS.adapters.generic;
  let resumeFile = null; try { resumeFile = await E.getResume((S.profile && S.profile.resumePath || 'resume.pdf').replace(/^.*\//, '')); } catch (e) { console.warn('[ATS] resume.pdf not found in extension folder (run node sync-extension.js)'); }

  // ---------- panel (its own <form>, so nothing inside it can reach the site's form) ----------
  const panel = document.createElement('form'); panel.id = 'ats-panel'; panel.setAttribute('autocomplete', 'off');
  const h4 = document.createElement('h4'); const t = document.createElement('span'); t.textContent = '⚡ ATS Apply Helper';
  const mk = (tag, props = {}, text) => { const el = document.createElement(tag); Object.assign(el, props); if (text != null) el.textContent = text; return el; };
  const min = mk('button', { type: 'button', className: 'ats-secondary' }, '–'); const rl = mk('button', { type: 'button', className: 'ats-secondary', title: 'Reload the extension from disk (after node sync-extension.js)' }, '↻');
  rl.onclick = () => chrome.runtime.sendMessage({ type: 'reloadExt' }); min.onclick = () => panel.classList.toggle('ats-min');
  const grp = mk('span'); grp.append(rl, document.createTextNode(' '), min); h4.append(t, grp); panel.appendChild(h4);
  const statusEl = mk('div', { className: 'ats-status' }), unknownEl = mk('div'), actionsEl = mk('div', { className: 'ats-row' }), hintEl = mk('div', { className: 'ats-small' });
  panel.append(statusEl, unknownEl, actionsEl, hintEl);
  panel.addEventListener('submit', e => { e.preventDefault(); e.stopPropagation(); });
  panel.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); e.stopPropagation(); } });
  document.documentElement.appendChild(panel);
  const status = s => { statusEl.textContent = s; };
  const btn = (label, fn, secondary) => { const b = mk('button', { type: 'button', className: secondary ? 'ats-secondary' : '' }, label); b.onclick = fn; actionsEl.appendChild(b); return b; };

  // ---------- step runner ----------
  const state = {}; let lastSig = '', autoClickedFor = '', pending = [], running = false, lastRes = null, total = 0;
  const nextButton = () => { const r = lastRes; if (r && r.advance) return true; return !!E.findButton(document, /^(next|continue|save and continue|save & continue|proceed)\b/i); };
  async function runStep(reason) {
    if (running) return; running = true;
    try {
      const sig = E.signature(); lastSig = sig;
      const ad = adapter();
      let r; try { r = await ad.step({ profile: S.profile || {}, answers, resumeFile, opts: { autofill: S.settings.autofill === true }, state }); }
      catch (e) { console.error('[ATS]', e); status('Error: ' + e.message); return; }
      lastRes = r;
      if (r.status === 'navigating') { status('Opening the application…'); lastSig = ''; return; }
      if (r.status === 'login') { status(r.message || 'Sign in / create the Workday account; the helper continues afterwards.'); lastSig = ''; return; }
      if (r.status === 'waiting') { status('No form here yet. Open the application (Apply) and I will fill it.'); return; }
      total += r.filled;
      pending = r.unknown.filter(u => !(u.kind === 'checkbox')); renderUnknown();
      const required = pending.filter(u => u.required).length;
      const errs = r.errors || [];
      if (r.status === 'review') { status(`Filled ${r.filled} here (${total} total). Final page: REVIEW IT, then click Submit yourself.`); return; }
      if (errs.length) { status(`Filled ${r.filled}. The page shows errors: ${errs.slice(0, 3).join(' | ')}. Fix them, then click Next.`); return; }
      if (required) { status(`Filled ${r.filled}. ${pending.length} question(s) need you ↓ (${required} required), then "Save & Next".`); return; }
      status(`Filled ${r.filled} field(s) on "${r.title || 'this page'}".` + (pending.length ? ` ${pending.length} optional unknown(s) ↓` : ''));
      if (S.settings.autoNext !== false && r.canAdvance && r.advance && E.signature() !== autoClickedFor) {
        autoClickedFor = E.signature(); await sleep(800);
        const t = r.advance(); if (t) { status(`Clicked "${t}"…`); lastSig = ''; }
      }
    } finally { running = false; }
  }
  function renderUnknown() {
    unknownEl.replaceChildren();
    pending.forEach((u, i) => {
      const q = mk('div', { className: 'ats-q' }); q.appendChild(mk('label', {}, u.question + (u.required ? ' *' : '')));
      let input;
      if (u.options && u.options.length) { input = mk('select'); input.appendChild(mk('option', { value: '' }, '— choose —')); for (const o of u.options) input.appendChild(mk('option', {}, o)); }
      else if (u.kind === 'textarea') { input = mk('textarea'); input.rows = 3; }
      else { input = mk('input', { placeholder: u.kind === 'wd-date' ? 'DD/MM/YYYY or MM/YYYY' : 'answer' }); }
      input.dataset.i = i; q.appendChild(input); unknownEl.appendChild(q);
    });
    if (pending.length) { const b = mk('button', { type: 'button' }, 'Save & Next ▶'); b.onclick = saveAndNext; unknownEl.appendChild(b); }
  }
  async function saveAndNext() {
    for (const inp of [...unknownEl.querySelectorAll('input, select, textarea')]) {
      const u = pending[+inp.dataset.i]; const v = inp.value.trim(); if (!v) continue;
      if (u.c) await E.setValue(u.c, v); else if (u.pickEl) await E.pickAny(u.pickEl, [v]);
      if (/^(month|year|day|date|from|to|start|end)$/i.test(u.question) || /#\d+$/.test(u.question)) continue;  // context-free labels are never memorised
      const key = '^' + escapeRe(u.question) + '$';
      S.learned = S.learned.filter(l => l.match[0] !== key); S.learned.unshift({ match: [key], answer: v });
    }
    await chrome.storage.local.set({ learned: S.learned });
    pending = []; renderUnknown(); autoClickedFor = ''; lastSig = '';
    if (lastRes && lastRes.advance && !(E.errors().length)) { const t = lastRes.advance(); if (t) status(`Clicked "${t}"…`); else await runStep('manual'); }
    else await runStep('manual');
  }

  btn('Fill this page', () => { lastSig = ''; runStep('manual'); });
  btn('Next ▶', () => { if (lastRes && lastRes.advance) { const t = lastRes.advance(); if (!t) status('No Next button (never clicks Submit).'); } else { const t = E.clickButton(document, /^(next|continue|save and continue|save & continue|proceed)\b/i); if (!t) status('No Next button (never clicks Submit).'); } }, true);
  const an = mk('label', { className: 'ats-small' }); const cb = mk('input', { type: 'checkbox', checked: S.settings.autoNext !== false }); cb.onchange = async () => { S.settings.autoNext = cb.checked; await chrome.storage.local.set({ settings: S.settings }); }; an.append(cb, document.createTextNode(' auto-Next')); actionsEl.appendChild(an);
  hintEl.textContent = (S.profileMissing ? '⚠ profile.json missing in the extension folder: run node sync-extension.js, then ↻. ' : '') + (resumeFile ? '' : '⚠ resume.pdf missing (node sync-extension.js). ') + `Alt+F fill · Alt+N next. Submit is always your click. Profile loaded ${S.profileLoadedAt ? new Date(S.profileLoadedAt).toLocaleString() : '?'}; ${S.learned.length} learned answer(s).`;
  document.addEventListener('keydown', e => { if (!e.altKey) return; const k = e.key.toLowerCase(); if (k === 'f') { lastSig = ''; runStep('manual'); } else if (k === 'n') { if (lastRes && lastRes.advance) lastRes.advance(); else E.clickButton(document, /^(next|continue|save and continue|proceed)\b/i); } });

  // ---------- watch: fill whenever the page changes (SPA navigation, new step, modal) ----------
  let timer = null;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(() => { if (!running && E.signature() !== lastSig) runStep('auto'); }, 900); };
  new MutationObserver(records => { if (records.every(r => panel.contains(r.target))) return; schedule(); }).observe(document.body, { childList: true, subtree: true });
  setInterval(() => { if (!running && E.signature() !== lastSig) runStep('auto'); }, 2500);
  status('Watching this page…'); schedule();
})();
