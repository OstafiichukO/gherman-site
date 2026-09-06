import { chromium, devices } from 'playwright';
import { shim } from './shim.mjs';
import fs from 'fs';
const OUT = new URL('./out/', import.meta.url).pathname;
const S = 'https://gherman.com.ua';
const PAGES = [
  ['listing-flat-photo',  `${S}/listings/6039cd78-ac60-4a00-95ba-a37803e2ee61.html`],
  ['listing-flat-nophoto',`${S}/listings/e897dea1-1126-4cd7-af56-eeea3dc63675.html`],
  ['listing-house-photo', `${S}/listings/4c9efaec-c096-4786-bed2-cdb0f167223f.html`],
  ['listing-land-photo',  `${S}/listings/6543b4d5-389c-4737-821e-39511184f610.html`],
  ['listing-land-nophoto',`${S}/listings/e901c112-a3fe-4534-ae88-e41ab6076a16.html`],
  ['listing-commerce',    `${S}/listings/bdc0e2f0-a26b-46b8-b923-f9ab35731d9d.html`],
  ['guide',               `${S}/gid-po-neruhomosti-chernivtsi.html`],
  ['article-faq',         `${S}/baza-znan/chasti-zapytannia-pro-kupivliu-prodazh-neruhomosti-chernivtsi.html`],
  ['article-rooms',       `${S}/baza-znan/1-kimnatni-kvartyry-chernivtsi.html`],
  ['rayon-house',         `${S}/rayony/house-rosha.html`],
];
const PERF = () => { window.__cls=0; try{ new PerformanceObserver(l=>{for(const e of l.getEntries()) if(!e.hadRecentInput) window.__cls+=e.value;}).observe({type:'layout-shift',buffered:true}); }catch(e){}
  window.__lcp=0; try{ new PerformanceObserver(l=>{const e=l.getEntries().at(-1); window.__lcp=e.startTime; window.__lcpEl=e.element?e.element.tagName:'';}).observe({type:'largest-contentful-paint',buffered:true}); }catch(e){} };

const R = {};
const b = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } });
for (const view of ['mobile','desktop']) {
  for (const [key, url] of PAGES) {
    const ctx = await b.newContext(view==='mobile' ? {...devices['iPhone 13'],locale:'uk-UA'} : {viewport:{width:1440,height:900},locale:'uk-UA'});
    const log = []; await shim(ctx, log);
    const page = await ctx.newPage();
    await page.addInitScript(PERF);
    const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0,150)));
    let status = null;
    try { const r = await page.goto(url, { waitUntil:'load', timeout:60000 }); status = r?.status(); } catch(e) {}
    await page.waitForTimeout(2500);
    await page.evaluate(async () => { const h=document.documentElement.scrollHeight;
      for (let y=0; y<h; y+=innerHeight*0.9) { scrollTo(0,y); await new Promise(r=>setTimeout(r,100)); } scrollTo(0,0);
      await new Promise(r=>setTimeout(r,300)); });
    await page.waitForTimeout(600);
    const d = await page.evaluate(() => {
      const imgs=[...document.images];
      const broken = imgs.filter(i=>i.complete && i.naturalWidth===0 && i.getAttribute('src'));
      return {
        title: document.title.slice(0,75),
        h1: document.querySelector('h1')?.innerText.trim().slice(0,60) || null,
        canonical: document.querySelector('link[rel=canonical]')?.href?.replace('https://gherman.com.ua','') || null,
        robots: document.querySelector('meta[name=robots]')?.content || null,
        ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map(s=>{try{const j=JSON.parse(s.textContent);return j['@type'];}catch(e){return 'BROKEN-JSON';}}),
        imgs: imgs.length, broken: broken.length,
        brokenSrc: broken.map(i=>String(i.src).slice(0,80)).slice(0,3),
        imgNoDims: imgs.filter(i=>!(i.hasAttribute('width')&&i.hasAttribute('height'))).length,
        imgLazyFirst: imgs[0]?.loading || null,
        cls: +(window.__cls||0).toFixed(3), lcpEl: window.__lcpEl||null,
        links: document.querySelectorAll('a[href]').length,
        internalLinks: [...document.querySelectorAll('a[href]')].filter(a=>a.href.includes('gherman.com.ua')).length,
        docH: document.documentElement.scrollHeight,
        textLen: (document.body.innerText||'').replace(/\s+/g,' ').trim().length,
        bodySample: (document.body.innerText||'').replace(/\s+/g,' ').trim().slice(0,110),
      };
    });
    R[`${key}-${view}`] = { status, errs, ...d, reqBad: log.filter(l=>!l.status||l.status>=400).map(l=>l.status+' '+l.url.slice(0,80)) };
    if (view==='mobile') await page.screenshot({ path: `${OUT}pt-${key}.png`, fullPage: false });
    await ctx.close();
  }
}
await b.close();
fs.writeFileSync(OUT+'pagetypes.json', JSON.stringify(R,null,2));
for (const [k,v] of Object.entries(R)) {
  console.log(`=== ${k} === ${v.status} CLS=${v.cls} LCP=${v.lcpEl} img=${v.imgs}(биті ${v.broken}, без розмірів ${v.imgNoDims}, перше lazy=${v.imgLazyFirst}) посилань=${v.links}/внутр ${v.internalLinks} текст=${v.textLen} ld=${JSON.stringify(v.ld)} robots=${v.robots}`);
  console.log(`    title: ${v.title}`);
  console.log(`    h1: ${v.h1} | canonical: ${v.canonical}`);
  if (v.broken) console.log(`    БИТІ ЗОБРАЖЕННЯ: ${v.brokenSrc.join(' ')}`);
  if (v.reqBad.length) console.log(`    погані запити: ${v.reqBad.join(' | ')}`);
  if (v.errs.length) console.log(`    JS-помилки: ${v.errs.join(' | ')}`);
}
