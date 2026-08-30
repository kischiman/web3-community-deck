// Admin panel. The only place the base rate card exists, and the only place a proposal
// becomes a staffing decision. The token lives in sessionStorage, so closing the tab
// signs you out.

const $ = (id) => document.getElementById(id);
const KEY = "budget-admin-token";

let token = sessionStorage.getItem(KEY) || "";
let state = null;

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

// ---------------------------------------------------------------- auth

async function signIn(password) {
  const res = await timedFetch("/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not sign in");
  token = data.token;
  // private-mode browsers can refuse storage; the token still works for this page
  try {
    sessionStorage.setItem(KEY, token);
  } catch {
    console.warn("[admin] sessionStorage unavailable — you'll sign in again on reload");
  }
}

/** fetch that gives up rather than hanging forever — a hang is invisible otherwise. */
async function timedFetch(path, options = {}, ms = 15000) {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), ms);
  try {
    return await fetch(path, { ...options, signal: stop.signal });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`The server did not answer ${path} within ${ms / 1000}s.`);
    }
    throw new Error(`Could not reach ${path} — check your connection.`);
  } finally {
    clearTimeout(timer);
  }
}

async function api(path, body) {
  const res = await timedFetch(path, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    sessionStorage.removeItem(KEY);
    token = "";
    throw new Error("Session expired — sign in again.");
  }

  // Anything else non-OK must throw too. Returning the error body as if it were
  // data poisons the caller's state and the failure surfaces somewhere unrelated.
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Server returned ${res.status}`);
  }

  try {
    return await res.json();
  } catch {
    throw new Error("The server sent something unreadable.");
  }
}

function showGate(message) {
  $("panel").hidden = true;
  $("gate").hidden = false;
  if (message) {
    $("gate-error").textContent = message;
    $("gate-error").hidden = false;
  }
}

// Load and draw first, and only then dismiss the gate. Hiding it up front means a
// failure halfway through leaves you staring at an empty panel with no way back.
async function enter() {
  state = await api("/api/admin/state");
  render();
  $("gate").hidden = true;
  $("panel").hidden = false;
  connect();
}

async function attemptSignIn() {
  const button = $("signin");
  const say = (msg, isError) => {
    $("gate-error").textContent = msg;
    $("gate-error").hidden = !msg;
    $("gate-error").style.color = isError ? "" : "var(--muted)";
  };

  say("");
  button.disabled = true;
  const original = button.textContent;
  button.textContent = "Signing in…";

  // A hung request is otherwise indistinguishable from a dead button.
  const slow = setTimeout(() => say("Still waiting on the server…", false), 4000);

  try {
    await signIn($("pw").value);
    $("pw").value = "";
    say("Loading the panel…", false);
    await enter();
    say("");
  } catch (err) {
    console.error("[admin] sign-in failed:", err);
    say(err.message || "Something went wrong — see the console.", true);
  } finally {
    clearTimeout(slow);
    button.disabled = false;
    button.textContent = original;
  }
}

$("signin").addEventListener("click", attemptSignIn);

// Enter in the password field, since there is no form to do it for us
$("pw").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    attemptSignIn();
  }
});

// If a password manager ever managed a native GET submit, the password landed in
// the URL and therefore in browser history. Clear it and say so plainly.
if (location.search.includes("password=") || location.search.includes("pw=")) {
  history.replaceState(null, "", location.pathname);
  $("gate-error").textContent =
    "Your password may have been placed in this page's URL by a form submission — it has been cleared here, but consider changing it.";
  $("gate-error").hidden = false;
}

// Walk the same three steps the sign-in does, reporting each on screen. The password
// is read from the field and never echoed.
$("diagnose").addEventListener("click", async () => {
  const out = $("diag");
  out.hidden = false;
  const lines = [];
  const show = (s) => {
    lines.push(s);
    out.textContent = lines.join("\n");
  };

  show("1. is admin configured on the server?");
  try {
    const { enabled } = await (await timedFetch("/api/admin/enabled", {}, 10000)).json();
    show(`   → ${enabled ? "yes" : "NO — ADMIN_PASSWORD is not set on the server"}`);
    if (!enabled) return;
  } catch (err) {
    return show(`   → failed: ${err.message}`);
  }

  const pw = $("pw").value;
  if (!pw) return show("\n2. type your password into the field above, then run this again");

  show(`\n2. signing in (password length ${pw.length})…`);
  let tok;
  try {
    const res = await timedFetch(
      "/api/admin/login",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: pw }) },
      10000
    );
    const data = await res.json().catch(() => ({}));
    show(`   → HTTP ${res.status}${data.error ? " · " + data.error : ""}`);
    if (!res.ok) return show("\n   The password is being rejected. Check it in your host's dashboard.");
    tok = data.token;
    show(`   → token received (${tok.length} chars)`);
  } catch (err) {
    return show(`   → failed: ${err.message}`);
  }

  show("\n3. loading the panel data…");
  try {
    const res = await timedFetch("/api/admin/state", { headers: { authorization: `Bearer ${tok}` } }, 15000);
    show(`   → HTTP ${res.status}`);
    const data = await res.json().catch(() => null);
    if (!res.ok) return show(`   → ${data?.error || "server error"}`);
    show(`   → ${data.tasks?.length ?? 0} lines, ${Object.keys(data.rates ?? {}).length} rates`);
    show("\nAll three steps passed — signing you in now.");
    token = tok;
    state = data;
    render();
    $("gate").hidden = true;
    $("panel").hidden = false;
    connect();
  } catch (err) {
    show(`   → failed: ${err.message}`);
  }
});

$("signout").addEventListener("click", async () => {
  await api("/api/admin/logout", {}).catch(() => {});
  sessionStorage.removeItem(KEY);
  token = "";
  location.reload();
});

$("export").addEventListener("click", async () => {
  const res = await fetch("/api/budget/export", { headers: { authorization: `Bearer ${token}` } });
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `budget-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

// ---------------------------------------------------------------- rendering

function renderStorage() {
  const s = state.storage;
  const el = $("storage-warn");
  if (!s || s.durable) return (el.hidden = true);
  el.hidden = false;
  el.innerHTML = `<b>Edits here are not durable.</b> State is kept in
    <code>${esc(s.where)}</code>, which this host wipes on every redeploy. Set
    <code>GIST_ID</code> and <code>GITHUB_TOKEN</code> in the environment to keep it
    permanently — until then, use <b>Export</b> before any deploy.`;
}

function renderRates() {
  // Roles no longer drive any figure — each line carries its own rate — so the only
  // project-wide number left is contingency.
  $("rate-grid").innerHTML = `<div class="rate">
      <label for="r-contingency">Contingency · %</label>
      <input id="r-contingency" data-rate="contingency" type="number" min="0" step="1"
             value="${state.rates.contingency}" />
    </div>`;

  const on = state.tasks.filter((t) => t.prefill).length;
  $("prefill-count").textContent = `${on} of ${state.tasks.length} lines suggest a rate`;

  // The public board is scope-only unless this is on. Say which state it is in
  // rather than leaving the admin to infer it from a highlight.
  const money = state.settings?.publicMoney === true;
  const toggle = $("public-money");
  toggle.classList.toggle("on", money);
  toggle.setAttribute("aria-pressed", String(money));
  toggle.textContent = money ? "public" : "hidden";
  $("money-state").textContent = money
    ? "rates, amounts and totals are public"
    : "the board shows scope only";
}

function renderPeople() {
  if (!state.people.length) {
    $("people").innerHTML = `<p class="empty-note">No proposals yet. Share the public link and they will appear here.</p>`;
    return;
  }
  $("people").innerHTML = state.people
    .map(
      (p) => `<div class="person${p.assigned ? " on" : ""}">
        <div>
          <div class="pname">${p.assigned ? "◆ " : ""}${esc(p.name)}</div>
          <div class="plines">${p.lines.filter((l) => l.assigned).length} of ${p.lines.length} proposals accepted</div>
        </div>
        <div class="pnums">
          <span class="v">${money(p.assigned)}</span>
          <span class="sub">of ${money(p.proposed)} proposed</span>
        </div>
      </div>`
    )
    .join("");
}

// Terms for a proposal or line: a fixed sum, a quantity at a rate, or — when no
// rate was given — just the quantity, rather than "× $0".
const terms = (x) =>
  x.unit === "fixed" ? "fixed" : x.rate ? `${x.qty} ${esc(x.unit)} × ${money(x.rate)}` : `${x.qty} ${esc(x.unit)}`;

function proposalRow(t, p) {
  const on = t.assigned === p.id;
  return `<div class="proposal admin${on ? " on" : ""}">
    <span class="who">${esc(p.name)}</span>
    <span class="terms">${terms(p)}</span>
    <span class="amt">${money(p.amount)}</span>
    <span class="prow-actions">
      <button class="btn ${on ? "" : "ghost "}small" data-assign="${esc(t.id)}" data-pid="${esc(p.id)}">
        ${on ? "On the project" : "Put on project"}
      </button>
      <button class="btn ghost small" data-pedit="${esc(t.id)}" data-pid="${esc(p.id)}">Edit</button>
      <button class="remove" data-premove="${esc(t.id)}" data-pid="${esc(p.id)}" title="Remove proposal" aria-label="Remove proposal">×</button>
    </span>
    ${p.notes ? `<p class="pnote">${esc(p.notes)}</p>` : ""}
  </div>`;
}

function lineHtml(t) {
  const on = t.proposals.find((p) => p.id === t.assigned);
  return `<div class="line admin" data-claimed="${!!on}">
    <div class="detail">
      <div class="name">${esc(t.name)}${t.kind === "expense" ? '<span class="tag">expense</span>' : ""}${
        t.added ? '<span class="tag">added</span>' : ""
      }</div>
      ${t.note ? `<div class="note">${esc(t.note)}</div>` : ""}
      ${
        t.proposals.length
          ? `<div class="proposals">${t.proposals.map((p) => proposalRow(t, p)).join("")}</div>`
          : `<p class="empty-note">No proposals yet</p>`
      }
    </div>
    <div class="num base">
      <span class="terms">${terms(t)}</span>
      ${money(t.base)}
      <button class="prefill-toggle${t.prefill ? " on" : ""}" data-prefill="${esc(t.id)}"
              title="${t.prefill ? "Public board suggests this rate" : "Public board shows no rate for this line"}">
        ${t.prefill ? "suggested" : "hidden"}
      </button>
    </div>
    <div class="num amount">${money(t.effective)}</div>
    <div class="line-actions">
      <button class="btn ghost small" data-edit="${esc(t.id)}">Edit</button>
      <button class="remove" data-remove="${esc(t.id)}" title="Remove line" aria-label="Remove line">×</button>
    </div>
  </div>`;
}

function render() {
  renderStorage();
  renderRates();
  renderPeople();

  $("phases").innerHTML = state.phases
    .map((p) => {
      const tasks = state.tasks.filter((t) => t.phase === p.id);
      return `<section class="phase">
        <header>
          <div>
            <h2>${esc(p.title)}</h2>
            <p class="note">${esc(p.note)}</p>
          </div>
          <span class="amount">${money(state.totals.effective.byPhase[p.id])}</span>
        </header>
        ${tasks.map(lineHtml).join("")}
        <div class="phase-foot">
          <button class="btn ghost small" data-newline="${esc(p.id)}">+ Add task</button>
        </div>
      </section>`;
    })
    .join("");

  const eff = state.totals.effective;
  const base = state.totals.base;
  $("summary").innerHTML =
    state.phases
      .map(
        (p) =>
          `<div class="row"><span>${esc(p.title)}</span><span class="v">${money(eff.byPhase[p.id])}</span></div>`
      )
      .join("") +
    `<div class="row sub"><span>Subtotal</span><span class="v">${money(eff.net)}</span></div>
     <div class="row sub"><span>Contingency at ${state.rates.contingency}%</span><span class="v">${money(eff.contingency)}</span></div>
     <div class="row total"><span>Committed total</span><span class="v">${money(eff.total)}</span></div>
     <div class="row sub"><span>Against base rate card</span><span class="v">${money(base.total)}</span></div>`;
}

// ---------------------------------------------------------------- actions

/** Report a failed call. Nothing here may throw: these run from click handlers, and
 *  a rejected handler is a button that does nothing at all. */
function reportFailure(err) {
  const message = (err && err.message) || "That did not save.";

  // api() clears the token whenever the server rejects it. Admin sessions live in a
  // Map in the server's memory, so every restart — every deploy — empties them; a tab
  // left open across one is the ordinary way this happens, and the way back is the
  // gate, not an error on a panel that can no longer do anything.
  if (!token) return showGate(message);

  alert(message);

  // A refusal usually means this page is describing something the server no longer
  // has. Re-read, so the stale line goes rather than sitting there to be clicked again.
  api("/api/admin/state")
    .then((fresh) => {
      state = fresh;
      render();
    })
    .catch(() => {});
}

/** True when the change went through; callers close their dialog on that, not before. */
async function mutate(action, body) {
  try {
    await api(`/api/admin/${action}`, body);
    state = await api("/api/admin/state");
    render();
    return true;
  } catch (err) {
    console.error(`[admin] ${action} failed:`, err);
    reportFailure(err);
    return false;
  }
}

// ---------------------------------------------------------------- edit a line

let editingId = null;
// Set when the dialog is adding rather than editing; the fields are the same either way.
let newLinePhase = null;

function openNewLine(phaseId) {
  const p = state.phases.find((x) => x.id === phaseId);
  if (!p) return;
  editingId = null;
  newLinePhase = phaseId;

  $("edit-title").textContent = `Add a line to ${p.title}`;
  $("e-name").value = "";
  $("e-note").value = "";
  $("e-qty").value = "";
  $("e-unit").innerHTML = state.units
    .map((u) => `<option value="${u}"${u === "days" ? " selected" : ""}>${u}</option>`)
    .join("");
  $("e-rate").value = "";

  calcEdit();
  $("scrim").hidden = false;
  $("edit-modal").hidden = false;
  $("e-name").focus();
}

function openEdit(id) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return;
  editingId = id;
  newLinePhase = null;
  $("edit-title").textContent = "Edit line";

  $("e-name").value = t.name;
  $("e-note").value = t.note || "";
  $("e-qty").value = t.qty;
  $("e-unit").innerHTML = state.units
    .map((u) => `<option value="${u}"${u === t.unit ? " selected" : ""}>${u}</option>`)
    .join("");
  $("e-rate").value = t.rate ?? "";

  calcEdit();
  $("scrim").hidden = false;
  $("edit-modal").hidden = false;
  $("e-name").focus();
}

function calcEdit() {
  const fixed = $("e-unit").value === "fixed";
  $("e-rate").disabled = fixed;
  $("e-qty").previousElementSibling.textContent = fixed ? "Amount · USD" : "Quantity";
  const qty = Number($("e-qty").value) || 0;
  $("e-total").textContent = money(fixed ? qty : qty * (Number($("e-rate").value) || 0));
}

["e-qty", "e-rate"].forEach((id) => $(id).addEventListener("input", calcEdit));
$("e-unit").addEventListener("change", calcEdit);

function closeEdit() {
  $("scrim").hidden = true;
  $("edit-modal").hidden = true;
  // Leaving the mode set would send the next Edit through the add path.
  newLinePhase = null;
}

$("edit-close").addEventListener("click", closeEdit);
$("edit-cancel").addEventListener("click", closeEdit);
$("scrim").addEventListener("click", () => { closeEdit(); closeProp(); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { closeEdit(); closeProp(); }
});

$("edit-save").addEventListener("click", async () => {
  const saved = await mutate(newLinePhase ? "task" : "update", {
    phase: newLinePhase,
    id: editingId,
    name: $("e-name").value,
    note: $("e-note").value,
    qty: $("e-qty").value,
    unit: $("e-unit").value,
    rate: $("e-rate").disabled ? undefined : $("e-rate").value,
  });
  if (saved) closeEdit();
});

// ---------------------------------------------------------------- edit a proposal

let propTask = null;
let propId = null;

function openProposal(taskId, proposalId) {
  const t = state.tasks.find((x) => x.id === taskId);
  const p = t?.proposals.find((x) => x.id === proposalId);
  if (!p) return;
  propTask = taskId;
  propId = proposalId;

  $("prop-task").innerHTML = `<b>${esc(p.name)}</b> on ${esc(t.name)}`;
  $("pr-name").value = p.name;
  $("pr-qty").value = p.qty;
  $("pr-unit").innerHTML = state.units
    .map((u) => `<option value="${u}"${u === p.unit ? " selected" : ""}>${u}</option>`)
    .join("");
  $("pr-rate").value = p.rate ?? "";
  $("pr-notes").value = p.notes || "";

  calcProp();
  $("scrim").hidden = false;
  $("prop-modal").hidden = false;
  $("pr-name").focus();
}

function calcProp() {
  const fixed = $("pr-unit").value === "fixed";
  $("pr-rate").disabled = fixed;
  const qty = Number($("pr-qty").value) || 0;
  $("pr-total").textContent = money(fixed ? qty : qty * (Number($("pr-rate").value) || 0));
}

["pr-qty", "pr-rate"].forEach((id) => $(id).addEventListener("input", calcProp));
$("pr-unit").addEventListener("change", calcProp);

function closeProp() {
  $("scrim").hidden = true;
  $("prop-modal").hidden = true;
}

$("prop-close").addEventListener("click", closeProp);
$("prop-cancel").addEventListener("click", closeProp);

$("prop-save").addEventListener("click", async () => {
  const saved = await mutate("proposal-update", {
    id: propTask,
    proposalId: propId,
    name: $("pr-name").value,
    qty: $("pr-qty").value,
    unit: $("pr-unit").value,
    rate: $("pr-rate").disabled ? undefined : $("pr-rate").value,
    notes: $("pr-notes").value,
  });
  if (saved) closeProp();
});

$("prop-remove").addEventListener("click", async () => {
  const t = state.tasks.find((x) => x.id === propTask);
  const p = t?.proposals.find((x) => x.id === propId);
  if (p && confirm(`Remove ${p.name}'s proposal?`)) {
    if (await mutate("proposal-remove", { id: propTask, proposalId: propId })) closeProp();
  }
});

document.addEventListener("click", (e) => {
  const pe = e.target.closest("[data-pedit]");
  if (pe) return openProposal(pe.dataset.pedit, pe.dataset.pid);

  const pr = e.target.closest("[data-premove]");
  if (pr) {
    const t = state.tasks.find((x) => x.id === pr.dataset.premove);
    const p = t?.proposals.find((x) => x.id === pr.dataset.pid);
    if (p && confirm(`Remove ${p.name}'s proposal?`)) {
      return mutate("proposal-remove", { id: pr.dataset.premove, proposalId: pr.dataset.pid });
    }
    return;
  }

  const nl = e.target.closest("[data-newline]");
  if (nl) return openNewLine(nl.dataset.newline);
  const ed = e.target.closest("[data-edit]");
  if (ed) return openEdit(ed.dataset.edit);

  const a = e.target.closest("[data-assign]");
  if (a) {
    const t = state.tasks.find((x) => x.id === a.dataset.assign);
    const already = t.assigned === a.dataset.pid;
    return mutate("assign", { id: a.dataset.assign, proposalId: already ? null : a.dataset.pid });
  }

  const pf = e.target.closest("[data-prefill]");
  if (pf) {
    const t = state.tasks.find((x) => x.id === pf.dataset.prefill);
    return mutate("prefill", { id: pf.dataset.prefill, value: !t.prefill });
  }

  const all = e.target.closest("[data-prefill-all]");
  if (all) return mutate("prefill-all", { value: all.dataset.prefillAll === "1" });

  if (e.target.closest("#public-money")) {
    return mutate("public-money", { value: !(state.settings?.publicMoney === true) });
  }

  const rm = e.target.closest("[data-remove]");
  if (rm) {
    const t = state.tasks.find((x) => x.id === rm.dataset.remove);
    if (t && confirm(`Remove "${t.name}" and any proposals on it?`)) mutate("remove", { id: rm.dataset.remove });
  }
});

document.addEventListener("change", (e) => {
  const rate = e.target.closest("[data-rate]");
  if (rate) return mutate("rate", { key: rate.dataset.rate, value: rate.value });
});

// ---------------------------------------------------------------- live sync

function connect() {
  const stream = new EventSource("/api/budget/events");
  let seen = 0;
  stream.onmessage = async (e) => {
    const { updatedAt } = JSON.parse(e.data);
    if (seen && updatedAt !== state.updatedAt) {
      try {
        state = await api("/api/admin/state");
        render();
      } catch (err) {
        // Most often the server restarted under us, which also ended the session.
        console.error("[admin] could not refresh:", err);
        reportFailure(err);
        return;
      }
    }
    seen = updatedAt;
  };
  stream.onerror = () => {
    $("live").textContent = "reconnecting…";
  };
  stream.onopen = () => {
    $("live").textContent = "live";
    $("live").setAttribute("data-on", "true");
  };
}

// ---------------------------------------------------------------- start

(async () => {
  const { enabled } = await (await fetch("/api/admin/enabled")).json();
  if (!enabled) {
    $("gate-note").textContent =
      "Admin is not configured on this server. Set ADMIN_PASSWORD in the environment and restart.";
    $("signin").disabled = true;
    $("pw").disabled = true;
    return;
  }
  if (token) {
    try {
      return await enter();
    } catch {
      // token no longer valid — fall through to the gate
    }
  }
  showGate();
})();
