import { checkPassword, setSession, clearSession, roleOf, fail } from './_lib.js';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') { const role = roleOf(req); return res.status(200).json({ staff: !!role, role }); }
  if (req.method === 'DELETE') { clearSession(res); return res.status(200).json({ ok: true }); }
  if (req.method !== 'POST') return res.status(405).end();
  const role = checkPassword(req.body?.password);
  if (!role) return fail(res, 401, 'e_password', 'Şifre hatalı');
  setSession(res, role);
  return res.status(200).json({ ok: true, role });
}
