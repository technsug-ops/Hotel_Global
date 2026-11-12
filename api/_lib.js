import { put, get, list } from '@vercel/blob';
import crypto from 'node:crypto';

const SECRET = process.env.SESSION_SECRET || '';
const COOKIE = 'hg_s';
const SESSION_HOURS = 12;

export const ROOM_TYPES = ['EZ', 'DZ', 'ZBZ', 'DBZ', 'VBZ', 'SUP FAM'];
export const AGE_KEYS = ['Y', 'C8', 'C3', 'C0'];

/* ---------- auth ---------- */
const sign = (v) => crypto.createHmac('sha256', SECRET).update(v).digest('base64url');
function safeEq(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
export function checkPassword(pw) {
  const real = process.env.STAFF_PASSWORD || '';
  return real.length > 0 && safeEq(pw || '', real);
}
export function setSession(res) {
  const exp = Date.now() + SESSION_HOURS * 3600e3;
  const payload = `staff.${exp}`;
  res.setHeader('Set-Cookie', `${COOKIE}=${payload}.${sign(payload)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_HOURS * 3600}`);
}
export function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}
export function isStaff(req) {
  if (!SECRET) return false;
  const c = cookies(req)[COOKIE];
  if (!c) return false;
  const i = c.lastIndexOf('.');
  if (i < 0) return false;
  const payload = c.slice(0, i), sig = c.slice(i + 1);
  if (!safeEq(sign(payload), sig)) return false;
  return Number(payload.split('.')[1]) > Date.now();
}
export function requireStaff(req, res) {
  if (isStaff(req)) return true;
  res.status(401).json({ error: 'Oturum gerekli' });
  return false;
}

/* ---------- storage (Vercel Blob, private) ---------- */
export async function readJSON(path) {
  const r = await get(path, { access: 'private', useCache: false });
  if (!r || r.statusCode !== 200) return null;
  const text = await new Response(r.stream).text();
  return { data: JSON.parse(text), etag: r.blob.etag };
}
export async function writeJSON(path, data, etag) {
  const opts = { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', cacheControlMaxAge: 60 };
  if (etag) opts.ifMatch = etag;
  return put(path, JSON.stringify(data), opts);
}
export async function listPaths(prefix) {
  const out = [];
  let cursor;
  do {
    const r = await list({ prefix, cursor, limit: 1000 });
    out.push(...r.blobs.map((b) => b.pathname));
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return out;
}
export const groupPath = (id) => `groups/${id}.json`;
export const tokenPath = (t) => `tokens/${t}.json`;
export const newId = (bytes = 9) => crypto.randomBytes(bytes).toString('base64url');
export const isId = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{8,40}$/.test(v);

/* ---------- validation ---------- */
const str = (v, n = 200) => String(v ?? '').trim().slice(0, n);
const num = (v, min = 0, max = 100000) => Math.min(max, Math.max(min, Number(v) || 0));
const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');

export function cleanSettings(s = {}) {
  return {
    name: str(s.name, 120), leader: str(s.leader, 80), phone: str(s.phone, 40), mail: str(s.mail, 120),
    in: date(s.in), out: date(s.out), paymode: s.paymode === 'grup' ? 'grup' : 'kisi',
    pNight: num(s.pNight), pDay: num(s.pDay), pSingle: num(s.pSingle), deadline: num(s.deadline, 0, 60),
    salon: str(s.salon, 80), notes: str(s.notes, 1000),
    confirmDays: s.confirmDays === undefined || s.confirmDays === '' ? 7 : num(s.confirmDays, 0, 120),
    callDays: s.callDays === undefined || s.callDays === '' ? 3 : num(s.callDays, 0, 60),
    status: ['Teklif', 'Opsiyon', 'Kesin', 'İptal'].includes(s.status) ? s.status : 'Opsiyon',
  };
}
function cleanPerson(p = {}) {
  return { n: str(p.n, 80), a: AGE_KEYS.includes(p.a) ? p.a : 'Y' };
}
export function cleanSubmission(b = {}, staff = false) {
  const keep = (o, x) => (staff ? { ...x, paid: !!o.paid, given: !!o.given, no: str(o.no, 10) } : x);
  const rooms = (Array.isArray(b.rooms) ? b.rooms : []).slice(0, 150).map((r) => keep(r, {
    type: ROOM_TYPES.includes(r.type) ? r.type : 'ZBZ',
    extra: num(r.extra, 0, 2), crib: !!r.crib,
    people: (Array.isArray(r.people) ? r.people : []).slice(0, 8).map(cleanPerson),
    payer: num(r.payer, 0, 7), invoice: !!r.invoice, inv: str(r.inv, 300), mail: str(r.mail, 120),
  }));
  const days = (Array.isArray(b.days) ? b.days : []).slice(0, 500).map((d) => keep(d, {
    ...cleanPerson(d), invoice: !!d.invoice, inv: str(d.inv, 300), mail: str(d.mail, 120),
  }));
  const leader = { name: str(b.leader?.name, 80), phone: str(b.leader?.phone, 40), mail: str(b.leader?.mail, 120) };
  const groupInv = { inv: str(b.groupInv?.inv, 300), mail: str(b.groupInv?.mail, 120) };
  const out = { leader, rooms, days, groupInv };
  if (staff) out.groupPay = { paid: !!b.groupPay?.paid, given: !!b.groupPay?.given };
  return out;
}

const AGE_F = { Y: 1, C8: 1, C3: 0.5, C0: 0 };
function nightsOf(st) {
  if (!st.in || !st.out) return 0;
  return Math.max(0, Math.round((new Date(st.out + 'T12:00:00') - new Date(st.in + 'T12:00:00')) / 864e5));
}
/* panelin özet kartları için tutarlar (istemcideki hesapla aynı kural) */
export function money(g) {
  const st = g.settings, s = g.submission || {}, n = nightsOf(st);
  const roomTotal = (r) => r.people.reduce((x, p) => x + st.pNight * n * (AGE_F[p.a] ?? 1), 0) + (r.people.length === 1 && r.people[0].a !== 'C0' ? st.pSingle * n : 0);
  const dayTotal = (d) => st.pDay * (AGE_F[d.a] ?? 1);
  const rooms = s.rooms || [], days = s.days || [];
  const due = rooms.reduce((x, r) => x + roomTotal(r), 0) + days.reduce((x, d) => x + dayTotal(d), 0);
  let paid = 0, open = 0;
  if (st.paymode === 'grup') { if (s.groupPay?.paid) paid = due; else open = due > 0 ? 1 : 0; }
  else {
    rooms.forEach((r) => { const v = roomTotal(r); if (r.paid) paid += v; else if (v > 0) open++; });
    days.forEach((d) => { const v = dayTotal(d); if (d.paid) paid += v; else if (v > 0) open++; });
  }
  return { due: Math.round(due * 100) / 100, paid: Math.round(paid * 100) / 100, openAccounts: open, nights: n };
}
export function summary(g) {
  const s = g.submission || {};
  return {
    id: g.id, name: g.settings.name, in: g.settings.in, out: g.settings.out, status: g.settings.status,
    paymode: g.settings.paymode, rooms: (s.rooms || []).length,
    sleepers: (s.rooms || []).reduce((x, r) => x + r.people.length, 0), days: (s.days || []).length,
    submittedAt: g.submittedAt || null, alerts: (g.alerts || []).filter((a) => !a.seen).length,
    confirmDays: g.settings.confirmDays ?? 7, callDays: g.settings.callDays ?? 3, deadline: g.settings.deadline,
    ...money(g), salon: g.settings.salon || '',
    confirmedAt: g.confirmedAt || null, pending: !!g.pending, lastCall: (g.calls || [])[0] || null, leader: g.settings.leader, phone: g.settings.phone,
  };
}
export function pushAlert(g, text) {
  g.alerts = g.alerts || [];
  g.alerts.unshift({ at: new Date().toISOString(), text, seen: false });
  g.alerts = g.alerts.slice(0, 50);
}

export const CALL_RESULTS = ['Kesinleşti', 'Değişiklik var', 'Ulaşılamadı', 'Tekrar aranacak', 'İptal'];
export function cleanCall(c = {}) {
  return { result: CALL_RESULTS.includes(c.result) ? c.result : 'Tekrar aranacak', note: str(c.note, 500), by: str(c.by, 60) };
}

/* grup sorumlusunun listesini personel alanlarını (ödendi, verildi, oda no) koruyarak uygula */
export function mergeSubmission(old = {}, incoming) {
  const out = JSON.parse(JSON.stringify(incoming));
  out.rooms.forEach((r, i) => { const o = old.rooms?.[i]; Object.assign(r, { paid: !!o?.paid, given: !!o?.given, no: o?.no || '' }); });
  out.days.forEach((d, i) => { const o = old.days?.[i]; Object.assign(d, { paid: !!o?.paid, given: !!o?.given }); });
  out.groupPay = old.groupPay || { paid: false, given: false };
  return out;
}
export function roomingDeadline(settings) {
  if (!settings.in) return null;
  const d = new Date(settings.in + 'T23:59:59');
  d.setDate(d.getDate() - (Number(settings.deadline) || 0));
  return d;
}
export const describe = (sub) => `${sub.rooms.length} oda, ${sub.rooms.reduce((x, r) => x + r.people.length, 0)} konaklayan, ${sub.days.length} günübirlik`;

const BEDS = { EZ: 1, DZ: 2, ZBZ: 2, DBZ: 3, VBZ: 4, 'SUP FAM': 5 };
export function capacityErrors(sub) {
  const out = [];
  sub.rooms.forEach((r, i) => {
    const need = r.people.filter((p) => p.a !== 'C0').length, cap = BEDS[r.type] + (r.extra || 0);
    const babies = r.people.length - need;
    if (need > cap) out.push(`Oda ${i + 1} (${r.type}): ${need} kişi, ${cap} yatak`);
    if (babies > 2) out.push(`Oda ${i + 1}: en fazla 2 bebek (0–2 yaş)`);
  });
  return out;
}
