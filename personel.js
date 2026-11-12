/* Personel, izin ve devamsızlık. index.html'deki ortak yardımcıları kullanır (api, t, esc, eur, toast, DEPTS…). */
let STAFF = [], LEAVE = [], TEAM = [], TEAM_LEAVE = [], CUR_ST = "people";
const CONTRACTS = ["vollzeit", "teilzeit", "minijob", "werkstudent", "aushilfe", "azubi"];
const LTYPES = ["urlaub", "krank", "kind", "sonder", "unbezahlt", "schule"];
const SICK = ["krank", "kind"];
const year = () => new Date().getFullYear();
const eur0p = (n) => new Intl.NumberFormat(I18N.locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n || 0);
const num1 = (n) => new Intl.NumberFormat(I18N.locale, { maximumFractionDigits: 1 }).format(n || 0);
const pct = (n) => new Intl.NumberFormat(I18N.locale, { style: "percent", maximumFractionDigits: 1 }).format(n || 0);

/* Pazartesi–Cuma iş günleri, [a, b] dahil */
function workdays(a, b) {
  if (!a || !b || b < a) return 0;
  let n = 0; const d = new Date(a + "T12:00:00"), e = new Date(b + "T12:00:00");
  for (; d <= e; d.setDate(d.getDate() + 1)) { const w = d.getDay(); if (w !== 0 && w !== 6) n++; }
  return n;
}
const clip = (x, a, b) => [x.from < a ? a : x.from, x.to > b ? b : x.to];
const counts = (x) => x.status !== "abgelehnt" && x.status !== "beantragt";

function personStats(p, upto = todayIso()) {
  const y0 = `${year()}-01-01`, y1 = `${year()}-12-31`;
  const mine = LEAVE.filter((x) => x.staffId === p.id && x.to >= y0 && x.from <= y1);
  const days = (f) => mine.filter(f).reduce((n, x) => n + workdays(...clip(x, y0, y1)), 0);
  const vacUsed = days((x) => x.type === "urlaub" && x.status === "genehmigt");
  const vacPending = days((x) => x.type === "urlaub" && x.status === "beantragt");
  const sickOf = (lo) => mine.filter((x) => SICK.includes(x.type) && counts(x) && x.from <= upto && x.to >= lo).reduce((n, x) => n + workdays(...clip(x, lo, upto)), 0);
  const sick = sickOf(y0);
  // yıl içinde çalışması planlanan iş günleri (giriş tarihinden bugüne)
  const from = p.start && p.start > y0 ? p.start : y0, to = p.end && p.end < upto ? p.end : upto;
  const planned = workdays(from, to);
  const away = (d) => LEAVE.some((x) => x.staffId === p.id && counts(x) && x.from <= d && x.to >= d);
  return { vacUsed, vacPending, vacLeft: (p.vacDays || 0) - vacUsed, sick, sickPct: planned ? sickOf(from) / planned : 0, planned, awayToday: away(todayIso()), week: (p.rate || 0) * (p.weekHours || 0), fte: (p.weekHours || 0) / 40 };
}
function aggregate(list) {
  const st = list.map((p) => ({ p, s: personStats(p) }));
  const planned = st.reduce((x, o) => x + o.s.planned, 0), sick = st.reduce((x, o) => x + o.s.sick, 0);
  const hours = list.reduce((x, p) => x + (p.weekHours || 0), 0), week = st.reduce((x, o) => x + o.s.week, 0);
  return { n: list.length, fte: hours / 40, week, avgRate: hours ? week / hours : 0, sick, sickPct: planned ? sick / planned : 0, vacLeft: st.reduce((x, o) => x + Math.max(0, o.s.vacLeft), 0), many: st.filter((o) => o.s.vacLeft >= 10).length, away: st.filter((o) => o.s.awayToday).length };
}

async function loadStaffAll() {
  const [s, l] = await Promise.all([api("/api/staff"), api("/api/leave")]);
  STAFF = s.staff || []; LEAVE = l.leave || [];
  drawLeaveBadge();
}
function drawLeaveBadge() {
  const n = LEAVE.filter((x) => x.status === "beantragt").length;
  $("navLeaveCount").innerHTML = n ? `<span class="chip warn">${n}</span>` : "";
}
async function openStaff(tabKey) {
  if (ROLE !== "mudur") return toast(t("e_manager"));
  if (tabKey && ["people", "leave", "kpi", "cal"].includes(tabKey)) CUR_ST = tabKey;
  showView("staff"); G = null; try { history.replaceState(null, "", "#staff/" + CUR_ST); } catch (e) {}
  try { await loadStaffAll(); drawStaff(); } catch (e) { authFail(e); }
}
$("navStaff").onclick = () => openStaff(CUR_ST);
$("sfTabs").onclick = (e) => { const b = e.target.closest("[data-st]"); if (b) { CUR_ST = b.dataset.st; try { history.replaceState(null, "", "#staff/" + CUR_ST); } catch (er) {} drawStaff(); } };
$("sfDeptFilter").onchange = () => drawStaff();
$("sfShowLeft").onchange = () => drawStaff();

function drawStaff() {
  I18N.apply($("v-staff"));
  document.querySelectorAll("#sfTabs [data-st]").forEach((b) => { const on = b.dataset.st === CUR_ST; b.setAttribute("aria-selected", on); $("sf-" + b.dataset.st).classList.toggle("hidden", !on); });
  const active = STAFF.filter((p) => p.active), A = aggregate(active), pend = LEAVE.filter((x) => x.status === "beantragt");
  const absentToday = active.filter((p) => personStats(p).awayToday);
  $("sfPendCount").innerHTML = pend.length ? `<span class="chip warn">${pend.length}</span>` : "";
  $("sfKpis").innerHTML = [
    [t("k_headcount"), A.n, t("k_headcount_sub", { f: num1(A.fte) }), ""],
    [t("k_cost_week"), eur0p(A.week), t("k_cost_week_sub", { m: eur0p(A.week * 4.33) }), ""],
    [t("k_sick_rate", { y: year() }), pct(A.sickPct), t("k_sick_rate_sub", { d: A.sick }), A.sickPct > 0.06 ? "warn" : "ok"],
    [t("k_vac_left"), Math.round(A.vacLeft), t("k_vac_left_sub", { n: A.many }), ""],
    [t("k_pending_leave"), pend.length, "", pend.length ? "warn" : "ok"],
    [t("k_absent_today"), absentToday.length, absentToday.map((p) => p.name).slice(0, 3).join(", "), ""],
  ].map(([a, b, c, k]) => `<div class="tile ${k ? "tile-" + k : ""}"><span class="tl">${esc(a)}</span><b>${esc(b)}</b><span class="ts">${esc(c)}</span></div>`).join("");
  const f = $("sfDeptFilter"), cur = f.value;
  f.innerHTML = `<option value="">${esc(t("sf_all"))}</option>` + DEPTS.map((d) => `<option value="${d}">${esc(deptLabel(d))}</option>`).join(""); f.value = cur;
  ({ people: drawPeople, leave: drawLeave, kpi: drawKpi, cal: drawCal })[CUR_ST]();
}

/* ---- kişiler ---- */
function drawPeople() {
  const dep = $("sfDeptFilter").value, left = $("sfShowLeft").checked;
  const list = STAFF.filter((p) => (left || p.active) && (!dep || p.dept === dep)).sort((a, b) => DEPTS.indexOf(a.dept) - DEPTS.indexOf(b.dept) || a.name.localeCompare(b.name));
  if (!list.length) { $("sfTable").innerHTML = `<tbody><tr><td class="muted">${t("sf_none")}</td></tr></tbody>`; return; }
  $("sfTable").innerHTML = `<thead><tr><th>${t("sf_name")}</th><th>${t("sf_dept")}</th><th>${t("sf_contract")}</th><th class="num">${t("sf_hours")}</th><th class="num">€/h</th><th class="num">${t("c_week_cost")}</th><th>${t("c_vac")}</th><th class="num">${t("c_sick")}</th><th></th></tr></thead><tbody>${list.map((p) => {
    const s = personStats(p), endSoon = p.end && p.end >= todayIso() && p.end <= plusIso(60);
    return `<tr class="${p.active ? "" : "muted"}"><td><b>${esc(p.name)}</b>${s.awayToday ? ` <span class="chip info">${t("away")}</span>` : ""}<div class="small muted">${esc(p.role || "")}${p.phone ? " · " + esc(p.phone) : ""}</div></td>
      <td class="small">${esc(deptLabel(p.dept))}</td>
      <td class="small">${esc(t("ct_" + p.contract))}${p.end ? `<div class="${endSoon ? "" : "muted"}">${endSoon ? '<span class="chip warn">' : ""}→ ${esc(HG.dTR(p.end))}${endSoon ? "</span>" : ""}</div>` : ""}</td>
      <td class="num">${num1(p.weekHours)}</td><td class="num">${num1(p.rate)}</td><td class="num">${eur0p(s.week)}</td>
      <td class="small">${s.vacUsed} / <b class="${s.vacLeft < 0 ? "crit" : ""}">${s.vacLeft}</b>${s.vacPending ? ` <span class="muted">(+${s.vacPending}?)</span>` : ""}</td>
      <td class="num">${s.sick}</td>
      <td><div class="row" style="flex-wrap:nowrap">${p.active ? `<button type="button" class="btn ghost small" data-link="${esc(p.id)}">${t("sf_link")}</button>` : ""}<button type="button" class="btn ghost small" data-edit="${esc(p.id)}">${t("sf_edit")}</button></div></td></tr>`;
  }).join("")}</tbody>`;
}
function staffForm(p) {
  const o = (arr, cur, lab) => arr.map((v) => `<option value="${v}"${v === cur ? " selected" : ""}>${esc(lab(v))}</option>`).join("");
  const f = (k, key, type = "text", extra = "") => `<label><span>${t(key)}</span><input id="sp_${k}" type="${type}" value="${esc(p[k] ?? "")}" ${extra}></label>`;
  $("sfForm").innerHTML = `${f("name", "sf_name", "text", 'required maxlength="80"')}
    <label><span>${t("sf_dept")}</span><select id="sp_dept">${o(DEPTS, p.dept, deptLabel)}</select></label>
    ${f("role", "sf_role")}
    <label><span>${t("sf_contract")}</span><select id="sp_contract">${o(CONTRACTS, p.contract, (v) => t("ct_" + v))}</select></label>
    ${f("start", "sf_start", "date")}${f("end", "sf_end", "date")}
    ${f("rate", "sf_rate", "number", 'min="0" step="0.01"')}${f("weekHours", "sf_hours", "number", 'min="0" step="0.5"')}${f("vacDays", "sf_vac", "number", 'min="0"')}
    ${f("phone", "sf_phone")}${f("mail", "sf_mail", "email")}
    <label><span>${t("sf_lang")}</span><select id="sp_lang">${o(["tr", "de", "en"], p.lang || "tr", (v) => t("wl_" + v))}</select></label>
    <label><span>${t("sf_active")}</span><select id="sp_active"><option value="1"${p.active !== false ? " selected" : ""}>${t("sf_active")}</option><option value="0"${p.active === false ? " selected" : ""}>${t("sf_left")}</option></select></label>
    <label style="grid-column:1/-1"><span>${t("sf_notes")}</span><textarea id="sp_notes" rows="2" maxlength="1000">${esc(p.notes || "")}</textarea></label>
    <div class="row"><button class="btn" type="submit">${t("sf_save")}</button></div>`;
  $("sfForm").dataset.id = p.id || ""; $("sfForm").dataset.etag = p.etag || "";
  $("sfForm").classList.remove("hidden"); $("sp_name").focus();
}
$("sfNew").onclick = () => { CUR_ST = "people"; drawStaff(); staffForm({ dept: $("sfDeptFilter").value || "resepsiyon", contract: "vollzeit", weekHours: 40, vacDays: 26, active: true, start: todayIso() }); };
$("sfTable").onclick = (e) => {
  const b = e.target.closest("[data-edit]"); if (b) { $("sfLink").classList.add("hidden"); staffForm(STAFF.find((p) => p.id === b.dataset.edit)); $("sfForm").scrollIntoView({ block: "nearest" }); }
  const l = e.target.closest("[data-link]"); if (l) showLink(l.dataset.link);
};
/* kişisel izin linki */
const personalUrl = (p) => `${location.origin}/i.html?t=${encodeURIComponent(p.token)}&lang=${I18N.lang}`;
async function newToken(p) { const r = await api(`/api/staff?id=${encodeURIComponent(p.id)}`, { method: "PUT", body: { regenerateLink: true } }); await loadStaffAll(); return STAFF.find((x) => x.id === p.id) || r.person; }
async function showLink(id, regen = false) {
  let p = STAFF.find((x) => x.id === id); if (!p) return;
  try { if (!p.token || regen) p = await newToken(p); } catch (e) { return authFail(e); }
  const url = personalUrl(p), digits = (p.phone || "").replace(/[^\d]/g, "").replace(/^00/, "");
  const wa = `https://wa.me/${digits}?text=${encodeURIComponent(t("sf_link_wa_text", { n: p.name.split(" ")[0], u: url }))}`;
  $("sfForm").classList.add("hidden");
  $("sfLink").innerHTML = `<div class="row between"><h3>${esc(t("sf_link_title"))} · ${esc(p.name)}</h3><button type="button" class="btn ghost small" id="slClose">×</button></div>
    <p class="note">${esc(t("sf_link_note"))}</p>
    <div class="linkbox"><input readonly value="${esc(url)}" id="slUrl" style="flex:1;min-width:220px"><button type="button" class="btn small" id="slCopy">${t("sf_link_copy")}</button><a class="btn ghost small" href="${esc(wa)}" target="_blank" rel="noopener">${t("sf_link_wa")}</a></div>
    <div><button type="button" class="btn ghost small" id="slNew">${t("sf_link_new")}</button></div>`;
  $("sfLink").classList.remove("hidden"); $("sfLink").scrollIntoView({ block: "nearest" });
  $("slClose").onclick = () => $("sfLink").classList.add("hidden");
  $("slCopy").onclick = async () => { try { await navigator.clipboard.writeText(url); } catch (e) { $("slUrl").select(); document.execCommand("copy"); } toast(t("sf_link_copied")); };
  $("slNew").onclick = (e) => { const b = e.currentTarget; if (b.dataset.armed !== "1") { b.dataset.armed = "1"; toast(t("demo_sure")); return; } showLink(id, true); };
}
$("sfForm").onsubmit = async (e) => {
  e.preventDefault();
  const g = (k) => $("sp_" + k).value;
  const body = { name: g("name"), dept: g("dept"), role: g("role"), contract: g("contract"), start: g("start"), end: g("end"), rate: Number(g("rate")), weekHours: Number(g("weekHours")), vacDays: Number(g("vacDays")), phone: g("phone"), mail: g("mail"), lang: g("lang"), notes: g("notes"), active: g("active") === "1" };
  const id = $("sfForm").dataset.id;
  try {
    if (id) await api(`/api/staff?id=${encodeURIComponent(id)}`, { method: "PUT", body: { ...body, etag: $("sfForm").dataset.etag } });
    else await api("/api/staff", { method: "POST", body });
    toast(t("sf_saved")); $("sfForm").classList.add("hidden"); await loadStaffAll(); drawStaff();
  } catch (err) { if (!authFail(err) && err.status === 409) { await loadStaffAll(); drawStaff(); } }
};

/* ---- izin ve devamsızlık ---- */
const pName = (id) => (STAFF.find((p) => p.id === id) || TEAM.find((p) => p.id === id) || { name: "?" }).name;
function leaveWarnings(x) {
  const w = [], p = STAFF.find((s) => s.id === x.staffId);
  if (SICK.includes(x.type) && !x.au && (new Date(x.to) - new Date(x.from)) / 864e5 + 1 > 3) w.push(["warn", t("lv_au_missing")]);
  if (p && x.type === "urlaub" && x.status === "beantragt") {
    const s = personStats(p), need = workdays(...clip(x, `${year()}-01-01`, `${year()}-12-31`));
    if (need > s.vacLeft) w.push(["crit", t("lv_over", { n: s.vacLeft })]);
    const others = LEAVE.filter((o) => o.id !== x.id && counts(o) && o.from <= x.to && o.to >= x.from && (STAFF.find((s) => s.id === o.staffId) || {}).dept === p.dept);
    const uniq = new Set(others.map((o) => o.staffId)); uniq.delete(x.staffId);
    if (uniq.size) w.push(["warn", t("lv_overlap_dept", { n: uniq.size })]);
  }
  return w;
}
function drawLeave() {
  const pend = LEAVE.filter((x) => x.status === "beantragt").sort((a, b) => a.from.localeCompare(b.from));
  $("lvPending").innerHTML = pend.length ? pend.map((x) => {
    const p = STAFF.find((s) => s.id === x.staffId) || {};
    return `<div class="flag warn"><span class="chip warn">${esc(t("lt_" + x.type))}</span><div style="display:grid;gap:4px;flex:1"><div><b>${esc(pName(x.staffId))}</b> · ${esc(deptLabel(p.dept))} · ${esc(HG.dTR(x.from))} – ${esc(HG.dTR(x.to))} · ${esc(t("lv_days", { n: workdays(x.from, x.to) }))}</div>${x.note ? `<div class="small">${esc(x.note)}</div>` : ""}${x.by ? `<div class="small muted">${x.self ? `<span class="chip info">${esc(t("lv_self"))}</span> ` : ""}${esc(x.by)} · ${esc(HG.dtTR(x.createdAt))}</div>` : ""}${leaveWarnings(x).map(([k, m]) => `<div class="small"><span class="chip ${k}">!</span> ${esc(m)}</div>`).join("")}
      <div class="row"><button type="button" class="btn small" data-lv="${esc(x.id)}" data-act="genehmigt">${t("lv_approve")}</button><button type="button" class="btn danger small" data-lv="${esc(x.id)}" data-act="abgelehnt">${t("lv_reject")}</button></div></div></div>`;
  }).join("") : `<span class="chip ok">${t("lv_none_pending")}</span>`;
  const y0 = `${year()}-01-01`, list = LEAVE.filter((x) => x.to >= y0 && x.status !== "beantragt").sort((a, b) => b.from.localeCompare(a.from));
  $("lvTable").innerHTML = `<thead><tr><th>${t("lv_person")}</th><th>${t("lv_type")}</th><th>${t("lv_from")}</th><th>${t("lv_to")}</th><th class="num">${t("lv_days", { n: "" }).trim()}</th><th>${t("f_status")}</th><th></th></tr></thead><tbody>${list.map((x) => {
    const w = leaveWarnings(x);
    return `<tr><td><b>${esc(pName(x.staffId))}</b>${x.note ? `<div class="small muted">${esc(x.note)}</div>` : ""}${w.map(([k, m]) => `<div class="small"><span class="chip ${k}">!</span> ${esc(m)}</div>`).join("")}</td><td class="small">${esc(t("lt_" + x.type))}${SICK.includes(x.type) ? `<label class="row small" style="gap:4px;margin-top:4px"><input type="checkbox" data-au="${esc(x.id)}" ${x.au ? "checked" : ""} style="width:auto">AU</label>` : ""}</td>
      <td class="small">${esc(HG.dTR(x.from))}</td><td class="small">${esc(HG.dTR(x.to))}</td><td class="num">${workdays(x.from, x.to)}</td>
      <td><span class="chip ${x.status === "abgelehnt" ? "crit" : x.status === "genehmigt" ? "ok" : "info"}">${esc(t("ls_" + x.status))}</span></td>
      <td><button type="button" class="btn ghost small" data-lvdel="${esc(x.id)}">${t("lv_delete")}</button></td></tr>`;
  }).join("")}</tbody>`;
}
async function leavePut(id, body) {
  try { await api(`/api/leave?id=${encodeURIComponent(id)}`, { method: "PUT", body: { ...body, who: myName() } }); await loadStaffAll(); drawStaff(); } catch (e) { authFail(e); }
}
$("v-staff").addEventListener("click", async (e) => {
  const a = e.target.closest("[data-lv]"); if (a) return leavePut(a.dataset.lv, { status: a.dataset.act });
  const d = e.target.closest("[data-lvdel]");
  if (d) { if (d.dataset.armed !== "1") { d.dataset.armed = "1"; toast(t("demo_sure")); return; } try { await api(`/api/leave?id=${encodeURIComponent(d.dataset.lvdel)}`, { method: "DELETE" }); await loadStaffAll(); drawStaff(); } catch (er) { authFail(er); } }
});
$("v-staff").addEventListener("change", (e) => { const c = e.target.closest("[data-au]"); if (c) leavePut(c.dataset.au, { au: c.checked }); });

function leaveFormHTML(people, mgr) {
  return `<label><span>${t("lv_person")}</span><select name="staffId" required>${people.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</select></label>
    <label><span>${t("lv_type")}</span><select name="type">${LTYPES.map((v) => `<option value="${v}">${esc(t("lt_" + v))}</option>`).join("")}</select></label>
    <label><span>${t("lv_from")}</span><input type="date" name="from" value="${todayIso()}" required></label>
    <label><span>${t("lv_to")}</span><input type="date" name="to" value="${todayIso()}" required></label>
    <label style="grid-column:1/-1"><span>${t("lv_note")}</span><input name="note" maxlength="500"></label>
    <label class="row small" style="gap:6px"><input type="checkbox" name="au" style="width:auto"><span>${t("lv_au")}</span></label>
    ${mgr ? `<label class="row small" style="gap:6px"><input type="checkbox" name="approve" checked style="width:auto"><span>${t("lv_approve_direct")}</span></label>` : ""}
    <div><button class="btn" type="submit">${t("d_create")}</button></div>`;
}
async function submitLeave(form, mgr) {
  const fd = new FormData(form), body = Object.fromEntries(fd.entries());
  body.au = fd.has("au"); body.approve = fd.has("approve"); body.who = myName();
  if (body.to < body.from) return toast(t("e_leave_dates"));
  await api("/api/leave", { method: "POST", body });
  form.classList.add("hidden");
}
$("lvNewBtn").onclick = () => { const f = $("lvForm"); f.innerHTML = leaveFormHTML(STAFF.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name)), true); f.classList.toggle("hidden"); };
$("lvForm").onsubmit = async (e) => { e.preventDefault(); try { await submitLeave(e.currentTarget, true); toast(t("lv_saved")); await loadStaffAll(); drawStaff(); } catch (er) { authFail(er); } };

/* ---- birim göstergeleri ---- */
function drawKpi() {
  const cols = t("kp_cols").split("|"), active = STAFF.filter((p) => p.active);
  const rows = DEPTS.map((d) => [d, aggregate(active.filter((p) => p.dept === d))]).filter(([, a]) => a.n);
  const tot = aggregate(active);
  const tr = (label, a, strong) => `<tr${strong ? ' style="font-weight:700"' : ""}><td>${esc(label)}</td><td class="num">${a.n}</td><td class="num">${num1(a.fte)}</td><td class="num">${num1(a.avgRate)}</td><td class="num">${eur0p(a.week)}</td><td class="num">${a.sick}</td><td class="num"><span class="chip ${a.sickPct > 0.06 ? "warn" : "ok"}">${pct(a.sickPct)}</span></td><td class="num">${Math.round(a.vacLeft)}</td><td class="num">${a.away}</td></tr>`;
  $("kpTable").innerHTML = `<thead><tr>${cols.map((c, i) => `<th${i ? ' class="num"' : ""}>${esc(c)}</th>`).join("")}</tr></thead><tbody>${rows.map(([d, a]) => tr(deptLabel(d), a)).join("")}${tr("Σ", tot, true)}</tbody>`;
}

/* ---- 14 günlük takvim ---- */
function drawCal() {
  const days = Array.from({ length: 14 }, (_, i) => plusIso(i)), short = t("cal_short").split("|");
  const dep = $("sfDeptFilter").value, people = STAFF.filter((p) => p.active && (!dep || p.dept === dep)).sort((a, b) => DEPTS.indexOf(a.dept) - DEPTS.indexOf(b.dept) || a.name.localeCompare(b.name));
  let lastDept = null;
  $("calTable").innerHTML = `<thead><tr><th>${t("sf_name")}</th>${days.map((d) => { const w = new Date(d + "T12:00").getDay(); return `<th class="num${w === 0 || w === 6 ? " we" : ""}">${esc(dayName(d)).replace(/\s/, "<br>")}</th>`; }).join("")}</tr></thead><tbody>${people.map((p) => {
    const head = p.dept !== lastDept ? `<tr class="calhead"><td colspan="${days.length + 1}">${esc(deptLabel(p.dept))}</td></tr>` : ""; lastDept = p.dept;
    return head + `<tr><td class="small"><b>${esc(p.name)}</b></td>${days.map((d) => {
      const x = LEAVE.find((l) => l.staffId === p.id && l.status !== "abgelehnt" && l.from <= d && l.to >= d), w = new Date(d + "T12:00").getDay();
      if (!x) return `<td class="${w === 0 || w === 6 ? "we" : ""}"></td>`;
      const k = SICK.includes(x.type) ? "crit" : x.type === "urlaub" ? "ok" : "info";
      return `<td class="cell-${k}${x.status === "beantragt" ? " req" : ""}" title="${esc(t("lt_" + x.type) + " · " + t("ls_" + x.status))}">${esc(short[LTYPES.indexOf(x.type)])}${x.status === "beantragt" ? "?" : ""}</td>`;
    }).join("")}</tr>`;
  }).join("") || `<tr><td class="muted">${t("sf_none")}</td></tr>`}</tbody>`;
}

/* ---- birim sayfasında ekip kartı (herkes) ---- */
async function loadTeam() {
  try { const [s, l] = await Promise.all([api("/api/staff"), api("/api/leave")]); TEAM = s.staff || []; TEAM_LEAVE = l.leave || []; if (ROLE === "mudur") { STAFF = s.staff; LEAVE = l.leave; drawLeaveBadge(); } }
  catch (e) { if (e.status === 401) throw e; }
}
/* Bölümler sayfasındaki ayrı "Ekip ve devamsızlık" sekmesi: tüm birimler */
const teamPeople = () => TEAM.filter((p) => p.active !== false).sort((a, b) => DEPTS.indexOf(a.dept) - DEPTS.indexOf(b.dept) || a.name.localeCompare(b.name));
function drawDeptTeam() {
  const people = teamPeople(), byId = Object.fromEntries(people.map((p) => [p.id, p]));
  const until = plusIso(14), list = TEAM_LEAVE.filter((x) => byId[x.staffId] && x.to >= todayIso() && x.from <= until && (x.status === undefined || counts(x)));
  $("dlNew").disabled = !people.length;
  if (!people.length) { $("dlList").innerHTML = `<span class="muted small">${t("dt_no_staff")}</span>`; return; }
  const html = DEPTS.map((d) => {
    const rows = list.filter((x) => byId[x.staffId].dept === d).sort((a, b) => a.from.localeCompare(b.from));
    if (!rows.length) return "";
    return `<div class="small" style="margin-top:6px"><b>${esc(deptLabel(d))}</b></div>` + rows.map((x) => `<div class="flag info"><span class="chip info">${t("away")}</span><span><b>${esc(byId[x.staffId].name)}</b> · ${esc(dayName(x.from))}${x.to !== x.from ? " – " + esc(dayName(x.to)) : ""}</span></div>`).join("");
  }).join("");
  $("dlList").innerHTML = html || `<span class="chip ok">${t("dt_none_absent")}</span>`;
}
$("dlNew").onclick = () => {
  const f = $("dlForm");
  f.innerHTML = leaveFormHTML(teamPeople(), false);
  const sel = f.querySelector('[name="staffId"]');
  sel.innerHTML = DEPTS.map((d) => { const ps = teamPeople().filter((p) => p.dept === d); return ps.length ? `<optgroup label="${esc(deptLabel(d))}">${ps.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</optgroup>` : ""; }).join("");
  f.classList.toggle("hidden");
};
$("dlForm").onsubmit = async (e) => { e.preventDefault(); if (needName()) return; try { await submitLeave(e.currentTarget, false); toast(t("dt_sent")); await loadTeam(); drawDeptTeam(); } catch (er) { authFail(er); } };
