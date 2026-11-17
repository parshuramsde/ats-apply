// Keka careers adapter (in-page). Resume first (Keka parses it), then every empty field via the generic engine.
window.ATS = window.ATS || {}; ATS.adapters = ATS.adapters || {};
ATS.adapters.keka = (() => {
  const E = ATS.engine; const { sleep, vis, log } = E;
  const matches = url => /\.keka\.com\//i.test(url) || /kekacareers|keka\.io/i.test(url);
  async function waitIdle(max) { const t0 = Date.now(); while (Date.now() - t0 < max) { const busy = [...document.querySelectorAll('.spinner, .loader, .loading, [class*="spinner"], [class*="loading"], mat-spinner, mat-progress-bar')].some(vis); if (!busy) { await sleep(1200); return; } await sleep(500); } }
  async function step(ctx) {
    const { answers, state } = ctx;
    const res = { status: 'waiting', filled: 0, unknown: [], errors: [], canAdvance: false, title: 'Keka application' };
    if (E.scan(document).length < 2) {
      if (/\/careers\/jobdetails\//i.test(location.href) && !state.kekaApplyClicked) {
        state.kekaApplyClicked = true;
        const t = E.clickButton(document, /^(apply|apply now|apply for this job|apply to this job|i'?m interested)\b/i);
        if (t) { log('clicked ' + t); await sleep(2500); res.status = 'navigating'; return res; }
        location.href = location.href.replace('/careers/jobdetails/', '/careers/applyjob/'); res.status = 'navigating';
      }
      return res;
    }
    log('Keka application form');
    if (!state.kekaResume && ctx.resumeFile) { if (await E.uploadResume(document, ctx.resumeFile)) { state.kekaResume = true; await waitIdle(8000); } }
    const g = await E.fillGeneric(document, { answers });
    res.filled += g.filled; res.unknown.push(...g.unknown);
    await sleep(400); res.errors = E.errors(document);
    res.status = E.hasSubmit(document) ? 'review' : 'filled';
    return res;
  }
  return { name: 'keka', matches, step };
})();
