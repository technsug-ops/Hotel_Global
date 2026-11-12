import crypto from 'node:crypto';
import { requireStaff, isStaff, writeJSON, readJSON, listPaths, groupPath, tokenPath, newId, cleanSettings, cleanSubmission, cleanSchedule, describe, fail, del } from './_lib.js';

/*
 * Demo verileri. Tüm demo kayıtlarının kimliği "demo-" ile başlar; "Sil" yalnızca bunları kaldırır.
 * POST (personel oturumu) {action:'load'|'clear'}
 * GET ?action=load|clear&key=HMAC(SESSION_SECRET,'demo') — kurulum sırasında uzaktan tetiklemek için
 */
const KEY = () => crypto.createHmac('sha256', process.env.SESSION_SECRET || 'x').update('demo').digest('hex').slice(0, 32);
const iso = (n) => { const d = new Date(); d.setUTCHours(12, 0, 0, 0); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const at = (n, h = 10) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); d.setUTCHours(h - 1, 0, 0, 0); return d.toISOString(); };

const FIRST = ['Ahmet', 'Mehmet', 'Ayşe', 'Fatma', 'Ali', 'Zeynep', 'Mustafa', 'Elif', 'Hasan', 'Emine', 'Hüseyin', 'Merve', 'İbrahim', 'Esra', 'Yusuf', 'Hatice', 'Ömer', 'Selin', 'Murat', 'Büşra', 'Emre', 'Kübra', 'Kemal', 'Derya', 'Burak'];
const LAST = ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Aydın', 'Öztürk', 'Arslan', 'Doğan', 'Kılıç', 'Aslan', 'Korkmaz', 'Koç', 'Kurt'];
let seq = 0;
const name = () => { seq++; return `${FIRST[seq % FIRST.length]} ${LAST[(seq * 7) % LAST.length]} (Demo)`; };
const P = (a = 'Y') => ({ n: name(), a });
const rooms = (spec) => spec.flatMap(([type, count, people, extra = {}]) => Array.from({ length: count }, () => ({ type, people: people.map(P), payer: 0, ...extra })));

function group(id, s, o = {}) {
  const now = new Date().toISOString();
  const settings = cleanSettings({ paymode: 'kisi', pSingle: 15, deadline: 3, confirmDays: 7, callDays: 3, ...s });
  const submission = cleanSubmission({ leader: { name: s.leader, phone: s.phone, mail: s.mail }, rooms: [], days: [], groupInv: {}, groupPay: {}, ...(o.sub || {}) }, true);
  const g = {
    id, token: 'demo-' + newId(14), createdAt: at(-20), updatedAt: now, settings, submission,
    submittedAt: o.sub ? (o.submittedAt || at(-4, 14)) : null, confirmedAt: o.confirmedAt || null,
    history: [], alerts: o.alerts || [], schedule: cleanSchedule(o.schedule || []), calls: o.calls || [], consents: [],
    pending: o.pending || null, demo: true,
  };
  if (o.sub) g.consents.push({ at: g.submittedAt, name: s.leader, phone: s.phone, mail: s.mail });
  g.history = [
    ...(o.history || []),
    ...(o.sub ? [{ at: g.submittedAt, by: 'grup', code: 'h_form_sent', p: { desc: describe(submission) }, text: '' }] : []),
    { at: at(-20), by: 'otel', code: 'h_created', p: {}, text: '' },
  ];
  return g;
}
const day = (d, kind, start, end, venue, pax, title = '') => ({ date: iso(d), kind, start, end, venue, pax, title });

function build() {
  seq = 0;
  const G = [];

  // 1) Bugün gelen büyük seminer grubu, 3 gün, kesintisiz ikram
  const s1 = rooms([['ZBZ', 23, ['Y', 'Y']], ['EZ', 4, ['Y']]]);
  s1.slice(0, 12).forEach((r, i) => Object.assign(r, { paid: true, given: true, no: String(201 + i) }));
  s1.slice(12).forEach((r, i) => (r.no = String(213 + i)));
  s1[3].invoice = true; s1[3].inv = 'Demo Mühendislik GmbH, Musterstr. 1, 60311 Frankfurt';
  const sch1 = [];
  for (let d = 0; d <= 2; d++) {
    if (d > 0) sch1.push(day(d, 'Kahvaltı', '07:00', '09:30', 'Arka Restaurant', 50));
    if (d < 2) {
      sch1.push(day(d, 'Salon kullanımı', '09:00', '17:30', 'Konferans salonu', 84, 'Teknik seminer'));
      sch1.push(day(d, 'Gün boyu ikram', '09:00', '17:30', 'Konferans salonu', 84));
      sch1.push(day(d, 'Öğle yemeği', '12:30', '13:30', 'Arka Restaurant', 84));
      sch1.push(day(d, 'Akşam yemeği', '19:00', '21:00', 'Arka Restaurant', 50));
    }
  }
  sch1.push(day(1, 'Salon kullanımı', '14:00', '16:00', 'Kırmızı salon', 25, 'Atölye B'));
  G.push(group('demo-muhendis', { name: 'DEMO · Mühendisler Derneği Semineri', leader: 'Ali Demo', phone: '+49 151 0000001', mail: 'ali@demo.invalid', in: iso(0), out: iso(2), pNight: 100, pDay: 35, salon: 'Konferans salonu', status: 'Kesin' }, {
    sub: { leader: { name: 'Ali Demo', phone: '+49 151 0000001', mail: 'ali@demo.invalid' }, rooms: s1, days: Array.from({ length: 34 }, (_, i) => ({ ...P(), paid: i < 10, given: i < 10 })) },
    schedule: sch1, confirmedAt: at(-8),
    calls: [{ at: at(-8, 11), result: 'confirmed', note: '50 konaklama + 34 günübirlik teyit edildi', by: 'Rezervasyon (Demo)' }],
    history: [{ at: at(-8, 11), by: 'otel', code: 'h_call', p: { by: 'Rezervasyon (Demo)', result: 'confirmed', note: '' }, text: '' }],
  }));

  // 2) Yarın gelen düğün / aile grubu, bebek ve çocuklar, değişiklik talebi bekliyor
  const s2 = rooms([['ZBZ', 8, ['Y', 'Y']], ['VBZ', 1, ['Y', 'Y', 'C8', 'C3']], ['ZBZ', 1, ['Y', 'Y', 'C0'], { crib: true }], ['EZ', 2, ['Y']], ['DBZ', 1, ['Y', 'Y', 'Y']]]);
  const s2b = JSON.parse(JSON.stringify(s2)); s2b.push(...rooms([['ZBZ', 2, ['Y', 'Y']]]));
  G.push(group('demo-latif-dugun', { name: 'DEMO · Latif Ailesi Düğünü', leader: 'Latif Demo', phone: '+49 151 0000002', in: iso(1), out: iso(3), pNight: 95, pDay: 0, status: 'Kesin', deadline: 3 }, {
    sub: { leader: { name: 'Latif Demo', phone: '+49 151 0000002' }, rooms: s2, days: [] }, confirmedAt: at(-6),
    pending: { at: at(0, 7), submission: cleanSubmission({ leader: { name: 'Latif Demo', phone: '+49 151 0000002' }, rooms: s2b, days: [] }) },
    alerts: [{ at: at(0, 7), code: 'a_pending', p: { desc: { r: 15, s: 31, d: 0 } }, text: '', seen: false }],
    schedule: [
      day(1, 'Akşam yemeği', '19:30', '22:00', 'Ön Restaurant', 27, 'Kına gecesi'),
      day(1, 'Salon kullanımı', '15:00', '18:00', 'Kırmızı salon', 27, 'Hazırlık ve prova'),
      day(2, 'Kahvaltı', '08:00', '10:30', 'Ön Restaurant', 27),
      day(2, 'Salon kullanımı', '17:00', '23:59', 'Mavi salon', 120, 'Düğün'),
      day(2, 'Akşam yemeği', '18:30', '21:00', 'Ön Restaurant', 120, 'Düğün yemeği'),
      day(3, 'Kahvaltı', '08:00', '10:30', 'Ön Restaurant', 27),
    ],
  }));

  // 3) Kesinleşme tarihi geçmiş, aranması gereken grup
  G.push(group('demo-yakup-hoca', { name: 'DEMO · Yakup Hoca Semineri', leader: 'Yakup Demo', phone: '+49 151 0000003', in: iso(5), out: iso(7), pNight: 90, pDay: 30, status: 'Opsiyon', estSleepers: 40, estDays: 15, salon: 'Gri salon' }, {
    calls: [{ at: at(-3, 15), result: 'unreachable', note: 'Telefon kapalı', by: 'Rezervasyon (Demo)' }],
    schedule: [day(5, 'Salon kullanımı', '10:00', '17:00', 'Gri salon', 55), day(5, 'Gün boyu ikram', '10:00', '17:00', 'Gri salon', 55), day(5, 'Öğle yemeği', '12:30', '13:30', 'Arka Restaurant', 55), day(6, 'Salon kullanımı', '09:00', '13:00', 'Gri salon', 55)],
  }));

  // 4) Teyit araması zamanı gelmiş grup (henüz liste yok, tahmini sayılar)
  G.push(group('demo-genclik', { name: 'DEMO · Gençlik Kampı', leader: 'Zeynep Demo', phone: '+49 151 0000004', in: iso(9), out: iso(12), pNight: 70, pDay: 25, status: 'Opsiyon', estSleepers: 60, estDays: 20, salon: 'A1' }, {
    schedule: [day(10, 'Salon kullanımı', '09:30', '16:00', 'A1', 80), day(10, 'İkram / ara', '10:30', '11:00', 'A1', 80), day(10, 'İkram / ara', '15:00', '15:30', 'A1', 80), day(10, 'Öğle yemeği', '12:30', '13:30', 'Arka Restaurant', 80)],
  }));

  // 5) Bugün ayrılan, hesabı tam kapanmamış grup
  const s5 = rooms([['ZBZ', 8, ['Y', 'Y']], ['EZ', 2, ['Y']]]);
  s5.forEach((r, i) => Object.assign(r, { paid: i < 7, given: i < 7, no: String(301 + i) }));
  G.push(group('demo-almanca', { name: 'DEMO · Almanca Kursu', leader: 'Mehmet Demo', phone: '+49 151 0000005', in: iso(-3), out: iso(0), pNight: 85, pDay: 0, status: 'Kesin' }, {
    sub: { leader: { name: 'Mehmet Demo', phone: '+49 151 0000005' }, rooms: s5, days: [] }, submittedAt: at(-7), confirmedAt: at(-12),
    schedule: [day(-2, 'Salon kullanımı', '09:00', '16:00', 'Mavi salon', 18), day(-1, 'Salon kullanımı', '09:00', '16:00', 'Mavi salon', 18), day(0, 'Kahvaltı', '07:00', '09:00', 'Arka Restaurant', 18)],
  }));

  // 6) Geçen hafta ayrılmış, açık hesap kalmış grup
  const s6 = rooms([['ZBZ', 5, ['Y', 'Y']]]);
  s6.forEach((r, i) => Object.assign(r, { paid: i < 3, given: i < 3 }));
  G.push(group('demo-acik-hesap', { name: 'DEMO · Spor Kulübü', leader: 'Hasan Demo', phone: '+49 151 0000006', in: iso(-6), out: iso(-4), pNight: 80, status: 'Kesin' }, {
    sub: { leader: { name: 'Hasan Demo', phone: '+49 151 0000006' }, rooms: s6, days: [] }, submittedAt: at(-9), confirmedAt: at(-13),
  }));

  // 7) İptal
  G.push(group('demo-iptal', { name: 'DEMO · İptal Edilen Gezi', leader: 'Elif Demo', in: iso(15), out: iso(17), pNight: 90, status: 'İptal', estSleepers: 30 }, {
    calls: [{ at: at(-2, 10), result: 'cancelled', note: 'Otobüs bulunamadı', by: 'Rezervasyon (Demo)' }],
  }));

  // 8) Teklif aşamasında ileri tarihli grup
  G.push(group('demo-teklif', { name: 'DEMO · Hastane Personeli Eğitimi', leader: 'Selin Demo', phone: '+49 151 0000008', in: iso(21), out: iso(23), pNight: 105, pDay: 40, status: 'Teklif', estSleepers: 35, estDays: 25, salon: 'Konferans salonu' }, {
    schedule: [day(21, 'Salon kullanımı', '09:00', '17:00', 'Konferans salonu', 60), day(21, 'Gün boyu ikram', '09:00', '17:00', 'Konferans salonu', 60), day(22, 'Salon kullanımı', '09:00', '15:00', 'Konferans salonu', 60)],
  }));
  // 9) Müdüre telefonla gelen hızlı talep: tarih net değil, detay resepsiyonda
  const q = group('demo-hizli-talep', { name: 'DEMO · Fatih Bey’in Derneği', leader: 'Fatih Demo', phone: '+49 151 0000009', status: 'Talep', estSleepers: 40, estDays: 10, when: 'Mart sonu, 2 gece', source: 'Rıdvan Bey’in tanıdığı', notes: 'Salon ve akşam yemeği istiyorlar; fiyat sordular.', pNight: 0 });
  q.createdAt = new Date(Date.now() - 2 * 3600e3).toISOString();
  q.history = [{ at: q.createdAt, by: 'Müdüriyet', code: 'h_quick', p: { by: 'Rıdvan Bey (Demo)' }, text: '' }];
  G.push(q);
  return G;
}

function tasks() {
  const now = new Date().toISOString();
  const T = (id, x, log = []) => ({ id, prio: 'normal', note: '', from: '', groupId: '', groupName: '', due: '', time: '', who: '', status: 'acik', createdAt: at(-1, 9), updatedAt: now, createdBy: x.who || '', ...x, log: [...log, { at: at(-1, 9), who: x.who || '', code: 'tl_created' }] });
  return [
    T('demo-t-klima', { title: '214 numaralı odada klima çalışmıyor', dept: 'haus', from: 'resepsiyon', due: iso(-1), time: '18:00', prio: 'acil', who: 'Ayşe (Resepsiyon)', note: 'Misafir şikayet etti, geçici olarak vantilatör verildi.' }),
    T('demo-t-mikrofon', { title: 'Konferans salonuna 2 telsiz mikrofon', dept: 'haus', from: 'salon', due: iso(0), time: '08:30', prio: 'acil', who: 'Kemal (Salon)', groupId: 'demo-muhendis', groupName: 'DEMO · Mühendisler Derneği Semineri', status: 'devam', assignee: 'Murat (Teknik)' },
      [{ at: at(0, 7), who: 'Murat (Teknik)', code: 'tl_comment', p: { text: 'Piller değiştirildi, 08:15’te salonda olacak.' } }, { at: at(0, 7), who: 'Murat (Teknik)', code: 'tl_status', p: { a: 'acik', b: 'devam' } }]),
    T('demo-t-vegan', { title: '6 vejetaryen, 2 glütensiz menü', dept: 'mutfak', from: 'restoran', due: iso(0), time: '12:00', who: 'Derya (Restaurant)', groupId: 'demo-muhendis', groupName: 'DEMO · Mühendisler Derneği Semineri', note: 'Öğle ve akşam yemeği için. İsim kartları masada olacak.' }),
    T('demo-t-termos', { title: 'Kesintisiz ikram: 4 termos çay + 4 kahve, 15:00’te tazele', dept: 'restoran', from: 'salon', due: iso(0), time: '09:00', who: 'Kemal (Salon)', groupId: 'demo-muhendis', groupName: 'DEMO · Mühendisler Derneği Semineri', status: 'devam', assignee: 'Derya (Restaurant)' }),
    T('demo-t-pasta', { title: 'Düğün pastası teslim alınacak, soğuk odaya', dept: 'mutfak', from: 'rezervasyon', due: iso(2), time: '11:00', who: 'Esra (Rezervasyon)', groupId: 'demo-latif-dugun', groupName: 'DEMO · Latif Ailesi Düğünü', prio: 'planli' }),
    T('demo-t-sandalye', { title: 'Mavi salona 120 sandalye ve sahne düzeni', dept: 'salon', from: 'rezervasyon', due: iso(2), time: '14:00', who: 'Esra (Rezervasyon)', groupId: 'demo-latif-dugun', groupName: 'DEMO · Latif Ailesi Düğünü' }),
    T('demo-t-ara', { title: 'Yakup Hoca’ya tekrar ulaş, kesinleşme tarihi geçti', dept: 'rezervasyon', from: 'mudur', due: iso(0), time: '11:00', prio: 'acil', who: 'Rıdvan Bey (Demo)', groupId: 'demo-yakup-hoca', groupName: 'DEMO · Yakup Hoca Semineri' }),
    T('demo-t-tahsilat', { title: 'Spor Kulübü açık hesabı: fatura e-postayla gönderilsin', dept: 'resepsiyon', from: 'mudur', due: iso(1), who: 'Rıdvan Bey (Demo)', groupId: 'demo-acik-hesap', groupName: 'DEMO · Spor Kulübü', status: 'bekliyor' },
      [{ at: at(0, 8), who: 'Ayşe (Resepsiyon)', code: 'tl_comment', p: { text: 'Fatura adresi eksik, grup sorumlusundan istendi.' } }]),
    T('demo-t-talep', { title: 'Yeni grup talebi: Fatih Demo aranacak, detaylar alınacak', dept: 'resepsiyon', from: 'mudur', due: iso(0), prio: 'acil', who: 'Rıdvan Bey (Demo)', groupId: 'demo-hizli-talep', groupName: 'DEMO · Fatih Bey’in Derneği', note: 'Tel: +49 151 0000009\nYönlendiren: Rıdvan Bey’in tanıdığı\nZaman: Mart sonu, 2 gece\nYaklaşık: 40 konaklayan, 10 günübirlik\nNot: Salon ve akşam yemeği istiyorlar; fiyat sordular.' }),
    T('demo-t-lamba', { title: '3. kat koridor lambası yandı', dept: 'haus', from: 'resepsiyon', due: iso(-2), who: 'Ayşe (Resepsiyon)', status: 'bitti', doneAt: at(-1, 15), assignee: 'Murat (Teknik)' }),
  ];
}

function staff() {
  const now = new Date().toISOString(), y = new Date().getFullYear();
  // [kimlik, ad, birim, görev, sözleşme, €/saat, hafta saati, izin hakkı, başlangıç, bitiş]
  const S = [
    ['demo-p-ridvan', 'Rıdvan Demo', 'mudur', 'Otel müdürü', 'vollzeit', 32, 40, 30, '2019-03-01'],
    ['demo-p-esra', 'Esra Demo', 'rezervasyon', 'Rezervasyon sorumlusu', 'vollzeit', 19.5, 40, 28, '2021-05-01'],
    ['demo-p-can', 'Can Demo', 'rezervasyon', 'Satış ve gruplar', 'teilzeit', 18, 25, 18, '2023-09-01'],
    ['demo-p-ayse', 'Ayşe Demo', 'resepsiyon', 'Resepsiyon şefi', 'vollzeit', 18.5, 40, 28, '2020-02-01'],
    ['demo-p-jonas', 'Jonas Demo', 'resepsiyon', 'Resepsiyonist', 'vollzeit', 16, 40, 26, '2024-04-01'],
    ['demo-p-lea', 'Lea Demo', 'resepsiyon', 'Gece resepsiyonu', 'teilzeit', 16.5, 30, 20, '2024-10-01'],
    ['demo-p-derya', 'Derya Demo', 'restoran', 'Restaurant şefi', 'vollzeit', 17.5, 40, 28, '2021-06-01'],
    ['demo-p-tim', 'Tim Demo', 'restoran', 'Servis', 'minijob', 13.9, 10, 10, '2025-05-01'],
    ['demo-p-sara', 'Sara Demo', 'restoran', 'Servis', 'werkstudent', 14.5, 20, 13, '2025-10-01', `${y + 1}-03-31`],
    ['demo-p-kemal', 'Kemal Demo', 'salon', 'Etkinlik sorumlusu', 'vollzeit', 18, 40, 28, '2022-01-15'],
    ['demo-p-yusuf', 'Yusuf Demo', 'mutfak', 'Aşçıbaşı', 'vollzeit', 21, 40, 28, '2018-08-01'],
    ['demo-p-anna', 'Anna Demo', 'mutfak', 'Aşçı', 'vollzeit', 16.5, 40, 26, '2023-03-01'],
    ['demo-p-emre', 'Emre Demo', 'mutfak', 'Mutfak yardımcısı', 'azubi', 7.5, 40, 25, `${y - 1}-08-01`, `${y + 2}-07-31`],
    ['demo-p-hatice', 'Hatice Demo', 'haus', 'Kat hizmetleri şefi', 'vollzeit', 16, 40, 28, '2019-11-01'],
    ['demo-p-maria', 'Maria Demo', 'haus', 'Oda temizliği', 'teilzeit', 14, 30, 20, '2022-04-01'],
    ['demo-p-olga', 'Olga Demo', 'haus', 'Oda temizliği', 'aushilfe', 14, 20, 10, '2025-09-01', iso(40)],
    ['demo-p-murat', 'Murat Demo', 'haus', 'Teknik / bakım', 'vollzeit', 19, 40, 28, '2020-07-01'],
  ];
  const people = S.map(([id, name, dept, role, contract, rate, weekHours, vacDays, start, end = '']) => ({ id, name, dept, role, contract, rate, weekHours, vacDays, start, end, phone: '', mail: '', notes: '', active: true, createdAt: now, updatedAt: now }));
  people.push({ id: 'demo-p-eski', name: 'Peter Demo', dept: 'restoran', role: 'Servis', contract: 'aushilfe', rate: 13.9, weekHours: 15, vacDays: 10, start: '2024-05-01', end: '2025-12-31', phone: '', mail: '', notes: 'Sözleşme bitti', active: false, createdAt: now, updatedAt: now });
  const L = (id, staffId, type, from, to, status, o = {}) => ({ id, staffId, type, from, to, status, note: '', au: false, by: 'Demo', createdAt: at(-30), ...o });
  const Y = (m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const leave = [
    L('demo-l-1', 'demo-p-ayse', 'urlaub', Y(7, 14), Y(7, 25), 'genehmigt'),
    L('demo-l-2', 'demo-p-jonas', 'urlaub', Y(8, 4), Y(8, 15), 'genehmigt'),
    L('demo-l-3', 'demo-p-yusuf', 'urlaub', Y(6, 2), Y(6, 20), 'genehmigt'),
    L('demo-l-4', 'demo-p-hatice', 'urlaub', Y(9, 1), Y(9, 19), 'genehmigt'),
    L('demo-l-5', 'demo-p-maria', 'krank', Y(2, 10), Y(2, 14), 'gemeldet', { au: true }),
    L('demo-l-6', 'demo-p-maria', 'krank', Y(10, 6), Y(10, 8), 'gemeldet'),
    L('demo-l-7', 'demo-p-anna', 'kind', Y(3, 3), Y(3, 4), 'gemeldet'),
    L('demo-l-8', 'demo-p-tim', 'krank', Y(4, 22), Y(4, 22), 'gemeldet'),
    L('demo-l-9', 'demo-p-murat', 'urlaub', Y(5, 12), Y(5, 23), 'genehmigt'),
    L('demo-l-10', 'demo-p-esra', 'urlaub', Y(4, 7), Y(4, 17), 'genehmigt'),
    L('demo-l-18', 'demo-p-anna', 'krank', Y(1, 12), Y(1, 23), 'gemeldet', { au: true }),
    L('demo-l-19', 'demo-p-murat', 'krank', Y(9, 14), Y(9, 25), 'gemeldet', { au: true }),
    L('demo-l-20', 'demo-p-lea', 'krank', Y(3, 16), Y(3, 20), 'gemeldet', { au: true }),
    L('demo-l-21', 'demo-p-olga', 'krank', Y(10, 19), Y(10, 23), 'gemeldet', { au: true }),
    L('demo-l-22', 'demo-p-jonas', 'krank', Y(2, 2), Y(2, 6), 'gemeldet', { au: true }),
    L('demo-l-23', 'demo-p-derya', 'kind', Y(5, 4), Y(5, 6), 'gemeldet'),
    // şu an ve yakın gelecek
    L('demo-l-11', 'demo-p-jonas', 'krank', iso(-1), iso(3), 'gemeldet', { by: 'Ayşe (Resepsiyon)', createdAt: at(-1, 7) }),
    L('demo-l-12', 'demo-p-emre', 'schule', iso(1), iso(2), 'gemeldet'),
    L('demo-l-13', 'demo-p-derya', 'urlaub', iso(6), iso(10), 'genehmigt'),
    L('demo-l-14', 'demo-p-kemal', 'urlaub', iso(8), iso(12), 'beantragt', { note: 'Aile ziyareti', createdAt: at(-1, 16), by: 'Kemal Demo' }),
    L('demo-l-15', 'demo-p-tim', 'urlaub', iso(7), iso(9), 'beantragt', { createdAt: at(0, 8), by: 'Tim Demo' }),
    L('demo-l-16', 'demo-p-ayse', 'urlaub', iso(20), iso(34), 'beantragt', { note: 'Türkiye', by: 'Ayşe Demo' }),
    L('demo-l-17', 'demo-p-maria', 'krank', iso(0), iso(0), 'gemeldet', { by: 'Hatice (Kat hizmetleri)', createdAt: at(0, 6) }),
  ];
  return { people, leave };
}

async function clear() {
  let n = 0;
  for (const p of [...(await listPaths('groups/demo-')), ...(await listPaths('tasks/demo-')), ...(await listPaths('staff/demo-')), ...(await listPaths('leave/demo-'))]) {
    if (p.startsWith('groups/')) { const r = await readJSON(p).catch(() => null); if (r?.data?.token) await del(tokenPath(r.data.token)).catch(() => {}); }
    await del(p); n++;
  }
  // demo personeline sonradan girilmiş izin/hastalık kayıtları
  for (const p of await listPaths('leave/')) { if (p.startsWith('leave/demo-')) continue; const r = await readJSON(p).catch(() => null); if (String(r?.data?.staffId || '').startsWith('demo-')) { await del(p); n++; } }
  // önceki yüklemeden kalmış demo linkleri
  for (const p of await listPaths('tokens/demo-')) await del(p).catch(() => {});
  for (const p of await listPaths('stafftokens/demo-')) await del(p).catch(() => {});
  return n;
}
async function load() {
  await clear();
  const gs = build(), ts = tasks();
  for (const g of gs) { await writeJSON(groupPath(g.id), g); await writeJSON(tokenPath(g.token), { id: g.id }); }
  for (const t of ts) await writeJSON(`tasks/${t.id}.json`, t);
  const st = staff();
  for (const p of st.people) { p.token = 'demo-' + newId(14); await writeJSON(`staff/${p.id}.json`, p); await writeJSON(`stafftokens/${p.token}.json`, { id: p.id }); }
  for (const l of st.leave) await writeJSON(`leave/${l.id}.json`, l);
  return { groups: gs.length, tasks: ts.length, staff: st.people.length, leave: st.leave.length };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  let action;
  if (req.method === 'GET' && !isStaff(req)) {
    const k = String(req.query.key || '');
    if (k.length !== 32 || !crypto.timingSafeEqual(Buffer.from(k), Buffer.from(KEY()))) return fail(res, 401, 'e_auth');
    action = req.query.action;
  } else {
    if (!requireStaff(req, res)) return;
    action = req.method === 'GET' ? req.query.action : req.body?.action;
  }
  try {
    if (action === 'load') return res.status(200).json({ ok: true, ...(await load()) });
    if (action === 'clear') return res.status(200).json({ ok: true, removed: await clear() });
    return fail(res, 400, 'e_action');
  } catch (e) {
    console.error('demo', e);
    return fail(res, 500, 'e_server');
  }
}
