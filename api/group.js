import { requireStaff, readJSON, writeJSON, groupPath, tokenPath, newId, del, isId, cleanSettings, cleanSubmission, cleanCall, pushAlert, addHistory, mergeSubmission, describe, cleanSchedule, fail } from './_lib.js';

const NOTE_CODES = ['h_rooming_saved', 'h_settings_saved'];

import { notifyManager } from './_wa.js';

export default async function handler(req, res) {
  const t0 = new Date().toISOString();
  res.setHeader('Cache-Control', 'no-store');
  if (!requireStaff(req, res)) return;
  const id = req.query.id;
  if (!isId(id)) return fail(res, 400, 'e_invalid_group', 'Geçersiz grup');
  try {
    const cur = await readJSON(groupPath(id));
    if (!cur) return fail(res, 404, 'e_not_found', 'Grup bulunamadı');
    if (req.method === 'GET') return res.status(200).json({ group: cur.data, etag: cur.etag });
    if (req.method !== 'PUT') return res.status(405).end();
    const b = req.body || {};
    if (b.etag && b.etag !== cur.etag) return fail(res, 409, 'e_conflict');
    const g = cur.data;
    const now = new Date().toISOString();
    if (b.settings) {
      const prev = g.settings, next = cleanSettings(b.settings);
      if (prev.in !== next.in || prev.out !== next.out) {
        const p = { a: `${prev.in || '—'} → ${prev.out || '—'}`, b: `${next.in || '—'} → ${next.out || '—'}` };
        addHistory(g, 'otel', 'h_dates', p); pushAlert(g, 'a_dates', p);
      }
      if (prev.status !== next.status) addHistory(g, 'otel', 'h_status', { a: prev.status, b: next.status });
      g.settings = next;
    }
    if (b.submission) g.submission = cleanSubmission(b.submission, true);
    if (b.schedule) { g.schedule = cleanSchedule(b.schedule); addHistory(g, 'otel', 'h_schedule', { n: g.schedule.length }); }
    if (b.pending === 'approve' && g.pending) {
      g.submission = mergeSubmission(g.submission || {}, g.pending.submission);
      g.submittedAt = g.pending.at;
      addHistory(g, 'otel', 'h_pending_ok', { desc: describe(g.pending.submission) });
      g.pending = null;
    } else if (b.pending === 'reject' && g.pending) {
      addHistory(g, 'otel', 'h_pending_no', { desc: describe(g.pending.submission) });
      g.pending = null;
    }
    if (b.call) {
      const c = { at: now, ...cleanCall(b.call) };
      g.calls = [c, ...(g.calls || [])].slice(0, 100);
      if (c.result === 'confirmed') { g.settings.status = 'Kesin'; g.confirmedAt = now; }
      if (c.result === 'cancelled') g.settings.status = 'İptal';
      const p = { by: c.by, result: c.result, note: c.note };
      if (c.result === 'changed' || c.result === 'cancelled') pushAlert(g, 'a_call', p);
      addHistory(g, 'otel', 'h_call', p);
    }
    if (b.regenerateLink) {
      const old = g.token;
      g.token = newId(18);
      await writeJSON(tokenPath(g.token), { id: g.id });
      try { await del(tokenPath(old)); } catch (e) { console.error('token del', e); }
      addHistory(g, 'otel', 'h_link_new');
    }
    if (b.alertsSeen) (g.alerts || []).forEach((a) => (a.seen = true));
    if (NOTE_CODES.includes(b.noteCode)) addHistory(g, 'otel', b.noteCode);
    g.updatedAt = now;
    try {
      const w = await writeJSON(groupPath(id), g, cur.etag);
      await notifyManager(g, t0);
      return res.status(200).json({ group: g, etag: w.etag });
    } catch (e) {
      if (String(e?.name || e).includes('Precondition')) return fail(res, 409, 'e_conflict');
      throw e;
    }
  } catch (e) {
    console.error('group', e);
    return fail(res, 500, 'e_server', 'Sunucu hatası');
  }
}
