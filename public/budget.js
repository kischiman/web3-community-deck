// Public budget dashboard. Collaborators propose themselves for lines; who actually
// goes on the project is decided in the admin panel. The base rate card is not in this
// payload at all unless the admin has switched pre-filling on.

const $ = (id) => document.getElementById(id);

const phasesEl = $("phases");
const summaryEl = $("summary");
const liveEl = $("live");
const scrim = $("scrim");

let state = { phases: [], units: [], tasks: [], prefillRates: false };

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const money = (n) =>
  (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

// ---------------------------------------------------------------- transport

async function load() {
  state = await (await fetch("/api/budget")).json();
  render();
}

async function send(action, body) {
  const res = await fetch(`/api/budget/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({}));
    flash(error || "That did not save");
    return false;
  }
  await load();
  return true;
}

function flash(msg) {
  liveEl.textContent = msg;
  liveEl.removeAttribute("data-on");
  setTimeout(connectLabel, 2500);
}

// ---------------------------------------------------------------- rendering

function proposalHtml(t, p) {
  const isAssigned = t.assigned === p.id;
  return `<div class="proposal${isAssigned ? " on" : ""}">
    <span class="who">${isAssigned ? "◆ " : ""}${esc(p.name)}</span>
    <span class="terms">${p.unit === "fixed" ? "fixed" : `${p.qty} ${esc(p.unit)} × ${money(p.rate)}`}</span>
    <span class="amt">${money(p.amount)}</span>
    ${isAssigned ? '<span class="on-tag">on the project</span>' : ""}
    ${p.notes ? `<p class="pnote">${esc(p.notes)}</p>` : ""}
  </div>`;
}

function lineHtml(t) {
  const assigned = t.proposals.find((p) => p.id === t.assigned);
  return `<div class="line" data-id="${esc(t.id)}" data-claimed="${!!assigned}">
    <div class="detail">
      <div class="name">${esc(t.name)}${t.kind === "expense" ? '<span class="tag">expense</span>' : ""}${
        t.added ? '<span class="tag">added</span>' : ""
      }</div>
      ${t.note ? `<div class="note">${esc(t.note)}</div>` : ""}
      ${t.proposals.length ? `<div class="proposals">${t.proposals.map((p) => proposalHtml(t, p)).join("")}</div>` : ""}
    </div>
    <div class="num scope">${
      t.unit === "fixed" ? "fixed" : `${t.suggestedQty} ${esc(t.unit || "days")}`
    }<span class="scope-label">suggested</span></div>
    <div class="line-actions">
      <button class="btn ghost small" data-claim="${esc(t.id)}">${
        t.proposals.length ? "Propose / edit" : "Propose yourself"
      }</button>
    </div>
  </div>`;
}

function render() {
  phasesEl.innerHTML = state.phases
    .map((p) => {
      const tasks = state.tasks.filter((t) => t.phase === p.id);
      const proposed = tasks.reduce(
        (a, t) => a + t.proposals.reduce((b, x) => b + (t.assigned === x.id ? x.amount : 0), 0),
        0
      );
      const open = tasks.filter((t) => !t.assigned).length;
      return `<section class="phase">
        <header>
          <div>
            <h2>${esc(p.title)}</h2>
            <p class="note">${esc(p.note)}</p>
          </div>
          <span class="amount">${open} open${proposed ? ` · ${money(proposed)} committed` : ""}</span>
        </header>
        ${tasks.map(lineHtml).join("")}
        <div class="phase-foot">
          <button class="btn ghost small" data-add="${esc(p.id)}">+ Add task</button>
        </div>
      </section>`;
    })
    .join("");

  const all = state.tasks;
  const committed = all.reduce((a, t) => {
    const p = t.proposals.find((x) => x.id === t.assigned);
    return a + (p ? p.amount : 0);
  }, 0);
  const proposals = all.reduce((a, t) => a + t.proposals.length, 0);
  const staffed = all.filter((t) => t.assigned).length;

  const pct = Number(state.contingency) || 0;
  const contingency = committed * (pct / 100);

  summaryEl.innerHTML = `
    <div class="row"><span>Lines</span><span class="v">${all.length}</span></div>
    <div class="row"><span>Proposals submitted</span><span class="v">${proposals}</span></div>
    <div class="row"><span>Lines with someone on them</span><span class="v">${staffed}</span></div>
    <div class="row"><span>Committed so far</span><span class="v">${money(committed)}</span></div>
    <div class="row sub"><span>Contingency at ${pct}%</span><span class="v">${money(contingency)}</span></div>
    <div class="row total"><span>Committed incl. contingency</span><span class="v">${money(committed + contingency)}</span></div>
    <div class="row sub"><span>Unstaffed lines are not costed here — that lives in the admin panel.</span><span class="v"></span></div>`;
}

// ---------------------------------------------------------------- propose modal

const claimModal = $("claim-modal");
let claimingId = null;
let myProposalId = null;

function unitOptions(sel, selected) {
  sel.innerHTML = state.units
    .map((u) => `<option value="${u}"${u === selected ? " selected" : ""}>${u}</option>`)
    .join("");
}

function openClaim(id) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return;
  claimingId = id;

  const remembered = localStorage.getItem("budget-name") || "";
  const mine = t.proposals.find((p) => p.name.toLowerCase() === remembered.toLowerCase());
  myProposalId = mine?.id || null;

  $("claim-task").innerHTML = `<b>${esc(t.name)}</b>${t.note ? " — " + esc(t.note) : ""}`;
  $("c-name").value = mine?.name || remembered;
  $("c-qty").value = mine?.qty ?? t.suggestedQty ?? "";
  unitOptions($("c-unit"), mine?.unit || t.unit || "days");
  // a rate only appears here if the admin chose to pre-fill it
  $("c-rate").value = mine?.rate ?? t.suggestedRate ?? "";
  $("c-notes").value = mine?.notes || "";
  $("claim-submit").textContent = mine ? "Update proposal" : "Submit proposal";
  $("claim-release").hidden = !mine;

  calcClaim();
  show(claimModal);
  $("c-name").focus();
}

function calcClaim() {
  const qty = Number($("c-qty").value) || 0;
  const rate = Number($("c-rate").value) || 0;
  $("c-total").textContent = money($("c-unit").value === "fixed" ? rate : qty * rate);
}

["c-qty", "c-rate"].forEach((id) => $(id).addEventListener("input", calcClaim));
$("c-unit").addEventListener("change", calcClaim);

$("claim-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  localStorage.setItem("budget-name", $("c-name").value.trim());
  const ok = await send("propose", {
    id: claimingId,
    name: $("c-name").value,
    qty: $("c-qty").value,
    unit: $("c-unit").value,
    rate: $("c-rate").value,
    notes: $("c-notes").value,
  });
  if (ok) hide(claimModal);
});

$("claim-release").addEventListener("click", async () => {
  if (myProposalId && (await send("withdraw", { id: claimingId, proposalId: myProposalId }))) hide(claimModal);
});

// ---------------------------------------------------------------- add-task modal

const taskModal = $("task-modal");
let addingPhase = null;

function openAdd(phaseId) {
  const p = state.phases.find((x) => x.id === phaseId);
  if (!p) return;
  addingPhase = phaseId;

  $("task-phase").innerHTML = `Adding to <b>${esc(p.title)}</b>`;
  $("t-name").value = "";
  $("t-note").value = "";
  $("t-qty").value = 1;
  unitOptions($("t-unit"), "days");

  show(taskModal);
  $("t-name").focus();
}

$("task-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const ok = await send("task", {
    phase: addingPhase,
    name: $("t-name").value,
    note: $("t-note").value,
    qty: $("t-qty").value,
    unit: $("t-unit").value,
    role: $("t-unit").value === "fixed" ? "fixed" : "researcher",
  });
  if (ok) hide(taskModal);
});

// ---------------------------------------------------------------- plumbing

function show(m) {
  scrim.hidden = false;
  m.hidden = false;
}

function hide(m) {
  scrim.hidden = true;
  m.hidden = true;
}

const hideAll = () => {
  hide(claimModal);
  hide(taskModal);
};

$("claim-close").addEventListener("click", hideAll);
$("task-close").addEventListener("click", hideAll);
scrim.addEventListener("click", hideAll);
document.addEventListener("keydown", (e) => e.key === "Escape" && hideAll());

document.addEventListener("click", (e) => {
  const claimBtn = e.target.closest("[data-claim]");
  if (claimBtn) return openClaim(claimBtn.dataset.claim);
  const addBtn = e.target.closest("[data-add]");
  if (addBtn) return openAdd(addBtn.dataset.add);
});

// ---------------------------------------------------------------- live sync

function connectLabel() {
  liveEl.textContent = "live";
  liveEl.setAttribute("data-on", "true");
}

function connect() {
  const stream = new EventSource("/api/budget/events");
  let seen = 0;
  stream.onopen = connectLabel;
  stream.onmessage = (e) => {
    const { updatedAt } = JSON.parse(e.data);
    if (seen && updatedAt !== state.updatedAt) load();
    seen = updatedAt;
  };
  stream.onerror = () => {
    liveEl.textContent = "reconnecting…";
    liveEl.removeAttribute("data-on");
  };
}

load().then(connect);
