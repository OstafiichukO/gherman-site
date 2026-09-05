import { chromium, devices } from 'playwright';
const HOP=new Set(['content-encoding','content-length','transfer-encoding','connection','keep-alive']);
const b = await chromium.launch({ proxy:{server:process.env.HTTPS_PROXY} });
const ctx = await b.newContext({...devices['iPhone 13'],locale:'uk-UA'});
const log=[];
await ctx.route('**/*', async route => { const r=route.request(),u=r.url();
  if(!/^https?:/.test(u)) return route.continue();
  const h={...r.headers()}; delete h['accept-encoding']; delete h['host'];
  try{ const res=await fetch(u,{method:r.method(),headers:h,body:['GET','HEAD'].includes(r.method())?undefined:r.postDataBuffer(),redirect:'follow'});
    const buf=Buffer.from(await res.arrayBuffer()); const o={}; for(const[k,v] of res.headers) if(!HOP.has(k.toLowerCase())) o[k]=v;
    log.push({u:u.slice(0,130),s:res.status}); await route.fulfill({status:res.status,headers:o,body:buf});
  }catch(e){ log.push({u:u.slice(0,130),s:0}); await route.abort('failed'); } });
const p = await ctx.newPage();
await p.goto('https://gherman.com.ua/',{waitUntil:'load',timeout:60000});
await p.waitForTimeout(3000);
const mark = log.length;

// ---- Оренда ----
await p.evaluate(()=>document.getElementById('catpill-rental')?.click());
await p.waitForTimeout(9000);
console.log('=== ОРЕНДА ===');
console.log(' нові запити:', JSON.stringify(log.slice(mark).map(x=>x.s+' '+x.u.replace('https://yglebmbtdyjyqnmwwsku.supabase.co/rest/v1/','sb:')),null,0));
console.log(' видимий текст:', await p.evaluate(()=>{
  const s=[...document.querySelectorAll('section,div')].find(e=>/оренд/i.test(e.className||'')||/rental/i.test(e.id||''));
  return (document.body.innerText||'').replace(/\s+/g,' ').slice(0,400);
}));
await p.screenshot({path:new URL('./out/flow-rental.png',import.meta.url).pathname});

// ---- клік по картці каталогу -> модалка + галерея ----
await p.evaluate(()=>document.getElementById('catpill-flat')?.click());
await p.waitForTimeout(2500);
const card = await p.evaluate(()=>{
  const c=[...document.querySelectorAll('[onclick],[class*=card]')].find(e=>/openObj|obj-card|cp-card/.test((e.getAttribute('onclick')||'')+' '+(e.className||'')) && e.getClientRects().length);
  if(!c) return 'no card';
  c.click(); return 'clicked '+(c.className||c.getAttribute('onclick')||'').slice(0,60);
});
await p.waitForTimeout(2500);
const modal = await p.evaluate(()=>{
  const o=document.getElementById('obj-modal-overlay');
  if(!o||!o.getClientRects().length) return {open:false};
  const imgs=[...o.querySelectorAll('img')].map(i=>({nat:i.naturalWidth+'x'+i.naturalHeight, box:Math.round(i.getBoundingClientRect().width)+'x'+Math.round(i.getBoundingClientRect().height), lazy:i.loading, wh:i.hasAttribute('width')}));
  return {open:true, bodyOverflow:getComputedStyle(document.body).overflow, url:location.href,
    imgs:imgs.slice(0,6), imgCount:imgs.length,
    text:(o.innerText||'').replace(/\s+/g,' ').slice(0,180),
    focusInModal: o.contains(document.activeElement), active: document.activeElement?.tagName};
});
console.log('=== КАРТКА/МОДАЛКА ===', card);
console.log(JSON.stringify(modal,null,1));
// Escape / back
const esc = await p.evaluate(()=>{document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));return 1;});
await p.waitForTimeout(600);
console.log(' після Escape відкрито:', await p.evaluate(()=>{const o=document.getElementById('obj-modal-overlay');return !!(o&&o.getClientRects().length);}));
await p.goBack().catch(()=>{});
await p.waitForTimeout(1200);
console.log(' після Back: url=', p.url(), 'модалка відкрита=', await p.evaluate(()=>{const o=document.getElementById('obj-modal-overlay');return !!(o&&o.getClientRects().length);}));
await p.screenshot({path:new URL('./out/flow-modal.png',import.meta.url).pathname});
await b.close();
