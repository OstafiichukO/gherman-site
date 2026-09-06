import { chromium, devices } from 'playwright';
import { shim } from './shim.mjs';
import fs from 'fs';
const OUT = new URL('./out/', import.meta.url).pathname;
const CATS = ['flat','house','land','newbuild','commerce','rental'];
const R = {};
const browser = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } });

for (const view of ['mobile','desktop']) {
  const ctx = await browser.newContext(view === 'mobile'
    ? { ...devices['iPhone 13'], locale: 'uk-UA' }
    : { viewport: { width: 1440, height: 900 }, locale: 'uk-UA' });
  const log = []; await shim(ctx, log);
  const page = await ctx.newPage();
  await page.goto('https://gherman.com.ua/', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(3500);

  R[view] = {};
  for (const c of CATS) {
    const mark = log.length;
    const clicked = await page.evaluate((c) => {
      const el = document.getElementById('catpill-' + c);
      if (!el) return 'no #catpill-' + c;
      el.click(); return 'ok';
    }, c);
    await page.waitForTimeout(6000);
    const state = await page.evaluate(() => {
      const counter = [...document.querySelectorAll('*')].filter(e => !e.children.length && /варіант/i.test(e.innerText||'')).map(e=>e.innerText.trim())[0] || null;
      const empty = document.querySelector('.no-results-card');
      const cards = document.querySelectorAll('.cp-card, .acc-card, [class*=obj-card]').length;
      return { counter, empty: empty ? (empty.innerText||'').replace(/\s+/g,' ').trim().slice(0,120) : null,
        cards, url: location.href,
        heading: document.querySelector('h1')?.innerText.trim().slice(0,60) || null,
        title: document.title.slice(0,70) };
    });
    const reqs = log.slice(mark).filter(l => /supabase/.test(l.url))
      .map(l => l.status + ' ' + l.url.replace(/.*rest\/v1\//,'').replace(/&order=.*/,'').slice(0,95));
    R[view][c] = { clicked, ...state, reqs };
    await page.screenshot({ path: `${OUT}cat-${view}-${c}.png` });
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync(OUT + 'categories.json', JSON.stringify(R, null, 2));
for (const v of Object.keys(R)) { console.log('=== ' + v + ' ==='); for (const c of CATS) {
  const x = R[v][c];
  console.log(` ${c.padEnd(9)} карток=${String(x.cards).padEnd(4)} лічильник=${String(x.counter).padEnd(16)} url=${(x.url||'').replace('https://gherman.com.ua','')}`);
  if (x.empty) console.log(`   ПОРОЖНЬО: ${x.empty}`);
  x.reqs.forEach(r => console.log('   ' + r));
} }
