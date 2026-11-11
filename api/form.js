import { readJSON, writeJSON, groupPath, tokenPath, isId, cleanSubmission, pushAlert, mergeSubmission, roomingDeadline, describe } from './_lib.js';

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
    const deadline = roomingDeadline(g.settings);
    const pub = () => ({
      settings: { name: g.settings.name, leader: g.settings.leader, in: g.settings.in, out: g.settings.out, paymode: g.settings.paymode, pNight: g.settings.pNight, pDay: g.settings.pDay, pSingle: g.settings.pSingle, deadline: g.settings.deadline },
      submission: cleanSubmission(g.pending ? g.pending.submission : (g.submission || {})),
      submittedAt: g.submittedAt, locked: !!(deadline && new Date() > deadline),
      pending: g.pending ? { at: g.pending.at } : null,
    });
    if (req.method === 'GET') return res.status(200).json(pub());
    if (req.method !== 'POST') return res.status(405).end();

    const now = new Date(), nowIso = now.toISOString();
    const incoming = cleanSubmission(req.body || {});
    const text = describe(incoming);
    if (deadline && now > deadline) {
      // son tarih geçti: değişiklik otel onayına kadar bekler
      g.pending = { at: nowIso, submission: incoming };
      pushAlert(g, `Son tarihten sonra değişiklik talebi (${text}). Onaylayın veya reddedin.`);
      g.history = [{ at: nowIso, by: 'grup', text: `Değişiklik talebi gönderildi: ${text}` }, ...(g.history || [])].slice(0, 200);
    } else {
      const first = !g.submittedAt;
      const old = g.submission || { rooms: [], days: [] };
      const anyPaid = (old.rooms || []).some((r) => r.paid || r.given) || (old.days || []).some((d) => d.paid || d.given) || old.groupPay?.paid;
      if (!first) pushAlert(g, `Grup sorumlusu formu güncelledi: ${text}`);
      if (anyPaid) pushAlert(g, 'Ödeme kaydı yapıldıktan sonra grup listesi değişti. Tahsilat listesini kontrol edin.');
      g.submission = mergeSubmission(old, incoming);
      g.submittedAt = nowIso;
      g.pending = null;
      g.history = [{ at: nowIso, by: 'grup', text: `Form ${first ? 'gönderildi' : 'güncellendi'}: ${text}` }, ...(g.history || [])].slice(0, 200);
    }
    g.updatedAt = nowIso;
    await writeJSON(groupPath(g.id), g, cur.etag);
    return res.status(200).json(pub());
  } catch (e) {
    console.error('form', e);
    if (String(e?.name || e).includes('Precondition')) return res.status(409).json({ error: 'Kayıt aynı anda değiştirildi. Lütfen tekrar gönderin.' });
    return res.status(500).json({ error: 'Sunucu hatası' });
  }
}
