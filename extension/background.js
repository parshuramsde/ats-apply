// Seeds storage from the bundled profile.json, and injects the helper into any tab when the toolbar icon is clicked
// (for career sites that are not Workday/Keka).
const FILES = ['answers.js', 'engine.js', 'adapters/workday.js', 'adapters/keka.js', 'adapters/generic.js', 'content.js'];

async function seed() {
  let profile, profileMissing = false;
  try { profile = await (await fetch(chrome.runtime.getURL('profile.json'))).json(); }
  catch (e) { profileMissing = true; profile = { personal: {}, answers: [], work: [], education: [], workday: {}, defaults: {} }; }
  await chrome.storage.local.set({ profile, profileMissing, profileLoadedAt: Date.now() });
}
chrome.runtime.onInstalled.addListener(seed);
chrome.runtime.onStartup.addListener(seed);

chrome.action.onClicked.addListener(async tab => {
  if (!tab.id || !/^https?:/.test(tab.url || '')) return;
  try {
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['panel.css'] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: FILES });
  } catch (e) { console.warn('[ATS] inject failed', e); }
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    if (msg.type === 'reseed') { await seed(); reply({ ok: true }); }
    else if (msg.type === 'reloadExt') { reply({ ok: true }); setTimeout(() => chrome.runtime.reload(), 100); }
    else if (msg.type === 'closeTab' && sender.tab) { await chrome.tabs.remove(sender.tab.id); reply({ ok: true }); }
    else reply({ ok: false });
  })();
  return true;
});
