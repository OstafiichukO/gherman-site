import { chromium, devices } from 'playwright';
import fs from 'fs';
import path from 'path';

const SITE = 'https://gherman.com.ua';

// Chromium's own TLS cannot traverse this session's egress relay, so every
// request the page makes is fulfilled through Node's fetch (which can).
// Network *timings* therefore reflect this shim, not the real CDN — real
// TTFB/size are measured separately with curl (see net.json).
const HOP = new Set(['content-encoding','content-length','transfer-encoding','connection','keep-alive']);
async function installShim(context, log) {
  await context.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    if (!/^https?:/.test(url)) return route.continue();
    const headers = { ...req.headers() };
    delete headers['accept-encoding'];
    delete headers['host'];
    try {
      const t0 = Date.now();
      const resp = await fetch(url, {
        method: req.method(), headers,
        body: ['GET','HEAD'].includes(req.method()) ? undefined : req.postDataBuffer(),
        redirect: 'follow',
      });
      const buf = Buffer.from(await resp.arrayBuffer());
      const out = {};
      for (const [k, v] of resp.headers) if (!HOP.has(k.toLowerCase())) out[k] = v;
      log.push({ url: url.slice(0,160), status: resp.status, bytes: buf.length, ms: Date.now()-t0, type: req.resourceType() });
      await route.fulfill({ status: resp.status, headers: out, body: buf });
    } catch (e) {
      log.push({ url: url.slice(0,160), status: 0, err: String(e).slice(0,160), type: req.resourceType() });
      await route.abort('failed');
    }
  });
}
const OUT = new URL('./out/', import.meta.url).pathname;

const PAGES = [
  { key: 'home',    url: SITE + '/' },
  { key: 'listing', url: SITE + '/listings/01aa4881-6eff-40a2-ba44-2be4b0ac6b40.html' },
  { key: 'rayon',   url: SITE + '/rayony/flat-tsentr.html' },
  { key: 'article', url: SITE + '/baza-znan/yak-kupyty-kvartyru-v-chernivtsyah.html' },
];

const VIEWPORTS = [
  { key: 'mobile',  ctx: { ...devices['iPhone 13'] } },
  { key: 'desktop', ctx: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36' } },
];

// ---- in-page collectors -------------------------------------------------
const PERF_INIT = () => {
  window.__cls = 0; window.__shifts = [];
  window.__lcp = 0; window.__lcpEl = '';
  window.__longtasks = [];
  try {
    new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) {
      window.__cls += e.value;
      if (e.value > 0.005) window.__shifts.push({ value: +e.value.toFixed(4),
        sources: (e.sources||[]).slice(0,3).map(s => s.node ? (s.node.tagName||'') + (s.node.id ? '#'+s.node.id : '') + (s.node.className && typeof s.node.className === 'string' ? '.'+s.node.className.split(' ')[0] : '') : '?') });
    }}).observe({ type: 'layout-shift', buffered: true });
  } catch(e){}
  try {
    new PerformanceObserver(l => { const es = l.getEntries(); const e = es[es.length-1];
      window.__lcp = e.startTime;
      const n = e.element; window.__lcpEl = n ? (n.tagName + (n.id?'#'+n.id:'') + (n.src?' src='+String(n.src).slice(0,90):'')) : '';
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch(e){}
  try {
    new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.duration > 100) window.__longtasks.push(Math.round(e.duration)); })
      .observe({ type: 'longtask', buffered: true });
  } catch(e){}
};

const AUDIT = () => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const sel = el => { if (!el) return '?'; let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    else if (el.className && typeof el.className === 'string' && el.className.trim()) s += '.' + el.className.trim().split(/\s+/).slice(0,2).join('.');
    return s; };

  // 1. horizontal overflow
  const docW = document.documentElement.scrollWidth;
  const overflowers = [];
  if (docW > vw + 1) {
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const right = r.right + window.scrollX;
      if (right > vw + 1 && r.width <= docW) {
        const cs = getComputedStyle(el);
        if (cs.position === 'fixed') continue;
        overflowers.push({ sel: sel(el), right: Math.round(right), w: Math.round(r.width), overflowX: cs.overflowX });
      }
    }
  }
  // keep only outermost-ish, dedupe
  const seen = new Set();
  const overflow = overflowers.filter(o => { if (seen.has(o.sel)) return false; seen.add(o.sel); return true; }).slice(0, 15);

  // 2. tap targets
  const tapables = [...document.querySelectorAll('a,button,input,select,textarea,[role=button],[onclick]')];
  const smallTaps = [];
  for (const el of tapables) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.top > document.documentElement.scrollHeight) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (r.width < 40 || r.height < 40) smallTaps.push({ sel: sel(el), w: Math.round(r.width), h: Math.round(r.height), text: (el.innerText||el.value||el.getAttribute('aria-label')||'').trim().slice(0,40) });
  }

  // 3. images
  const imgs = [...document.images];
  const imgReport = {
    total: imgs.length,
    broken: imgs.filter(i => i.complete && i.naturalWidth === 0 && i.getAttribute('src')).map(i => ({ sel: sel(i), src: String(i.currentSrc||i.src).slice(0,120) })).slice(0,10),
    noAlt: imgs.filter(i => !i.hasAttribute('alt')).map(i => ({ sel: sel(i), src: String(i.currentSrc||i.src).slice(0,90) })).slice(0,10),
    emptyAlt: imgs.filter(i => i.hasAttribute('alt') && i.alt.trim()==='').length,
    noDims: imgs.filter(i => !(i.hasAttribute('width') && i.hasAttribute('height')) && !(getComputedStyle(i).aspectRatio !== 'auto')).length,
    noLazy: imgs.filter(i => i.loading !== 'lazy').length,
    oversized: imgs.filter(i => { const r = i.getBoundingClientRect(); return r.width > 0 && i.naturalWidth > r.width * window.devicePixelRatio * 1.8; })
      .map(i => { const r = i.getBoundingClientRect(); return { sel: sel(i), natural: i.naturalWidth + 'x' + i.naturalHeight, shown: Math.round(r.width)+'x'+Math.round(r.height), src: String(i.currentSrc||i.src).slice(0,110) }; }).slice(0,10),
  };

  // 4. headings
  const heads = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(h => h.offsetParent !== null || h.getClientRects().length);
  const headings = { h1: heads.filter(h=>h.tagName==='H1').map(h=>h.innerText.trim().slice(0,80)),
    counts: Object.fromEntries(['H1','H2','H3','H4','H5','H6'].map(t => [t, heads.filter(h=>h.tagName===t).length])) };

  // 5. accessible names / form labels
  const noName = [];
  for (const el of [...document.querySelectorAll('a,button,[role=button]')]) {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const name = (el.innerText||'').trim() || el.getAttribute('aria-label') || el.getAttribute('title') || (el.querySelector('img')?.alt||'').trim();
    if (!name) noName.push({ sel: sel(el), html: el.outerHTML.slice(0,110) });
  }
  const unlabeled = [];
  for (const el of [...document.querySelectorAll('input,select,textarea')]) {
    if (el.type === 'hidden') continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const id = el.id;
    const has = (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) || el.closest('label') || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
    if (!has) unlabeled.push({ sel: sel(el), placeholder: el.placeholder || '', type: el.type });
  }

  // 6. font sizes
  const tiny = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.children.length) continue;
    const t = (el.innerText||'').trim(); if (t.length < 4) continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 12) tiny.push({ sel: sel(el), fs, text: t.slice(0,40) });
  }

  // 7. viewport meta / zoom
  const vpMeta = document.querySelector('meta[name=viewport]')?.content || '(none)';

  // 8. rendered vs static: how much DOM is JS-built
  const domNodes = document.querySelectorAll('*').length;
  const bodyText = (document.body.innerText||'').replace(/\s+/g,' ').trim();

  // 9. links
  const links = [...document.querySelectorAll('a[href]')];
  const hrefs = [...new Set(links.map(a => a.href))];
  const emptyHref = links.filter(a => { const h = a.getAttribute('href'); return h === '#' || h === '' || h === 'javascript:void(0)'; }).length;
  const extNoRel = links.filter(a => a.target === '_blank' && !(a.rel||'').includes('noopener')).map(a=>a.href.slice(0,90)).slice(0,10);

  // 10. perf
  const nav = performance.getEntriesByType('navigation')[0] || {};
  const res = performance.getEntriesByType('resource');
  const byType = {};
  let totalTransfer = nav.transferSize || 0;
  for (const r of res) {
    const t = r.initiatorType || 'other';
    byType[t] = byType[t] || { n: 0, bytes: 0 };
    byType[t].n++; byType[t].bytes += r.transferSize || 0;
    totalTransfer += r.transferSize || 0;
  }
  const slowest = res.map(r => ({ url: r.name.slice(0,110), ms: Math.round(r.duration), kb: Math.round((r.transferSize||0)/1024) }))
    .sort((a,b)=>b.ms-a.ms).slice(0,8);
  const thirdParty = [...new Set(res.filter(r => { try { return new URL(r.name).host !== location.host; } catch(e){ return false; } }).map(r => new URL(r.name).host))];

  const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0;

  return {
    vw, vh, dpr: window.devicePixelRatio,
    docScrollWidth: docW, docScrollHeight: document.documentElement.scrollHeight,
    overflow, smallTaps: smallTaps.slice(0, 25), smallTapsTotal: smallTaps.length,
    imgReport, headings, noName: noName.slice(0,12), noNameTotal: noName.length,
    unlabeled: unlabeled.slice(0,15), unlabeledTotal: unlabeled.length,
    tiny: tiny.slice(0,12), tinyTotal: tiny.length,
    vpMeta, domNodes, bodyTextLen: bodyText.length, bodyTextSample: bodyText.slice(0,300),
    linkCount: links.length, uniqueHrefs: hrefs.length, emptyHref, extNoRel,
    perf: {
      ttfb: Math.round(nav.responseStart||0), domContentLoaded: Math.round(nav.domContentLoadedEventEnd||0),
      load: Math.round(nav.loadEventEnd||0), fcp: Math.round(fcp),
      lcp: Math.round(window.__lcp||0), lcpEl: window.__lcpEl,
      cls: +(window.__cls||0).toFixed(4), shifts: (window.__shifts||[]).slice(0,8),
      longtasks: window.__longtasks || [],
      htmlTransferKB: Math.round((nav.transferSize||0)/1024),
      htmlDecodedKB: Math.round((nav.decodedBodySize||0)/1024),
      totalTransferKB: Math.round(totalTransfer/1024),
      resourceCount: res.length,
      byType: Object.fromEntries(Object.entries(byType).map(([k,v])=>[k,{n:v.n,kb:Math.round(v.bytes/1024)}])),
      slowest, thirdParty,
    },
    hrefsSample: hrefs.slice(0, 400),
  };
};

// ---- runner -------------------------------------------------------------
const results = {};

const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch(PROXY ? { proxy: { server: PROXY } } : {});

for (const vp of VIEWPORTS) {
  for (const p of PAGES) {
    const id = `${p.key}-${vp.key}`;
    process.stderr.write(`\n>>> ${id} ...`);
    const context = await browser.newContext({ ...vp.ctx, locale: 'uk-UA', timezoneId: 'Europe/Kyiv' });
    const page = await context.newPage();
    const console_ = [], failed = [], responses = [], pageErrors = [];
    page.on('console', m => { if (['error','warning'].includes(m.type())) console_.push({ type: m.type(), text: m.text().slice(0,300), loc: m.location()?.url?.slice(0,120) }); });
    page.on('pageerror', e => pageErrors.push(String(e).slice(0,300)));
    page.on('requestfailed', r => failed.push({ url: r.url().slice(0,140), err: r.failure()?.errorText }));
    page.on('response', r => { if (r.status() >= 400) responses.push({ url: r.url().slice(0,140), status: r.status() }); });
    const netlog = [];
    await installShim(context, netlog);
    await page.addInitScript(PERF_INIT);

    const t0 = Date.now();
    let navErr = null, finalUrl = null, status = null;
    try {
      const resp = await page.goto(p.url, { waitUntil: 'load', timeout: 60000 });
      status = resp?.status();
    } catch (e) { navErr = String(e).slice(0,200); }
    const navMs = Date.now() - t0;
    try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch(e) {}
    await page.waitForTimeout(1500);
    finalUrl = page.url();

    // scroll through the page to trigger lazy content + CLS from lazy images
    try {
      await page.evaluate(async () => {
        const h = document.documentElement.scrollHeight;
        for (let y = 0; y < h; y += window.innerHeight * 0.9) {
          window.scrollTo(0, y);
          await new Promise(r => setTimeout(r, 120));
        }
        window.scrollTo(0, 0);
        await new Promise(r => setTimeout(r, 400));
      });
    } catch(e) {}
    await page.waitForTimeout(800);

    let data = null, evalErr = null;
    try { data = await page.evaluate(AUDIT); } catch (e) { evalErr = String(e).slice(0,400); }

    try { await page.screenshot({ path: path.join(OUT, id + '.png'), fullPage: false }); } catch(e){}

    results[id] = { url: p.url, finalUrl, status, navMs, navErr, evalErr,
      netlog: netlog.slice(0, 200), netlogTotal: netlog.length,
      netBytes: netlog.reduce((a,b)=>a+(b.bytes||0),0),
      netBad: netlog.filter(n => !n.status || n.status >= 400),
      console: console_.slice(0,25), consoleTotal: console_.length,
      pageErrors, failed: failed.slice(0,20), failedTotal: failed.length,
      http4xx5xx: responses.slice(0,20), http4xx5xxTotal: responses.length,
      ...data };

    await context.close();
  }
}

await browser.close();
fs.writeFileSync(path.join(OUT, 'raw.json'), JSON.stringify(results, null, 2));
process.stderr.write('\nDONE\n');
