import { chromium, devices } from 'playwright';
import { shim } from './shim.mjs';
const b = await chromium.launch({ proxy:{server:process.env.HTTPS_PROXY} });

// А. Десктоп: чи працює «ПОКАЗАТИ ОБ'ЄКТИ»
{
  const ctx = await b.newContext({viewport:{width:1440,height:900},locale:'uk-UA'}); await shim(ctx);
  const p = await ctx.newPage();
  await p.goto('https://gherman.com.ua/',{waitUntil:'load',timeout:90000});
  await p.waitForTimeout(3500);
  const before = await p.evaluate(()=>document.querySelectorAll('.acc-card').length);
  const btn = await p.evaluate(()=>{ const b=[...document.querySelectorAll('button,a,div')].find(e=>/показати об/i.test((e.innerText||'').trim()) && e.getClientRects().length);
    if(!b) return 'не знайдено'; b.click(); return (b.innerText||'').trim().slice(0,30); });
  await p.waitForTimeout(6000);
  const after = await p.evaluate(()=>({cards:document.querySelectorAll('.acc-card').length, url:location.href.replace('https://gherman.com.ua',''), y:Math.round(scrollY)}));
  console.log('=== десктоп «Показати об\'єкти» ===', 'кнопка:',btn,'| карток до:',before,'після:',after.cards,'| url:',after.url,'| скрол:',after.y);
  await ctx.close();
}
// Б. Фокус-пастка в модалці (мобільна)
{
  const ctx = await b.newContext({...devices['iPhone 13'],locale:'uk-UA'}); await shim(ctx);
  const p = await ctx.newPage();
  await p.goto('https://gherman.com.ua/?obj=01aa4881-6eff-40a2-ba44-2be4b0ac6b40',{waitUntil:'load',timeout:90000});
  await p.waitForTimeout(4000);
  const open = await p.evaluate(()=>{const o=document.getElementById('obj-modal-overlay');return !!(o&&o.getClientRects().length);});
  const trap = await p.evaluate(async ()=>{
    const o=document.getElementById('obj-modal-overlay'); if(!o) return 'модалка не знайдена';
    const seq=[];
    for(let i=0;i<12;i++){
      const foc=[...document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]')].filter(e=>e.getClientRects().length);
      const idx=foc.indexOf(document.activeElement);
      const next=foc[(idx+1)%foc.length]; if(!next) break; next.focus();
      seq.push({tag:next.tagName+(next.id?'#'+next.id:''), inModal:o.contains(next)});
    }
    return { escapedModal: seq.filter(s=>!s.inModal).length, total: seq.length,
             first: seq.slice(0,4).map(s=>s.tag+(s.inModal?'':' [ПОЗА МОДАЛКОЮ]')) };
  });
  console.log('=== фокус-пастка модалки об\'єкта ===','відкрита:',open);
  console.log('   ', JSON.stringify(trap));
  // чи повертається фокус і чи закривається по кліку на підкладку
  const backdrop = await p.evaluate(()=>{const o=document.getElementById('obj-modal-overlay'); if(!o) return 'n/a';
    o.dispatchEvent(new MouseEvent('click',{bubbles:true})); return 1;});
  await p.waitForTimeout(800);
  console.log('   після кліку по підкладці відкрита:', await p.evaluate(()=>{const o=document.getElementById('obj-modal-overlay');return !!(o&&o.getClientRects().length);}));
  await ctx.close();
}
await b.close();
