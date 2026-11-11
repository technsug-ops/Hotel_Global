# Hotel Global — Grup Operasyonu

Otel Global için grup operasyonu web uygulaması (TechNS UG). Vercel'de çalışır, veriler Vercel Blob'da (özel erişim, Frankfurt / fra1) tutulur.

## Modül 1 — Odalama formu ve grup bilgi raporu

| Sayfa | Kim kullanır | Ne yapar |
|---|---|---|
| `/` | Resepsiyon / yönetim (şifreli) | Grup oluşturur, grup sorumlusu linkini alır, odalamayı düzeltir, oda no atar, tahsilatı işaretler, uyarıları görür |
| `/g.html?t=…` | Grup sorumlusu (gruba özel link) | Odaları, kişileri, yaş gruplarını, günübirlik katılımcıları ve fatura bilgilerini girer |

Kurallar: çocuk 0–2 ücretsiz · 3–7 %50 · 8+ tam; tek kişilik oda farkı; oda kapasitesi, oda tipi stoğu (DBZ, DZ, EZ, ZBZ, SUP FAM, VBZ) ve ek yatak (32) kontrolü.

Uyarılar: grup sorumlusu formu değiştirirse, son tarihten sonra gönderirse veya ödeme işaretlendikten sonra liste değişirse grupta uyarı oluşur.

## Yapı

- `index.html`, `g.html`, `common.js`, `style.css` — arayüz
- `api/login.js` — panel girişi (HMAC imzalı, HttpOnly çerez, 12 saat)
- `api/groups.js` — grup listesi ve yeni grup
- `api/group.js` — grup oku / güncelle (ETag ile eşzamanlılık koruması)
- `api/form.js` — grup sorumlusu formu (token ile)
- Depolama: `groups/{id}.json`, `tokens/{token}.json`

## Ortam değişkenleri (Vercel)

- `STAFF_PASSWORD` — panel şifresi
- `SESSION_SECRET` — oturum imza anahtarı
- `BLOB_READ_WRITE_TOKEN` — Blob deposu (otomatik)

## Canlı kullanımdan önce

- Vercel Pro plan (ticari kullanım)
- Vercel ve diğer sağlayıcılarla veri işleme sözleşmesi (AVV), gizlilik bildirimi
- Kişi bazında kullanıcı hesapları, e-posta bildirimi (modül 2)
