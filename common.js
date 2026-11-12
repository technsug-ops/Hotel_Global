/* Hotel Global — ortak kurallar, form editörü ve grup bilgi raporu */
const HG = (() => {
  const ROOMTYPES = {
    "EZ": { label: "EZ (tek kişilik)", beds: 1, stock: 6 },
    "DZ": { label: "DZ (çift kişilik)", beds: 2, stock: 2 },
    "ZBZ": { label: "ZBZ (2 yataklı)", beds: 2, stock: 57 },
    "DBZ": { label: "DBZ (3 kişilik)", beds: 3, stock: 2 },
    "VBZ": { label: "VBZ (4 yataklı)", beds: 4, stock: 6 },
    "SUP FAM": { label: "SUP FAM (5 kişilik)", beds: 5, stock: 2 },
  };
  const AGES = {
    "Y": { label: "Yetişkin", f: 1, bed: true },
    "C8": { label: "Çocuk 8 yaş ve üstü", f: 1, bed: true },
    "C3": { label: "Çocuk 3–7 yaş", f: 0.5, bed: true },
    "C0": { label: "Çocuk 0–2 yaş", f: 0, bed: false },
  };
  const EXTRA_BEDS = 32;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const eur = (n) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n || 0);
  const dTR = (s) => { if (!s) return "—"; const d = new Date(s + "T12:00:00"); return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", weekday: "long" }); };
  const dtTR = (iso) => iso ? new Date(iso).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
  const nights = (st) => { if (!st.in || !st.out) return 0; return Math.max(0, Math.round((new Date(st.out + "T12:00:00") - new Date(st.in + "T12:00:00")) / 864e5)); };
  const deadlineDate = (st) => { const d = new Date((st.in || "2100-01-01") + "T12:00:00"); d.setDate(d.getDate() - Number(st.deadline || 0)); return d; };
  const daysLeft = (st) => { const t = new Date(); t.setHours(12, 0, 0, 0); return Math.round((deadlineDate(st) - t) / 864e5); };
  const addDays = (iso, n) => { const d = new Date((iso || "2100-01-01") + "T12:00:00"); d.setDate(d.getDate() - Number(n || 0)); return d; };
  const today = () => { const t = new Date(); t.setHours(12, 0, 0, 0); return t; };
  const fmt = (d) => d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
  /* teyit: kesinleşme son tarihi = geliş − confirmDays; arama günü = son tarih − callDays */
  function confirmInfo(st, confirmedAt) {
    const confirmBy = addDays(st.in, st.confirmDays ?? 7);
    const callOn = new Date(confirmBy); callOn.setDate(callOn.getDate() - Number(st.callDays ?? 3));
    const t = today(), arrived = t >= addDays(st.in, 0);
    let stage = "bekliyor";
    if (st.status === "İptal") stage = "iptal";
    else if (st.status === "Kesin" || confirmedAt) stage = "kesin";
    else if (arrived) stage = "geldi";
    else if (t > confirmBy) stage = "gecikti";
    else if (t >= callOn) stage = "ara";
    return { confirmBy, callOn, stage, daysToConfirm: Math.round((confirmBy - t) / 864e5) };
  }
  function toast(msg) { const t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }

  /* ---------- fiyat ---------- */
  const personPrice = (st, a, isDay) => isDay ? st.pDay * AGES[a].f : st.pNight * nights(st) * AGES[a].f;
  function roomPrice(st, r) {
    const base = r.people.reduce((x, p) => x + personPrice(st, p.a, false), 0);
    const single = r.people.length === 1 && AGES[r.people[0].a].bed ? st.pSingle * nights(st) : 0;
    return { base, single, total: base + single };
  }
  function collectRows(st, sub) {
    if (st.paymode === "grup") {
      const tot = sub.rooms.reduce((x, r) => x + roomPrice(st, r).total, 0) + sub.days.reduce((x, d) => x + personPrice(st, d.a, true), 0);
      sub.groupPay = sub.groupPay || { paid: false, given: false };
      return [{ who: (st.leader || "Grup sorumlusu") + " (grup)", what: "Grubun tamamı", amount: tot, o: sub.groupPay, inv: !!sub.groupInv?.inv, mail: sub.groupInv?.mail || "", give: "Fatura" }];
    }
    const rows = [];
    sub.rooms.forEach((r, i) => { const p = roomPrice(st, r); const payer = r.people[r.payer] || r.people[0] || {}; rows.push({ who: payer.n || `Oda ${i + 1}`, what: `Oda ${i + 1}${r.no ? " (no " + r.no + ")" : ""} · ${r.type} · ${r.people.length} kişi` + (p.single ? ` · tek kişilik farkı ${eur(p.single)}` : ""), amount: p.total, o: r, inv: r.invoice, mail: r.mail, give: "Oda kartı" }); });
    sub.days.forEach((d) => rows.push({ who: d.n || "(ad yok)", what: `Günübirlik · ${AGES[d.a].label}`, amount: personPrice(st, d.a, true), o: d, inv: d.invoice, mail: d.mail, give: "Kaşeli kâğıt" }));
    return rows;
  }

  /* ---------- kontroller ---------- */
  function flags(st, sub, submittedAt, confirmedAt) {
    const F = [];
    const ci = confirmInfo(st, confirmedAt);
    if (ci.stage === "ara") F.push(["warn", `Teyit araması zamanı geldi: grup en geç ${fmt(ci.confirmBy)} tarihine kadar kesinleşmeli (${ci.daysToConfirm} gün kaldı). Grup sorumlusu aranmalı.`]);
    if (ci.stage === "gecikti") F.push(["crit", `Kesinleşme son tarihi (${fmt(ci.confirmBy)}) geçti, grup hâlâ kesin değil. Yönetici kararı gerekli: opsiyon uzatılsın mı, oda ve salon serbest bırakılsın mı?`]);
    if (nights(st) <= 0 && st.in) F.push(["crit", "Tarihler hatalı: çıkış gelişten sonra olmalı."]);
    if (!submittedAt) { const l = daysLeft(st); F.push([l < 0 ? "crit" : "warn", l < 0 ? "Odalama formu gelmedi ve son tarih geçti. Grup sorumlusu hemen aranmalı." : `Odalama formu henüz gönderilmedi. Son tarihe ${l} gün var.`]); }
    if (!sub.leader?.phone) F.push(["warn", "Grup sorumlusunun telefonu yok."]);
    if (!sub.leader?.mail) F.push(["warn", "Grup sorumlusunun e-postası yok."]);
    const cnt = {};
    sub.rooms.forEach((r, i) => {
      cnt[r.type] = (cnt[r.type] || 0) + 1;
      const cap = ROOMTYPES[r.type].beds + Number(r.extra || 0), need = r.people.filter((p) => AGES[p.a].bed).length;
      if (need > cap) F.push(["crit", `Oda ${i + 1} (${r.type}): ${need} kişi, ${cap} yatak. Daha büyük oda ya da ek yatak gerekli.`]);
      if (!r.people.length) F.push(["warn", `Oda ${i + 1}: kişi yazılmamış.`]);
      if (r.people.some((p) => !p.n)) F.push(["warn", `Oda ${i + 1}: adı yazılmamış kişi var.`]);
      if (r.people.some((p) => p.a === "C0") && !r.crib) F.push(["warn", `Oda ${i + 1}: 0–2 yaş bebek var, bebek yatağı istenmemiş. Sorulmalı.`]);
    });
    for (const t in cnt) if (cnt[t] > ROOMTYPES[t].stock) F.push(["crit", `${t}: ${cnt[t]} oda istendi, otelde ${ROOMTYPES[t].stock} var.`]);
    const extras = sub.rooms.reduce((x, r) => x + Number(r.extra || 0), 0);
    if (extras > EXTRA_BEDS) F.push(["crit", `Ek yatak: ${extras} istendi, otelde ${EXTRA_BEDS} var.`]);
    if (st.paymode === "kisi") {
      sub.rooms.forEach((r, i) => { if (r.invoice && !r.inv) F.push(["warn", `Oda ${i + 1}: fatura istendi ama fatura bilgisi yok.`]); if (r.invoice && !r.mail) F.push(["warn", `Oda ${i + 1}: fatura istendi ama e-posta yok; fatura gönderilemez.`]); });
      sub.days.forEach((d) => { if (d.invoice && (!d.inv || !d.mail)) F.push(["warn", `Günübirlik ${d.n || "(ad yok)"}: fatura bilgisi veya e-posta eksik.`]); });
    } else {
      const g = sub.groupInv || {};
      if (!g.inv) F.push(["warn", "Grup faturası için fatura bilgisi yok."]);
      else if (!/\b\d{5}\b/.test(g.inv)) F.push(["warn", "Fatura adresinde 5 haneli posta kodu görünmüyor."]);
    }
    if (submittedAt) {
      const unpaid = collectRows(st, sub).filter((r) => !r.o.paid && r.amount > 0);
      if (unpaid.length) F.push(["warn", `${unpaid.length} hesap henüz ödenmedi (${eur(unpaid.reduce((x, r) => x + r.amount, 0))}).`]);
    }
    return F;
  }

  /* ---------- form editörü ---------- */
  function select(options, value, onChange) {
    const s = document.createElement("select");
    for (const [v, t] of options) { const o = document.createElement("option"); o.value = v; o.textContent = t; if (String(v) === String(value)) o.selected = true; s.appendChild(o); }
    s.onchange = () => onChange(s.value);
    return s;
  }
  function input(v, ph, onInput, type, label) {
    const i = document.createElement("input"); i.value = v ?? ""; if (ph) i.placeholder = ph; if (type) i.type = type; if (label) i.setAttribute("aria-label", label);
    i.oninput = () => onInput(i.value); return i;
  }
  const ageOpts = Object.entries(AGES).map(([k, a]) => [k, a.label]);
  const yesNo = [["false", "Hayır"], ["true", "Evet"]];
  function labeled(text, el) { const l = document.createElement("label"); l.textContent = text; l.appendChild(el); return l; }

  const roomCap = (r, type = r.type, extra = r.extra) => ROOMTYPES[type].beds + Number(extra || 0);
  const bedNeed = (people) => people.filter((p) => AGES[p.a].bed).length;
  function capacityErrors(sub) {
    const out = [];
    sub.rooms.forEach((r, i) => { const n = bedNeed(r.people), c = roomCap(r); if (n > c) out.push(`Oda ${i + 1} (${r.type}): ${n} kişi, ${c} yatak`); });
    return out;
  }
  const FULL = (r) => `Bu oda dolu (${roomCap(r)} yatak). Daha büyük bir oda tipi seçin, ek yatak ekleyin veya yeni oda açın.`;
  function renderEditor(els, st, sub, onChange, opts = {}) {
    const redraw = () => renderEditor(els, st, sub, onChange, opts);
    const changed = (full) => { onChange(); if (full) redraw(); };
    // odalar
    els.rooms.innerHTML = "";
    if (!sub.rooms.length) els.rooms.innerHTML = '<p class="note">Henüz oda eklenmedi.</p>';
    sub.rooms.forEach((r, ri) => {
      const d = document.createElement("div"); d.className = "room";
      const cap = ROOMTYPES[r.type].beds + Number(r.extra || 0), need = r.people.filter((p) => AGES[p.a].bed).length;
      if (need > cap) d.classList.add("bad");
      const h = document.createElement("div"); h.className = "roomhead";
      h.append(
        labeled(`Oda ${ri + 1} · oda tipi`, select(Object.entries(ROOMTYPES).map(([k, t]) => [k, t.label]), r.type, (v) => {
          if (bedNeed(r.people) > roomCap(r, v)) { toast(`${ROOMTYPES[v].label} bu odadaki ${bedNeed(r.people)} kişiye yetmez.`); return redraw(); }
          r.type = v; changed(true); })),
        labeled("Ek yatak", select([[0, "0"], [1, "1"], [2, "2"]], r.extra || 0, (v) => {
          if (bedNeed(r.people) > roomCap(r, r.type, v)) { toast(`Ek yatak azaltılamaz: odada ${bedNeed(r.people)} kişi var.`); return redraw(); }
          r.extra = Number(v); changed(true); })),
        labeled("Bebek yatağı", select(yesNo, String(!!r.crib), (v) => { r.crib = v === "true"; changed(false); })),
      );
      if (opts.staff) h.append(labeled("Oda no (otel)", input(r.no, "ör. 214", (v) => { r.no = v; changed(false); })));
      const stc = document.createElement("div"); stc.className = "small";
      stc.innerHTML = need > cap ? `<span class="chip crit">${need} kişi / ${cap} yatak · kapasite aşıldı, fazla kişiyi silin</span>` : need === cap ? `<span class="chip warn">${need} / ${cap} yatak · oda dolu</span>` : `<span class="chip ok">${need} kişi / ${cap} yatak</span>`;
      h.append(stc); d.appendChild(h);
      r.people.forEach((p, pi) => {
        const row = document.createElement("div"); row.className = "person";
        const del = document.createElement("button"); del.type = "button"; del.className = "btn danger small"; del.textContent = "Sil";
        del.onclick = () => { r.people.splice(pi, 1); if (r.payer >= r.people.length) r.payer = 0; changed(true); };
        row.append(input(p.n, "Ad Soyad", (v) => { p.n = v; changed(false); }, null, `Oda ${ri + 1} kişi ${pi + 1} ad soyad`), select(ageOpts, p.a, (v) => {
          const others = bedNeed(r.people.filter((_, k) => k !== pi));
          if (AGES[v].bed && others + 1 > roomCap(r)) { toast(FULL(r)); return redraw(); }
          p.a = v; changed(true); }), del);
        d.appendChild(row);
      });
      const act = document.createElement("div"); act.className = "row";
      const add = document.createElement("button"); add.type = "button"; add.className = "btn ghost small"; add.textContent = "+ Kişi";
      const full = bedNeed(r.people) >= roomCap(r);
      add.onclick = () => {
        if (full) { const babies = r.people.filter((p) => p.a === "C0").length; if (babies >= 2) return toast(FULL(r)); r.people.push({ n: "", a: "C0" }); toast("Oda dolu: yalnız 0–2 yaş bebek eklenebilir (yatak gerekmez)."); return changed(true); }
        if (r.people.length < 8) { r.people.push({ n: "", a: "Y" }); changed(true); } };
      if (full) add.textContent = "+ Bebek (0–2)";
      const rm = document.createElement("button"); rm.type = "button"; rm.className = "btn danger small"; rm.textContent = "Odayı sil";
      rm.onclick = () => { sub.rooms.splice(ri, 1); changed(true); };
      act.append(add, rm); d.appendChild(act); els.rooms.appendChild(d);
    });
    // günübirlik
    els.days.innerHTML = "";
    if (!sub.days.length) els.days.innerHTML = '<p class="note">Günübirlik katılımcı yok.</p>';
    sub.days.forEach((p, i) => {
      const row = document.createElement("div"); row.className = "person";
      const del = document.createElement("button"); del.type = "button"; del.className = "btn danger small"; del.textContent = "Sil";
      del.onclick = () => { sub.days.splice(i, 1); changed(true); };
      row.append(input(p.n, "Ad Soyad", (v) => { p.n = v; changed(false); }, null, `Günübirlik ${i + 1} ad soyad`), select(ageOpts, p.a, (v) => { p.a = v; changed(false); }), del);
      els.days.appendChild(row);
    });
    // fatura
    els.inv.innerHTML = "";
    if (st.paymode === "grup") {
      sub.groupInv = sub.groupInv || { inv: "", mail: "" };
      const g = document.createElement("div"); g.className = "grid";
      g.append(labeled("Fatura adı ve adresi (posta kodu 5 hane)", input(sub.groupInv.inv, "Ad / firma, cadde no, PLZ şehir", (v) => { sub.groupInv.inv = v; changed(false); })),
        labeled("Faturanın gideceği e-posta", input(sub.groupInv.mail, "ad@ornek.de", (v) => { sub.groupInv.mail = v; changed(false); }, "email")));
      els.inv.appendChild(g); return;
    }
    const payers = [...sub.rooms.map((r, i) => ({ o: r, label: `Oda ${i + 1} · ödeyen`, room: true })), ...sub.days.map((d) => ({ o: d, label: "Günübirlik" }))];
    if (!payers.length) els.inv.innerHTML = '<p class="note">Önce oda veya katılımcı ekleyin.</p>';
    payers.forEach(({ o, label, room }) => {
      const c = document.createElement("div"); c.className = "room"; c.style.borderLeftColor = "var(--line)";
      const g = document.createElement("div"); g.className = "grid";
      if (room) g.append(labeled(label, select(o.people.map((p, i) => [i, p.n || `Kişi ${i + 1}`]), o.payer || 0, (v) => { o.payer = Number(v); changed(false); })));
      else { const x = document.createElement("input"); x.value = o.n || "(ad yok)"; x.disabled = true; g.append(labeled(label, x)); }
      g.append(labeled("E-posta (fatura için)", input(o.mail, "ad@ornek.de", (v) => { o.mail = v; changed(false); }, "email")),
        labeled("Fatura istiyor mu?", select(yesNo, String(!!o.invoice), (v) => { o.invoice = v === "true"; changed(true); })));
      if (o.invoice) g.append(labeled("Fatura adı ve adresi", input(o.inv, "Ad / firma, cadde no, PLZ şehir", (v) => { o.inv = v; changed(false); })));
      c.appendChild(g); els.inv.appendChild(c);
    });
  }

  /* ---------- rapor ---------- */
  function renderReport(els, st, sub, submittedAt, onToggle, confirmedAt) {
    const n = nights(st), rows = collectRows(st, sub);
    const sleepers = sub.rooms.reduce((x, r) => x + r.people.length, 0);
    const total = rows.reduce((x, r) => x + r.amount, 0), paid = rows.filter((r) => r.o.paid).reduce((x, r) => x + r.amount, 0);
    const F = flags(st, sub, submittedAt, confirmedAt);
    els.tiles.innerHTML = [
      ["Konaklayan", sleepers, `${sub.rooms.length} oda · ${n} gece`],
      ["Günübirlik", sub.days.length, `${eur(st.pDay)} / kişi`],
      ["Beklenen tahsilat", eur(total), st.paymode === "kisi" ? "herkes kendisi öder" : "grup tek fatura"],
      ["Tahsil edilen", eur(paid), `kalan ${eur(total - paid)}`],
      ["Açık konu", F.length, F.some((f) => f[0] === "crit") ? "kritik var" : (F.length ? "uyarı" : "yok")],
    ].map(([a, b, c]) => `<div class="tile"><span class="small muted">${a}</span><b>${b}</b><span class="small muted">${c}</span></div>`).join("");
    els.flags.innerHTML = F.length ? F.map(([k, t]) => `<div class="flag ${k}"><span class="chip ${k}">${k === "crit" ? "Kritik" : "Uyarı"}</span><span>${esc(t)}</span></div>`).join("") : '<span class="chip ok">Açık konu yok</span>';
    els.pay.innerHTML = `<thead><tr><th>Ödeyen</th><th>Kapsam</th><th class="num">Tutar</th><th>Verilecek</th><th>Fatura</th><th>Ödendi</th><th>Verildi</th></tr></thead><tbody>${rows.map((r, i) => `<tr class="${r.o.paid ? "paid" : ""}"><td>${esc(r.who)}</td><td class="small">${esc(r.what)}</td><td class="num">${eur(r.amount)}</td><td class="small">${r.give}</td><td class="small">${r.inv ? (r.mail ? "Evet · e-posta" : "Evet · <span class='chip warn'>e-posta yok</span>") : "Hayır"}</td><td><input type="checkbox" data-i="${i}" data-k="paid" ${r.o.paid ? "checked" : ""} ${onToggle ? "" : "disabled"} aria-label="${esc(r.who)} ödendi"></td><td><input type="checkbox" data-i="${i}" data-k="given" ${r.o.given ? "checked" : ""} ${onToggle ? "" : "disabled"} aria-label="${esc(r.who)} verildi"></td></tr>`).join("")}<tr><td colspan="2"><b>Toplam</b></td><td class="num"><b>${eur(total)}</b></td><td colspan="4"></td></tr></tbody>`;
    if (onToggle) els.pay.querySelectorAll("input[type=checkbox]").forEach((cb) => (cb.onchange = () => { rows[cb.dataset.i].o[cb.dataset.k] = cb.checked; onToggle(); }));
    els.roomsTable.innerHTML = `<thead><tr><th>Oda</th><th>Tip</th><th>Misafirler</th><th class="num">Yatak</th><th>Ek / bebek yatağı</th></tr></thead><tbody>${sub.rooms.map((r, i) => { const cap = ROOMTYPES[r.type].beds + Number(r.extra || 0), need = r.people.filter((p) => AGES[p.a].bed).length; return `<tr><td>Oda ${i + 1}${r.no ? "<br><span class='small muted'>no " + esc(r.no) + "</span>" : ""}</td><td>${r.type}</td><td class="small">${r.people.map((p) => esc(p.n || "(ad yok)") + ` <span class="muted">(${AGES[p.a].label})</span>`).join("<br>")}</td><td class="num">${need} / ${cap}${need > cap ? ' <span class="chip crit">aşım</span>' : ""}</td><td class="small">${r.extra ? r.extra + " ek yatak" : ""}${r.extra && r.crib ? " · " : ""}${r.crib ? "bebek yatağı" : ""}</td></tr>`; }).join("") || '<tr><td colspan="5" class="muted">Oda yok.</td></tr>'}</tbody>`;
  }

  async function api(path, opts = {}) {
    const r = await fetch(path, { credentials: "same-origin", headers: { "Content-Type": "application/json" }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
    let data = {}; try { data = await r.json(); } catch (e) {}
    if (!r.ok) { const err = new Error(data.error || `Hata (${r.status})`); err.status = r.status; throw err; }
    return data;
  }

  /* ---------- mekanlar ---------- */
  const toMin = (t) => { const [h, m] = String(t || "0:0").split(":").map(Number); return h * 60 + (m || 0); };
  const MEALS = ["Kahvaltı", "Öğle yemeği", "Akşam yemeği"];
  function events(groups, from, to) {
    const out = [];
    groups.filter((g) => g.status !== "İptal").forEach((g) => (g.schedule || []).forEach((e) => {
      if ((from && e.date < from) || (to && e.date > to)) return;
      const s = toMin(e.start), en = e.end ? toMin(e.end) : s + 60;
      out.push({ ...e, s, e2: Math.max(en, s + 1), g });
    }));
    return out;
  }
  function venueIssues(groups, venues, from, to) {
    const ev = events(groups, from, to), issues = [], byKey = {};
    const vmap = Object.fromEntries(venues.map((v) => [v.name, v]));
    ev.forEach((e) => {
      if (!e.venue) { issues.push({ level: "warn", date: e.date, venue: "—", groups: [e.g], text: `${e.start} ${e.kind}: mekân seçilmemiş` }); return; }
      if (!vmap[e.venue]) issues.push({ level: "warn", date: e.date, venue: e.venue, groups: [e.g], text: `"${e.venue}" mekân listesinde yok` });
      (byKey[e.date + "|" + e.venue] = byKey[e.date + "|" + e.venue] || []).push(e);
    });
    for (const k in byKey) {
      const [d, vn] = k.split("|"), list = byKey[k], v = vmap[vn] || { kind: "salon", cap: 0 };
      if (v.kind === "salon") {
        for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j];
          if (a.g.id !== b.g.id && a.s < b.e2 && b.s < a.e2) issues.push({ level: "crit", date: d, venue: vn, groups: [a.g, b.g], text: `${vn} çakışması: ${a.g.name} (${a.start}–${a.end || "?"}) ve ${b.g.name} (${b.start}–${b.end || "?"})` });
        }
        if (v.cap) list.filter((e) => e.pax > v.cap).forEach((e) => issues.push({ level: "crit", date: d, venue: vn, groups: [e.g], text: `${vn}: ${e.pax} kişi, kapasite ${v.cap} (${e.g.name}, ${e.start})` }));
      } else if (v.cap) {
        const points = [...new Set(list.map((e) => e.s))];
        let worst = null;
        points.forEach((t) => { const here = list.filter((e) => e.s <= t && t < e.e2); const sum = here.reduce((x, e) => x + e.pax, 0); if (sum > v.cap && (!worst || sum > worst.sum)) worst = { t, sum, here }; });
        if (worst) issues.push({ level: "crit", date: d, venue: vn, groups: worst.here.map((e) => e.g), text: `${vn} kapasitesi aşılıyor: ${String(Math.floor(worst.t / 60)).padStart(2, "0")}:${String(worst.t % 60).padStart(2, "0")} itibarıyla ${worst.sum} kişi / ${v.cap} (${worst.here.map((e) => e.g.name).join(", ")})` });
      }
    }
    return issues;
  }
  function dayPlan(groups, venues, iso) {
    const ev = events(groups, iso, iso).sort((a, b) => a.s - b.s);
    const meals = Object.fromEntries([...MEALS, "İkram / ara"].map((m) => [m, ev.filter((e) => e.kind === m).reduce((x, e) => x + e.pax, 0)]));
    const names = [...new Set([...venues.map((v) => v.name), ...ev.map((e) => e.venue || "— mekân yok —")])];
    return { meals, rows: names.map((n) => ({ venue: venues.find((v) => v.name === n) || { name: n, kind: "salon", cap: 0, unknown: true }, ev: ev.filter((e) => (e.venue || "— mekân yok —") === n) })) };
  }

  return { venueIssues, dayPlan, MEALS, toMin, capacityErrors, confirmInfo, fmt, ROOMTYPES, AGES, $, esc, eur, dTR, dtTR, nights, deadlineDate, daysLeft, toast, collectRows, flags, renderEditor, renderReport, api };
})();
