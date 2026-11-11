/* Hotel Global — dışarıda hazırlanmış katılımcı listesini (Google Sheets / Excel / CSV) içe aktarma */
const HGImport = (() => {
  const { AGES, esc, toast, api } = HG;

  /* ---------- ayrıştırma ---------- */
  function parseTable(text) {
    text = String(text || "").replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();
    if (!text) return [];
    const first = text.split("\n")[0];
    const delim = first.includes("\t") ? "\t" : (first.split(";").length > first.split(",").length ? ";" : ",");
    const rows = []; let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"' && cell === "") q = true;
      else if (c === delim) { row.push(cell.trim()); cell = ""; }
      else if (c === "\n") { row.push(cell.trim()); rows.push(row); row = []; cell = ""; }
      else cell += c;
    }
    row.push(cell.trim()); rows.push(row);
    return rows.filter((r) => r.some((x) => x !== "")).slice(0, 2001);
  }
  const norm = (s) => String(s || "").toLocaleLowerCase("tr").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i").replace(/[^a-z0-9]+/g, " ").trim();
  const FIELDS = [
    ["name", "Ad Soyad (zorunlu)", ["ad soyad", "adi soyadi", "adiniz soyadiniz", "isim soyisim", "isim", "name", "katilimci", "misafir", "full name", "vorname nachname"]],
    ["first", "Ad (ayrı sütunsa)", ["ad", "adi", "adiniz", "first name", "vorname"]],
    ["last", "Soyad (ayrı sütunsa)", ["soyad", "soyadi", "soyadiniz", "last name", "nachname", "surname"]],
    ["age", "Yaş / yaş grubu / doğum yılı", ["yas", "yasi", "yas grubu", "age", "alter", "dogum", "dogum yili", "dogum tarihi", "geburtsjahr"]],
    ["stay", "Konaklama (evet / hayır)", ["konaklama", "konaklama talebi", "yatili", "kalacak", "otel", "ubernachtung", "overnight", "gunubirlik"]],
    ["room", "Oda / aile (aynı değer = aynı oda)", ["oda", "oda no", "aile", "room", "zimmer", "oda arkadasi", "familie"]],
    ["mail", "E-posta", ["e posta", "eposta", "email", "e mail", "mail", "e posta adresi"]],
    ["invoice", "Fatura istiyor (evet / hayır)", ["fatura", "fatura istiyor", "invoice", "rechnung"]],
    ["inv", "Fatura adı / adresi", ["fatura adresi", "fatura bilgileri", "firma", "rechnungsadresse", "billing address"]],
  ];
  function guess(headers) {
    const h = headers.map(norm), used = new Set(), map = {};
    for (const [key, , words] of FIELDS) {
      let best = -1, score = 0;
      h.forEach((x, i) => {
        if (used.has(i)) return;
        for (const w of words) {
          const s = x === w ? 3 : (x.startsWith(w + " ") || x.endsWith(" " + w) ? 2 : (w.length > 3 && x.includes(w) ? 1 : 0));
          if (s > score) { score = s; best = i; }
        }
      });
      if (best >= 0 && !(key === "first" && map.name !== undefined) && !(key === "last" && map.name !== undefined)) { map[key] = best; used.add(best); }
    }
    if (map.inv !== undefined && map.invoice === map.inv) delete map.invoice;
    return map;
  }
  const YES = /^(evet|e|yes|y|ja|j|var|x|true|1|yatili|konaklama|konaklayacak|kalacak|istiyor)/;
  const NO = /^(hayir|h|no|n|nein|yok|false|0|gunubirlik|istemiyor)/;
  function ageKey(v) {
    const s = norm(v);
    if (!s) return "Y";
    if (/bebek|baby|0 2|0 3/.test(s)) return "C0";
    if (/yetiskin|adult|erwachsen/.test(s)) return "Y";
    if (/3 7|3 6|2 7/.test(s)) return "C3";
    let n = parseInt(s.match(/\d{1,4}/)?.[0] || "", 10);
    if (Number.isNaN(n)) return "Y";
    if (n > 1900) n = new Date().getFullYear() - n;
    if (n <= 2) return "C0"; if (n <= 7) return "C3"; if (n < 18) return "C8"; return "Y";
  }

  /* ---------- odalara dağıtma ---------- */
  const TYPE_BY_N = { 1: "EZ", 2: "ZBZ", 3: "DBZ", 4: "VBZ", 5: "SUP FAM" };
  function toRooms(people, maxPer) {
    const beds = people.filter((p) => p.a !== "C0"), babies = people.filter((p) => p.a === "C0");
    const chunks = [];
    for (let i = 0; i < beds.length; i += maxPer) chunks.push(beds.slice(i, i + maxPer));
    if (!chunks.length) chunks.push([]);
    babies.forEach((b, i) => { const c = chunks.find((x) => x.filter((p) => p.a === "C0").length < 2) || chunks[chunks.length - 1]; c.push(b); });
    return chunks.map((ppl) => {
      const n = Math.max(1, ppl.filter((p) => p.a !== "C0").length);
      const withInv = ppl.find((p) => p.invoice) || {}, withMail = ppl.find((p) => p.mail) || {};
      const payer = Math.max(0, ppl.findIndex((p) => p.a === "Y"));
      return { type: TYPE_BY_N[n] || "VBZ", extra: 0, crib: ppl.some((p) => p.a === "C0"), people: ppl.map((p) => ({ n: p.n, a: p.a })), payer, invoice: !!withInv.invoice, inv: withInv.inv || "", mail: withMail.mail || "" };
    });
  }
  function build(rows, map, opts) {
    const data = rows.slice(1), people = [], skipped = [];
    data.forEach((r, i) => {
      const get = (k) => (map[k] === undefined || map[k] === "" ? "" : String(r[map[k]] ?? "").trim());
      const n = (get("name") || [get("first"), get("last")].filter(Boolean).join(" ")).slice(0, 80);
      if (!n) { skipped.push(i + 2); return; }
      let stay = opts.stayDefault === "stay";
      if (map.stay !== undefined && map.stay !== "") { const v = norm(get("stay")); if (YES.test(v)) stay = true; else if (NO.test(v)) stay = false; }
      const invRaw = norm(get("invoice"));
      people.push({ n, a: ageKey(get("age")), stay, room: get("room"), mail: get("mail").slice(0, 120), invoice: YES.test(invRaw) || (!!get("inv") && !NO.test(invRaw)), inv: get("inv").slice(0, 300) });
    });
    const stayers = people.filter((p) => p.stay), days = people.filter((p) => !p.stay);
    const rooms = [];
    if (map.room !== undefined && map.room !== "") {
      const groups = new Map();
      stayers.forEach((p) => { const k = norm(p.room) || "__" + p.n; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); });
      groups.forEach((g) => rooms.push(...toRooms(g, g.filter((p) => p.a !== "C0").length > 5 ? 4 : 5)));
    } else {
      const per = opts.roomDefault === "single" ? 1 : 2;
      rooms.push(...toRooms(stayers, per).flatMap((r) => r.people.length ? [r] : []));
      // bebekler toRooms içinde zaten yerleşti; tek kişilik modda bebek kalan kişilere eklenir
    }
    return {
      rooms: rooms.filter((r) => r.people.length),
      days: days.map((p) => ({ n: p.n, a: p.a, invoice: p.invoice, inv: p.inv, mail: p.mail })),
      skipped, total: people.length,
    };
  }

  /* ---------- arayüz ---------- */
  function mount(container, { getSub, onApply, token }) {
    container.innerHTML = `
      <div class="row" style="gap:6px" role="tablist" aria-label="İçe aktarma yöntemi">
        <button type="button" class="btn small" data-m="paste" aria-selected="true">Tablodan yapıştır</button>
        <button type="button" class="btn ghost small" data-m="link">Google Sheets linki</button>
        <button type="button" class="btn ghost small" data-m="file">CSV dosyası</button>
      </div>
      <div data-p="paste"><label>Google Sheets veya Excel'de başlık satırı dahil tabloyu seçin, kopyalayın (Ctrl+C) ve buraya yapıştırın (Ctrl+V)<textarea rows="5" class="imp-paste" placeholder="Ad Soyad	Yaş	Konaklama	Oda&#10;Ahmet Yılmaz	34	Evet	1&#10;Ayşe Yılmaz	32	Evet	1"></textarea></label></div>
      <div data-p="link" class="hidden"><label>Tablonun linki (Paylaş → Bağlantıya sahip olan herkes → Görüntüleyen)<input class="imp-link" placeholder="https://docs.google.com/spreadsheets/d/…/edit#gid=0"></label></div>
      <div data-p="file" class="hidden"><label>Google Sheets'te Dosya → İndir → CSV ile kaydettiğiniz dosya<input type="file" class="imp-file" accept=".csv,.tsv,.txt,text/csv"></label></div>
      <div class="row"><button type="button" class="btn small imp-read">Listeyi oku</button><span class="small muted imp-msg"></span></div>
      <div class="imp-map hidden" style="display:grid;gap:12px"></div>`;
    let mode = "paste", rows = [], map = {};
    const q = (s) => container.querySelector(s);
    container.querySelectorAll("[data-m]").forEach((b) => (b.onclick = () => {
      mode = b.dataset.m;
      container.querySelectorAll("[data-m]").forEach((x) => { const on = x === b; x.className = "btn small" + (on ? "" : " ghost"); x.setAttribute("aria-selected", on); });
      container.querySelectorAll("[data-p]").forEach((p) => p.classList.toggle("hidden", p.dataset.p !== mode));
    }));
    q(".imp-read").onclick = async () => {
      const msg = q(".imp-msg"); msg.textContent = "Okunuyor…";
      try {
        let text = "";
        if (mode === "paste") text = q(".imp-paste").value;
        else if (mode === "file") { const f = q(".imp-file").files[0]; if (!f) throw new Error("Dosya seçin."); if (f.size > 1e6) throw new Error("Dosya 1 MB'tan büyük."); text = await f.text(); }
        else text = (await api("/api/sheet", { method: "POST", body: { url: q(".imp-link").value, t: token } })).csv;
        rows = parseTable(text);
        if (rows.length < 2) throw new Error("Başlık satırı ve en az bir kişi satırı gerekli.");
        map = guess(rows[0]); msg.textContent = `${rows.length - 1} satır okundu.`; drawMap();
      } catch (e) { msg.textContent = ""; toast(e.message); }
    };
    function drawMap() {
      const box = q(".imp-map"); box.classList.remove("hidden");
      const opts = [`<option value="">— yok —</option>`, ...rows[0].map((h, i) => `<option value="${i}">${esc(h || "Sütun " + (i + 1))}</option>`)].join("");
      box.innerHTML = `<h3>Sütun eşleştirme</h3><p class="note">Sütunlar otomatik tanındı. Yanlış olanı düzeltin.</p>
        <div class="grid">${FIELDS.map(([k, label]) => `<label>${label}<select data-f="${k}">${opts}</select></label>`).join("")}
          <label>Konaklama sütunu yoksa<select class="imp-stay"><option value="stay">Herkes konaklıyor</option><option value="day">Herkes günübirlik</option></select></label>
          <label>Oda sütunu yoksa<select class="imp-room"><option value="double">İkişer kişi (ZBZ)</option><option value="single">Herkes tek (EZ)</option></select></label>
          <label>Mevcut liste<select class="imp-mode"><option value="append">Mevcut listeye ekle</option><option value="replace">Mevcut listenin yerine koy</option></select></label>
        </div>
        <div class="imp-prev small"></div>
        <div class="row"><button type="button" class="btn imp-apply">İçe aktar</button></div>`;
      box.querySelectorAll("[data-f]").forEach((s) => { s.value = map[s.dataset.f] ?? ""; s.onchange = () => { map[s.dataset.f] = s.value === "" ? undefined : Number(s.value); prev(); }; });
      box.querySelector(".imp-stay").onchange = prev; box.querySelector(".imp-room").onchange = prev;
      box.querySelector(".imp-apply").onclick = () => {
        const r = result(); if (!r.total) return toast("İçe aktarılacak kişi yok: Ad Soyad sütununu seçin.");
        const sub = getSub();
        if (q(".imp-mode").value === "replace") { sub.rooms = r.rooms; sub.days = r.days; }
        else { sub.rooms.push(...r.rooms); sub.days.push(...r.days); }
        onApply(r); container.innerHTML = ""; toast(`${r.total} kişi içe aktarıldı. Oda dağılımını kontrol edip kaydedin.`);
      };
      prev();
    }
    const result = () => build(rows, map, { stayDefault: q(".imp-stay").value, roomDefault: q(".imp-room").value });
    function prev() {
      const r = result(), sl = r.rooms.reduce((x, o) => x + o.people.length, 0);
      const types = {}; r.rooms.forEach((o) => (types[o.type] = (types[o.type] || 0) + 1));
      q(".imp-prev").innerHTML = `<div class="flag ${r.total ? "" : "warn"}" style="background:var(--accent-soft)"><span><b>${r.total}</b> kişi → <b>${sl}</b> konaklayan, <b>${r.rooms.length}</b> oda (${Object.entries(types).map(([k, v]) => `${esc(k)} ×${v}`).join(", ") || "—"}), <b>${r.days.length}</b> günübirlik${r.skipped.length ? ` · adı boş olduğu için atlanan satır: ${r.skipped.slice(0, 10).join(", ")}${r.skipped.length > 10 ? "…" : ""}` : ""}</span></div>
        <div class="tablewrap" style="margin-top:8px"><table><thead><tr><th>Ad Soyad</th><th>Yaş grubu</th><th>Konaklama</th><th>Oda</th></tr></thead><tbody>${r.rooms.slice(0, 6).flatMap((o, i) => o.people.map((p) => `<tr><td>${esc(p.n)}</td><td>${AGES[p.a].label}</td><td>Evet</td><td>${i + 1} · ${o.type}</td></tr>`)).join("")}${r.days.slice(0, 5).map((p) => `<tr><td>${esc(p.n)}</td><td>${AGES[p.a].label}</td><td>Günübirlik</td><td>—</td></tr>`).join("")}</tbody></table></div>
        <p class="note">Önizleme ilk birkaç satırı gösterir.</p>`;
    }
  }
  return { mount, parseTable, guess, build };
})();
