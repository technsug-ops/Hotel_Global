import { requireStaff, readJSON, writeJSON, listPaths, groupPath, tokenPath, newId, cleanSettings, summary } from './_lib.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!requireStaff(req, res)) return;
  try {
    if (req.method === 'GET') {
      const paths = await listPaths('groups/');
      const groups = (await Promise.all(paths.map((p) => readJSON(p).catch(() => null))))
        .filter(Boolean).map((r) => summary(r.data))
        .sort((a, b) => String(a.in).localeCompare(String(b.in)));
      return res.status(200).json({ groups });
    }
    if (req.method === 'POST') {
      const settings = cleanSettings(req.body?.settings);
      if (!settings.name) return res.status(400).json({ error: 'Grup adı gerekli' });
      const now = new Date().toISOString();
      const g = {
        id: newId(), token: newId(18), createdAt: now, updatedAt: now, settings,
        submission: { leader: { name: settings.leader, phone: settings.phone, mail: settings.mail }, rooms: [], days: [], groupInv: { inv: '', mail: '' }, groupPay: { paid: false, given: false } },
        submittedAt: null, history: [{ at: now, by: 'otel', text: 'Grup kaydı açıldı' }], alerts: [],
      };
      await writeJSON(groupPath(g.id), g);
      await writeJSON(tokenPath(g.token), { id: g.id });
      return res.status(201).json({ id: g.id });
    }
    return res.status(405).end();
  } catch (e) {
    console.error('groups', e);
    return res.status(500).json({ error: 'Sunucu hatası' });
  }
}
