const HOP = new Set(['content-encoding','content-length','transfer-encoding','connection','keep-alive']);
export async function shim(context, log = []) {
  await context.route('**/*', async (route) => {
    const req = route.request(), url = req.url();
    if (!/^https?:/.test(url)) return route.continue();
    const h = { ...req.headers() }; delete h['accept-encoding']; delete h['host'];
    try {
      const res = await fetch(url, { method: req.method(), headers: h,
        body: ['GET','HEAD'].includes(req.method()) ? undefined : req.postDataBuffer(), redirect: 'follow' });
      const buf = Buffer.from(await res.arrayBuffer());
      const o = {}; for (const [k, v] of res.headers) if (!HOP.has(k.toLowerCase())) o[k] = v;
      log.push({ url: url.slice(0,150), status: res.status, bytes: buf.length, type: req.resourceType() });
      await route.fulfill({ status: res.status, headers: o, body: buf });
    } catch (e) { log.push({ url: url.slice(0,150), status: 0, err: String(e).slice(0,90) }); await route.abort('failed'); }
  });
  return log;
}
