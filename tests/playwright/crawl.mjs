import fs from 'fs';
const OUT = new URL('./out/', import.meta.url).pathname;
const REPO = '/home/user/gherman-site';

// 1) всі URL із sitemap.xml
const sm = fs.readFileSync(REPO + '/sitemap.xml', 'utf8');
const smUrls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);

// 2) всі зовнішні та внутрішні посилання з усіх статичних HTML
const files = [];
const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
  if (e.name === '.git' || e.name === 'node_modules' || e.name === 'tests') continue;
  const p = d + '/' + e.name;
  if (e.isDirectory()) walk(p); else if (e.name.endsWith('.html')) files.push(p);
} };
walk(REPO);
const linkMap = new Map(); // url -> Set(файли, де зустрічається)
for (const f of files) {
  const h = fs.readFileSync(f, 'utf8');
  for (const m of h.matchAll(/href="(https?:\/\/[^"#]+)"/g)) {
    const u = m[1];
    if (!linkMap.has(u)) linkMap.set(u, new Set());
    linkMap.get(u).add(f.replace(REPO + '/', ''));
  }
}

const check = async (url, method = 'HEAD') => {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 25000);
    const r = await fetch(url, { method, redirect: 'manual', signal: c.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' } });
    clearTimeout(t);
    return { status: r.status, loc: r.headers.get('location') || null };
  } catch (e) { return { status: 0, err: String(e.cause?.code || e.name || e).slice(0, 60) }; }
};

async function pool(items, n, fn) {
  const res = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; res[k] = await fn(items[k], k); }
  }));
  return res;
}

// --- sitemap ---
process.stderr.write(`sitemap: ${smUrls.length} URL\n`);
let done = 0;
const smRes = await pool(smUrls, 12, async (u) => {
  let r = await check(u);
  if (r.status === 405 || r.status === 0) r = await check(u, 'GET');
  if (++done % 100 === 0) process.stderr.write(`  ${done}/${smUrls.length}\n`);
  return { url: u, ...r };
});

// --- зовнішні посилання ---
const ext = [...linkMap.keys()].filter(u => !u.includes('gherman.com.ua'));
process.stderr.write(`зовнішніх посилань: ${ext.length}\n`);
const extRes = await pool(ext, 8, async (u) => {
  let r = await check(u, 'GET');
  return { url: u, ...r, from: [...linkMap.get(u)].slice(0, 3) };
});

// --- внутрішні посилання, яких немає в sitemap ---
const smSet = new Set(smUrls);
const intOnly = [...linkMap.keys()].filter(u => u.includes('gherman.com.ua') && !smSet.has(u));
process.stderr.write(`внутрішніх поза sitemap: ${intOnly.length}\n`);
const intRes = await pool(intOnly, 12, async (u) => ({ url: u, ...(await check(u)), from: [...linkMap.get(u)].slice(0, 3) }));

const out = { smRes, extRes, intRes,
  smBad: smRes.filter(r => r.status !== 200),
  extBad: extRes.filter(r => !(r.status >= 200 && r.status < 400)),
  intBad: intRes.filter(r => r.status !== 200) };
fs.writeFileSync(OUT + 'crawl.json', JSON.stringify(out, null, 2));
console.log('=== SITEMAP ===', smRes.length, 'перевірено, не-200:', out.smBad.length);
out.smBad.slice(0, 40).forEach(r => console.log('  ', r.status, r.err || '', r.url));
console.log('=== ЗОВНІШНІ ===', extRes.length, 'перевірено, проблемних:', out.extBad.length);
out.extBad.forEach(r => console.log('  ', r.status, r.err || '', r.url, '<-', r.from.join(', ')));
console.log('=== ВНУТРІШНІ поза sitemap ===', intRes.length, 'проблемних:', out.intBad.length);
out.intBad.slice(0, 30).forEach(r => console.log('  ', r.status, r.err || '', r.url, '<-', r.from.join(', ')));
