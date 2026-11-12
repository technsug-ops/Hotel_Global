import { readJSON, writeJSON, groupPath, tokenPath, isId, cleanSubmission, pushAlert, addHistory, mergeSubmission, roomingDeadline, describe, capacityErrors, fail, linkExpired } from './_lib.js';

async function load(token) {
  if (!isId(token)) return null;
  const t = await readJSON(tokenPath(token));
  if (!t) return null;
  const g = await readJSON(groupPath(t.data.id));
  return g && g.data.token === token ? g : null;
}

import { notifyManager } from './_wa.js';

export default async function handler(req, res) {
  const t0 = new Date().toISOString();
  res.setHeader('Cache-Control', 'no-store');
  try {
    const cur = await load(req.query.t);
    if (!cur) return fail(res, 404, 'e_link', 'Link geçersiz veya süresi dolmuş.');
    const g = cur.data;
    if (g.settings.status === 'İptal') return fail(res, 410, 'e_cancelled', 'Bu grup kaydı iptal edildi.');
    if (linkExpired(g.settings)) return fail(res, 410, 'e_link_expired', 'Linkin süresi doldu.');
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
    if (req.body?.consent !== true) return fail(res, 400, 'e_consent', 'Onay kutusu işaretlenmeli.');
    const incoming = cleanSubmission(req.body || {});
    const capErr = capacityErrors(incoming);
    if (capErr.length) return res.status(400).json({ error: 'Oda kapasitesi aşıldı: ' + capErr.join('; '), code: 'e_capacity', detail: capErr });
    const desc = describe(incoming);
    if (deadline && now > deadline) {
      g.pending = { at: nowIso, submission: incoming };
      pushAlert(g, 'a_pending', { desc });
      addHistory(g, 'grup', 'h_pending_sent', { desc });
    } else {
      const first = !g.submittedAt;
      const old = g.submission || { rooms: [], days: [] };
      const anyPaid = (old.rooms || []).some((r) => r.paid || r.given) || (old.days || []).some((d) => d.paid || d.given) || old.groupPay?.paid;
      if (!first) pushAlert(g, 'a_form_updated', { desc });
      if (anyPaid) pushAlert(g, 'a_after_payment');
      g.submission = mergeSubmission(old, incoming);
      g.submittedAt = nowIso;
      g.pending = null;
      addHistory(g, 'grup', first ? 'h_form_sent' : 'h_form_updated', { desc });
    }
    // kimin gönderdiği: grup sorumlusunun kendi beyanı ve onay zamanı
    g.consents = [{ at: nowIso, name: incoming.leader.name, phone: incoming.leader.phone, mail: incoming.leader.mail }, ...(g.consents || [])].slice(0, 50);
    g.updatedAt = nowIso;
    await writeJSON(groupPath(g.id), g, cur.etag);
    await notifyManager(g, t0);
    return res.status(200).json(pub());
  } catch (e) {
    console.error('form', e);
    if (String(e?.name || e).includes('Precondition')) return fail(res, 409, 'e_conflict');
    return fail(res, 500, 'e_server', 'Sunucu hatası');
  }
}
