// Fallback for any other career site (Greenhouse, Lever, Ashby, SuccessFactors, custom pages).
window.ATS = window.ATS || {}; ATS.adapters = ATS.adapters || {};
ATS.adapters.generic = (() => {
  const E = ATS.engine; const { sleep, log } = E;
  async function step(ctx) {
    const { answers, state } = ctx;
    const res = { status: 'waiting', filled: 0, unknown: [], errors: [], canAdvance: false, title: 'Application form' };
    if (E.scan(document).length < 2) {
      if (!state.applyClicked) { const t = E.clickButton(document, /^(apply|apply now|apply for this (job|position)|apply manually|i'?m interested|start application)$/i); if (t) { state.applyClicked = true; log('clicked ' + t); await sleep(2500); res.status = 'navigating'; } }
      return res;
    }
    log('form step found');
    if (ctx.resumeFile && await E.uploadResume(document, ctx.resumeFile)) res.filled++;
    else if (/docs\.google\.com\/forms/i.test(location.href) && E.findButton(document, /add file/i) && !document.querySelector('[data-automation-id], [aria-label*="resume" i][role="listitem"]')) res.notes = ['Resume: Google Forms uses a Google Drive picker, which no extension can fill. Click "Add file" and pick resume.pdf yourself.'];
    const g = await E.fillGeneric(document, { answers });
    res.filled += g.filled; res.unknown.push(...g.unknown); res.errors = E.errors(document);
    if (E.hasSubmit(document)) { res.status = 'review'; return res; }
    res.status = 'filled'; res.canAdvance = !!E.findButton(document, /^(next|continue|save and continue|save & continue|proceed)\b/i);
    res.advance = () => E.clickButton(document, /^(next|continue|save and continue|save & continue|proceed)\b/i);
    return res;
  }
  return { name: 'generic', matches: () => true, step };
})();
