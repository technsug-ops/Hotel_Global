import { requireStaff, requireManager, isManager, readJSON, writeJSON, listPaths, newId, isId, fail, del } from './_lib.js';
import { staffTokenPath } from './me.js';

/*
 * Personel kartları: staff/{id}.json
 * Müdüriyet: tüm alanlar. Diğer personel: yalnız ad ve birim (izin bildirimi ve "bugün kim yok" için).
 */
export const DEPTS = ['resepsiyon', 'rezervasyon', 'restoran', 'mutfak', 'haus', 'salon', 'mudur'];
export const CONTRACTS = ['vollzeit', 'teilzeit', 'minijob', 'werkstudent', 'aushilfe', 'azubi'];
const str = (v, n) => String(v ?? '').trim().slice(0, n);
const num = (v, lo, hi) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, Math.round(x * 100) / 100)) : 0; };
const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '');
const path = (id) => `staff/${id}.json`;

export function cleanStaff(b = {}) {
  return {
    name: str(b.name, 80), dept: DEPTS.includes(b.dept) ? b.dept : 'resepsiyon', role: str(b.role, 60),
    contract: CONTRACTS.includes(b.contract) ? b.contract : 'vollzeit',
    start: date(b.start), end: date(b.end),
    rate: num(b.rate, 0, 500), weekHours: num(b.weekHours, 0, 60), vacDays: num(b.vacDays, 0, 60),
    phone: str(b.phone, 40), mail: str(b.mail, 120), lang: ['tr', 'de', 'en'].includes(b.lang) ? b.lang : 'tr', notes: str(b.notes, 1000), active: b.active !== false,
  };
}
export async function allStaff() {
  return (await Promise.all((await listPaths('staff/')).map((p) => readJSON(p).catch(() => null)))).filter(Boolean);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!requireStaff(req, res)) return;
  try {
    if (req.method === 'GET') {
      const all = await allStaff();
      if (!isManager(req)) return res.status(200).json({ staff: all.map((r) => r.data).filter((x) => x.active).map(({ id, name, dept }) => ({ id, name, dept })) });
      return res.status(200).json({ staff: all.map((r) => ({ ...r.data, etag: r.etag })) });
    }
    if (!requireManager(req, res)) return;
    if (req.method === 'POST') {
      const c = cleanStaff(req.body);
      if (!c.name) return fail(res, 400, 'e_staff_name');
      const now = new Date().toISOString();
      const x = { id: newId(), ...c, token: newId(18), createdAt: now, updatedAt: now };
      await writeJSON(path(x.id), x);
      await writeJSON(staffTokenPath(x.token), { id: x.id });
      return res.status(201).json({ person: x });
    }
    if (req.method === 'PUT') {
      const id = req.query.id;
      if (!isId(id)) return fail(res, 400, 'e_not_found');
      const cur = await readJSON(path(id));
      if (!cur) return fail(res, 404, 'e_not_found');
      if (req.body?.regenerateLink) {
        const x = { ...cur.data, token: newId(18), updatedAt: new Date().toISOString() };
        await writeJSON(path(id), x, cur.etag);
        await writeJSON(staffTokenPath(x.token), { id });
        if (cur.data.token) await del(staffTokenPath(cur.data.token)).catch(() => {});
        return res.status(200).json({ person: x });
      }
      const c = cleanStaff({ ...cur.data, ...req.body });
      if (!c.name) return fail(res, 400, 'e_staff_name');
      const x = { ...cur.data, ...c, updatedAt: new Date().toISOString() };
      try { await writeJSON(path(id), x, req.body?.etag || cur.etag); }
      catch (e) { if (String(e?.name || e).includes('Precondition')) return fail(res, 409, 'e_conflict'); throw e; }
      return res.status(200).json({ person: x });
    }
    return res.status(405).end();
  } catch (e) {
    console.error('staff', e);
    return fail(res, 500, 'e_server');
  }
}
