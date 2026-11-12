import { requireStaff, requireManager, isManager, readJSON, writeJSON, listPaths, newId, isId, fail, del } from './_lib.js';
import { sendTemplate } from './_wa.js';

const LT = { urlaub: ['yıllık izin', 'Urlaub', 'vacation'], krank: ['hastalık', 'Krankheit', 'sick leave'], kind: ['çocuk hastalığı', 'Kind krank', 'child sick'], sonder: ['özel izin', 'Sonderurlaub', 'special leave'], unbezahlt: ['ücretsiz izin', 'unbezahlter Urlaub', 'unpaid leave'], schule: ['okul', 'Berufsschule', 'school'] };
const RES = { genehmigt: ['onaylandı', 'genehmigt', 'approved'], abgelehnt: ['reddedildi', 'abgelehnt', 'rejected'] };
const LI = { tr: 0, de: 1, en: 2 };
const dd = (iso) => iso.split('-').reverse().join('.');

/*
 * İzin ve devamsızlık: leave/{id}.json
 * Türler: urlaub (yıllık izin), krank (hastalık), kind (çocuk hastalığı), sonder (özel izin), unbezahlt (ücretsiz), schule (okul / meslek okulu)
 * Hastalıkta yalnızca tarih ve rapor (AU) var/yok tutulur; teşhis tutulmaz.
 * Müdüriyet her şeyi görür. Diğer personel yalnız onaylı/kayıtlı devamsızlığın kişi ve tarihini görür, türünü göremez.
 */
export const TYPES = ['urlaub', 'krank', 'kind', 'sonder', 'unbezahlt', 'schule'];
const NEEDS_OK = ['urlaub', 'sonder', 'unbezahlt'];
const STATUS = ['beantragt', 'genehmigt', 'abgelehnt', 'gemeldet'];
const str = (v, n) => String(v ?? '').trim().slice(0, n);
const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '');
const path = (id) => `leave/${id}.json`;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!requireStaff(req, res)) return;
  const mgr = isManager(req);
  try {
    if (req.method === 'GET') {
      const all = (await Promise.all((await listPaths('leave/')).map((p) => readJSON(p).catch(() => null)))).filter(Boolean).map((r) => r.data);
      if (mgr) return res.status(200).json({ leave: all });
      const from = new Date(Date.now() - 864e5).toISOString().slice(0, 10), to = new Date(Date.now() + 15 * 864e5).toISOString().slice(0, 10);
      return res.status(200).json({ leave: all.filter((x) => x.status !== 'abgelehnt' && x.status !== 'beantragt' && x.to >= from && x.from <= to).map(({ id, staffId, from, to }) => ({ id, staffId, from, to })) });
    }
    if (req.method === 'POST') {
      const b = req.body || {}, type = TYPES.includes(b.type) ? b.type : 'urlaub';
      const x = { id: newId(), staffId: isId(b.staffId) ? b.staffId : '', type, from: date(b.from), to: date(b.to) || date(b.from), note: str(b.note, 500), au: !!b.au, by: str(b.who, 60), createdAt: new Date().toISOString() };
      if (!x.staffId || !x.from) return fail(res, 400, 'e_leave_fields');
      if (x.to < x.from) return fail(res, 400, 'e_leave_dates');
      if (!(await readJSON(`staff/${x.staffId}.json`))) return fail(res, 400, 'e_leave_fields');
      x.status = NEEDS_OK.includes(type) ? (mgr && b.approve ? 'genehmigt' : 'beantragt') : 'gemeldet';
      if (x.status === 'genehmigt') { x.decidedAt = x.createdAt; x.decidedBy = x.by; }
      await writeJSON(path(x.id), x);
      return res.status(201).json({ entry: mgr ? x : { id: x.id, status: x.status } });
    }
    if (!requireManager(req, res)) return;
    const id = req.query.id;
    if (!isId(id)) return fail(res, 400, 'e_not_found');
    const cur = await readJSON(path(id));
    if (!cur) return fail(res, 404, 'e_not_found');
    if (req.method === 'DELETE') { await del(path(id)); return res.status(200).json({ ok: true }); }
    if (req.method === 'PUT') {
      const x = cur.data, b = req.body || {};
      let decided = false;
      if (STATUS.includes(b.status) && b.status !== x.status) { x.status = b.status; x.decidedAt = new Date().toISOString(); x.decidedBy = str(b.who, 60); decided = RES[b.status] && NEEDS_OK.includes(x.type); }
      if (b.au !== undefined) x.au = !!b.au;
      if (date(b.from)) x.from = b.from;
      if (date(b.to)) x.to = b.to;
      if (b.note !== undefined) x.note = str(b.note, 500);
      if (x.to < x.from) return fail(res, 400, 'e_leave_dates');
      await writeJSON(path(id), x);
      if (decided) {
        const p = (await readJSON(`staff/${x.staffId}.json`).catch(() => null))?.data;
        if (p?.phone) { const i = LI[p.lang] ?? 0; await sendTemplate(p.phone, 'hg_izin_sonuc', ['tr', 'de', 'en'][i], [p.name.split(' ')[0], LT[x.type][i], x.from === x.to ? dd(x.from) : `${dd(x.from)} – ${dd(x.to)}`, RES[x.status][i]], { staffId: p.id, kind: 'staff' }).catch((e) => console.error('wa leave', e)); }
      }
      return res.status(200).json({ entry: x });
    }
    return res.status(405).end();
  } catch (e) {
    console.error('leave', e);
    return fail(res, 500, 'e_server');
  }
}
