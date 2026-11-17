#!/usr/bin/env node
// Loads the extension into Chrome, serves test/mock-workday.html on http://localhost:4123, and checks the helper
// drives the mock through every page to Review without submitting. Usage: node test/run-ext-mock.js [--show]
const http = require('http'); const fs = require('fs'); const path = require('path'); const os = require('os');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..'); const ext = path.join(root, 'extension');
// bundle a test profile (dummy password) + resume into the extension folder, restoring the user's own afterwards
const bak = {}; for (const f of ['profile.json', 'resume.pdf']) { const p = path.join(ext, f); if (fs.existsSync(p)) bak[f] = fs.readFileSync(p); }
const prof = JSON.parse(fs.readFileSync(path.join(root, 'profile.json'), 'utf8')); prof.account.workdayPassword = 'Mock-Passw0rd!'; prof.resumePath = 'resume.pdf';
fs.writeFileSync(path.join(ext, 'profile.json'), JSON.stringify(prof)); fs.copyFileSync(path.join(root, 'resume.pdf'), path.join(ext, 'resume.pdf'));
const restore = () => { for (const f of ['profile.json', 'resume.pdf']) { const p = path.join(ext, f); if (bak[f]) fs.writeFileSync(p, bak[f]); else fs.rmSync(p, { force: true }); } };

const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(fs.readFileSync(path.join(__dirname, 'mock-workday.html'))); }).listen(4123);
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ats-ext-'));
  const show = process.argv.includes('--show');
  const ctx = await chromium.launchPersistentContext(dir, { channel: 'chromium', headless: !show, args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`] });
  const page = ctx.pages()[0] || await ctx.newPage();
  page.on('console', m => { const t = m.text(); if (t.startsWith('[ATS]') || m.type() === 'error') console.log('  ' + m.type() + ': ' + t.slice(0, 200)); });
  await page.goto('http://localhost:4123/mock-workday.html');
  let ok = false; const t0 = Date.now();
  while (Date.now() - t0 < (process.env.T ? +process.env.T : 240000)) {
    await page.waitForTimeout(2000);
    const st = await page.evaluate(() => ({ step: document.querySelector('[data-automation-id="progressBarActiveStep"]')?.innerText || '', submitted: !!document.getElementById('submitted'), panel: document.querySelector('#ats-panel .ats-status')?.innerText || '' })).catch(() => ({}));
    if (st.submitted) { console.log('FAIL: the helper submitted!'); break; }
    if (Math.floor((Date.now() - t0) / 2000) % 3 === 0) console.log(`  [${Math.round((Date.now() - t0) / 1000)}s] step="${st.step}" h2="${await page.evaluate(() => [...document.querySelectorAll('h1,h2')].filter(e => e.offsetHeight).map(e => e.innerText).join('/')).catch(() => '')}" panel="${(st.panel || '').slice(0, 120)}"`);
    if (st.step === 'Review') { ok = true; console.log('panel says: ' + st.panel); console.log(await page.evaluate(() => document.getElementById('summary').innerText.slice(0, 1500))); break; }
  }
  await ctx.close(); server.close(); restore(); fs.rmSync(dir, { recursive: true, force: true });
  console.log(ok ? '\nEXTENSION MOCK TEST PASSED (reached Review without submitting)' : '\nEXTENSION MOCK TEST FAILED'); process.exit(ok ? 0 : 1);
})().catch(e => { restore(); server.close(); console.error(e); process.exit(1); });
