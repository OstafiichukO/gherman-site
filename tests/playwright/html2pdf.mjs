import { chromium } from 'playwright';
const [,, htmlPath, pdfPath, titleText] = process.argv;
const b = await chromium.launch();
const p = await b.newPage();
await p.goto('file://' + htmlPath, { waitUntil: 'networkidle' });
await p.emulateMedia({ media: 'print' });
const foot = `<div style="width:100%;font-family:'DejaVu Sans',sans-serif;font-size:7pt;color:#8a8177;
  padding:0 14mm;display:flex;justify-content:space-between;align-items:center;">
  <span>${titleText}</span>
  <span>Стор. <span class="pageNumber"></span> з <span class="totalPages"></span></span>
</div>`;
await p.pdf({
  path: pdfPath, format: 'A4', printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate: foot,
  margin: { top: '16mm', bottom: '18mm', left: '14mm', right: '14mm' },
});
await b.close();
console.log('готово');
