import { chromium, devices } from 'playwright';
import { shim } from './shim.mjs';
const b = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } });
const ctx = await b.newContext({ ...devices['iPhone 13'], locale:'uk-UA' });
const log = []; await shim(ctx, log);
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0,200)));
await p.goto('https://gherman.com.ua/', { waitUntil:'load', timeout:60000 });
await p.waitForTimeout(5000);
const read = () => p.evaluate(() => document.getElementById('variants-count')?.innerText.trim());
console.log('на завантаженні:', await read());
console.log('чи є функція в глобальній області:', await p.evaluate(() => typeof window.updateVariantsCount));
// рахуємо, скільки разів взагалі летів counting-запит select=id,price
const cnt = () => log.filter(l => /select=id,price/.test(l.url)).length;
console.log('запитів лічильника за весь час завантаження:', cnt());
// клікаємо категорію
await p.evaluate(() => document.getElementById('catpill-house')?.click());
await p.waitForTimeout(4000);
console.log('після «Будинок»:', await read(), '| запитів лічильника:', cnt());
// змінюємо кімнати (там є явний addEventListener)
await p.evaluate(() => { const r = document.getElementById('rooms-filter'); if (r) { r.value = '2'; r.dispatchEvent(new Event('input', { bubbles:true })); } });
await p.waitForTimeout(4000);
console.log('після зміни «Кімнат»=2:', await read(), '| запитів лічильника:', cnt());
console.log('URL-и лічильника:', log.filter(l=>/select=id,price/.test(l.url)).map(l=>l.status+' '+l.url.replace(/.*rest\/v1\//,'')).slice(0,5));
console.log('pageerrors:', JSON.stringify(errs));
await b.close();
