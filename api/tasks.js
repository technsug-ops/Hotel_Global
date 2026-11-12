import { requireStaff, readJSON, writeJSON, listPaths, newId, isId, fail } from './_lib.js';

/* Birimler arası görevler. Her görev ayrı dosya: tasks/{id}.json */
export const DEPTS = ['resepsiyon', 'rezervasyon', 'restoran', 'mutfak', 'haus', 'salon', 'mudur'];
const STATUS = ['acik', 'devam', 'bekliyor', 'bitti'];
const PRIO = ['acil', 'normal', 'planli'];
const str = (v, n) => String(v ?? '').trim().slice(0, n);
const path = (id) => `tasks/${id}.json`;

function clean(b = {}) {
  return {
    title: str(b.title, 160), note: str(b.note, 1000),
    dept: DEPTS.includes(b.dept) ? b.dept : 'resepsiyon',
    from: DEPTS.includes(b.from) ? b.from : '',
    groupId: isId(b.groupId) ? b.groupId : '', groupName: str(b.groupName, 120),
    due: /^\d{4}-\d{2}-\d{2}$/.test(b.due || '') ? b.due : '', time: /^([01]\d|2[0-3]):[0-5]\d$/.test(b.time || '') ? b.time : '',
    prio: PRIO.includes(b.prio) ? b.prio : 'normal', who: str(b.who, 60),
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!requireStaff(req, res)) return;
  try {
    if (req.method === 'GET') {
      const all = (await Promise.all((await listPaths('tasks/')).map((p) => readJSON(p).catch(() => null)))).filter(Boolean);
      // biten görevler 30 gün sonra listeden düşer (dosya kalır)
      const cutoff = Date.now() - 30 * 864e5;
      const tasks = all.map((r) => ({ ...r.data, etag: r.etag })).filter((x) => x.status !== 'bitti' || new Date(x.doneAt || x.updatedAt).getTime() > cutoff);
      return res.status(200).json({ tasks });
    }
    if (req.method === 'POST') {
      const c = clean(req.body);
      if (!c.title) return fail(res, 400, 'e_task_title');
      const now = new Date().toISOString();
      const x = { id: newId(), ...c, status: 'acik', createdAt: now, updatedAt: now, createdBy: c.who, log: [{ at: now, who: c.who, code: 'tl_created' }] };
      await writeJSON(path(x.id), x);
      return res.status(201).json({ task: x });
    }
    if (req.method === 'PUT') {
      const id = req.query.id;
      if (!isId(id)) return fail(res, 400, 'e_invalid_group');
      const cur = await readJSON(path(id));
      if (!cur) return fail(res, 404, 'e_not_found');
      const x = cur.data, b = req.body || {}, now = new Date().toISOString(), who = str(b.who, 60);
      if (b.status && STATUS.includes(b.status) && b.status !== x.status) {
        x.log.unshift({ at: now, who, code: 'tl_status', p: { a: x.status, b: b.status } });
        x.status = b.status; if (b.status === 'bitti') x.doneAt = now;
      }
      if (b.dept && DEPTS.includes(b.dept) && b.dept !== x.dept) { x.log.unshift({ at: now, who, code: 'tl_moved', p: { a: x.dept, b: b.dept } }); x.dept = b.dept; }
      if (b.assignee !== undefined) x.assignee = str(b.assignee, 60);
      if (b.comment) x.log.unshift({ at: now, who, code: 'tl_comment', p: { text: str(b.comment, 1000) } });
      x.log = x.log.slice(0, 100); x.updatedAt = now;
      try { await writeJSON(path(id), x, cur.etag); }
      catch (e) { if (String(e?.name || e).includes('Precondition')) return fail(res, 409, 'e_conflict'); throw e; }
      return res.status(200).json({ task: x });
    }
    return res.status(405).end();
  } catch (e) {
    console.error('tasks', e);
    return fail(res, 500, 'e_server');
  }
}
