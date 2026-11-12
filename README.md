# Hotel Global — Grup Operasyonu

Otel Global için grup operasyonu web uygulaması (TechNS UG). Vercel'de çalışır, veriler Vercel Blob'da (özel erişim, Frankfurt / fra1) tutulur. Arayüz üç dillidir: Türkçe, Deutsch, English.

## Sayfalar

| Sayfa | Kim | Ne yapar |
|---|---|---|
| `/` | Resepsiyon / yönetim (şifreli) | Gösterge paneli, grup kaydı, teyit araması, odalama, program ve mekanlar, tahsilat, uyarılar |
| `/g.html?t=…&lang=de` | Grup sorumlusu (gruba özel link) | Odalar, kişiler, günübirlik, fatura; dış liste içe aktarma |

## Dosyalar

- `i18n.js` — TR/DE/EN sözlük, `t(key, params)`, dil seçici. Yeni metin = yeni anahtar, üç dilde.
- `common.js` — kurallar (kapasite, fiyat, teyit, mekan çakışması), form editörü, rapor
- `importer.js` — Google Sheets / Excel / CSV içe aktarma
- `style.css` — arayüz
- `api/*` — `login`, `groups`, `group`, `form`, `sheet`, `venues`; `_lib.js` ortak

Sunucu dil bağımsızdır: hatalar `{ code }`, geçmiş ve uyarılar `{ code, p }` olarak saklanır; arayüz seçili dilde gösterir.

## Ortam değişkenleri

`STAFF_PASSWORD`, `SESSION_SECRET`, `BLOB_READ_WRITE_TOKEN`

## Canlı kullanımdan önce

Vercel Pro plan · AVV · gizlilik bildirimi ve Impressum · veri silme kuralı · kişi bazında kullanıcılar · e-posta bildirimi
