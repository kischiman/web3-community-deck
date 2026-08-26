// Shared budget. State lives on the server; this renders it and sends changes back.
// Every edit broadcasts, so a second browser updates without a refresh.

const $ = (id) => document.getElementById(id);

const phasesEl = $("phases");
const rateGrid = $("rate-grid");
const summaryEl = $("summary");
const liveEl = $("live");
const scrim = $("scrim");

let state = { phases: [], rates: {}, tasks: [], totals: null };

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const money = (n) =>
  (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const RATE_LABELS = {
  principal: "Principal / lead",
  researcher: "Researcher",
  designer: "Designer",
  engineer: "Engineer",
  pm: "Project manager",
  apartment: "Apartment · month",
  perdiem: "Per diem · day",
  contingency: "Contingency · %",
};

// ---------------------------------------------------------------- transport

async function load() {
  const res = await fetch("/api/budget");
  state = await res.json();
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
    alertish(error || "That did not save");
    return false;
  }
  await load();
  return true;
}

function alertish(msg) {
  liveEl.textContent = msg;
  liveEl.removeAttribute("data-on");
  setTimeout(() => connectLabel(), 2500);
}

// ---------------------------------------------------------------- rendering

const rateOf = (t) => (t.role === "fixed" ? null : Number(t.rateOverride) || Number(state.rates[t.role]) || 0);
const amountOf = (t) => (t.role === "fixed" ? Number(t.qty) || 0 : (Number(t.qty) || 0) * rateOf(t));

function renderRates() {
  rateGrid.innerHTML = Object.keys(state.rates)
    .map(
      (key) => `<div class="rate">
        <label for="r-${key}">${esc(RATE_LABELS[key] || key)}</label>
        <input id="r-${key}" data-rate="${key}" type="number" step="${key === "contingency" ? 1 : 25}"
               min="0" value="${state.rates[key]}" />
      </div>`
    )
    .join("");
}

function lineHtml(t) {
  const rate = rateOf(t);
  const claimed = !!t.claim;
  return `<div class="line" data-id="${esc(t.id)}" data-claimed="${claimed}">
    <div class="detail">
      <div class="name">${esc(t.name)}${t.kind === "expense" ? '<span class="tag">expense</span>' : ""}${
        t.added ? '<span class="tag">added</span>' : ""
      }</div>
      ${t.note ? `<div class="note">${esc(t.note)}</div>` : ""}
      ${claimed ? `<span class="claimed-by">◆ ${esc(t.claim.name)}</span>` : ""}
      ${claimed && t.claim.notes ? `<div class="claim-note">${esc(t.claim.notes)}</div>` : ""}
    </div>
    <div class="num qty">${t.role === "fixed" ? "—" : (t.qty % 1 ? t.qty.toFixed(1) : t.qty) + " " + esc(t.unit || "")}</div>
    <div class="num rate">${rate === null ? "—" : money(rate)}${
      t.rateOverride ? '<span class="tag" title="claimant rate">own</span>' : ""
    }</div>
    <div class="num amount">${money(amountOf(t))}</div>
    <div class="line-actions">
      <button class="btn ghost small" data-claim="${esc(t.id)}">${claimed ? "Edit" : "Claim task"}</button>
      <button class="remove" data-remove="${esc(t.id)}" title="Remove line" aria-label="Remove line">×</button>
    </div>
  </div>`;
}

function render() {
  renderRates();

  phasesEl.innerHTML = state.phases
    .map((p) => {
      const tasks = state.tasks.filter((t) => t.phase === p.id);
      const sum = tasks.reduce((a, t) => a + amountOf(t), 0);
      return `<section class="phase">
        <header>
          <div>
            <h2>${esc(p.title)}</h2>
            <p class="note">${esc(p.note)}</p>
          </div>
          <span class="amount">${money(sum)}</span>
        </header>
        ${tasks.map(lineHtml).join("")}
        <div class="phase-foot">
          <button class="btn ghost small" data-add="${esc(p.id)}">+ Add task</button>
        </div>
      </section>`;
    })
    .join("");

  const net = state.tasks.reduce((a, t) => a + amountOf(t), 0);
  const contingency = net * ((Number(state.rates.contingency) || 0) / 100);
  const claimedCount = state.tasks.filter((t) => t.claim).length;

  summaryEl.innerHTML =
    state.phases
      .map((p) => {
        const sum = state.tasks.filter((t) => t.phase === p.id).reduce((a, t) => a + amountOf(t), 0);
        return `<div class="row"><span>${esc(p.title)}</span><span class="v">${money(sum)}</span></div>`;
      })
      .join("") +
    `<div class="row sub"><span>Subtotal before contingency</span><span class="v">${money(net)}</span></div>
     <div class="row sub"><span>Contingency at ${state.rates.contingency}%</span><span class="v">${money(contingency)}</span></div>
     <div class="row total"><span>Total</span><span class="v">${money(net + contingency)}</span></div>
     <div class="row sub"><span>${claimedCount} of ${state.tasks.length} lines claimed</span><span class="v"></span></div>`;
}

// ---------------------------------------------------------------- claim modal

const claimModal = $("claim-modal");
let claimingId = null;

function openClaim(id) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return;
  claimingId = id;

  $("claim-task").innerHTML = `<b>${esc(t.name)}</b>${t.note ? " — " + esc(t.note) : ""}`;
  $("c-name").value = t.claim?.name || "";
  $("c-qty").value = t.role === "fixed" ? "" : t.qty;
  $("c-qty").disabled = t.role === "fixed";
  $("c-rate").value = t.rateOverride || (t.role === "fixed" ? "" : state.rates[t.role] || "");
  $("c-rate").disabled = t.role === "fixed";
  $("c-unit").textContent = t.role === "fixed" ? "fixed amount" : t.unit || "days";
  $("c-notes").value = t.claim?.notes || "";
  $("claim-submit").textContent = t.claim ? "Save claim" : "Claim task";
  $("claim-release").hidden = !t.claim;

  calcClaim();
  show(claimModal);
  $("c-name").focus();
}

function calcClaim() {
  const t = state.tasks.find((x) => x.id === claimingId);
  const total =
    t && t.role === "fixed"
      ? Number(t.qty) || 0
      : (Number($("c-qty").value) || 0) * (Number($("c-rate").value) || 0);
  $("c-total").textContent = money(total);
}

$("c-qty").addEventListener("input", calcClaim);
$("c-rate").addEventListener("input", calcClaim);

$("claim-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const ok = await send("claim", {
    id: claimingId,
    name: $("c-name").value,
    qty: $("c-qty").disabled ? undefined : $("c-qty").value,
    rate: $("c-rate").disabled ? undefined : $("c-rate").value,
    notes: $("c-notes").value,
  });
  if (ok) hide(claimModal);
});

$("claim-release").addEventListener("click", async () => {
  if (await send("unclaim", { id: claimingId })) hide(claimModal);
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

  $("t-role").innerHTML =
    Object.keys(state.rates)
      .filter((k) => k !== "contingency")
      .map((k) => `<option value="${k}">${esc(RATE_LABELS[k] || k)} · ${money(state.rates[k])}</option>`)
      .join("") + '<option value="fixed">Fixed amount (USD)</option>';

  calcTask();
  show(taskModal);
  $("t-name").focus();
}

function calcTask() {
  const role = $("t-role").value;
  const qty = Number($("t-qty").value) || 0;
  $("t-total").textContent = money(role === "fixed" ? qty : qty * (state.rates[role] || 0));
  $("t-qty").previousElementSibling.textContent = role === "fixed" ? "Amount · USD" : "Quantity";
}

$("t-qty").addEventListener("input", calcTask);
$("t-role").addEventListener("change", calcTask);

$("task-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const role = $("t-role").value;
  const ok = await send("task", {
    phase: addingPhase,
    name: $("t-name").value,
    note: $("t-note").value,
    qty: $("t-qty").value,
    role,
    unit: role === "fixed" ? "fixed" : "days",
  });
  if (ok) hide(taskModal);
});

// ---------------------------------------------------------------- modal plumbing

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

// ---------------------------------------------------------------- events

document.addEventListener("click", (e) => {
  const claimBtn = e.target.closest("[data-claim]");
  if (claimBtn) return openClaim(claimBtn.dataset.claim);

  const addBtn = e.target.closest("[data-add]");
  if (addBtn) return openAdd(addBtn.dataset.add);

  const rm = e.target.closest("[data-remove]");
  if (rm) {
    const t = state.tasks.find((x) => x.id === rm.dataset.remove);
    if (t && confirm(`Remove "${t.name}"? Everyone loses this line.`)) send("remove", { id: rm.dataset.remove });
  }
});

rateGrid.addEventListener("change", (e) => {
  const input = e.target.closest("[data-rate]");
  if (input) send("rate", { key: input.dataset.rate, value: input.value });
});

// ---------------------------------------------------------------- live sync

function connectLabel() {
  liveEl.textContent = "live · everyone sees this";
  liveEl.setAttribute("data-on", "true");
}

function connect() {
  const stream = new EventSource("/api/budget/events");
  let seen = 0;

  stream.onopen = connectLabel;
  stream.onmessage = (e) => {
    const { updatedAt } = JSON.parse(e.data);
    // ignore the first frame and our own echo; reload when someone else changed something
    if (seen && updatedAt !== state.updatedAt) load();
    seen = updatedAt;
  };
  stream.onerror = () => {
    liveEl.textContent = "reconnecting…";
    liveEl.removeAttribute("data-on");
  };
}

load().then(connect);
