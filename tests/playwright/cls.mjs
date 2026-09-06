import { chromium, devices } from 'playwright';
import { shim } from './shim.mjs';
const INIT = () => { window.__s=[]; window.__c=0;
  try { new PerformanceObserver(l=>{ for(const e of l.getEntries()) if(!e.hadRecentInput){ window.__c+=e.value;
    if(e.value>0.01) window.__s.push({v:+e.value.toFixed(4), t:Math.round(e.startTime),
      src:(e.sources||[]).slice(0,3).map(s=>{const n=s.node; if(!n||!n.tagName) return '?';
        return n.tagName+(n.id?'#'+n.id:'')+(typeof n.className==='string'&&n.className.trim()?'.'+n.className.trim().split(/\s+/)[0]:'')
          +(n.tagName==='IMG'?' src='+String(n.currentSrc||n.src).slice(-28):'');})});
  }}).observe({type:'layout-shift',buffered:true}); } catch(e){} };
const b = await chromium.launch({ proxy:{server:process.env.HTTPS_PROXY} });
for (const [name,ctxOpt,url] of [
  ['home-desktop',{viewport:{width:1440,height:900},locale:'uk-UA'},'https://gherman.com.ua/'],
  ['home-mobile',{...devices['iPhone 13'],locale:'uk-UA'},'https://gherman.com.ua/'],
]) {
  const ctx = await b.newContext(ctxOpt); await shim(ctx);
  const p = await ctx.newPage(); await p.addInitScript(INIT);
  await p.goto(url,{waitUntil:'load',timeout:90000});
  await p.waitForTimeout(4000);
  const r = await p.evaluate(()=>({cls:+window.__c.toFixed(4), shifts:window.__s,
    imgsNoDims:[...document.images].filter(i=>!(i.hasAttribute('width')&&i.hasAttribute('height'))&&getComputedStyle(i).aspectRatio==='auto')
      .map(i=>({src:String(i.currentSrc||i.src).slice(-30),nat:i.naturalWidth+'x'+i.naturalHeight,
        box:Math.round(i.getBoundingClientRect().width)+'x'+Math.round(i.getBoundingClientRect().height),lazy:i.loading})).slice(0,14)}));
  console.log('###',name,'CLS =',r.cls);
  r.shifts.forEach(s=>console.log(`   +${s.v} на ${s.t}мс ← ${s.src.join(' | ')}`));
  console.log('   зображення без зарезервованого місця:');
  r.imgsNoDims.forEach(i=>console.log(`     ${i.src} нат.${i.nat} показ ${i.box} lazy=${i.lazy}`));
  await ctx.close();
}
await b.close();
