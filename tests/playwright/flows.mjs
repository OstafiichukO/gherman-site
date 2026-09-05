import { chromium, devices } from 'playwright';
import fs from 'fs';

const SITE = 'https://gherman.com.ua';
const OUT = new URL('./out/', import.meta.url).pathname;
const HOP = new Set(['content-encoding','content-length','transfer-encoding','connection','keep-alive']);

async function shim(context, log) {
  await context.route('**/*', async (route) => {
    const req = route.request(); const url = req.url();
    if (!/^https?:/.test(url)) return route.continue();
    const headers = { ...req.headers() }; delete headers['accept-encoding']; delete headers['host'];
    try {
      const resp = await fetch(url, { method: req.method(), headers,
        body: ['GET','HEAD'].includes(req.method()) ? undefined : req.postDataBuffer(), redirect: 'follow' });
      const buf = Buffer.from(await resp.arrayBuffer());
      const out = {}; for (const [k,v] of resp.headers) if (!HOP.has(k.toLowerCase())) out[k]=v;
      log.push({ url: url.slice(0,150), status: resp.status, bytes: buf.length, method: req.method(),
                 post: req.postData()?.slice(0,300) });
      await route.fulfill({ status: resp.status, headers: out, body: buf });
    } catch(e) { log.push({ url: url.slice(0,150), status: 0, err: String(e).slice(0,120) }); await route.abort('failed'); }
  });
}

const R = {};
const browser = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } });

const overflowProbe = () => {
  const vw = window.innerWidth, docW = document.documentElement.scrollWidth;
  const bad = [];
  if (docW > vw + 1) for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    if (getComputedStyle(el).position === 'fixed') continue;
    if (r.right + window.scrollX > vw + 1 && r.width <= docW)
      bad.push((el.tagName.toLowerCase()) + (el.id?'#'+el.id:'') + (typeof el.className==='string'&&el.className.trim()?'.'+el.className.trim().split(/\s+/)[0]:'') + ' r=' + Math.round(r.right));
  }
  return { vw, docW, over: docW - vw, bad: [...new Set(bad)].slice(0,10) };
};

// ---------- 1. mobile home: filters + category + modals ----------
{
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'uk-UA' });
  const log = []; await shim(ctx, log);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0,200)));
  const cerr = []; page.on('console', m => { if (m.type()==='error') cerr.push(m.text().slice(0,160)); });
  await page.goto(SITE + '/', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2500);
  const step = {};

  // exclusives block state (the 401 endpoint feeds it)
  step.exclusivesBlock = await page.evaluate(() => {
    const cands = [...document.querySelectorAll('[id*=excl],[class*=excl]')].map(e => ({
      sel: e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+(typeof e.className==='string'&&e.className?'.'+e.className.split(' ')[0]:''),
      shown: !!(e.offsetParent || e.getClientRects().length),
      text: (e.innerText||'').replace(/\s+/g,' ').trim().slice(0,120),
      h: Math.round(e.getBoundingClientRect().height)
    })).filter(x => x.shown);
    return cands.slice(0,10);
  });

  // category pills -> open "flat"
  step.catPill = await page.evaluate(() => {
    const el = document.querySelector('#catpill-flat'); if (!el) return 'missing';
    el.click(); return 'clicked';
  });
  await page.waitForTimeout(1800);
  step.afterCatPill = await page.evaluate(() => ({
    cards: document.querySelectorAll('[class*=card],[class*=feed] > *').length,
    text: (document.body.innerText||'').replace(/\s+/g,' ').slice(0,200),
    scrollY: Math.round(window.scrollY),
    bodyOverflow: getComputedStyle(document.body).overflow,
  }));
  step.overflowAfterCat = await page.evaluate(overflowProbe);
  await page.screenshot({ path: OUT + 'flow-mobile-category.png' });

  // apply a filter
  step.filter = await page.evaluate(() => {
    const set = (id, v) => { const e = document.getElementById(id); if (!e) return false;
      e.value = v; e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); return true; };
    return { priceMin: set('cat-price-min','10000'), priceMax: set('cat-price-max','60000') };
  });
  await page.waitForTimeout(1500);
  step.afterFilter = await page.evaluate(() => ({ text: (document.body.innerText||'').replace(/\s+/g,' ').slice(0,240) }));

  // lead modal
  step.leadModal = await page.evaluate(() => {
    const o = document.getElementById('lead-modal-overlay') || document.querySelector('[id*=lead][id*=overlay]');
    if (!o) return 'no overlay el';
    const before = getComputedStyle(o).display;
    if (typeof window.openLeadModal === 'function') { window.openLeadModal(); }
    else { const b=[...document.querySelectorAll('button,a')].find(x=>/залиш|зв.?яза|передзвон|заявк/i.test(x.innerText||'')); if(b) b.click(); }
    return { before, after: getComputedStyle(o).display, bodyOverflow: getComputedStyle(document.body).overflow };
  });
  await page.waitForTimeout(700);
  step.escapeClosesModal = await page.evaluate(() => {
    const o = document.getElementById('lead-modal-overlay'); if (!o) return 'n/a';
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    return getComputedStyle(o).display;
  });

  // back-button behaviour after opening a modal
  step.historyLen = await page.evaluate(() => history.length);

  // submit lead form with empty fields -> validation?
  step.emptySubmit = await page.evaluate(() => {
    const n = document.getElementById('lead-name-2'), p = document.getElementById('lead-phone-2');
    if (!n || !p) return 'inputs not found';
    const btn = [...document.querySelectorAll('button')].find(b => /надісл|відправ|замов/i.test(b.innerText||''));
    return { hasRequired: { name: n.required, phone: p.required }, btn: btn ? btn.innerText.trim().slice(0,40) : 'no submit btn' };
  });

  step.errs = errs; step.consoleErrors = [...new Set(cerr)];
  step.postRequests = log.filter(l => l.method === 'POST').map(l => ({ url: l.url, status: l.status, post: l.post }));
  R.mobileHomeFlow = step;
  await ctx.close();
}

// ---------- 2. narrow phone 320/360 overflow ----------
for (const w of [320, 360]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 720 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: devices['iPhone 13'].userAgent, locale: 'uk-UA' });
  const log = []; await shim(ctx, log);
  const page = await ctx.newPage();
  await page.goto(SITE + '/', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2000);
  R['overflow_' + w] = await page.evaluate(overflowProbe);
  await page.screenshot({ path: OUT + `flow-${w}.png` });
  await ctx.close();
}

// ---------- 3. desktop gatekeeper + touch-laptop case ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'uk-UA' });
  const log = []; await shim(ctx, log);
  const page = await ctx.newPage();
  await page.goto(SITE + '/', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1500);
  R.desktopGate = { finalUrl: page.url(), docs: log.filter(l => l.url.endsWith('.html') || l.url === SITE + '/').map(l => ({u:l.url, s:l.status, kb: Math.round((l.bytes||0)/1024)})) };
  await ctx.close();
}
{ // touchscreen laptop 1440 wide WITH touch -> should stay on mobile page
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true, isMobile: false, locale: 'uk-UA' });
  const log = []; await shim(ctx, log);
  const page = await ctx.newPage();
  await page.goto(SITE + '/', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1500);
  R.touchLaptop = { finalUrl: page.url(), ...(await page.evaluate(() => ({
    docW: document.documentElement.scrollWidth, vw: innerWidth,
    heroW: (() => { const h = document.querySelector('h1'); const r = h?.getBoundingClientRect(); return r ? Math.round(r.width) : null; })(),
    contentMaxW: (() => { const b = document.body; return Math.round(b.getBoundingClientRect().width); })(),
  }))) };
  await page.screenshot({ path: OUT + 'flow-touch-laptop.png' });
  await ctx.close();
}

// ---------- 4. deep links / edge function paths ----------
{
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'uk-UA' });
  const log = []; await shim(ctx, log);
  const page = await ctx.newPage();
  const targets = [
    '/?info=insurance',
    '/?obj=01aa4881-6eff-40a2-ba44-2be4b0ac6b40',
    '/baza-znan/',
    '/rayony/',
    '/listings/',
    '/nema-takoyi-storinky-xyz',
  ];
  R.deepLinks = [];
  for (const t of targets) {
    let st = null, err = null;
    try { const r = await page.goto(SITE + t, { waitUntil: 'domcontentloaded', timeout: 45000 }); st = r?.status(); }
    catch(e) { err = String(e).slice(0,100); }
    await page.waitForTimeout(1200);
    const info = await page.evaluate(() => ({
      title: document.title.slice(0,80),
      h1: document.querySelector('h1')?.innerText.slice(0,60) || null,
      ogImage: document.querySelector('meta[property="og:image"]')?.content?.slice(0,110) || null,
      ogTitle: document.querySelector('meta[property="og:title"]')?.content?.slice(0,80) || null,
      canonical: document.querySelector('link[rel=canonical]')?.href || null,
      robots: document.querySelector('meta[name=robots]')?.content || null,
      visibleModal: [...document.querySelectorAll('[id*=overlay],[id*=modal]')].filter(e=>e.getClientRects().length).map(e=>e.id).slice(0,5),
      bodyStart: (document.body.innerText||'').replace(/\s+/g,' ').trim().slice(0,120),
    })).catch(()=>({}));
    R.deepLinks.push({ path: t, status: st, err, ...info });
  }
  await ctx.close();
}

// ---------- 5. listing page: image reserve / CLS source ----------
{
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'uk-UA' });
  const log = []; await shim(ctx, log);
  const page = await ctx.newPage();
  await page.goto(SITE + '/listings/01aa4881-6eff-40a2-ba44-2be4b0ac6b40.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
  const beforeImg = await page.evaluate(() => ({ docH: document.documentElement.scrollHeight,
    imgBox: (()=>{const i=document.images[0]; if(!i) return null; const r=i.getBoundingClientRect(); return {w:Math.round(r.width),h:Math.round(r.height)};})() }));
  await page.waitForLoadState('load');
  await page.waitForTimeout(2500);
  const afterImg = await page.evaluate(() => ({ docH: document.documentElement.scrollHeight,
    imgBox: (()=>{const i=document.images[0]; const r=i.getBoundingClientRect(); return {w:Math.round(r.width),h:Math.round(r.height), nat:i.naturalWidth+'x'+i.naturalHeight, lazy:i.loading, hasWH: i.hasAttribute('width')&&i.hasAttribute('height')};})() }));
  R.listingImage = { beforeImg, afterImg,
    photoBytes: log.filter(l=>/object-photos/.test(l.url)).map(l=>({kb:Math.round((l.bytes||0)/1024), url:l.url.slice(0,90)})) };
  await page.screenshot({ path: OUT + 'flow-listing-mobile.png', fullPage: true });
  await ctx.close();
}

await browser.close();
fs.writeFileSync(OUT + 'flows.json', JSON.stringify(R, null, 2));
console.log(JSON.stringify(R, null, 2));
