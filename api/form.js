import { readJSON, writeJSON, groupPath, tokenPath, isId, cleanSubmission, pushAlert } from './_lib.js';

async function load(token) {
  if (!isId(token)) return null;
  const t = await readJSON(tokenPath(token));
  if (!t) return null;
  const g = await readJSON(groupPath(t.data.id));
  return g && g.data.token === token ? g : null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const cur = await load(req.query.t);
    if (!cur) return res.status(404).json({ error: 'Link geçersiz veya süresi dolmuş.' });
    const g = cur.data;
    if (g.settings.status === 'İptal') return res.status(410).json({ error: 'Bu grup kaydı iptal edildi.' });
    const pub = () => ({
      settings: { name: g.settings.name, leader: g.settings.leader, in: g.settings.in, out: g.settings.out, paymode: g.settings.paymode, pNight: g.settings.pNight, pDay: g.settings.pDay, pSingle: g.settings.pSingle, deadline: g.settings.deadline },
      submission: cleanSubmission(g.submission || {}), submittedAt: g.submittedAt,
    });
    if (req.method === 'GET') return res.status(200).json(pub());
    if (req.method !== 'POST') return res.status(405).end();

    const now = new Date();
    const incoming = cleanSubmission(req.body || {});
    const old = g.submission || { rooms: [], days: [] };
    const anyPaid = (old.rooms || []).some((r) => r.paid || r.given) || (old.days || []).some((d) => d.paid || d.given) || old.groupPay?.paid;
    // personel alanlarını (ödendi, verildi, oda no) aynı sıradaki kayıtlara geri yaz
    incoming.rooms.forEach((r, i) => { const o = old.rooms?.[i]; if (o) Object.assign(r, { paid: !!o.paid, given: !!o.given, no: o.no || '' }); });
    incoming.days.forEach((d, i) => { const o = old.days?.[i]; if (o) Object.assign(d, { paid: !!o.paid, given: !!o.given }); });
    incoming.groupPay = old.groupPay || { paid: false, given: false };

    const people = incoming.rooms.reduce((x, r) => x + r.people.length, 0);
    const text = `Grup sorumlusu formu ${g.submittedAt ? 'güncelledi' : 'gönderdi'}: ${incoming.rooms.length} oda, ${people} konaklayan, ${incoming.days.length} günübirlik`;
    const first = !g.submittedAt;
    const deadline = g.settings.in ? new Date(g.settings.in + 'T12:00:00') : null;
    if (deadline) deadline.setDate(deadline.getDate() - (g.settings.deadline || 0));
    if (!first) pushAlert(g, `Değişiklik: ${text}`);
    if (deadline && now > deadline) pushAlert(g, `Son tarihten sonra gönderim (${text})`);
    if (anyPaid) pushAlert(g, 'Ödeme kaydı yapıldıktan sonra grup listesi değişti. Tahsilat listesini kontrol edin.');

    g.submission = incoming;
    g.submittedAt = now.toISOString();
    g.updatedAt = g.submittedAt;
    g.history = [{ at: g.submittedAt, by: 'grup', text }, ...(g.history || [])].slice(0, 200);
    await writeJSON(groupPath(g.id), g, cur.etag);
    return res.status(200).json(pub());
  } catch (e) {
    console.error('form', e);
    if (String(e?.name || e).includes('Precondition')) return res.status(409).json({ error: 'Kayıt aynı anda değiştirildi. Lütfen tekrar gönderin.' });
    return res.status(500).json({ error: 'Sunucu hatası' });
  }
}
