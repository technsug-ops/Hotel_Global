import crypto from 'node:crypto';
import { writeJSON, readJSON, listPaths, newId } from './_lib.js';

/*
 * WhatsApp Business Platform (Cloud API).
 * Ortam değişkenleri: WA_TOKEN, WA_PHONE_ID, WA_APP_SECRET, WA_VERIFY_TOKEN, WA_MANAGER_PHONE, WA_DEFAULT_CC (varsayılan 49)
 * WA_TOKEN veya WA_PHONE_ID yoksa "simülasyon": mesaj gönderilmez, giden kutusuna "simüle" olarak yazılır.
 * Kayıtlar: wa/out/{zaman}-{id}.json, wa/in/{zaman}-{id}.json
 */
const GRAPH = 'https://graph.facebook.com/v21.0';
export const waConfigured = () => !!(process.env.WA_TOKEN && process.env.WA_PHONE_ID);
export const LANGS = ['tr', 'de', 'en'];

/* Meta'da bu adlarla, Utility kategorisinde, tr/de/en dillerinde kaydedilecek şablonlar. {{n}} = parametre. */
export const TEMPLATES = {
  hg_grup_linki: {
    params: ['ad', 'grup', 'link', 'son_tarih'],
    tr: 'Merhaba {{1}}, {{2}} için oda ve kişi listenizi bu linkten doldurabilirsiniz: {{3}} Son tarih: {{4}}. Hotel Global',
    de: 'Hallo {{1}}, bitte tragen Sie die Zimmer- und Teilnehmerliste für {{2}} über diesen Link ein: {{3}} Frist: {{4}}. Hotel Global',
    en: 'Hello {{1}}, please fill in the room and guest list for {{2}} using this link: {{3}} Deadline: {{4}}. Hotel Global',
  },
  hg_odalama_hatirlatma: {
    params: ['ad', 'grup', 'son_tarih', 'link'],
    tr: 'Merhaba {{1}}, {{2}} grubunun oda listesi için son tarih {{3}}. Henüz doldurulmadı: {{4}} Hotel Global',
    de: 'Hallo {{1}}, die Frist für die Zimmerliste der Gruppe {{2}} ist der {{3}}. Bisher noch nicht ausgefüllt: {{4}} Hotel Global',
    en: 'Hello {{1}}, the deadline for the room list of {{2}} is {{3}}. It has not been filled in yet: {{4}} Hotel Global',
  },
  hg_teyit: {
    params: ['ad', 'tarih', 'grup'],
    buttons: ['confirm', 'change', 'cancel'],
    buttonText: { tr: ['Teyit ediyorum', 'Değişiklik var', 'İptal etmek istiyorum'], de: ['Ich bestätige', 'Es gibt Änderungen', 'Ich möchte stornieren'], en: ['I confirm', 'There are changes', 'I want to cancel'] },
    tr: 'Merhaba {{1}}, {{2}} tarihli {{3}} rezervasyonunuzu teyit eder misiniz? Aşağıdaki düğmelerden birini seçebilirsiniz. Hotel Global',
    de: 'Hallo {{1}}, bestätigen Sie bitte Ihre Reservierung {{3}} ab {{2}}? Wählen Sie einfach eine der Schaltflächen unten. Hotel Global',
    en: 'Hello {{1}}, could you confirm your booking {{3}} from {{2}}? Just choose one of the buttons below. Hotel Global',
  },
  hg_izin_sonuc: {
    params: ['ad', 'tur', 'tarih', 'sonuc'],
    tr: 'Merhaba {{1}}, {{3}} için {{2}} talebiniz: {{4}}. Hotel Global',
    de: 'Hallo {{1}}, Ihr Antrag ({{2}}) für {{3}}: {{4}}. Hotel Global',
    en: 'Hello {{1}}, your request ({{2}}) for {{3}}: {{4}}. Hotel Global',
  },
  hg_yonetici_uyari: {
    params: ['grup', 'konu'],
    tr: 'Hotel Global uyarı: {{1}} · {{2}}. Ayrıntılar panelde.',
    de: 'Hotel Global Hinweis: {{1}} · {{2}}. Details im Panel.',
    en: 'Hotel Global alert: {{1}} · {{2}}. Details in the panel.',
  },
  hg_gunluk_ozet: {
    params: ['tarih', 'giris', 'cikis', 'konaklayan', 'kritik', 'talep'],
    tr: 'Günaydın, {{1}} özeti: {{2}} grup giriş, {{3}} grup çıkış, {{4}} konaklayan. Kritik konu: {{5}}. Bekleyen talep: {{6}}. Hotel Global',
    de: 'Guten Morgen, Übersicht {{1}}: {{2}} Gruppen Anreise, {{3}} Abreise, {{4}} Übernachtende. Kritisch: {{5}}. Offene Anfragen: {{6}}. Hotel Global',
    en: 'Good morning, summary {{1}}: {{2}} groups arriving, {{3}} departing, {{4}} staying. Critical: {{5}}. Pending requests: {{6}}. Hotel Global',
  },
};

/* Telefonu WhatsApp biçimine çevirir: yalnız rakam, ülke koduyla. 0151… → 49151… */
export function normPhone(p) {
  let s = String(p || '').trim();
  const plus = s.startsWith('+');
  s = s.replace(/\D/g, '');
  if (!s) return '';
  if (plus) return s;
  if (s.startsWith('00')) return s.slice(2);
  if (s.startsWith('0')) return (process.env.WA_DEFAULT_CC || '49') + s.slice(1);
  return s;
}
// demo kayıtlarına (uydurma numaralar) hiçbir zaman gerçek mesaj gitmez
const isDemo = (ctx) => String(ctx.groupId || '').startsWith('demo-') || String(ctx.staffId || '').startsWith('demo-');
// WhatsApp parametrelerinde satır sonu ve uzun boşluk olamaz
const cleanParam = (v) => String(v ?? '—').replace(/\s+/g, ' ').trim().slice(0, 900) || '—';
export function renderTemplate(name, lang, params) {
  const tp = TEMPLATES[name]; if (!tp) return '';
  return (tp[lang] || tp.tr).replace(/\{\{(\d+)\}\}/g, (_, i) => cleanParam(params[i - 1]));
}

const stamp = () => new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
async function logOut(rec) { const id = newId(8); const x = { id, at: new Date().toISOString(), ...rec }; await writeJSON(`wa/out/${stamp()}-${id}.json`, x); return x; }
export async function logIn(rec) { const id = newId(8); const x = { id, at: new Date().toISOString(), ...rec }; await writeJSON(`wa/in/${stamp()}-${id}.json`, x); return x; }

/* Şablon gönder. ctx: {groupId, staffId, by, kind} kayıt için. */
export async function sendTemplate(to, name, lang, params, ctx = {}) {
  const tp = TEMPLATES[name];
  const phone = normPhone(to);
  const L = LANGS.includes(lang) ? lang : 'tr';
  const text = renderTemplate(name, L, params);
  const base = { to: phone, template: name, lang: L, params: params.map(cleanParam), text, ...ctx };
  if (!phone || phone.length < 8) return logOut({ ...base, status: 'failed', error: 'e_wa_phone' });
  if (!waConfigured() || isDemo(ctx)) return logOut({ ...base, status: 'simulated' });
  const components = [{ type: 'body', parameters: params.map((v) => ({ type: 'text', text: cleanParam(v) })) }];
  (tp.buttons || []).forEach((b, i) => components.push({ type: 'button', sub_type: 'quick_reply', index: String(i), parameters: [{ type: 'payload', payload: `${b}:${ctx.groupId || ''}` }] }));
  try {
    const r = await fetch(`${GRAPH}/${process.env.WA_PHONE_ID}/messages`, {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.WA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: phone, type: 'template', template: { name, language: { code: L }, components } }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return logOut({ ...base, status: 'failed', error: j?.error?.message?.slice(0, 300) || `HTTP ${r.status}` });
    return logOut({ ...base, status: 'sent', waId: j?.messages?.[0]?.id || '' });
  } catch (e) {
    return logOut({ ...base, status: 'failed', error: String(e).slice(0, 300) });
  }
}

/* 24 saatlik pencere içinde serbest metin (gelen mesaja cevap) */
export async function sendText(to, text, ctx = {}) {
  const phone = normPhone(to), body = String(text || '').slice(0, 4000);
  const base = { to: phone, template: '', text: body, ...ctx };
  if (!phone || !body) return logOut({ ...base, status: 'failed', error: 'e_wa_phone' });
  if (!waConfigured() || isDemo(ctx)) return logOut({ ...base, status: 'simulated' });
  try {
    const r = await fetch(`${GRAPH}/${process.env.WA_PHONE_ID}/messages`, {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.WA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: phone, type: 'text', text: { body } }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return logOut({ ...base, status: 'failed', error: j?.error?.message?.slice(0, 300) || `HTTP ${r.status}` });
    return logOut({ ...base, status: 'sent', waId: j?.messages?.[0]?.id || '' });
  } catch (e) { return logOut({ ...base, status: 'failed', error: String(e).slice(0, 300) }); }
}

export function verifySignature(raw, header) {
  const secret = process.env.WA_APP_SECRET;
  if (!secret || !header) return false;
  const exp = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const a = Buffer.from(exp), b = Buffer.from(String(header));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function listLog(dir, limit = 100) {
  const paths = (await listPaths(`wa/${dir}/`)).sort().reverse().slice(0, limit);
  return (await Promise.all(paths.map((p) => readJSON(p).then((r) => r && { ...r.data, path: p }).catch(() => null)))).filter(Boolean);
}

/* Yöneticiye anlık bildirim gerektiren uyarılar */
export const MANAGER_ALERTS = ['a_pending', 'a_after_payment', 'a_call', 'a_dates', 'a_wa_cancel', 'a_wa_change'];

export const CFG = 'config/wa.json';
export const DEFAULT_CFG = { autoReminder: true, autoConfirm: true, dailySummary: true, managerAlerts: true };
export async function getCfg() { const r = await readJSON(CFG).catch(() => null); return { ...DEFAULT_CFG, ...(r?.data || {}) }; }
export const mgrLang = () => (LANGS.includes(process.env.WA_MANAGER_LANG) ? process.env.WA_MANAGER_LANG : 'tr');
const ALERT_TXT = {
    a_pending: { tr: 'son tarihten sonra değişiklik talebi', de: 'Änderungswunsch nach Frist', en: 'change request after deadline' },
    a_after_payment: { tr: 'ödeme alındıktan sonra liste değişti', de: 'Liste nach Zahlung geändert', en: 'list changed after payment' },
    a_call: { tr: 'aramada değişiklik / iptal', de: 'Änderung / Storno im Telefonat', en: 'change / cancellation on call' },
    a_dates: { tr: 'tarihler değişti', de: 'Daten geändert', en: 'dates changed' },
    a_wa_cancel: { tr: 'WhatsApp ile iptal istiyor', de: 'möchte per WhatsApp stornieren', en: 'wants to cancel via WhatsApp' },
    a_wa_change: { tr: 'WhatsApp ile değişiklik bildirdi', de: 'meldet Änderungen per WhatsApp', en: 'reports changes via WhatsApp' },
};

/* Grup üzerinde yeni oluşan uyarıları yöneticiye bildirir (group.js / form.js da kullanır) */
export async function notifyManager(g, sinceIso) {
  try {
    const to = process.env.WA_MANAGER_PHONE; if (!to) return;
    const cfg = await getCfg(); if (!cfg.managerAlerts) return;
    const fresh = (g.alerts || []).filter((a) => a.at >= sinceIso && MANAGER_ALERTS.includes(a.code));
    for (const a of fresh.slice(0, 3)) await sendTemplate(to, 'hg_yonetici_uyari', mgrLang(), [g.settings.name, (ALERT_TXT[a.code] || {})[mgrLang()] || a.code], { groupId: g.id, kind: 'manager' });
  } catch (e) { console.error('notifyManager', e); }
}

