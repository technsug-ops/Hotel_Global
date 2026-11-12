import { isStaff, readJSON, tokenPath, isId, fail } from './_lib.js';

const MAX_BYTES = 1_000_000;

/* Herkese açık (bağlantıya sahip olan herkes görüntüleyebilir) bir Google Sheets tablosunu CSV olarak getirir.
   Açık proxy olmaması için yalnız panel oturumu veya geçerli grup linki ile çalışır. */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { url, t } = req.body || {};
    let ok = isStaff(req);
    if (!ok && isId(t)) ok = !!(await readJSON(tokenPath(t)));
    if (!ok) return fail(res, 401, 'e_auth');

    let u;
    try { u = new URL(String(url || '')); } catch { return fail(res, 400, 'e_sheet_link'); }
    const m = u.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/);
    if (u.hostname !== 'docs.google.com' || !m) return fail(res, 400, 'e_sheet_link');
    const gid = (u.searchParams.get('gid') || (u.hash.match(/gid=(\d+)/) || [])[1] || '0').replace(/\D/g, '') || '0';

    const r = await fetch(`https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`, { redirect: 'follow' });
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !type.includes('text/csv')) {
      return fail(res, 400, 'e_sheet_private');
    }
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_BYTES) return fail(res, 413, 'e_sheet_big');
    return res.status(200).json({ csv: buf.toString('utf8') });
  } catch (e) {
    console.error('sheet', e);
    return fail(res, 500, 'e_sheet_failed');
  }
}
