import { requireStaff, requireManager, isManager, readJSON, writeJSON, listPaths, groupPath, newId, isId, fail, pushAlert, addHistory, summary, roomingDeadline } from './_lib.js';
import { waConfigured, sendTemplate, sendText, logIn, listLog, verifySignature, normPhone, TEMPLATES, LANGS, getCfg, DEFAULT_CFG, CFG, mgrLang, notifyManager } from './_wa.js';

/*
 * Tek uç nokta (Vercel ücretsiz planında fonksiyon sayısı sınırlı):
 *   GET  ?op=webhook        Meta doğrulaması (hub.challenge)
 *   POST ?op=webhook        Meta'dan gelen mesajlar ve durumlar (imza kontrollü)
 *   GET  ?op=cron           Günlük otomasyon (Vercel Cron, CRON_SECRET) — müdüriyet elle de çalıştırabilir
 *   GET                     Durum, ayarlar, gelen/giden kayıtlar, şablonlar (personel)
 *   POST {op:'send'}        Gruba şablon gönder (personel)
 *   POST {op:'reply'}       24 saat içindeki gelen mesaja serbest cevap (personel)
 *   POST {op:'config'}      Otomasyon ayarları (müdüriyet)
 *   POST {op:'simulateIn'}  Gelen mesaj simülasyonu (müdüriyet, test için)
 */
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
const fmtD = (iso) => (iso ? iso.split('-').reverse().join('.') : '—');
const baseUrl = (req) => process.env.PUBLIC_URL || `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
const groupLang = (g) => (LANGS.includes(g.settings.waLang) ? g.settings.waLang : 'tr');

const TXT = {
  thanks_confirm: { tr: 'Teşekkür ederiz, rezervasyonunuz teyit edildi. Görüşmek üzere!', de: 'Vielen Dank, Ihre Reservierung ist bestätigt. Bis bald!', en: 'Thank you, your booking is confirmed. See you soon!' },
  thanks_change: { tr: 'Teşekkürler, ekibimiz değişiklikler için sizi en kısa sürede arayacak.', de: 'Danke, unser Team ruft Sie wegen der Änderungen in Kürze an.', en: 'Thank you, our team will call you shortly about the changes.' },
  thanks_cancel: { tr: 'Talebiniz alındı. Ekibimiz iptal için sizi en kısa sürede arayacak.', de: 'Ihre Anfrage ist eingegangen. Unser Team ruft Sie wegen der Stornierung in Kürze an.', en: 'Your request was received. Our team will call you shortly about the cancellation.' },
  task_change: { tr: 'WhatsApp: grup değişiklik bildirdi, arayıp ayrıntıları alın', de: 'WhatsApp: Gruppe meldet Änderungen, bitte anrufen', en: 'WhatsApp: group reports changes, please call' },
  task_cancel: { tr: 'WhatsApp: grup iptal istiyor, arayıp görüşün', de: 'WhatsApp: Gruppe möchte stornieren, bitte anrufen', en: 'WhatsApp: group wants to cancel, please call' },
  task_msg: { tr: 'WhatsApp mesajı geldi, cevaplayın', de: 'WhatsApp-Nachricht eingegangen, bitte antworten', en: 'WhatsApp message received, please reply' },
  approved: { tr: 'onaylandı', de: 'genehmigt', en: 'approved' }, rejected: { tr: 'reddedildi', de: 'abgelehnt', en: 'rejected' },
};
const tx = (k, l) => TXT[k][l] || TXT[k].tr;

async function addTask(t) {
  const now = new Date().toISOString();
  const x = { id: newId(), note: '', from: '', time: '', prio: 'acil', who: 'WhatsApp', ...t, status: 'acik', createdAt: now, updatedAt: now, createdBy: 'WhatsApp', log: [{ at: now, who: 'WhatsApp', code: 'tl_created' }] };
  await writeJSON(`tasks/${x.id}.json`, x);
}
async function allGroups() { return (await Promise.all((await listPaths('groups/')).map((p) => readJSON(p).catch(() => null)))).filter(Boolean); }

function groupParams(req, g, template) {
  const st = g.settings, L = groupLang(g), link = `${baseUrl(req)}/g.html?t=${g.token}&lang=${L}`;
  const dl = roomingDeadline(st), dls = dl ? fmtD(dl.toISOString().slice(0, 10)) : '—', first = (st.leader || '').split(' ')[0] || st.leader || '—';
  if (template === 'hg_grup_linki') return [first, st.name, link, dls];
  if (template === 'hg_odalama_hatirlatma') return [first, st.name, dls, link];
  if (template === 'hg_teyit') return [first, fmtD(st.in), st.name];
  return null;
}
async function sendToGroup(req, path, g, template, by, etag) {
  const params = groupParams(req, g, template);
  if (!params) return { error: 'e_wa_template' };
  if (!g.settings.phone) return { error: 'e_wa_phone' };
  const r = await sendTemplate(g.settings.phone, template, groupLang(g), params, { groupId: g.id, kind: 'group', by });
  addHistory(g, 'otel', 'h_wa_out', { t: template, s: r.status, by });
  g.waSent = { ...(g.waSent || {}), [template]: r.at };
  await writeJSON(path, g, etag);
  return { msg: r };
}

/* ---------- gelen mesaj işleme ---------- */
async function handleIncoming(req, m) {
  const from = normPhone(m.from), now = new Date().toISOString();
  const text = m.text?.body || m.button?.text || m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || (m.type !== 'text' ? `[${m.type}]` : '');
  const payload = m.button?.payload || m.interactive?.button_reply?.id || '';
  const [action, pid] = payload.split(':');
  // grup eşleştir: önce düğme yükündeki kimlik, sonra telefon (en yakın tarihli aktif grup)
  let rec = null;
  if (isId(pid)) rec = await readJSON(groupPath(pid)).catch(() => null);
  if (!rec) {
    const cand = (await allGroups()).filter((r) => r.data.settings.status !== 'İptal' && normPhone(r.data.settings.phone) === from && (!r.data.settings.out || r.data.settings.out >= today()));
    cand.sort((a, b) => (a.data.settings.in || '9').localeCompare(b.data.settings.in || '9'));
    rec = cand[0] || null;
  }
  let staff = null;
  if (!rec) {
    const ss = (await Promise.all((await listPaths('staff/')).map((p) => readJSON(p).catch(() => null)))).filter(Boolean);
    staff = ss.find((s) => s.data.active && normPhone(s.data.phone) === from)?.data || null;
  }
  await logIn({ from, text, payload, waId: m.id || '', groupId: rec?.data.id || '', groupName: rec?.data.settings.name || '', staffId: staff?.id || '', staffName: staff?.name || '', name: m._name || '' });
  if (!rec) return;
  const g = rec.data, L = groupLang(g);
  const t0 = now;
  if (action === 'confirm') {
    const c = { at: now, by: 'WhatsApp', result: 'confirmed', note: text };
    g.calls = [c, ...(g.calls || [])].slice(0, 100);
    if (g.settings.status !== 'İptal') { g.settings.status = 'Kesin'; g.confirmedAt = now; }
    addHistory(g, 'grup', 'h_call', { by: 'WhatsApp', result: 'confirmed', note: text });
    await writeJSON(rec.path || groupPath(g.id), g);
    await sendText(from, tx('thanks_confirm', L), { groupId: g.id, kind: 'auto' });
    return;
  }
  if (action === 'change' || action === 'cancel') {
    pushAlert(g, action === 'cancel' ? 'a_wa_cancel' : 'a_wa_change', { text });
    addHistory(g, 'grup', 'h_wa_in', { text });
    await writeJSON(groupPath(g.id), g);
    await addTask({ title: tx(action === 'cancel' ? 'task_cancel' : 'task_change', 'tr'), note: `${g.settings.leader || ''} · +${from}`, dept: 'rezervasyon', due: today(), groupId: g.id, groupName: g.settings.name });
    await sendText(from, tx(action === 'cancel' ? 'thanks_cancel' : 'thanks_change', L), { groupId: g.id, kind: 'auto' });
    await notifyManager(g, t0);
    return;
  }
  pushAlert(g, 'a_wa_in', { text });
  addHistory(g, 'grup', 'h_wa_in', { text });
  await writeJSON(groupPath(g.id), g);
  await addTask({ title: tx('task_msg', 'tr'), note: `${g.settings.leader || ''} · +${from}: ${text}`.slice(0, 1000), dept: 'resepsiyon', due: today(), groupId: g.id, groupName: g.settings.name, prio: 'normal' });
}
async function handleStatus(s) {
  // giden mesajın durumunu güncelle (sent → delivered → read / failed)
  const paths = (await listPaths('wa/out/')).sort().reverse().slice(0, 300);
  for (const p of paths) {
    const r = await readJSON(p).catch(() => null);
    if (r?.data?.waId && r.data.waId === s.id) {
      const order = ['sent', 'delivered', 'read'];
      if (s.status === 'failed' || order.indexOf(s.status) > order.indexOf(r.data.status)) {
        await writeJSON(p, { ...r.data, status: s.status, error: s.errors?.[0]?.title || r.data.error || '' });
      }
      return;
    }
  }
}
async function readRaw(req) {
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
  return Buffer.concat(chunks);
}

/* ---------- günlük otomasyon ---------- */
async function runCron(req) {
  const cfg = await getCfg(), tIso = today(), out = { reminders: 0, confirms: 0, summary: false };
  const recs = await allGroups();
  for (const rec of recs) {
    const g = rec.data, st = g.settings;
    if (st.status === 'İptal' || st.status === 'Talep' || !st.in || st.in < tIso || !st.phone) continue;
    const sent = g.waSent || {};
    const dl = roomingDeadline(st), daysToDl = dl ? Math.round((new Date(dl.toISOString().slice(0, 10) + 'T12:00:00') - new Date(tIso + 'T12:00:00')) / 864e5) : null;
    if (cfg.autoReminder && !g.submittedAt && daysToDl !== null && daysToDl <= 2 && daysToDl >= 0 && !sent.hg_odalama_hatirlatma) {
      const r = await sendToGroup(req, rec.path || groupPath(g.id), g, 'hg_odalama_hatirlatma', 'otomatik'); if (r.msg) out.reminders++;
      continue; // aynı gün tek mesaj
    }
    const confirmBy = new Date(st.in + 'T12:00:00'); confirmBy.setDate(confirmBy.getDate() - (st.confirmDays ?? 7));
    const callOn = new Date(confirmBy); callOn.setDate(callOn.getDate() - (st.callDays ?? 3));
    const callIso = callOn.toISOString().slice(0, 10), confIso = confirmBy.toISOString().slice(0, 10);
    if (cfg.autoConfirm && !g.confirmedAt && st.status !== 'Kesin' && tIso >= callIso && tIso <= confIso && !sent.hg_teyit) {
      const r = await sendToGroup(req, rec.path || groupPath(g.id), g, 'hg_teyit', 'otomatik'); if (r.msg) out.confirms++;
    }
  }
  if (cfg.dailySummary && process.env.WA_MANAGER_PHONE) {
    const sums = recs.map((r) => summary(r.data)).filter((g) => g.status !== 'İptal' && !(waConfigured() && g.id.startsWith('demo-')));
    const arr = sums.filter((g) => g.in === tIso).length, dep = sums.filter((g) => g.out === tIso).length;
    const stay = sums.filter((g) => g.in && g.in <= tIso && tIso < g.out).reduce((n, g) => n + (g.sleepersEff || 0), 0);
    const crit = sums.filter((g) => (g.out && g.out <= tIso && g.due - g.paid > 0.009) || g.alerts).length;
    const inq = sums.filter((g) => g.status === 'Talep').length;
    const leave = (await Promise.all((await listPaths('leave/')).map((p) => readJSON(p).catch(() => null)))).filter((r) => r?.data?.status === 'beantragt').length;
    await sendTemplate(process.env.WA_MANAGER_PHONE, 'hg_gunluk_ozet', mgrLang(), [fmtD(tIso), arr, dep, stay, crit, inq + leave], { kind: 'summary' });
    out.summary = true;
  }
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const op = req.query.op;
  try {
    /* Meta webhook */
    if (op === 'webhook') {
      if (req.method === 'GET') {
        const ok = req.query['hub.mode'] === 'subscribe' && process.env.WA_VERIFY_TOKEN && req.query['hub.verify_token'] === process.env.WA_VERIFY_TOKEN;
        return ok ? res.status(200).send(String(req.query['hub.challenge'] || '')) : res.status(403).end();
      }
      if (req.method !== 'POST') return res.status(405).end();
      const raw = await readRaw(req);
      if (!verifySignature(raw, req.headers['x-hub-signature-256'])) return res.status(401).end();
      const body = JSON.parse(raw.toString('utf8') || '{}');
      for (const e of body.entry || []) for (const ch of e.changes || []) {
        const v = ch.value || {}, names = Object.fromEntries((v.contacts || []).map((c) => [c.wa_id, c.profile?.name || '']));
        for (const m of v.messages || []) await handleIncoming(req, { ...m, _name: names[m.from] || '' });
        for (const s of v.statuses || []) await handleStatus(s);
      }
      return res.status(200).json({ ok: true });
    }
    /* günlük otomasyon */
    if (op === 'cron') {
      const cronOk = process.env.CRON_SECRET && req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`;
      if (!cronOk && !requireManager(req, res)) return;
      return res.status(200).json({ ok: true, ...(await runCron(req)) });
    }
    if (!requireStaff(req, res)) return;
    if (req.method === 'GET') {
      const [outLog, inLog, cfg] = await Promise.all([listLog('out', 150), listLog('in', 150), getCfg()]);
      const gid = isId(req.query.groupId) ? req.query.groupId : '';
      const f = (x) => !gid || x.groupId === gid;
      return res.status(200).json({
        configured: waConfigured(), manager: !!process.env.WA_MANAGER_PHONE, webhook: !!(process.env.WA_APP_SECRET && process.env.WA_VERIFY_TOKEN),
        cron: !!process.env.CRON_SECRET, cfg, out: outLog.filter(f), in: inLog.filter(f), templates: TEMPLATES, callback: `${baseUrl(req)}/api/wa?op=webhook`,
      });
    }
    if (req.method !== 'POST') return res.status(405).end();
    const b = req.body || {}, who = String(b.who || '').slice(0, 60);
    if (b.op === 'send') {
      if (!isId(b.groupId) || !['hg_grup_linki', 'hg_odalama_hatirlatma', 'hg_teyit'].includes(b.template)) return fail(res, 400, 'e_wa_template');
      const rec = await readJSON(groupPath(b.groupId));
      if (!rec) return fail(res, 404, 'e_not_found');
      const r = await sendToGroup(req, groupPath(b.groupId), rec.data, b.template, who || 'otel', rec.etag).catch((e) => (String(e?.name || e).includes('Precondition') ? { error: 'e_conflict' } : Promise.reject(e)));
      if (r.error) return fail(res, r.error === 'e_conflict' ? 409 : 400, r.error);
      return res.status(200).json({ ok: true, msg: r.msg });
    }
    if (b.op === 'reply') {
      const r = await sendText(b.to, b.text, { groupId: isId(b.groupId) ? b.groupId : '', kind: 'reply', by: who });
      if (isId(b.groupId)) { const rec = await readJSON(groupPath(b.groupId)); if (rec) { addHistory(rec.data, 'otel', 'h_wa_out', { t: 'text', s: r.status, by: who }); await writeJSON(groupPath(b.groupId), rec.data); } }
      return res.status(200).json({ ok: true, msg: r });
    }
    if (b.op === 'config') {
      if (!requireManager(req, res)) return;
      const c = Object.fromEntries(Object.keys(DEFAULT_CFG).map((k) => [k, b.cfg?.[k] !== false]));
      await writeJSON(CFG, c);
      return res.status(200).json({ ok: true, cfg: c });
    }
    if (b.op === 'simulateIn') {
      if (!requireManager(req, res)) return;
      const from = normPhone(b.from);
      if (!from) return fail(res, 400, 'e_wa_phone');
      const payload = ['confirm', 'change', 'cancel'].includes(b.action) && isId(b.groupId) ? `${b.action}:${b.groupId}` : '';
      const msg = payload ? { from, id: 'sim-' + newId(6), type: 'button', button: { payload, text: String(b.text || b.action) } } : { from, id: 'sim-' + newId(6), type: 'text', text: { body: String(b.text || '').slice(0, 1000) } };
      await handleIncoming(req, { ...msg, _name: 'Simülasyon' });
      return res.status(200).json({ ok: true });
    }
    return fail(res, 400, 'e_action');
  } catch (e) {
    console.error('wa', e);
    return fail(res, 500, 'e_server');
  }
}
