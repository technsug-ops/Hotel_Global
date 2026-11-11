import { checkPassword, setSession, clearSession, isStaff } from './_lib.js';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') return res.status(200).json({ staff: isStaff(req) });
  if (req.method === 'DELETE') { clearSession(res); return res.status(200).json({ ok: true }); }
  if (req.method !== 'POST') return res.status(405).end();
  if (!checkPassword(req.body?.password)) return res.status(401).json({ error: 'Şifre hatalı' });
  setSession(res);
  return res.status(200).json({ ok: true });
}
