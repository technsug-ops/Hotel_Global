# Hotel Global — Grup Operasyonu

Otel Global için grup operasyonu web uygulaması (TechNS UG).

## Modül 1 — Odalama formu ve grup bilgi raporu (prototip)

`index.html` tek sayfalık, sunucusuz bir prototiptir. Üç görünüm:

1. **Otel: grup ayarları** — grup adı, tarihler, ödeme şekli, fiyatlar, son tarih
2. **Grup sorumlusu: odalama formu** — odalar (DBZ, DZ, EZ, ZBZ, SUP FAM, VBZ), kişiler ve yaş grupları, günübirlik katılımcılar, fatura bilgileri
3. **Resepsiyon: grup bilgi raporu** — kimden ne alınacak, tekrar görüşülecekler, odalama listesi

Kurallar: çocuk 0–2 ücretsiz · 3–7 %50 · 8+ tam; tek kişilik oda farkı; oda kapasitesi, oda tipi stoğu ve ek yatak (32) kontrolü.

**Prototip sınırı:** veriler yalnız tarayıcının localStorage'ında saklanır; sunucuya veya başka bir kullanıcıya gitmez. Gerçek misafir verisi girilmemelidir.

## Sonraki adımlar

- Veritabanı (AB / Frankfurt bölgesi), grup başına benzersiz link, giriş
- Tahsilat ekranı ve yöneticiye anlık bildirim
- Grup kaydı ve günlük operasyon görünümü
