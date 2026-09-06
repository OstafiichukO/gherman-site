import { chromium, devices } from 'playwright';
import { shim } from './shim.mjs';
import fs from 'fs';
const OUT = new URL('./out/', import.meta.url).pathname;

const CONTRAST = () => {
  const parse = c => { const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/); 
    return m ? { r:+m[1], g:+m[2], b:+m[3], a: m[4]===undefined?1:+m[4] } : null; };
  const lin = v => { v/=255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
  const lum = c => 0.2126*lin(c.r) + 0.7152*lin(c.g) + 0.0722*lin(c.b);
  const over = (fg, bg) => ({ r: fg.r*fg.a + bg.r*(1-fg.a), g: fg.g*fg.a + bg.g*(1-fg.a), b: fg.b*fg.a + bg.b*(1-fg.a), a: 1 });
  const bgOf = el => {
    let n = el;
    while (n && n !== document.documentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.95) return c;
      if (c && c.a > 0) { const under = bgOf(n.parentElement || document.body); return over(c, under); }
      n = n.parentElement;
    }
    return { r:255, g:255, b:255, a:1 };
  };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05); };
  const sel = el => el.tagName.toLowerCase() + (el.id?'#'+el.id:'') + (typeof el.className==='string'&&el.className.trim()?'.'+el.className.trim().split(/\s+/)[0]:'');

  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.children.length) continue;
    const txt = (el.innerText || '').trim();
    if (txt.length < 2) continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
    // пропускаємо текст поверх фонового зображення — там фон не порахувати надійно
    let hasImgBg = false; let n = el;
    while (n && n !== document.documentElement) { if (getComputedStyle(n).backgroundImage !== 'none') { hasImgBg = true; break; } n = n.parentElement; }
    if (hasImgBg) continue;
    const fg = parse(cs.color); if (!fg) continue;
    const bg = bgOf(el);
    const eff = fg.a < 1 ? over(fg, bg) : fg;
    const cr = ratio(eff, bg);
    const fs = parseFloat(cs.fontSize), fw = parseInt(cs.fontWeight) || 400;
    const large = fs >= 24 || (fs >= 18.66 && fw >= 700);
    const need = large ? 3 : 4.5;
    if (cr < need) out.push({ sel: sel(el), text: txt.slice(0,40), ratio: +cr.toFixed(2), need, fs, color: cs.color, bg: `rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})` });
  }
  const seen = new Set();
  return out.filter(o => { const k = o.sel + '|' + o.color + '|' + o.bg; if (seen.has(k)) return false; seen.add(k); return true; })
            .sort((a,b) => a.ratio - b.ratio);
};

const KEYBOARD = () => {
  const focusables = [...document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]')]
    .filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && getComputedStyle(e).visibility !== 'hidden'; });
  const positiveTabindex = focusables.filter(e => +(e.getAttribute('tabindex')||0) > 0).length;
  // чи є видимий focus-стиль: порівнюємо outline до/після :focus неможливо статично,
  // тому дивимось, чи автор не прибив outline:none глобально
  let outlineNone = 0;
  for (const e of focusables.slice(0, 200)) { e.focus(); const cs = getComputedStyle(e);
    if ((cs.outlineStyle === 'none' || cs.outlineWidth === '0px') && cs.boxShadow === 'none') outlineNone++; }
  document.activeElement?.blur?.();
  return { focusables: focusables.length, positiveTabindex, withoutVisibleFocus: outlineNone };
};

const R = {};
const browser = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } });
const PAGES = [
  ['home','https://gherman.com.ua/'],
  ['listing','https://gherman.com.ua/listings/01aa4881-6eff-40a2-ba44-2be4b0ac6b40.html'],
  ['rayon','https://gherman.com.ua/rayony/flat-tsentr.html'],
  ['article','https://gherman.com.ua/baza-znan/yak-kupyty-kvartyru-v-chernivtsyah.html'],
  ['guide','https://gherman.com.ua/gid-po-neruhomosti-chernivtsi.html'],
];
for (const view of ['mobile','desktop']) {
  for (const [key, url] of PAGES) {
    const ctx = await browser.newContext(view === 'mobile' ? { ...devices['iPhone 13'], locale:'uk-UA' } : { viewport:{width:1440,height:900}, locale:'uk-UA' });
    await shim(ctx);
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(view === 'mobile' && key === 'home' ? 5000 : 1500);
    const contrast = await page.evaluate(CONTRAST);
    const kb = await page.evaluate(KEYBOARD);
    R[`${key}-${view}`] = { contrastFails: contrast.length, worst: contrast.slice(0, 8), kb };
    await ctx.close();
  }
}
await browser.close();
fs.writeFileSync(OUT + 'a11y.json', JSON.stringify(R, null, 2));
for (const [k, v] of Object.entries(R)) {
  console.log(`=== ${k} === контраст-провалів: ${v.contrastFails} | фокусованих: ${v.kb.focusables}, tabindex>0: ${v.kb.positiveTabindex}, без видимого фокусу: ${v.kb.withoutVisibleFocus}`);
  v.worst.forEach(w => console.log(`   ${String(w.ratio).padStart(5)}:1 (треба ${w.need}) ${w.fs}px ${w.color} на ${w.bg}  ${w.sel}  «${w.text}»`));
}
