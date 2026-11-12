import { requireStaff, readJSON, writeJSON, DEFAULT_VENUES, cleanVenues } from './_lib.js';

const PATH = 'config/venues.json';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!requireStaff(req, res)) return;
  try {
    if (req.method === 'GET') {
      const r = await readJSON(PATH);
      return res.status(200).json({ venues: r ? r.data.venues : DEFAULT_VENUES });
    }
    if (req.method === 'PUT') {
      const venues = cleanVenues(req.body?.venues);
      if (!venues.length) return res.status(400).json({ error: 'En az bir mekân olmalı.' });
      await writeJSON(PATH, { venues, updatedAt: new Date().toISOString() });
      return res.status(200).json({ venues });
    }
    return res.status(405).end();
  } catch (e) {
    console.error('venues', e);
    return res.status(500).json({ error: 'Sunucu hatası' });
  }
}
