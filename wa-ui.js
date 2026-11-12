/* WhatsApp sayfası ve grup sayfasındaki WhatsApp kartı. index.html'deki ortak yardımcıları kullanır. */
let WA = null;
const WS_CHIP = { simulated: "info", sent: "info", delivered: "ok", read: "ok", failed: "crit" };
const waAgeH = (iso) => (Date.now() - new Date(iso)) / 36e5;

async function openWa() {
  showView("wa"); G = null; try { history.replaceState(null, "", "#wa"); } catch (e) {}
  drawWa();
  try {
    const [w, gl] = await Promise.all([api("/api/wa"), GROUPS.length ? null : api("/api/groups")]);
    WA = w; if (gl) GROUPS = gl.groups; drawWa(); drawWaBadge();
  } catch (e) { authFail(e); }
}
$("navWa").onclick = openWa;
function drawWaBadge() {
  const n = WA ? WA.in.filter((x) => waAgeH(x.at) < 24).length : 0;
  $("navWaCount").innerHTML = n ? `<span class="chip info">${n}</span>` : "";
}

function msgOut(x, showGroup = true) {
  const label = x.template ? t("wt_" + x.template) : t("wt_text");
  return `<div class="flag ${WS_CHIP[x.status] === "crit" ? "crit" : "info"}"><span class="chip ${WS_CHIP[x.status] || "info"}">${esc(t("ws_" + x.status))}</span>
    <span style="flex:1;min-width:0"><b>${esc(label)}</b> → +${esc(x.to || "?")}${showGroup && x.groupId ? ` · <a href="#${esc(x.groupId)}/rapor" data-open="${esc(x.groupId)}">${esc((GROUPS.find((g) => g.id === x.groupId) || {}).name || "→")}</a>` : ""}
    <span class="small muted"> · ${esc(dtTR(x.at))}${x.by ? " · " + esc(x.by) : ""}</span>
    <br><span class="small">${esc(x.text || "")}</span>${x.error ? `<br><span class="small" style="color:var(--crit)">${esc(x.error === "e_wa_phone" ? t("e_wa_phone") : x.error)}</span>` : ""}</span></div>`;
}
function msgIn(x, showGroup = true) {
  const open = waAgeH(x.at) < 24;
  const who = x.groupId ? (showGroup ? `<a href="#${esc(x.groupId)}/rapor" data-open="${esc(x.groupId)}">${esc(x.groupName || "→")}</a>` : "") : x.staffName ? esc(x.staffName) : `<span class="muted">${t("wa_unknown")}</span>`;
  return `<div class="flag ${x.payload ? "warn" : "info"}" data-wain="${esc(x.id)}"><span class="chip ${x.payload ? "warn" : "info"}">+${esc(x.from)}</span>
    <div style="flex:1;min-width:0;display:grid;gap:6px"><div>${[who, x.name ? esc(x.name) : ""].filter(Boolean).join(" · ")} <span class="small muted">· ${esc(dtTR(x.at))}</span></div>
    <div><b>${esc(x.text || "")}</b></div>
    ${open ? `<div class="row noprint"><input data-wareply="${esc(x.from)}" data-wagid="${esc(x.groupId || "")}" placeholder="${esc(t("wa_reply_ph"))}" maxlength="1000" style="flex:1;min-width:160px"><button type="button" class="btn ghost small" data-wasendreply="1">${t("wa_reply")}</button></div>` : `<span class="small muted">${t("wa_reply_closed")}</span>`}</div></div>`;
}

function drawWa() {
  I18N.apply($("v-wa"));
  if (!WA) return;
  $("waConn").innerHTML = `<span class="chip ${WA.configured ? "ok" : "warn"}">${WA.configured ? "✓" : "!"}</span> ${esc(t(WA.configured ? "wa_conn_on" : "wa_conn_off"))}`;
  $("waChecks").innerHTML = [["wa_chk_conn", WA.configured], ["wa_chk_hook", WA.webhook], ["wa_chk_mgr", WA.manager], ["wa_chk_cron", WA.cron]]
    .map(([k, ok]) => `<span class="chip ${ok ? "ok" : "warn"}">${esc(t(k))}: ${esc(t(ok ? "wa_ok" : "wa_missing"))}</span>`).join(" ");
  $("waCallback").value = WA.callback;
  $("waIn").innerHTML = WA.in.length ? WA.in.slice(0, 40).map((x) => msgIn(x)).join("") : `<span class="muted small">${t("wa_none")}</span>`;
  $("waOut").innerHTML = WA.out.length ? WA.out.slice(0, 40).map((x) => msgOut(x)).join("") : `<span class="muted small">${t("wa_none")}</span>`;
  const mgr = ROLE === "mudur";
  $("waCfg").innerHTML = ["autoReminder", "autoConfirm", "dailySummary", "managerAlerts"].map((k) => `<label class="chkrow"><input type="checkbox" data-wacfg="${k}" ${WA.cfg[k] ? "checked" : ""} ${mgr ? "" : "disabled"}><span>${esc(t("wa_cfg_" + k))}</span></label>`).join("");
  $("waCfgSave").classList.toggle("hidden", !mgr); $("waRun").classList.toggle("hidden", !mgr);
  $("waTest").closest(".card").classList.toggle("hidden", !mgr);
  const gs = GROUPS.filter((g) => g.status !== "İptal");
  const cur = $("wtGroup").value;
  $("wtGroup").innerHTML = `<option value="">—</option>` + gs.map((g) => `<option value="${esc(g.id)}" data-phone="${esc(g.phone || "")}">${esc(g.name)}</option>`).join(""); $("wtGroup").value = cur;
  const ca = $("wtAction").value || "confirm";
  $("wtAction").innerHTML = ["confirm", "change", "cancel", "text"].map((a) => `<option value="${a}">${esc(t("wa_act_" + a))}</option>`).join(""); $("wtAction").value = ca;
  const L = I18N.lang;
  $("waTpl").innerHTML = Object.entries(WA.templates).map(([name, tp]) => `<details class="subcard"><summary><b>${esc(t("wt_" + name))}</b> · <code>${esc(name)}</code> · Utility</summary>
    <div style="display:grid;gap:8px;margin-top:8px"><div class="small">${esc(t("wa_params"))}: ${tp.params.map((p, i) => `{{${i + 1}}} ${esc(p)}`).join(" · ")}</div>
    ${["tr", "de", "en"].map((l) => `<div><span class="chip ${l === L ? "ok" : "info"}">${l}</span> <span class="small" style="user-select:all">${esc(tp[l])}</span>${tp.buttonText ? `<div class="small muted">${esc(t("wa_buttons"))}: ${tp.buttonText[l].map(esc).join(" · ")}</div>` : ""}</div>`).join("")}</div></details>`).join("");
}
$("wtGroup").onchange = () => { const o = $("wtGroup").selectedOptions[0]; if (o && o.dataset.phone) $("wtFrom").value = o.dataset.phone; };
$("waCfgSave").onclick = async () => {
  const cfg = Object.fromEntries([...document.querySelectorAll("[data-wacfg]")].map((c) => [c.dataset.wacfg, c.checked]));
  try { const r = await api("/api/wa", { method: "POST", body: { op: "config", cfg } }); WA.cfg = r.cfg; toast(t("wa_cfg_saved")); } catch (e) { authFail(e); }
};
$("waRun").onclick = async (e) => {
  const b = e.currentTarget; b.disabled = true;
  try { const r = await api("/api/wa?op=cron"); toast(t("wa_ran", { r: r.reminders, c: r.confirms, s: r.summary ? t("wa_ran_s") : "" })); await openWa(); } catch (er) { authFail(er); } finally { b.disabled = false; }
};
$("waTest").onsubmit = async (e) => {
  e.preventDefault();
  const action = $("wtAction").value, groupId = $("wtGroup").value;
  try { await api("/api/wa", { method: "POST", body: { op: "simulateIn", from: $("wtFrom").value, groupId, action, text: $("wtText").value || t("wa_act_" + action).replace(/^.*?: /, "") } }); toast(t("wa_test_done")); $("wtText").value = ""; await openWa(); await loadTasks(); }
  catch (er) { authFail(er); }
};

/* serbest cevap (gelen mesajlar listesi ve grup kartı) */
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-wasendreply]"); if (!b) return;
  const inp = b.parentElement.querySelector("[data-wareply]"); if (!inp.value.trim()) return;
  b.disabled = true;
  try {
    const r = await api("/api/wa", { method: "POST", body: { op: "reply", to: inp.dataset.wareply, text: inp.value.trim(), groupId: inp.dataset.wagid, who: myName() } });
    toast(t("wa_sent_ok", { t: t("wt_text"), s: t("ws_" + r.msg.status) })); inp.value = "";
    if (!$("v-wa").classList.contains("hidden")) openWa(); else loadGroupWa();
  } catch (er) { authFail(er); } finally { b.disabled = false; }
});
document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches("[data-wareply]")) { e.preventDefault(); e.target.parentElement.querySelector("[data-wasendreply]").click(); } });

/* grup sayfası kartı */
async function loadGroupWa() {
  if (!G) return;
  const id = G.id;
  try {
    const r = await api(`/api/wa?groupId=${encodeURIComponent(id)}`);
    if (!G || G.id !== id) return;
    const items = [...r.out.map((x) => ({ ...x, dir: "out" })), ...r.in.map((x) => ({ ...x, dir: "in" }))].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 15);
    $("gWaList").innerHTML = (r.configured ? "" : `<div class="flag warn"><span class="chip warn">!</span><span class="small">${esc(t("wa_conn_off"))}</span></div>`) + (items.length ? items.map((x) => (x.dir === "out" ? msgOut(x, false) : msgIn(x, false))).join("") : `<span class="muted small">${t("wa_none")}</span>`);
  } catch (e) { $("gWaList").innerHTML = ""; }
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-wasend]"); if (!b || !G) return;
  if (b.dataset.armed !== "1") { b.dataset.armed = "1"; toast(t("demo_sure")); setTimeout(() => (b.dataset.armed = ""), 4000); return; }
  b.dataset.armed = ""; b.disabled = true;
  try {
    const r = await api("/api/wa", { method: "POST", body: { op: "send", groupId: G.id, template: b.dataset.wasend, who: myName() } });
    toast(t("wa_sent_ok", { t: t("wt_" + b.dataset.wasend), s: t("ws_" + r.msg.status) }));
    const g = await api(`/api/group?id=${encodeURIComponent(G.id)}`); G = g.group; ETAG = g.etag; drawDetail(true); loadGroupWa();
  } catch (er) { authFail(er); } finally { b.disabled = false; }
});
