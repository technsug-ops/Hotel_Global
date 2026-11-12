/* Hotel Global — ortak kurallar, form editörü, rapor, mekan analizi (dil: i18n.js) */
const HG = (() => {
  const ROOMTYPES = { "EZ": { beds: 1, stock: 6 }, "DZ": { beds: 2, stock: 2 }, "ZBZ": { beds: 2, stock: 57 }, "DBZ": { beds: 3, stock: 2 }, "VBZ": { beds: 4, stock: 6 }, "SUP FAM": { beds: 5, stock: 2 } };
  const AGES = { "Y": { f: 1, bed: true }, "C8": { f: 1, bed: true }, "C3": { f: 0.5, bed: true }, "C0": { f: 0, bed: false } };
  const EXTRA_BEDS = 32;
  const rtLabel = (k) => t("rt_" + k), ageLabel = (k) => t("age_" + k);
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const eur = (n) => new Intl.NumberFormat(I18N.locale, { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n || 0);
  const dTR = (s) => s ? new Date(s + "T12:00:00").toLocaleDateString(I18N.locale, { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
  const dtTR = (iso) => iso ? new Date(iso).toLocaleString(I18N.locale, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
  const fmt = (d) => d.toLocaleDateString(I18N.locale, { day: "2-digit", month: "2-digit", year: "numeric" });
  const dayName = (iso) => new Date(iso + "T12:00:00").toLocaleDateString(I18N.locale, { weekday: "short", day: "2-digit", month: "2-digit" });
  const nights = (st) => { if (!st.in || !st.out) return 0; return Math.max(0, Math.round((new Date(st.out + "T12:00:00") - new Date(st.in + "T12:00:00")) / 864e5)); };
  const addDays = (iso, n) => { const d = new Date((iso || "2100-01-01") + "T12:00:00"); d.setDate(d.getDate() - Number(n || 0)); return d; };
  const today = () => { const x = new Date(); x.setHours(12, 0, 0, 0); return x; };
  const deadlineDate = (st) => addDays(st.in, st.deadline || 0);
  const daysLeft = (st) => Math.round((deadlineDate(st) - today()) / 864e5);
  const statusLabel = (s) => t("st_" + s);
  const OLD_RESULTS = { "Kesinleşti": "confirmed", "Değişiklik var": "changed", "Ulaşılamadı": "unreachable", "Tekrar aranacak": "callback", "İptal": "cancelled" };
  const callLabel = (r) => t("cr_" + (OLD_RESULTS[r] || r));
  const kindLabel = (k) => (I18N.has("meal_" + k) ? t("meal_" + k) : k);
  function toast(msg) { const x = document.createElement("div"); x.className = "toast"; x.setAttribute("role", "status"); x.textContent = msg; document.body.appendChild(x); setTimeout(() => x.remove(), 3200); }

  /* geçmiş / uyarı satırı: kod + parametre → seçili dil */
  function logText(e) {
    if (!e.code) return e.text || "";
    const p = { ...(e.p || {}) };
    if (p.desc) p.desc = t("desc", p.desc);
    if (p.result) p.result = callLabel(p.result);
    if ("note" in p) p.note = p.note ? " — " + p.note : "";
    if (e.code === "h_status") { p.a = statusLabel(p.a); p.b = statusLabel(p.b); }
    if (e.code === "h_call") p.by = p.by || "—";
    return t(e.code, p);
  }

  /* teyit: kesinleşme son tarihi = geliş − confirmDays; arama günü = son tarih − callDays */
  function confirmInfo(st, confirmedAt) {
    const confirmBy = addDays(st.in, st.confirmDays ?? 7);
    const callOn = new Date(confirmBy); callOn.setDate(callOn.getDate() - Number(st.callDays ?? 3));
    const x = today(), arrived = x >= addDays(st.in, 0);
    let stage = "bekliyor";
    if (st.status === "İptal") stage = "iptal";
    else if (st.status === "Kesin" || confirmedAt) stage = "kesin";
    else if (arrived) stage = "geldi";
    else if (x > confirmBy) stage = "gecikti";
    else if (x >= callOn) stage = "ara";
    return { confirmBy, callOn, stage, daysToConfirm: Math.round((confirmBy - x) / 864e5) };
  }

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
      return [{ who: t("pay_group_row", { n: st.leader || t("f_leader") }), what: t("pay_group_scope"), amount: tot, o: sub.groupPay, inv: !!sub.groupInv?.inv, mail: sub.groupInv?.mail || "", give: t("give_invoice") }];
    }
    const rows = [];
    sub.rooms.forEach((r, i) => {
      const p = roomPrice(st, r), payer = r.people[r.payer] || r.people[0] || {};
      rows.push({ who: payer.n || t("room_n", { i: i + 1 }), what: t("pay_room_scope", { i: i + 1, no: r.no ? " (" + t("room_no", { n: r.no }) + ")" : "", t: r.type, n: r.people.length }) + (p.single ? t("pay_single", { a: eur(p.single) }) : ""), amount: p.total, o: r, inv: r.invoice, mail: r.mail, give: t("give_card") });
    });
    sub.days.forEach((d) => rows.push({ who: d.n || t("no_name"), what: t("pay_day_scope", { a: ageLabel(d.a) }), amount: personPrice(st, d.a, true), o: d, inv: d.invoice, mail: d.mail, give: t("give_stamp") }));
    return rows;
  }

  /* ---------- kontroller ---------- */
  const roomCap = (r, type = r.type, extra = r.extra) => ROOMTYPES[type].beds + Number(extra || 0);
  const bedNeed = (people) => people.filter((p) => AGES[p.a].bed).length;
  function capacityErrors(sub) {
    const out = [];
    sub.rooms.forEach((r, i) => { const n = bedNeed(r.people), c = roomCap(r); if (n > c) out.push(`${t("room_n", { i: i + 1 })} (${r.type}): ${n}/${c}`); });
    return out;
  }
  function flags(st, sub, submittedAt, confirmedAt) {
    const F = [];
    const ci = confirmInfo(st, confirmedAt);
    if (ci.stage === "ara") F.push(["warn", t("fl_call", { d: fmt(ci.confirmBy), n: ci.daysToConfirm })]);
    if (ci.stage === "gecikti") F.push(["crit", t("fl_late", { d: fmt(ci.confirmBy) })]);
    if (st.in && st.out && st.out < st.in) F.push(["crit", t("fl_dates")]);
    if (!submittedAt) { const l = daysLeft(st); F.push(l < 0 ? ["crit", t("fl_noform_late")] : ["warn", t("fl_noform", { n: l })]); }
    if (!sub.leader?.phone && !st.phone) F.push(["warn", t("fl_nophone")]);
    if (!sub.leader?.mail && !st.mail) F.push(["warn", t("fl_nomail")]);
    const cnt = {};
    sub.rooms.forEach((r, i) => {
      cnt[r.type] = (cnt[r.type] || 0) + 1;
      const cap = roomCap(r), need = bedNeed(r.people);
      if (need > cap) F.push(["crit", t("fl_room_over", { i: i + 1, t: r.type, n: need, c: cap })]);
      if (!r.people.length) F.push(["warn", t("fl_room_empty", { i: i + 1 })]);
      if (r.people.some((p) => !p.n)) F.push(["warn", t("fl_room_noname", { i: i + 1 })]);
      if (r.people.some((p) => p.a === "C0") && !r.crib) F.push(["warn", t("fl_baby", { i: i + 1 })]);
    });
    for (const k in cnt) if (cnt[k] > ROOMTYPES[k].stock) F.push(["crit", t("fl_stock", { t: k, n: cnt[k], s: ROOMTYPES[k].stock })]);
    const extras = sub.rooms.reduce((x, r) => x + Number(r.extra || 0), 0);
    if (extras > EXTRA_BEDS) F.push(["crit", t("fl_extra", { n: extras, s: EXTRA_BEDS })]);
    if (st.paymode === "kisi") {
      sub.rooms.forEach((r, i) => { if (r.invoice && !r.inv) F.push(["warn", t("fl_inv_noinfo", { i: i + 1 })]); if (r.invoice && !r.mail) F.push(["warn", t("fl_inv_nomail", { i: i + 1 })]); });
      sub.days.forEach((d) => { if (d.invoice && (!d.inv || !d.mail)) F.push(["warn", t("fl_day_inv", { n: d.n || t("no_name") })]); });
    } else {
      const g = sub.groupInv || {};
      if (!g.inv) F.push(["warn", t("fl_group_inv")]);
      else if (!/\b\d{5}\b/.test(g.inv)) F.push(["warn", t("fl_plz")]);
    }
    if (submittedAt) {
      const unpaid = collectRows(st, sub).filter((r) => !r.o.paid && r.amount > 0);
      if (unpaid.length) F.push(["warn", t("fl_unpaid", { n: unpaid.length, a: eur(unpaid.reduce((x, r) => x + r.amount, 0)) })]);
    }
    return F;
  }

  /* ---------- form editörü ---------- */
  function select(options, value, onChange, label) {
    const s = document.createElement("select"); if (label) s.setAttribute("aria-label", label);
    for (const [v, txt] of options) { const o = document.createElement("option"); o.value = v; o.textContent = txt; if (String(v) === String(value)) o.selected = true; s.appendChild(o); }
    s.onchange = () => onChange(s.value);
    return s;
  }
  function input(v, ph, onInput, type, label) {
    const i = document.createElement("input"); i.value = v ?? ""; if (ph) i.placeholder = ph; if (type) i.type = type; if (label) i.setAttribute("aria-label", label);
    i.oninput = () => onInput(i.value); return i;
  }
  function labeled(text, el) { const l = document.createElement("label"); l.append(text, el); return l; }
  const btn = (txt, cls, onClick) => { const b = document.createElement("button"); b.type = "button"; b.className = cls; b.textContent = txt; b.onclick = onClick; return b; };

  function renderEditor(els, st, sub, onChange, opts = {}) {
    const redraw = () => renderEditor(els, st, sub, onChange, opts);
    const changed = (full) => { onChange(); if (full) redraw(); };
    const ageOpts = Object.keys(AGES).map((k) => [k, ageLabel(k)]);
    const yesNo = [["false", t("no")], ["true", t("yes")]];
    // odalar
    els.rooms.innerHTML = "";
    if (!sub.rooms.length) els.rooms.innerHTML = `<p class="empty">${t("no_rooms_yet")}</p>`;
    sub.rooms.forEach((r, ri) => {
      const d = document.createElement("div"); d.className = "room";
      const cap = roomCap(r), need = bedNeed(r.people);
      if (need > cap) d.classList.add("bad"); else if (need === cap) d.classList.add("full");
      const h = document.createElement("div"); h.className = "roomhead";
      h.append(
        labeled(t("room_type", { i: ri + 1 }), select(Object.keys(ROOMTYPES).map((k) => [k, rtLabel(k)]), r.type, (v) => {
          if (bedNeed(r.people) > roomCap(r, v)) { toast(t("type_too_small", { t: rtLabel(v), n: bedNeed(r.people) })); return redraw(); }
          r.type = v; changed(true); })),
        labeled(t("extra_bed"), select([[0, "0"], [1, "1"], [2, "2"]], r.extra || 0, (v) => {
          if (bedNeed(r.people) > roomCap(r, r.type, v)) { toast(t("extra_too_few", { n: bedNeed(r.people) })); return redraw(); }
          r.extra = Number(v); changed(true); })),
        labeled(t("baby_cot"), select(yesNo, String(!!r.crib), (v) => { r.crib = v === "true"; changed(false); })),
      );
      if (opts.staff) h.append(labeled(t("room_no_hotel"), input(r.no, "214", (v) => { r.no = v; changed(false); })));
      const stc = document.createElement("div"); stc.className = "capchip";
      stc.innerHTML = need > cap ? `<span class="chip crit">${t("cap_over", { n: need, c: cap })}</span>` : need === cap ? `<span class="chip warn">${t("cap_full", { n: need, c: cap })}</span>` : `<span class="chip ok">${t("cap_ok", { n: need, c: cap })}</span>`;
      h.append(stc); d.appendChild(h);
      r.people.forEach((p, pi) => {
        const row = document.createElement("div"); row.className = "person";
        row.append(
          input(p.n, t("full_name"), (v) => { p.n = v; changed(false); }, null, `${t("room_n", { i: ri + 1 })} · ${t("person_n", { i: pi + 1 })}`),
          select(ageOpts, p.a, (v) => {
            const others = bedNeed(r.people.filter((_, k) => k !== pi));
            if (AGES[v].bed && others + 1 > roomCap(r)) { toast(t("room_full_msg", { c: roomCap(r) })); return redraw(); }
            p.a = v; changed(true); }, t("im_age_group")),
          btn(t("delete"), "btn danger small", () => { r.people.splice(pi, 1); if (r.payer >= r.people.length) r.payer = 0; changed(true); }));
        d.appendChild(row);
      });
      const full = bedNeed(r.people) >= roomCap(r);
      const act = document.createElement("div"); act.className = "row";
      act.append(
        btn(full ? t("add_baby") : t("add_guest"), "btn ghost small", () => {
          if (full) { if (r.people.filter((p) => p.a === "C0").length >= 2) return toast(t("room_full_msg", { c: roomCap(r) })); r.people.push({ n: "", a: "C0" }); toast(t("room_full_baby")); return changed(true); }
          if (r.people.length < 8) { r.people.push({ n: "", a: "Y" }); changed(true); } }),
        btn(t("remove_room"), "btn danger small", () => { sub.rooms.splice(ri, 1); changed(true); }));
      d.appendChild(act); els.rooms.appendChild(d);
    });
    // günübirlik
    els.days.innerHTML = "";
    if (!sub.days.length) els.days.innerHTML = `<p class="empty">${t("no_day_guests")}</p>`;
    sub.days.forEach((p, i) => {
      const row = document.createElement("div"); row.className = "person";
      row.append(input(p.n, t("full_name"), (v) => { p.n = v; changed(false); }, null, `${t("day_guest")} ${i + 1}`), select(ageOpts, p.a, (v) => { p.a = v; changed(false); }, t("im_age_group")),
        btn(t("delete"), "btn danger small", () => { sub.days.splice(i, 1); changed(true); }));
      els.days.appendChild(row);
    });
    // fatura
    els.inv.innerHTML = "";
    if (st.paymode === "grup") {
      sub.groupInv = sub.groupInv || { inv: "", mail: "" };
      const g = document.createElement("div"); g.className = "grid";
      g.append(labeled(t("inv_group_address"), input(sub.groupInv.inv, t("inv_address_ph"), (v) => { sub.groupInv.inv = v; changed(false); })),
        labeled(t("inv_group_mail"), input(sub.groupInv.mail, "name@example.de", (v) => { sub.groupInv.mail = v; changed(false); }, "email")));
      els.inv.appendChild(g); return;
    }
    const payers = [...sub.rooms.map((r, i) => ({ o: r, label: t("payer_of", { i: i + 1 }), room: true })), ...sub.days.map((d) => ({ o: d, label: t("day_guest") }))];
    if (!payers.length) els.inv.innerHTML = `<p class="empty">${t("add_first")}</p>`;
    payers.forEach(({ o, label, room }) => {
      const c = document.createElement("div"); c.className = "subcard";
      const g = document.createElement("div"); g.className = "grid";
      if (room) g.append(labeled(label, select(o.people.map((p, i) => [i, p.n || t("person_n", { i: i + 1 })]), o.payer || 0, (v) => { o.payer = Number(v); changed(false); })));
      else { const x = document.createElement("input"); x.value = o.n || t("no_name"); x.disabled = true; g.append(labeled(label, x)); }
      g.append(labeled(t("inv_email"), input(o.mail, "name@example.de", (v) => { o.mail = v; changed(false); }, "email")),
        labeled(t("inv_wanted"), select(yesNo, String(!!o.invoice), (v) => { o.invoice = v === "true"; changed(true); })));
      if (o.invoice) g.append(labeled(t("inv_address"), input(o.inv, t("inv_address_ph"), (v) => { o.inv = v; changed(false); })));
      c.appendChild(g); els.inv.appendChild(c);
    });
  }

  /* ---------- rapor ---------- */
  function renderReport(els, st, sub, submittedAt, onToggle, confirmedAt) {
    const n = nights(st), rows = collectRows(st, sub);
    const sleepers = sub.rooms.reduce((x, r) => x + r.people.length, 0);
    const total = rows.reduce((x, r) => x + r.amount, 0), paid = rows.filter((r) => r.o.paid).reduce((x, r) => x + r.amount, 0);
    const F = flags(st, sub, submittedAt, confirmedAt);
    const crit = F.some((f) => f[0] === "crit");
    els.tiles.innerHTML = [
      [t("tile_sleep"), sleepers, t("tile_sleep_sub", { r: sub.rooms.length, n }), ""],
      [t("tile_day"), sub.days.length, t("tile_day_sub", { a: eur(st.pDay) }), ""],
      [t("tile_due"), eur(total), st.paymode === "kisi" ? t("pay_kisi") : t("pay_grup"), ""],
      [t("tile_paid"), eur(paid), t("tile_paid_sub", { a: eur(total - paid) }), total - paid > 0.009 ? "warn" : ""],
      [t("tile_issues"), F.length, crit ? t("tile_issues_crit") : (F.length ? t("tile_issues_warn") : t("tile_issues_none")), crit ? "crit" : ""],
    ].map(([a, b, c, k]) => `<div class="tile ${k ? "tile-" + k : ""}"><span class="tl">${a}</span><b>${b}</b><span class="ts">${c}</span></div>`).join("");
    els.flags.innerHTML = F.length ? F.map(([k, x]) => `<div class="flag ${k}"><span class="chip ${k}">${k === "crit" ? t("crit") : t("warn")}</span><span>${esc(x)}</span></div>`).join("") : `<span class="chip ok">${t("no_issues")}</span>`;
    els.pay.innerHTML = `<thead><tr><th>${t("p_payer")}</th><th>${t("p_scope")}</th><th class="num">${t("p_amount")}</th><th>${t("p_give")}</th><th>${t("p_invoice")}</th><th>${t("p_paid")}</th><th>${t("p_given")}</th></tr></thead><tbody>${rows.map((r, i) => `<tr class="${r.o.paid ? "paid" : ""}"><td>${esc(r.who)}</td><td class="small">${esc(r.what)}</td><td class="num">${eur(r.amount)}</td><td class="small">${esc(r.give)}</td><td class="small">${r.inv ? (r.mail ? t("inv_mail") : `<span class='chip warn'>${t("inv_nomail")}</span>`) : t("no")}</td><td><input type="checkbox" class="big-check" data-i="${i}" data-k="paid" ${r.o.paid ? "checked" : ""} ${onToggle ? "" : "disabled"} aria-label="${esc(r.who)} · ${t("p_paid")}"></td><td><input type="checkbox" class="big-check" data-i="${i}" data-k="given" ${r.o.given ? "checked" : ""} ${onToggle ? "" : "disabled"} aria-label="${esc(r.who)} · ${t("p_given")}"></td></tr>`).join("")}<tr class="sum"><td colspan="2">${t("total")}</td><td class="num">${eur(total)}</td><td colspan="4"></td></tr></tbody>`;
    if (onToggle) els.pay.querySelectorAll("input[type=checkbox]").forEach((cb) => (cb.onchange = () => { rows[cb.dataset.i].o[cb.dataset.k] = cb.checked; onToggle(); }));
    els.roomsTable.innerHTML = `<thead><tr><th>${t("c_room")}</th><th>${t("c_type")}</th><th>${t("c_guests")}</th><th class="num">${t("c_beds")}</th><th>${t("c_extra")}</th></tr></thead><tbody>${sub.rooms.map((r, i) => { const cap = roomCap(r), need = bedNeed(r.people); return `<tr><td>${t("room_n", { i: i + 1 })}${r.no ? `<br><span class='small muted'>${esc(t("room_no", { n: r.no }))}</span>` : ""}</td><td>${r.type}</td><td class="small">${r.people.map((p) => esc(p.n || t("no_name")) + ` <span class="muted">(${ageLabel(p.a)})</span>`).join("<br>")}</td><td class="num">${need} / ${cap}${need > cap ? ` <span class="chip crit">${t("over")}</span>` : ""}</td><td class="small">${[r.extra ? t("extra_n", { n: r.extra }) : "", r.crib ? t("crib") : ""].filter(Boolean).join(" · ")}</td></tr>`; }).join("") || `<tr><td colspan="5" class="muted">${t("no_rooms")}</td></tr>`}</tbody>`;
  }

  /* ---------- mekanlar ---------- */
  const toMin = (x) => { const [h, m] = String(x || "0:0").split(":").map(Number); return h * 60 + (m || 0); };
  const MEALS = ["Kahvaltı", "Öğle yemeği", "Akşam yemeği"];
  const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
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
      if (!e.venue) { issues.push({ level: "warn", date: e.date, venue: "—", groups: [e.g], text: t("vi_novenue", { t: e.start, k: kindLabel(e.kind) }) }); return; }
      if (!vmap[e.venue]) issues.push({ level: "warn", date: e.date, venue: e.venue, groups: [e.g], text: t("vi_unknown", { v: e.venue }) });
      (byKey[e.date + "|" + e.venue] = byKey[e.date + "|" + e.venue] || []).push(e);
    });
    for (const k in byKey) {
      const [d, vn] = k.split("|"), list = byKey[k], v = vmap[vn] || { kind: "salon", cap: 0 };
      if (v.kind === "salon") {
        for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j];
          if (a.g.id !== b.g.id && a.s < b.e2 && b.s < a.e2) issues.push({ level: "crit", date: d, venue: vn, groups: [a.g, b.g], text: t("vi_overlap", { v: vn, a: a.g.name, ta: `${a.start}–${a.end || "?"}`, b: b.g.name, tb: `${b.start}–${b.end || "?"}` }) });
        }
        if (v.cap) list.filter((e) => e.pax > v.cap).forEach((e) => issues.push({ level: "crit", date: d, venue: vn, groups: [e.g], text: t("vi_salon_cap", { v: vn, n: e.pax, c: v.cap, g: e.g.name, t: e.start }) }));
      } else if (v.cap) {
        let worst = null;
        [...new Set(list.map((e) => e.s))].forEach((x) => { const here = list.filter((e) => e.s <= x && x < e.e2); const sum = here.reduce((a, e) => a + e.pax, 0); if (sum > v.cap && (!worst || sum > worst.sum)) worst = { x, sum, here }; });
        if (worst) issues.push({ level: "crit", date: d, venue: vn, groups: worst.here.map((e) => e.g), text: t("vi_rest_cap", { v: vn, t: hm(worst.x), n: worst.sum, c: v.cap, g: worst.here.map((e) => e.g.name).join(", ") }) });
      }
    }
    return issues;
  }
  function dayPlan(groups, venues, iso) {
    const ev = events(groups, iso, iso).sort((a, b) => a.s - b.s);
    const meals = Object.fromEntries([...MEALS, "İkram / ara", "Gün boyu ikram"].map((m) => [m, ev.filter((e) => e.kind === m).reduce((x, e) => x + e.pax, 0)]));
    const NOV = "\u0000";
    const names = [...new Set([...venues.map((v) => v.name), ...ev.map((e) => e.venue || NOV)])];
    return { meals, rows: names.map((n) => ({ venue: venues.find((v) => v.name === n) || { name: n === NOV ? t("v_no_venue") : n, kind: "salon", cap: 0, unknown: true, none: n === NOV }, key: n === NOV ? "—" : n, ev: ev.filter((e) => (e.venue || NOV) === n) })) };
  }

  async function api(path, opts = {}) {
    const r = await fetch(path, { credentials: "same-origin", headers: { "Content-Type": "application/json" }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
    let data = {}; try { data = await r.json(); } catch (e) {}
    if (!r.ok) {
      const msg = data.code && I18N.has(data.code) ? t(data.code) + (data.detail ? " (" + data.detail.join("; ") + ")" : "") : (data.error || t("e_generic", { s: r.status }));
      const err = new Error(msg); err.status = r.status; err.code = data.code; throw err;
    }
    return data;
  }

  return { ROOMTYPES, AGES, rtLabel, ageLabel, statusLabel, callLabel, kindLabel, logText, $, esc, eur, dTR, dtTR, fmt, dayName, nights, deadlineDate, daysLeft, toast, confirmInfo, collectRows, flags, capacityErrors, renderEditor, renderReport, venueIssues, dayPlan, MEALS, toMin, api };
})();
