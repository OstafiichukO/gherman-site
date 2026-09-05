import { chromium, devices } from 'playwright';
const HOP=new Set(['content-encoding','content-length','transfer-encoding','connection','keep-alive']);
const b = await chromium.launch({ proxy:{server:process.env.HTTPS_PROXY} });
for (const mode of ['mobile','desktop']) {
  const ctx = await b.newContext(mode==='mobile' ? {...devices['iPhone 13'],locale:'uk-UA'} : {viewport:{width:1440,height:900},locale:'uk-UA'});
  const log=[];
  await ctx.route('**/*', async route => { const r=route.request(),u=r.url();
    if(!/^https?:/.test(u)) return route.continue();
    const h={...r.headers()}; delete h['accept-encoding']; delete h['host'];
    try{ const res=await fetch(u,{method:r.method(),headers:h,body:['GET','HEAD'].includes(r.method())?undefined:r.postDataBuffer(),redirect:'follow'});
      const buf=Buffer.from(await res.arrayBuffer()); const o={}; for(const[k,v] of res.headers) if(!HOP.has(k.toLowerCase())) o[k]=v;
      log.push({u:u.slice(0,120),s:res.status}); await route.fulfill({status:res.status,headers:o,body:buf});
    }catch(e){ log.push({u:u.slice(0,120),s:0}); await route.abort('failed'); } });
  const p = await ctx.newPage();
  await p.goto('https://gherman.com.ua/',{waitUntil:'load',timeout:60000});
  await p.waitForTimeout(12000);
  const st = await p.evaluate(()=>{
    const e=document.getElementById('excl-list');
    return { html: e? e.innerHTML.replace(/\s+/g,' ').replace(/data:image[^"]{20,}/g,'data:image[...]').slice(0,400):'no #excl-list',
             text: e? (e.innerText||'').replace(/\s+/g,' ').trim().slice(0,200):'',
             rentalBlock: [...document.querySelectorAll('[id*=rental],[id*=orenda]')].map(x=>x.id+':'+((x.innerText||'').replace(/\s+/g,' ').trim().slice(0,60))).slice(0,6) };
  });
  console.log('###', mode, p.url());
  console.log(' text:', st.text);
  console.log(' html:', st.html);
  console.log(' rental:', JSON.stringify(st.rentalBlock));
  console.log(' 401s:', log.filter(x=>x.s===401).length, 'attempts to manual_listings:', log.filter(x=>/manual_listings/.test(x.u)).length);
  await p.screenshot({path:new URL('./out/excl-'+mode+'.png',import.meta.url).pathname});
  await ctx.close();
}
await b.close();
