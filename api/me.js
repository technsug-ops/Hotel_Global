import { readJSON, writeJSON, listPaths, newId, isId, fail } from './_lib.js';

/*
 * Çalışanın kişisel izin linki: /i.html?t={token}
 * Çalışan yalnızca kendi adını, izin hakkını ve kendi kayıtlarını görür; ücret ve başkalarının bilgisi yoktur.
 */
const TYPES = ['urlaub', 'krank', 'kind', 'sonder', 'unbezahlt', 'schule'];
const NEEDS_OK = ['urlaub', 'sonder', 'unbezahlt'];
const str = (v, n) => String(v ?? '').trim().slice(0, n);
const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '');
export const staffTokenPath = (t) => `stafftokens/${t}.json`;
function workdays(a, b) {
  if (!a || !b || b < a) return 0;
  let n = 0; const d = new Date(a + 'T12:00:00Z'), e = new Date(b + 'T12:00:00Z');
  for (; d <= e; d.setUTCDate(d.getUTCDate() + 1)) { const w = d.getUTCDay(); if (w !== 0 && w !== 6) n++; }
  return n;
}

async function person(req) {
  const t = req.query.t;
  if (!isId(t)) return null;
  const tk = await readJSON(staffTokenPath(t)).catch(() => null);
  if (!tk) return null;
  const p = await readJSON(`staff/${tk.data.id}.json`).catch(() => null);
  if (!p || !p.data.active || p.data.token !== t) return null;
  return p.data;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  try {
    const p = await person(req);
    if (!p) return fail(res, 404, 'e_link');
    const y = new Date().getFullYear(), y0 = `${y}-01-01`, y1 = `${y}-12-31`;
    const all = (await Promise.all((await listPaths('leave/')).map((x) => readJSON(x).catch(() => null)))).filter(Boolean).map((r) => r.data).filter((x) => x.staffId === p.id);
    if (req.method === 'GET') {
      const yr = all.filter((x) => x.to >= y0 && x.from <= y1);
      const clip = (x) => workdays(x.from < y0 ? y0 : x.from, x.to > y1 ? y1 : x.to);
      const used = yr.filter((x) => x.type === 'urlaub' && x.status === 'genehmigt').reduce((n, x) => n + clip(x), 0);
      const pending = yr.filter((x) => x.type === 'urlaub' && x.status === 'beantragt').reduce((n, x) => n + clip(x), 0);
      const entries = all.filter((x) => x.to >= y0).sort((a, b) => b.from.localeCompare(a.from)).slice(0, 50)
        .map(({ id, type, from, to, status, note, au }) => ({ id, type, from, to, status, note, au, days: workdays(from, to) }));
      return res.status(200).json({ name: p.name, dept: p.dept, vacDays: p.vacDays || 0, used, pending, left: (p.vacDays || 0) - used, year: y, entries });
    }
    if (req.method === 'POST') {
      const b = req.body || {}, type = TYPES.includes(b.type) ? b.type : 'urlaub';
      const from = date(b.from), to = date(b.to) || from;
      if (!from) return fail(res, 400, 'e_leave_fields');
      if (to < from) return fail(res, 400, 'e_leave_dates');
      if ((new Date(to) - new Date(from)) / 864e5 > 120) return fail(res, 400, 'e_leave_long');
      if (all.filter((x) => x.status === 'beantragt').length >= 6) return fail(res, 429, 'e_leave_many');
      const now = new Date().toISOString();
      const x = { id: newId(), staffId: p.id, type, from, to, note: str(b.note, 500), au: !!b.au, by: `${p.name} (link)`, createdAt: now, status: NEEDS_OK.includes(type) ? 'beantragt' : 'gemeldet', self: true };
      await writeJSON(`leave/${x.id}.json`, x);
      return res.status(201).json({ ok: true, status: x.status });
    }
    return res.status(405).end();
  } catch (e) {
    console.error('me', e);
    return fail(res, 500, 'e_server');
  }
}
