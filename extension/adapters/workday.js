// Workday adapter (in-page). Job page -> Apply -> Use My Last Application / Apply Manually -> account -> My Information ->
// My Experience -> Application Questions -> Voluntary Disclosures -> Self Identify -> Review (STOP: you click Submit).
window.ATS = window.ATS || {}; ATS.adapters = ATS.adapters || {};
ATS.adapters.workday = (() => {
  const E = ATS.engine; const { sleep, vis, txt, log, AID } = E;
  const q = sel => [...document.querySelectorAll(sel)].find(vis) || null;      // first VISIBLE match
  const qa = (sel, root = document) => [...root.querySelectorAll(sel)].filter(vis);
  const has = sel => !!q(sel);
  // by URL, or by Workday's markup (some companies host Workday on their own domain)
  const matches = url => /myworkdayjobs\.com|myworkdaysite\.com|\/wday\//i.test(url)
    || !!document.querySelector('[data-automation-id="adventureButton"], [data-automation-id="applyManually"], [data-automation-id="useMyLastApplication"], [data-automation-id="progressBar"], [data-automation-id^="formField-"], [data-automation-id="signInSubmitButton"], [data-automation-id="createAccountSubmitButton"]');

  async function step(ctx) {
    const { profile, answers, opts, state } = ctx;
    const res = { status: 'waiting', filled: 0, unknown: [], errors: [], canAdvance: false, title: '' };
    // 1. job page
    if (has(AID('adventureButton')) && !has(AID('applyManually'))) { E.click(q(AID('adventureButton'))); log('clicked Apply'); await sleep(2500); res.status = 'navigating'; return res; }
    // 2. apply options
    if (has(AID('applyManually')) || has(AID('autofillWithResume')) || has(AID('useMyLastApplication'))) {
      const mode = opts.autofill ? 'autofill' : ((profile.workday || {}).applyMode || 'last');
      const order = mode === 'autofill' ? ['autofillWithResume', 'applyManually', 'useMyLastApplication'] : mode === 'manual' ? ['applyManually', 'autofillWithResume', 'useMyLastApplication'] : ['useMyLastApplication', 'applyManually', 'autofillWithResume'];
      const target = order.find(t => has(AID(t)));
      E.click(q(AID(target))); log('clicked ' + target); await sleep(3000); state.autofill = target === 'autofillWithResume';
      res.status = 'navigating'; return res;
    }
    // 3. auth
    if (has('input' + AID('email')) && (has(AID('signInSubmitButton')) || has(AID('createAccountSubmitButton')))) return auth(ctx, res);
    if (/verify (your )?e-?mail|check your (e-?mail|inbox)/i.test((document.body.innerText || '').slice(0, 4000))) { res.status = 'login'; res.message = 'Workday wants you to verify your email. Click the link in the mail.'; return res; }
    // 4. autofill resume page
    if (state.autofill && !state.autofillUploaded && has('input' + AID('file-upload-input-ref')) && !has(AID('legalNameSection_firstName')) && !has(AID('workExperienceSection'))) {
      if (await E.uploadResume(document, ctx.resumeFile)) { state.autofillUploaded = true; await sleep(4000); E.clickButton(document, /^(continue|next|save and continue)\b/i); }
      res.status = 'navigating'; return res;
    }
    // 5. application pages
    const inApp = has(AID('progressBar')) || has('[data-automation-id^="formField-"]') || has(AID('legalNameSection_firstName')) || has(AID('bottom-navigation-next-button'));
    if (!inApp) return res;
    const title = stepTitle(); res.title = title; state.once = state.once || {}; onceState = state.once; onceTitle = title;
    const nextBtn = q(`${AID('bottom-navigation-next-button')}, ${AID('pageFooterNextButton')}`);
    const nextText = nextBtn ? txt(nextBtn) : '';
    log('Workday step: ' + (title || '(unnamed)'));
    if (/submit/i.test(nextText) || /^review/i.test(title)) { res.status = 'review'; const g = await E.fillGeneric(document, { answers, skip: c => c.kind !== 'checkbox' }); res.filled += g.filled; return res; }
    if (/my information|personal information|contact information|personal details/i.test(title) || has(AID('legalNameSection_firstName'))) await myInformation(ctx, res);
    if (/experience/i.test(title) || has(AID('workExperienceSection')) || has(AID('educationSection')) || has('input' + AID('file-upload-input-ref'))) await myExperience(ctx, res);
    if (/voluntary|self.?identif|disclosure|diversity|equal/i.test(title)) await voluntary(ctx, res);
    const g = await E.fillGeneric(document, { answers, skip: c => c.kind === 'wd-date' && !/date|signed|today/i.test(c.question) });
    res.filled += g.filled; res.unknown.push(...g.unknown);
    await sleep(400);
    res.errors = E.errors(document);
    res.status = 'filled';
    res.canAdvance = !!nextBtn && !/submit/i.test(nextText);
    res.advance = () => { const b = q(`${AID('bottom-navigation-next-button')}, ${AID('pageFooterNextButton')}`); if (!b || /submit/i.test(txt(b))) return null; E.click(b); return txt(b) || 'Next'; };
    return res;
  }
  const stepTitle = () => { const a = q(AID('progressBarActiveStep')); const h = qa('h2, h1, h3').find(e => txt(e) && txt(e).length < 60); return ((a && txt(a)) || txt(h)).replace(/current step \d+ of \d+/i, '').trim(); };

  async function auth(ctx, res) {
    const { profile, answers, state } = ctx; res.status = 'login';
    const email = answers.ref((profile.account || {}).email || '@personal.email'); const pw = answers.ref((profile.account || {}).workdayPassword);
    if (answers.isUnknown(pw)) { res.message = 'Set account.workdayPassword in profile.json (then node sync-extension.js + reload), or sign in by hand.'; return res; }
    state.auth = state.auth || { create: 0, signin: 0 };
    const errText = E.errors().join(' ');
    if (has(AID('createAccountSubmitButton'))) {
      if (/already (exists|have|registered)|in use/i.test(errText) || state.auth.create >= 2) { if (has(AID('signInLink'))) { E.click(q(AID('signInLink'))); log('account exists, switching to Sign In'); await sleep(1500); } return res; }
      state.auth.create++; log('creating Workday account for ' + email);
      await E.fillText(q('input' + AID('email')), email); await E.fillText(q('input' + AID('password')), pw);
      if (has('input' + AID('verifyPassword'))) await E.fillText(q('input' + AID('verifyPassword')), pw);
      const cb = q('input' + AID('createAccountCheckbox')); if (cb && !cb.checked) { const l = cb.id && document.querySelector(`label[for="${CSS.escape(cb.id)}"]`); (l || cb).click(); if (!cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); } }
      await sleep(300); E.click(q(AID('createAccountSubmitButton'))); await sleep(3500);
      const after = E.errors().join(' | '); if (after) res.message = after;
      return res;
    }
    if (state.auth.signin >= 2) { res.message = 'Sign in did not work twice. Sign in or create the account by hand.'; return res; }
    if (state.auth.signin >= 1 && /incorrect|invalid|not (found|recogni)|no account|doesn.t exist/i.test(errText) && has(AID('createAccountLink')) && state.auth.create === 0) { E.click(q(AID('createAccountLink'))); log('no account here yet, switching to Create Account'); await sleep(1500); return res; }
    state.auth.signin++; log('signing in as ' + email);
    await E.fillText(q('input' + AID('email')), email); await E.fillText(q('input' + AID('password')), pw);
    await sleep(300); E.click(q(AID('signInSubmitButton'))); await sleep(3500);
    const after = E.errors().join(' | '); if (after) res.message = after;
    return res;
  }

  async function myInformation(ctx, res) {
    const { profile, answers } = ctx; const p = profile.personal; const W = profile.workday || {};
    const pick = async (label, el, prefs, opts) => { try { if (!el || E.isSet(el)) return; const c = await E.pickAny(el, answers.prefs(prefs), opts); if (c) { res.filled++; log(`${label} -> ${c}`); } else res.unknown.push({ question: label, required: true, tried: prefs, pickEl: el }); } catch (e) { log(label + ': ' + e.message); } };
    await pick('How did you hear about us', q(`${AID('sourceSection')} input, [data-automation-id^="formField-source"] input, ${AID('sourcePrompt')} input`), W.howDidYouHear || ['LinkedIn']);
    const prev = q(AID('previousWorker'));
    if (prev && !prev.querySelector('input[type=radio]:checked')) { const want = W.previouslyWorkedHere || 'No'; const lab = [...prev.querySelectorAll('label')].find(l => new RegExp(`^\\s*${want}\\b`, 'i').test(txt(l))); if (lab) { lab.click(); res.filled++; log('Previously worked here -> ' + want); } }
    const country = q(`button${AID('countryDropdown')}, ${AID('countryDropdown')}`);
    if (country && !new RegExp(p.address.country, 'i').test(E.selectedText(country))) { const c = await E.pickAny(country, [p.address.country]); if (c) { res.filled++; log('Country -> ' + c); await sleep(2000); } }
    await E.fillIfEmpty(q('input' + AID('legalNameSection_firstName')), p.firstName, 'First Name', res);
    await E.fillIfEmpty(q('input' + AID('legalNameSection_lastName')), p.lastName, 'Last Name', res);
    await E.fillIfEmpty(q('input' + AID('addressSection_addressLine1')), p.address.line1, 'Address Line 1', res);
    if (p.address.line2) await E.fillIfEmpty(q('input' + AID('addressSection_addressLine2')), p.address.line2, 'Address Line 2', res);
    await E.fillIfEmpty(q('input' + AID('addressSection_city')), p.address.city, 'City', res);
    await E.fillIfEmpty(q('input' + AID('addressSection_postalCode')), p.address.postalCode, 'Postal Code', res);
    await pick('State', q(`${AID('addressSection_countryRegion')}, ${AID('addressSection_regionSubdivision1')}, [data-automation-id^="formField-addressSection_countryRegion"], [data-automation-id^="formField-addressSection_regionSubdivision"]`), [p.address.state, 'New Delhi', 'National Capital Territory of Delhi', 'NCT']);
    await pick('Phone Device Type', q(`${AID('phone-device-type')}, [data-automation-id^="formField-phoneType"], [data-automation-id^="formField-phone-device"]`), [p.phoneDeviceType, 'Mobile', 'Cell', 'Home']);
    const code = q(`${AID('countryPhoneCode')}, [data-automation-id^="formField-countryPhoneCode"], [data-automation-id^="formField-phoneCountry"]`);
    if (code) { const cur = E.selectedText(code); if (!/\+91|india/i.test(cur)) { if (cur) await E.clearSelected(code); const c = await E.pickAny(code, [p.phoneCountry, p.phoneCountryCode, `${p.phoneCountry} (${p.phoneCountryCode})`], { accept: /\+91|india/i }); if (c) { res.filled++; log('Phone Country Code -> ' + c); } else res.unknown.push({ question: 'Phone country code', required: true }); } }
    await E.fillIfEmpty(q('input' + AID('phone-number')), p.phone, 'Phone Number', res);
  }

  function sectionEl(aid, headingRe) {
    const s = q(AID(aid)); if (s) return s;
    const h = qa('h2, h3, h4').find(e => headingRe.test(txt(e))); if (!h) return null;
    let n = h.parentElement; while (n && n !== document.body && !n.querySelector('button')) n = n.parentElement; return n;
  }
  // Adds entries at most ONCE per section per page: if our field selectors miss on some tenant, we must never keep adding.
  let onceState = null, onceTitle = '';
  const once = key => { const k = key + '|' + onceTitle; if (onceState[k]) return false; onceState[k] = true; return true; };
  async function ensureEntries(sec, count, n, key) {
    if (!once(key || 'entries')) return count();
    for (let guard = 0; guard < n + 2; guard++) {
      const have = count(); if (have >= n) return have;
      let add = qa('button[data-automation-id="Add"], button[data-automation-id="Add Another"], button[data-automation-id="add-button"], button[aria-label*="Add" i]', sec)[0] || qa('button', sec).find(b => /^\s*add( another)?\s*$/i.test(txt(b)));
      if (!add) { log('no Add button in section'); return have; }
      E.click(add); await sleep(1300); if (count() === have) return have;
    }
    return count();
  }
  const nth = (sec, aid, i) => qa(`${AID(aid)}, [data-automation-id="formField-${aid}"]`, sec)[i] || null;

  async function myExperience(ctx, res) {
    const { profile, answers } = ctx;
    const setPick = async (label, el, prefs, opts) => { if (!el || E.isSet(el)) return; const c = await E.pickAny(el, answers.prefs(prefs), opts); if (c) { res.filled++; log(`${label} -> ${c}`); } else { res.unknown.push({ question: label, required: false, tried: prefs, pickEl: el }); log(`${label}: no option matched`); } };
    const setDate = async (label, box, value) => { if (!box || !value) return; if ([...box.querySelectorAll('[data-automation-id^="dateSection"][data-automation-id$="-input"]')].every(e => e.value)) return; if (await E.fillWdDate(box, value)) { res.filled++; log(`${label} -> ${value}`); } };
    try { // work
      const sec = sectionEl('workExperienceSection', /work experience/i);
      if (sec && (profile.work || []).length) {
        const have = await ensureEntries(sec, () => qa('input' + AID('jobTitle'), sec).length, profile.work.length, 'work');
        for (let i = 0; i < Math.min(have, profile.work.length); i++) {
          const w = profile.work[i];
          await E.fillIfEmpty(nth(sec, 'jobTitle', i), w.title, `Job Title #${i + 1}`, res);
          await E.fillIfEmpty(nth(sec, 'company', i), w.company, `Company #${i + 1}`, res);
          await E.fillIfEmpty(nth(sec, 'location', i), w.location, `Location #${i + 1}`, res);
          const cur = qa('input' + AID('currentlyWorkHere'), sec)[i];
          if (w.current && cur && !cur.checked) { const l = cur.id && document.querySelector(`label[for="${CSS.escape(cur.id)}"]`); (l || cur).click(); if (!cur.checked) { cur.checked = true; cur.dispatchEvent(new Event('change', { bubbles: true })); } res.filled++; log(`I currently work here #${i + 1}`); await sleep(500); }
          await setDate(`From #${i + 1}`, qa(AID('formField-startDate'), sec)[i], w.from);
          if (!w.current) await setDate(`To #${i + 1}`, qa(AID('formField-endDate'), sec)[i], w.to);
          await E.fillIfEmpty(qa('textarea' + AID('description'), sec)[i], w.description, `Role Description #${i + 1}`, res);
        }
      }
    } catch (e) { log('work experience: ' + e.message); }
    try { // education
      const sec = sectionEl('educationSection', /^education/i);
      if (sec && (profile.education || []).length) {
        const have = await ensureEntries(sec, () => qa(`${AID('degree')}, [data-automation-id="formField-degree"]`, sec).length, profile.education.length, 'education');
        for (let i = 0; i < Math.min(have, profile.education.length); i++) {
          const ed = profile.education[i];
          const school = qa(`${AID('school')}, ${AID('schoolItem')}, ${AID('schoolName')}, [data-automation-id="formField-school"], [data-automation-id="formField-schoolItem"], [data-automation-id="formField-schoolName"]`, sec)[i];
          if (school && !E.isSet(school)) {
            const plain = school.tagName === 'INPUT' && !(school.getAttribute('role') === 'combobox' || school.placeholder === 'Search');
            if (plain) await E.fillIfEmpty(school, ed.school, `School #${i + 1}`, res);
            else {
              const c = await E.pickAny(school, [ed.school, ed.schoolShort, ed.university]);
              if (c) { res.filled++; log(`School #${i + 1} -> ${c}`); }
              else { const inp = school.tagName === 'INPUT' ? school : school.querySelector('input'); if (inp) { E.setNative(inp, ed.school); inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(800); await E.closePopup(); if (E.isSet(school)) { res.filled++; log(`School #${i + 1} -> ${ed.school}`); } else res.unknown.push({ question: `School #${i + 1}`, required: true, tried: ed.school }); } }
            }
          }
          await setPick(`Degree #${i + 1}`, nth(sec, 'degree', i), ed.degreeOptions || [ed.degree]);
          await setPick(`Field of Study #${i + 1}`, qa(`${AID('fieldOfStudy')}, ${AID('formField-fieldOfStudy')}`, sec)[i], ed.fieldOfStudyOptions || [ed.fieldOfStudy]);
          await E.fillIfEmpty(nth(sec, 'gpa', i), ed.gpa, `GPA #${i + 1}`, res);
          const yearsOnly = qa(AID('formField-firstYearAttended'), sec).length > 0;
          await setDate(`From year #${i + 1}`, qa(`${AID('formField-firstYearAttended')}, ${AID('formField-startDate')}`, sec)[i], yearsOnly ? ed.fromYear : ed.from);
          await setDate(`To year #${i + 1}`, qa(`${AID('formField-lastYearAttended')}, ${AID('formField-endDate')}`, sec)[i], yearsOnly ? ed.toYear : ed.to);
        }
      }
    } catch (e) { log('education: ' + e.message); }
    try { // languages
      const sec = sectionEl('languageSection', /^languages?/i);
      if (sec && (profile.languages || []).length) {
        const langs = () => qa(`${AID('language')}, [data-automation-id="formField-language"]`, sec);
        const have = await ensureEntries(sec, () => langs().length, profile.languages.length, 'languages');
        const panels = qa('[data-automation-id^="language-"]', sec);
        for (let i = 0; i < Math.min(have, profile.languages.length); i++) {
          const L = profile.languages[i];
          await setPick(`Language #${i + 1}`, langs()[i], [L.language]);
          const panel = panels[i] || sec;
          const native = panels[i] ? panel.querySelector('input' + AID('nativeLanguage')) : qa('input' + AID('nativeLanguage'), sec)[i];
          if (L.native && native && !native.checked) { native.click(); res.filled++; log(`Native language #${i + 1}`); }
          for (const b of qa('button[aria-haspopup="listbox"]', panel)) {
            const lbl = txt(b.closest('[data-automation-id^="formField-"]')?.querySelector('label'));
            if (/^language$/i.test(lbl) || E.isSet(b)) continue;
            await setPick(`${lbl || 'Proficiency'} (${L.language})`, b, L.proficiencyOptions);
          }
        }
      }
    } catch (e) { log('languages: ' + e.message); }
    try { // skills
      const sec = sectionEl('skillsSection', /^skills/i);
      if (sec && (profile.skills || []).length) {
        const input = qa('input', sec)[0];
        const have = qa(AID('selectedItem'), sec).map(e => txt(e).replace(/\s*x$/i, '').toLowerCase());
        const max = profile.skillsMaxToAdd || 8;
        if (input && have.length < max) {
          let added = 0;
          for (const s of profile.skills) {
            if (have.length + added >= max) break;
            if (have.some(h => h.includes(s.toLowerCase()))) continue;
            const c = await E.pickMultiselect(input, [s]);
            if (c) { if (have.includes(c.toLowerCase())) continue; have.push(c.toLowerCase()); added++; log('Skill -> ' + c); }
          }
          res.filled += added;
        }
      }
    } catch (e) { log('skills: ' + e.message); }
    try { // resume
      if (!has(`${AID('file-upload-successful')}, ${AID('file-upload-item')}`)) { const sec = q(AID('resumeSection')); if (await E.uploadResume(document, ctx.resumeFile, { scope: sec || undefined })) res.filled++; }
    } catch (e) { log('resume: ' + e.message); }
    try { // websites: one entry per site, never duplicates; extra duplicate/empty panels are deleted
      const sites = answers.prefs((profile.workday || {}).websites || []);
      const sec = sectionEl('websiteSection', /^websites?/i);
      if (sec && sites.length) {
        const inputs = () => qa('input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=hidden])', sec);
        const norm = u => (u || '').trim().replace(/\/+$/, '').toLowerCase();
        const present = () => new Set(inputs().map(i => norm(i.value)).filter(Boolean));
        const missing = sites.filter(u => !present().has(norm(u)));
        const empties = () => inputs().filter(i => !i.value);
        if (missing.length > empties().length) await ensureEntries(sec, () => inputs().length, inputs().length + (missing.length - empties().length), 'websites');
        for (const u of missing) { const e = empties()[0]; if (!e) break; await E.fillText(e, u); res.filled++; log('Website -> ' + u); }
        // delete panels that duplicate an earlier URL or are still empty
        const seen = new Set();
        for (const i of inputs()) {
          const v = norm(i.value); const dup = v ? seen.has(v) : true; if (v) seen.add(v);
          if (!dup) continue;
          let panel = i.parentElement; while (panel && panel !== sec && !qa('button', panel).some(b => /delete|remove/i.test(txt(b) + ' ' + (b.getAttribute('aria-label') || '')))) panel = panel.parentElement;
          const del = panel && panel !== sec && qa('button', panel).find(b => /delete|remove/i.test(txt(b) + ' ' + (b.getAttribute('aria-label') || '')));
          if (del) { E.click(del); log('removed duplicate/empty website entry'); await sleep(900); }
        }
      }
    } catch (e) { log('websites: ' + e.message); }
    await E.fillIfEmpty(q(`input${AID('linkedinQuestion')}, [data-automation-id="formField-linkedinQuestion"] input`), profile.personal.links.linkedin, 'LinkedIn', res);
  }

  async function voluntary(ctx, res) {
    const { profile, answers } = ctx; const V = (profile.workday || {}).voluntary || {};
    for (const f of qa('[data-automation-id^="formField-"]')) {
      const label = txt(f.querySelector('label, legend')).replace(/\*/g, '').trim();
      const ctrl = f.querySelector('button[aria-haspopup="listbox"], input[placeholder="Search"]');
      if (!label || !ctrl || E.isSet(ctrl)) continue;
      let prefs = null;
      if (/gender|sex\b/i.test(label)) prefs = V.gender; else if (/nationalit|citizenship/i.test(label)) prefs = V.nationality || ['India', 'Indian']; else if (/hispanic|latino/i.test(label)) prefs = V.hispanicOrLatino; else if (/ethnic|race/i.test(label)) prefs = V.ethnicity; else if (/veteran|military/i.test(label)) prefs = V.veteran; else if (/disab/i.test(label)) prefs = V.disability;
      if (!prefs) continue;
      const c = await E.pickAny(ctrl, answers.prefs(prefs));
      if (c) { res.filled++; log(`${label} -> ${c}`); } else res.unknown.push({ question: label, required: false, tried: prefs, pickEl: ctrl });
    }
    await E.fillIfEmpty(q(`input${AID('name')}, [data-automation-id="formField-name"] input`), profile.personal.fullName, 'Name', res);
    // "Date signed" on Self Identify = today. Never touch birth dates here (those come from the DOB rule).
    const dateBox = q(`${AID('formField-dateSignedOn')}, ${AID('dateSignedOn')}`) || [...document.querySelectorAll('[data-automation-id^="formField-"]')].find(f => vis(f) && f.querySelector(AID('dateSectionMonth-input')) && /signed|today|^\s*date\s*\*?\s*$/i.test(txt(f.querySelector('label, legend'))) && !/birth|dob/i.test(txt(f.querySelector('label, legend'))));
    if (dateBox && ![...dateBox.querySelectorAll('[data-automation-id$="-input"]')].every(e => e.value) && await E.fillWdDate(dateBox, answers.ref('@today'))) { res.filled++; log('Date signed -> today'); }
    const agree = q('input' + AID('agreementCheckbox'));
    if (agree && !agree.checked) { const l = agree.id && document.querySelector(`label[for="${CSS.escape(agree.id)}"]`); (l || agree).click(); if (!agree.checked) { agree.checked = true; agree.dispatchEvent(new Event('change', { bubbles: true })); } res.filled++; log('agreement'); }
  }

  return { name: 'workday', matches, step };
})();
