import { chromium, devices } from 'playwright';
import { shim } from './shim.mjs';
import fs from 'fs';
const OUT = new URL('./out/', import.meta.url).pathname;
const R = { cpu: {}, viewports: {} };
const browser = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } });

const PERF_INIT = () => {
  window.__lcp = 0; window.__lt = []; window.__cls = 0;
  try { new PerformanceObserver(l => { const e = l.getEntries().at(-1); window.__lcp = e.startTime; }).observe({ type:'largest-contentful-paint', buffered:true }); } catch(e){}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.duration > 50) window.__lt.push(Math.round(e.duration)); }).observe({ type:'longtask', buffered:true }); } catch(e){}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type:'layout-shift', buffered:true }); } catch(e){}
};

// ---------- А. Троттлінг CPU (емуляція недорогого телефона) ----------
for (const rate of [1, 4, 6]) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'uk-UA' });
  await shim(ctx);
  const page = await ctx.newPage();
  await page.addInitScript(PERF_INIT);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  const t0 = Date.now();
  await page.goto('https://gherman.com.ua/', { waitUntil: 'load', timeout: 120000 });
  const loadMs = Date.now() - t0;
  await page.waitForTimeout(6000);
  R.cpu['home-x' + rate] = { loadMs, ...(await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    return {
      fcp: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0),
      lcp: Math.round(window.__lcp), cls: +window.__cls.toFixed(3),
      domInteractive: Math.round(nav.domInteractive || 0),
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0),
      longTasks: window.__lt, longTaskTotal: window.__lt.reduce((a,b)=>a+b,0),
    };
  })) };
  // чи реагує інтерфейс: скільки триває клік по категорії
  const t1 = Date.now();
  await page.evaluate(() => document.getElementById('catpill-house')?.click());
  await page.waitForFunction(() => document.querySelectorAll('.acc-card, .cp-card').length > 1, { timeout: 60000 }).catch(()=>{});
  R.cpu['home-x' + rate].categorySwitchMs = Date.now() - t1;
  await ctx.close();
}

// ---------- Б. Матриця viewport-ів ----------
const VPS = [
  ['phone-320',      { width: 320, height: 640 }, true],
  ['phone-360',      { width: 360, height: 740 }, true],
  ['phone-390',      { width: 390, height: 844 }, true],
  ['phone-landscape',{ width: 844, height: 390 }, true],
  ['tablet-768',     { width: 768, height: 1024 }, true],
  ['tablet-820',     { width: 820, height: 1180 }, true],
  ['tablet-1024',    { width: 1024, height: 1366 }, true],
  ['laptop-1280',    { width: 1280, height: 800 }, false],
  ['desktop-1440',   { width: 1440, height: 900 }, false],
  ['wide-1920',      { width: 1920, height: 1080 }, false],
];
for (const [name, vp, touch] of VPS) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1,
    userAgent: touch ? devices['iPhone 13'].userAgent : undefined, locale: 'uk-UA' });
  await shim(ctx);
  const page = await ctx.newPage();
  await page.goto('https://gherman.com.ua/', { waitUntil: 'load', timeout: 90000 });
  await page.waitForTimeout(3500);
  const info = await page.evaluate(() => {
    const vw = innerWidth, docW = document.documentElement.scrollWidth;
    const bad = [];
    if (docW > vw + 1) for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
      if (getComputedStyle(el).position === 'fixed') continue;
      if (r.right + scrollX > vw + 1 && r.width <= docW)
        bad.push(el.tagName.toLowerCase() + (el.id?'#'+el.id:'') + (typeof el.className==='string'&&el.className.trim()?'.'+el.className.trim().split(/\s+/)[0]:''));
    }
    const main = document.querySelector('main, .wrap, .container') || document.body;
    // ширина основної колонки: беремо найширший видимий блок-контейнер під body
    const cols = [...document.body.children].map(e => Math.round(e.getBoundingClientRect().width)).filter(Boolean);
    const h1 = document.querySelector('h1');
    return { vw, docW, overflow: docW - vw, offenders: [...new Set(bad)].slice(0,6),
      docH: document.documentElement.scrollHeight,
      bodyChildrenWidths: [...new Set(cols)].slice(0,6),
      h1Width: h1 ? Math.round(h1.getBoundingClientRect().width) : null,
      contentWidth: Math.round(main.getBoundingClientRect().width),
      url: location.pathname };
  });
  R.viewports[name] = info;
  await page.screenshot({ path: `${OUT}vp-${name}.png` });
  await ctx.close();
}

await browser.close();
fs.writeFileSync(OUT + 'perf-viewports.json', JSON.stringify(R, null, 2));
console.log('=== CPU-троттлінг (мобільна головна) ===');
for (const [k, v] of Object.entries(R.cpu))
  console.log(` ${k.padEnd(10)} load=${String(v.loadMs).padStart(6)}мс FCP=${String(v.fcp).padStart(5)} LCP=${String(v.lcp).padStart(5)} DCL=${String(v.domContentLoaded).padStart(5)} CLS=${v.cls} довгі задачі: ${v.longTasks.length} шт / ${v.longTaskTotal}мс, перемикання категорії=${v.categorySwitchMs}мс`);
console.log('\n=== Viewport-и (головна) ===');
for (const [k, v] of Object.entries(R.viewports))
  console.log(` ${k.padEnd(16)} vw=${String(v.vw).padStart(4)} docW=${String(v.docW).padStart(4)} overflow=${String(v.overflow).padStart(4)} контент=${String(v.contentWidth).padStart(4)} h1=${String(v.h1Width).padStart(4)} шлях=${v.url}${v.offenders.length?' | ' + v.offenders.join(', '):''}`);
