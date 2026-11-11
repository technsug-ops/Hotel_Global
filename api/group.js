import { requireStaff, readJSON, writeJSON, groupPath, isId, cleanSettings, cleanSubmission, cleanCall, pushAlert, mergeSubmission, describe } from './_lib.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!requireStaff(req, res)) return;
  const id = req.query.id;
  if (!isId(id)) return res.status(400).json({ error: 'Geçersiz grup' });
  try {
    const cur = await readJSON(groupPath(id));
    if (!cur) return res.status(404).json({ error: 'Grup bulunamadı' });
    if (req.method === 'GET') return res.status(200).json({ group: cur.data, etag: cur.etag });
    if (req.method !== 'PUT') return res.status(405).end();
    const b = req.body || {};
    if (b.etag && b.etag !== cur.etag) return res.status(409).json({ error: 'Kayıt başka biri tarafından değiştirildi. Sayfayı yenileyin.' });
    const g = cur.data;
    const now = new Date().toISOString();
    if (b.settings) {
      const prev = g.settings, next = cleanSettings(b.settings);
      if (prev.in !== next.in || prev.out !== next.out) {
        const t = `Tarih değişti: ${prev.in || '—'} → ${prev.out || '—'} yerine ${next.in || '—'} → ${next.out || '—'}`;
        g.history = [{ at: now, by: 'otel', text: t }, ...(g.history || [])].slice(0, 200);
        pushAlert(g, t + '. Grup sorumlusuna bildirin; son tarihler yeni tarihe göre kaydı.');
      }
      if (prev.status !== next.status) g.history = [{ at: now, by: 'otel', text: `Durum: ${prev.status} → ${next.status}` }, ...(g.history || [])].slice(0, 200);
      g.settings = next;
    }
    if (b.submission) g.submission = cleanSubmission(b.submission, true);
    if (b.alertsSeen) (g.alerts || []).forEach((a) => (a.seen = true));
    if (b.pending === 'approve' && g.pending) {
      g.submission = mergeSubmission(g.submission || {}, g.pending.submission);
      g.submittedAt = g.pending.at;
      g.history = [{ at: now, by: 'otel', text: `Değişiklik talebi onaylandı: ${describe(g.pending.submission)}` }, ...(g.history || [])].slice(0, 200);
      g.pending = null;
    } else if (b.pending === 'reject' && g.pending) {
      g.history = [{ at: now, by: 'otel', text: `Değişiklik talebi reddedildi: ${describe(g.pending.submission)}` }, ...(g.history || [])].slice(0, 200);
      g.pending = null;
    }
    if (b.call) {
      const c = { at: now, ...cleanCall(b.call) };
      g.calls = [c, ...(g.calls || [])].slice(0, 100);
      if (c.result === 'Kesinleşti') { g.settings.status = 'Kesin'; g.confirmedAt = now; }
      if (c.result === 'İptal') g.settings.status = 'İptal';
      if (c.result === 'Değişiklik var' || c.result === 'İptal') pushAlert(g, `Teyit araması: ${c.result}${c.note ? ' — ' + c.note : ''}`);
      g.history = [{ at: now, by: 'otel', text: `Teyit araması (${c.by || 'resepsiyon'}): ${c.result}${c.note ? ' — ' + c.note : ''}` }, ...(g.history || [])].slice(0, 200);
    }
    if (b.note) g.history = [{ at: now, by: 'otel', text: String(b.note).slice(0, 200) }, ...(g.history || [])].slice(0, 200);
    g.updatedAt = now;
    try {
      const w = await writeJSON(groupPath(id), g, cur.etag);
      return res.status(200).json({ group: g, etag: w.etag });
    } catch (e) {
      if (String(e?.name || e).includes('Precondition')) return res.status(409).json({ error: 'Kayıt aynı anda değiştirildi. Sayfayı yenileyin.' });
      throw e;
    }
  } catch (e) {
    console.error('group', e);
    return res.status(500).json({ error: 'Sunucu hatası' });
  }
}
