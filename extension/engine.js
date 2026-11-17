// In-page form engine. Plain HTML controls plus Workday widgets (listbox buttons, search prompts, month/year date
// parts), Angular (ng-select, mat-select) and PrimeNG. Everything works on live DOM elements.
window.ATS = window.ATS || {};
ATS.engine = (() => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const vis = e => !!e && !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
  const txt = e => (e ? (e.innerText || e.textContent || '') : '').replace(/\s+/g, ' ').trim();
  const PLACEHOLDER = /^(select one|select|choose|please select|select an option|-+|--select--|none)?$/i;
  const SUBMIT = /\bsubmit\b|send application|finish|complete application/i;
  const CONTROLS = 'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=file]):not([type=image]):not([type=reset]), select, textarea, button[aria-haspopup="listbox"], .ng-select, mat-select, .p-dropdown';
  const OPTION_SEL = '[role="listbox"] [role="option"], ul[role="listbox"] > li, [data-automation-id="promptOption"], [data-automation-id="promptLeafNode"], [data-automation-id="menuItem"], .ng-dropdown-panel .ng-option:not(.ng-option-disabled), mat-option, .p-dropdown-item, [role="option"]';
  const FIELD = '[data-automation-id^="formField-"], fieldset, .form-group, .form-field, .field, mat-form-field, [class*="form-field"], [class*="FormField"], [class*="form-element"], [class*="form-control-wrap"], [class*="question"], [class*="application-field"], li, div';
  const log = (...a) => console.log('[ATS]', ...a);
  const clean = s => (s || '').replace(/\*|\(required\)|\(optional\)|\brequired\b/gi, '').replace(/\s+/g, ' ').trim();
  const human = x => (x || '').replace(/[._\-\[\]]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim();
  const byIds = ids => ids.split(/\s+/).map(id => txt(document.getElementById(id))).filter(Boolean).join(' ');
  const panelHas = el => !!el.closest('#ats-panel');
  const AID = id => `[data-automation-id="${id}"]`;

  // ------------------------------------------------------------ labels & scanning
  function label(root, el) {
    if (el.id) { const l = root.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l && txt(l)) return txt(l); }
    if (el.getAttribute('aria-labelledby')) { const t = byIds(el.getAttribute('aria-labelledby')); if (t) return t; }
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
    const wrap = el.closest('label'); if (wrap && txt(wrap)) return txt(wrap);
    const ff = el.closest('[data-automation-id^="formField-"], mat-form-field');
    if (ff) { const l = ff.querySelector('label, legend, mat-label'); if (l && txt(l)) return txt(l); }
    let g = el;
    for (let i = 0; i < 4 && g && g.parentElement; i++) {
      g = g.parentElement.closest(FIELD) || g.parentElement; if (!g) break;
      if (i > 0 && g.querySelectorAll(CONTROLS).length > 1) break;
      const l = g.querySelector('label, legend, mat-label, [class*="label"], h3, h4'); if (l && txt(l)) return txt(l);
    }
    return el.placeholder || human(el.getAttribute('formcontrolname')) || human(el.name) || human(el.id) || human(el.getAttribute('data-automation-id')) || '';
  }
  const isRequired = (el, lab) => el.required || el.getAttribute('aria-required') === 'true' || /\*/.test(lab || '') || !!el.closest('.required, [class*="required"]');

  function scan(root = document) {
    const out = []; const seen = new Set();
    for (const el of root.querySelectorAll(CONTROLS)) {
      if (panelHas(el)) continue;
      const tag = el.tagName.toLowerCase();
      const type = (el.getAttribute('type') || tag).toLowerCase();
      if (type === 'password') continue;
      if (tag === 'input' && el.closest('.ng-select, mat-select, .p-dropdown, [role="listbox"]')) continue;
      if (type !== 'radio' && !vis(el)) continue;
      const aid = el.getAttribute('data-automation-id') || '';
      const c = { el, tag, type, aid };
      if (/^dateSection(Month|Day|Year)-input$/.test(aid)) {
        const box = el.closest('[data-automation-id^="formField-"], [data-automation-id="dateInputWrapper"], [data-automation-id="dateSection"]') || el.parentElement.parentElement;
        if (seen.has(box)) continue; seen.add(box);
        const parts = [...box.querySelectorAll('[data-automation-id^="dateSection"][data-automation-id$="-input"]')];
        const lab = box.querySelector('label, legend');
        Object.assign(c, { kind: 'wd-date', el: box, parts, question: clean(txt(lab) || label(root, el)), value: parts.map(p => p.value).join('/'), empty: parts.some(p => !p.value), required: isRequired(el, txt(lab)) });
        out.push(c); continue;
      }
      if (type === 'radio') {
        const box = el.closest('fieldset, [role="radiogroup"], [data-automation-id^="formField-"]') || el.parentElement.closest(FIELD) || el.parentElement;
        const k = el.name ? 'n:' + el.name : box;
        if (seen.has(k)) continue; seen.add(k);
        const radios = [...box.querySelectorAll('input[type="radio"]')].filter(r => !el.name || r.name === el.name);
        c.kind = 'radio'; c.radios = radios;
        c.options = radios.map(r => { const l = r.id && root.querySelector(`label[for="${CSS.escape(r.id)}"]`); return txt(l) || txt(r.closest('label')) || r.getAttribute('aria-label') || r.value || ''; });
        c.checked = radios.findIndex(r => r.checked); c.empty = c.checked < 0;
        let q = txt(box.querySelector('legend, label:not([for])'));
        if (!q || c.options.includes(q)) q = (box.getAttribute('aria-labelledby') && byIds(box.getAttribute('aria-labelledby'))) || box.getAttribute('aria-label') || '';
        if (!q) { const ff = box.closest('[data-automation-id^="formField-"]'); q = txt(ff && ff.querySelector('label, legend')); }
        const prev = box.previousElementSibling; if (!q && prev && !prev.querySelector('input')) q = txt(prev);
        if (!q) q = label(root, el);
        c.question = clean(q); c.required = isRequired(el, q);
        out.push(c); continue;
      }
      const lab = label(root, el); c.question = clean(lab); c.required = isRequired(el, lab);
      if (type === 'checkbox') { c.kind = 'checkbox'; c.checked = el.checked; }
      else if (tag === 'select') { c.kind = 'select'; c.options = [...el.options].map(o => o.text.trim()); c.value = el.options[el.selectedIndex]?.text.trim() || ''; c.empty = !c.value || PLACEHOLDER.test(c.value); }
      else if (tag === 'button') { c.kind = 'listbox'; c.value = txt(el); c.empty = PLACEHOLDER.test(c.value); }
      else if (el.classList.contains('ng-select')) { c.kind = 'ngselect'; c.value = txt(el.querySelector('.ng-value')); c.empty = !c.value; if (!c.question) { const g = el.closest('.form-group, .field, div'); c.question = clean(txt(g && g.querySelector('label'))); } }
      else if (tag === 'mat-select') { c.kind = 'matselect'; c.value = txt(el.querySelector('.mat-select-value-text, .mat-mdc-select-value-text')); c.empty = !c.value; }
      else if (el.classList.contains('p-dropdown')) { c.kind = 'pdropdown'; c.value = txt(el.querySelector('.p-dropdown-label')); c.empty = PLACEHOLDER.test(c.value) || /^empty$/i.test(c.value); }
      else if (tag === 'textarea') { c.kind = 'textarea'; c.value = el.value || ''; c.empty = !el.value; }
      else {
        const msBox = el.closest('[data-automation-id="multiSelectContainer"], [data-uxi-widget-type="selectinput"], [data-automation-id="multiselectInputContainer"]') || (aid === 'searchBox' ? el.parentElement : null);
        if (msBox || (el.placeholder === 'Search' && el.getAttribute('aria-autocomplete'))) {
          const box = msBox || el.closest('[data-automation-id^="formField-"]') || el.parentElement;
          c.kind = 'multiselect'; c.box = box;
          c.selected = [...box.querySelectorAll('[data-automation-id="selectedItem"]')].map(txt).filter(Boolean);
          if (!c.selected.length) { const ff = el.closest('[data-automation-id^="formField-"]'); if (ff) c.selected = [...ff.querySelectorAll('[data-automation-id="selectedItem"]')].map(txt).filter(Boolean); }
          c.value = c.selected.join(', '); c.empty = !c.selected.length;
          if (!c.question || /^search$/i.test(c.question)) { const ff = el.closest('[data-automation-id^="formField-"]'); const l = ff && ff.querySelector('label, legend'); if (l) c.question = clean(txt(l)); }
        } else {
          c.kind = 'text'; c.value = el.value || ''; c.empty = !el.value; c.readonly = el.readOnly;
          c.date = type === 'date' || /date|dob|birth|calendar|datepicker/i.test(el.className + ' ' + el.id + ' ' + el.name + ' ' + (el.getAttribute('data-provide') || ''));
          c.combobox = el.getAttribute('role') === 'combobox' || el.getAttribute('aria-autocomplete') === 'list';
          c.numeric = type === 'number' || ['numeric', 'decimal'].includes(el.getAttribute('inputmode'));
        }
      }
      out.push(c);
    }
    return out;
  }

  // ------------------------------------------------------------ typing & clicking
  function setNative(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const set = Object.getOwnPropertyDescriptor(proto, 'value'); if (set && set.set) set.set.call(el, value); else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const submitLike = el => !!el && SUBMIT.test(((el.getAttribute && el.getAttribute('aria-label')) || '') + ' ' + (el.innerText || el.value || ''));
  function click(el) { if (!el) return false; if (submitLike(el)) { console.warn('[ATS] refused to click submit-like control', el); return false; } el.scrollIntoView({ block: 'center' }); el.click(); return true; }
  async function fillText(el, value) {
    el.scrollIntoView({ block: 'center' }); el.focus(); el.click?.();
    setNative(el, String(value));
    el.dispatchEvent(new Event('blur', { bubbles: true })); el.blur();
    await sleep(120); return true;
  }
  async function fillIfEmpty(el, value, name, res) {
    if (!el || value == null || value === '' || value === 'FILL_ME') return false;
    if (el.value) return false;
    await fillText(el, value); if (res) res.filled++; log(`${name || 'field'} -> ${String(value).slice(0, 80)}`); return true;
  }

  // ------------------------------------------------------------ option widgets
  async function visibleOptions(timeout = 2500, accept) {
    const t0 = Date.now();
    while (true) {
      const items = [...document.querySelectorAll(OPTION_SEL)].filter(vis).filter(e => !panelHas(e)).map(e => ({ el: e, t: txt(e) })).filter(x => x.t && (!accept || accept.test(x.t)));
      if (items.length || Date.now() - t0 > timeout) return items;
      await sleep(150);
    }
  }
  async function chooseVisible(prefs, { timeout, accept, firstIfNone } = {}) {
    const items = await visibleOptions(timeout, accept);
    let choice = ATS.pickOption(items.map(x => x.t), prefs);
    if (choice == null && firstIfNone && items.length) choice = items[0].t;
    if (choice == null) return null;
    const it = items.find(x => x.t === choice); it.el.scrollIntoView({ block: 'nearest' }); it.el.click(); await sleep(350);
    return choice;
  }
  async function closePopup() {
    const a = document.activeElement || document.body;
    a.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
    a.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
    await sleep(150);
    if ((await visibleOptions(0)).length) { document.body.click(); await sleep(150); }
  }
  async function pickListbox(btn, prefs) {
    btn.scrollIntoView({ block: 'center' }); btn.click(); await sleep(450);
    const choice = await chooseVisible(prefs);
    if (choice == null) { await closePopup(); return null; }
    await sleep(200);
    if (PLACEHOLDER.test(txt(btn))) return null;
    return choice;
  }
  async function pickMultiselect(input, prefs, { accept } = {}) {
    for (const pref of (Array.isArray(prefs) ? prefs : [prefs])) {
      if (!pref) continue;
      input.scrollIntoView({ block: 'center' }); input.focus(); input.click();
      setNative(input, ''); setNative(input, String(pref));
      await sleep(900);
      const choice = await chooseVisible(pref, { timeout: 1500, accept, firstIfNone: !!accept });
      if (choice != null) { await sleep(500); await closePopup(); return choice; }
      await closePopup();
    }
    setNative(input, '');
    return null;
  }
  async function pickNgSelect(el, prefs) {
    el.scrollIntoView({ block: 'center' }); el.click(); await sleep(300);
    const inp = el.querySelector('input'); const list = Array.isArray(prefs) ? prefs : [prefs];
    for (const pref of list) { if (inp) { setNative(inp, String(pref)); await sleep(700); } const c = await chooseVisible(pref, { timeout: 1500 }); if (c != null) return c; }
    if (inp) setNative(inp, ''); await sleep(300);
    const c = await chooseVisible(list); if (c == null) await closePopup(); return c;
  }
  async function pickClickOpen(el, prefs) { el.scrollIntoView({ block: 'center' }); el.click(); await sleep(350); const c = await chooseVisible(prefs); if (c == null) await closePopup(); return c; }
  async function pickAny(el, prefs, opts = {}) {
    if (!el) return null;
    const tag = el.tagName.toLowerCase();
    if (tag === 'button') return pickListbox(el, prefs);
    if (tag === 'input') return pickMultiselect(el, prefs, opts);
    if (tag === 'select') { const o = [...el.options].map(x => x.text.trim()); const c = ATS.pickOption(o, prefs); if (c) { el.value = [...el.options].find(x => x.text.trim() === c).value; el.dispatchEvent(new Event('change', { bubbles: true })); } return c; }
    const inner = el.querySelector('button[aria-haspopup="listbox"], input:not([type=hidden]), select');
    return inner ? pickAny(inner, prefs, opts) : null;
  }
  function isSet(el) {
    if (!el) return false;
    if (el.tagName === 'BUTTON') return !PLACEHOLDER.test(txt(el));
    if ((el.tagName === 'INPUT' || el.tagName === 'SELECT') && el.value && !PLACEHOLDER.test(el.value)) return true;
    const box = el.closest('[data-automation-id^="formField-"]') || el;
    if (box.querySelector('[data-automation-id="selectedItem"]')) return true;
    const b = el.querySelector && el.querySelector('button[aria-haspopup="listbox"]'); if (b) return !PLACEHOLDER.test(txt(b));
    return false;
  }
  function selectedText(el) {
    if (!el) return '';
    if (el.tagName === 'BUTTON') return txt(el);
    const box = el.closest('[data-automation-id^="formField-"]') || el;
    return [...box.querySelectorAll('[data-automation-id="selectedItem"]')].map(txt).join(', ') || (el.value || '');
  }
  async function clearSelected(el) {
    const box = el.closest('[data-automation-id^="formField-"]') || el;
    for (let i = 0; i < 5; i++) {
      const pill = box.querySelector('[data-automation-id="selectedItem"]'); if (!pill) return;
      const del = pill.querySelector('[data-automation-id="DELETE_charm"], button, [role="button"]'); (del || pill).click(); await sleep(300);
    }
  }

  // ------------------------------------------------------------ dates
  function parseDate(v) {
    v = String(v).trim(); let m;
    if ((m = v.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/))) return { day: +m[1], month: +m[2], year: +m[3] };
    if ((m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return { day: +m[3], month: +m[2], year: +m[1] };
    if ((m = v.match(/^(\d{1,2})[\/.-](\d{4})$/))) return { month: +m[1], year: +m[2] };
    if ((m = v.match(/^(\d{4})$/))) return { year: +m[1] };
    return null;
  }
  async function fillWdDate(box, value) {
    const d = parseDate(value); if (!d) return false; let ok = false;
    for (const [part, val] of [['month', d.month], ['day', d.day], ['year', d.year]]) {
      if (val == null) continue;
      const inp = box.querySelector(`[data-automation-id="dateSection${part[0].toUpperCase() + part.slice(1)}-input"]`); if (!inp) continue;
      const s = part === 'year' ? String(val) : String(val).padStart(2, '0');
      inp.focus(); inp.click(); setNative(inp, s); await sleep(120);
      if (inp.value.replace(/^0+/, '') !== s.replace(/^0+/, '')) { inp.focus(); inp.select?.(); document.execCommand && document.execCommand('insertText', false, s); await sleep(120); }
      ok = ok || !!inp.value; inp.dispatchEvent(new Event('blur', { bubbles: true }));
    }
    return ok;
  }

  // ------------------------------------------------------------ set one control
  async function setValue(c, value) {
    const v = Array.isArray(value) ? value[0] : value;
    switch (c.kind) {
      case 'checkbox': { const want = /^(yes|true|check|on|1)$/i.test(String(v)); if (want !== !!c.el.checked) { const l = c.el.id && document.querySelector(`label[for="${CSS.escape(c.el.id)}"]`); click(l && txt(l) ? l : c.el); if (c.el.checked !== want) { c.el.checked = want; c.el.dispatchEvent(new Event('change', { bubbles: true })); } } return true; }
      case 'radio': { const choice = ATS.pickOption(c.options, value); if (choice == null) return false; const r = c.radios[c.options.indexOf(choice)]; const l = r.id && document.querySelector(`label[for="${CSS.escape(r.id)}"]`); click(l && txt(l) ? l : r); if (!r.checked) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); } return true; }
      case 'select': { const choice = ATS.pickOption(c.options, value); if (choice == null) return false; const o = [...c.el.options].find(x => x.text.trim() === choice); c.el.value = o.value; c.el.dispatchEvent(new Event('input', { bubbles: true })); c.el.dispatchEvent(new Event('change', { bubbles: true })); return true; }
      case 'listbox': return (await pickListbox(c.el, value)) != null;
      case 'multiselect': return (await pickMultiselect(c.el, value)) != null;
      case 'ngselect': return (await pickNgSelect(c.el, value)) != null;
      case 'matselect': case 'pdropdown': return (await pickClickOpen(c.el, value)) != null;
      case 'wd-date': return fillWdDate(c.el, v);
      case 'textarea': return fillText(c.el, v);
      case 'text': {
        let s = String(v); if (c.numeric) s = (s.match(/\d+(\.\d+)?/) || [s])[0];
        if (c.type === 'date') { const d = parseDate(s); if (!d || !d.day) return false; setNative(c.el, `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`); return true; }
        if (c.readonly && !c.date) return false;
        if (c.readonly) { c.el.removeAttribute('readonly'); setNative(c.el, s); c.el.dispatchEvent(new Event('blur', { bubbles: true })); return !!c.el.value; }
        if (c.combobox) { c.el.focus(); setNative(c.el, s); await sleep(1100); const p = await chooseVisible(s, { timeout: 1500 }); if (!p) { c.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); c.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); } return true; }
        return fillText(c.el, s);
      }
    }
    return false;
  }

  // ------------------------------------------------------------ catch-all pass
  async function fillGeneric(root, { answers, overwrite = false, skip = () => false } = {}) {
    const res = { filled: 0, unknown: [] };
    for (const c of scan(root)) {
      if (!c.question || skip(c)) continue;
      if (!document.contains(c.el)) continue;
      try {
        if (c.kind === 'checkbox') { const a = answers.answerFor(c.question); if (a && a !== 'SKIP' && /^(yes|true|check|on)$/i.test(a) && !c.el.checked) { await setValue(c, a); res.filled++; log('☑ ' + c.question); } continue; }
        if (!c.empty && !overwrite) continue;
        if (c.readonly && !c.date) continue;
        const hit = answers.lookup(c.question); const a = hit ? hit.answer : null;
        if (a === 'SKIP') continue;
        const options = c.options ? c.options.filter(o => o && !PLACEHOLDER.test(o)) : null;
        const unk = extra => res.unknown.push({ question: c.question, options, required: !!c.required, kind: c.kind, c, ...extra });
        if (a == null) { unk({}); continue; }
        if (options && ATS.pickOption(options, a) == null) { unk({ tried: a }); continue; }
        const ok = await setValue(c, a);
        if (ok) { res.filled++; log(`${c.question} -> ${String(a).slice(0, 80)}`); } else { unk({ tried: a }); log(`could not set "${c.question}" (${c.kind}) to "${a}"`); }
        await sleep(120);
      } catch (e) { log(`could not fill "${c.question}": ${e.message}`); }
    }
    return res;
  }

  // ------------------------------------------------------------ resume upload
  let resumeFile = null;
  async function getResume(name) {
    if (resumeFile) return resumeFile;
    const url = chrome.runtime.getURL(name || 'resume.pdf');
    const blob = await (await fetch(url)).blob();
    resumeFile = new File([blob], name || 'resume.pdf', { type: 'application/pdf' });
    return resumeFile;
  }
  async function uploadResume(root, file, { force = false, scope } = {}) {
    const inputs = [...(scope || root).querySelectorAll('input[type="file"]')].filter(e => !panelHas(e));
    const infos = inputs.map(el => {
      const lab = (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) || el.closest('label');
      const box = el.closest('[data-automation-id^="formField-"], [data-automation-id$="Section"], .form-group, .field, [class*="upload"], [class*="dropzone"]') || el.parentElement;
      const already = !!(box && (box.querySelector('[data-automation-id="file-upload-successful"], [data-automation-id="file-upload-item"], [class*="uploaded"], [class*="file-name"], [class*="filename"]') || /\.(pdf|docx?)\b/i.test(txt(box))));
      return { el, has: el.files.length > 0 || already, ctx: [el.name, el.id, el.getAttribute('data-automation-id'), el.getAttribute('aria-label'), el.accept, txt(lab), txt(box).slice(0, 160)].join(' ') };
    });
    for (const f of infos) {
      if (f.has && !force) continue;
      if (/cover|photo|image|avatar|transcript|portfolio|certificate|id proof|aadhaar|pan\b/i.test(f.ctx)) continue;
      if (!(/resume|\bcv\b|curriculum|file-upload|upload/i.test(f.ctx) || infos.length === 1)) continue;
      try {
        const dt = new DataTransfer(); dt.items.add(file); f.el.files = dt.files;
        f.el.dispatchEvent(new Event('input', { bubbles: true })); f.el.dispatchEvent(new Event('change', { bubbles: true }));
        log('resume uploaded'); await sleep(2500); return true;
      } catch (e) { log('resume upload failed: ' + e.message); }
    }
    return false;
  }

  // ------------------------------------------------------------ buttons, errors, signature
  function findButton(root, re, avoid = SUBMIT) {
    const t = e => ((e.getAttribute('aria-label') || '') + ' ' + (e.innerText || e.value || '')).replace(/\s+/g, ' ').trim();
    return [...root.querySelectorAll('button, a, input[type=button], [role="button"]')].find(e => vis(e) && !e.disabled && !panelHas(e) && re.test(t(e)) && !avoid.test(t(e))) || null;
  }
  function clickButton(root, re, avoid) { const b = findButton(root, re, avoid); if (!b) return null; click(b); return txt(b) || b.getAttribute('aria-label') || 'button'; }
  const hasSubmit = root => [...root.querySelectorAll('button, input[type=submit], a')].some(e => vis(e) && !panelHas(e) && SUBMIT.test((e.getAttribute('aria-label') || '') + ' ' + (e.innerText || e.value || '')));
  function errors(root = document) {
    const sel = '[data-automation-id="errorMessage"], [data-automation-id="errorBanner"], [role="alert"], .invalid-feedback, .text-danger, .error-message, .field-error, .mat-error, .help-block, .validation-message, [class*="error-text"], [class*="errorText"], [class*="ErrorMessage"]';
    return [...new Set([...root.querySelectorAll(sel)].filter(e => vis(e) && !panelHas(e)).map(e => txt(e)).filter(t => t && t.length < 200))].slice(0, 12);
  }
  const signature = () => location.href.split('#')[0] + '|' + [...document.querySelectorAll('h1, h2, [data-automation-id="progressBarActiveStep"]')].filter(vis).map(txt).join('/') + '|' +
    [...document.querySelectorAll('button')].filter(e => vis(e) && !panelHas(e)).slice(0, 12).map(txt).join(',') + '|' +
    [...document.querySelectorAll(CONTROLS)].filter(e => vis(e) && !panelHas(e)).map(e => e.getAttribute('data-automation-id') || e.id || e.name || e.getAttribute('aria-label') || e.getAttribute('formcontrolname') || '').join('|');

  return { sleep, vis, txt, log, clean, AID, PLACEHOLDER, SUBMIT, scan, setNative, click, submitLike, fillText, fillIfEmpty, visibleOptions, chooseVisible, closePopup, pickListbox, pickMultiselect, pickNgSelect, pickClickOpen, pickAny, isSet, selectedText, clearSelected, parseDate, fillWdDate, setValue, fillGeneric, getResume, uploadResume, findButton, clickButton, hasSubmit, errors, signature };
})();
