import { chromium, devices } from 'playwright';
import { shim } from './shim.mjs';
const b = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } });
for (const view of ['mobile','desktop']) {
  const ctx = await b.newContext(view==='mobile' ? {...devices['iPhone 13'],locale:'uk-UA'} : {viewport:{width:1440,height:900},locale:'uk-UA'});
  await shim(ctx);
  const p = await ctx.newPage();
  await p.goto('https://gherman.com.ua/', { waitUntil:'load', timeout:60000 });
  await p.waitForTimeout(5000);
  const read = () => p.evaluate(() => ({
    budgetText: document.getElementById('budget-display')?.innerText.replace(/\s+/g,' ').trim() || null,
    variants: [...document.querySelectorAll('*')].filter(e=>!e.children.length && /^\d[\d\s ]*варіант/.test((e.innerText||'').trim())).map(e=>e.innerText.trim())[0] || null,
    selectedBudget: window.selectedBudget ?? null,
    currentCategory: window.currentCategory ?? null,
    feedCards: document.querySelectorAll('.acc-card').length,
  }));
  console.log('###', view, 'на завантаженні:', JSON.stringify(await read()));
  // рухаємо повзунок бюджету в максимум
  await p.evaluate(() => { const t=document.getElementById('budget-track'); if(!t) return;
    const r=t.getBoundingClientRect();
    for (const type of ['pointerdown','pointermove','pointerup']) t.dispatchEvent(new PointerEvent(type,{bubbles:true,clientX:r.right-1,clientY:r.top+r.height/2}));
  });
  await p.waitForTimeout(3000);
  console.log('   після зсуву бюджету вправо:', JSON.stringify(await read()));
  await p.evaluate(() => document.getElementById('catpill-house')?.click());
  await p.waitForTimeout(5000);
  console.log('   після «Будинок»:', JSON.stringify(await read()));
  await ctx.close();
}
await b.close();
