// Big-screen deck: navigation, the Singapore map, and the live slide-5 workshop.

const slides = [...document.querySelectorAll(".slide")];
const navItems = document.getElementById("nav-items");
const bottleneckList = document.getElementById("bottlenecks");
const emptyState = document.getElementById("bottlenecks-empty");
const generateBtn = document.getElementById("generate");
const resetBtn = document.getElementById("reset");
const genStatus = document.getElementById("gen-status");
const results = document.getElementById("results");
const rowsEl = document.getElementById("rows");
const sourceNote = document.getElementById("source-note");

let current = 0;
let currentSub = 0;
let lastRenderedIds = "";
let lastGenStamp = "";

// Which proposal version is on screen. Panels and tabs may be tagged for one
// version; anything untagged (the precedents) shows in both.
let version = "1";

const forVersion = (el) => !el.dataset.version || el.dataset.version === version;
const panelsFor = (i) => [...slides[i].querySelectorAll(".panel")].filter(forVersion);
const tabsFor = (i) => [...slides[i].querySelectorAll(".subnav button")].filter(forVersion);

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const safeUrl = (u) => (/^https?:\/\//i.test(String(u || "")) ? String(u) : null);

// ---------------------------------------------------------------- navigation

slides.forEach((slide, i) => {
  const btn = document.createElement("button");
  btn.className = "nav-item";
  btn.innerHTML = `<b>0${i + 1}</b>${esc(slide.dataset.title)}`;
  btn.addEventListener("click", () => go(i, 0, true));
  navItems.appendChild(btn);
});

const navToggle = document.getElementById("nav-toggle");
const navCurrent = document.getElementById("nav-current");

function setMenu(open) {
  navItems.dataset.open = String(open);
  navToggle.setAttribute("aria-expanded", String(open));
}

navToggle.addEventListener("click", (e) => {
  e.stopPropagation();
  setMenu(navItems.dataset.open !== "true");
});

document.addEventListener("click", (e) => {
  if (navItems.dataset.open === "true" && !navItems.contains(e.target)) setMenu(false);
});

function go(index, sub, push) {
  current = Math.max(0, Math.min(slides.length - 1, index));
  const panels = panelsFor(current);
  currentSub = Math.max(0, Math.min(Math.max(panels.length - 1, 0), sub || 0));

  slides.forEach((s, i) => s.setAttribute("data-active", String(i === current)));
  [...navItems.children].forEach((b, i) => b.setAttribute("aria-current", String(i === current)));
  panels.forEach((p, i) => p.setAttribute("data-active", String(i === currentSub)));

  // hide any panel or tab belonging to the other version outright
  slides.forEach((s) => {
    s.querySelectorAll(".panel").forEach((p) => { if (!forVersion(p)) p.setAttribute("data-active", "false"); });
    s.querySelectorAll(".subnav button").forEach((b) => { b.hidden = !forVersion(b); });
  });

  const tabs = tabsFor(current);
  tabs.forEach((t, i) => t.setAttribute("aria-selected", String(i === currentSub)));

  const label = tabs.length
    ? `${slides[current].dataset.title} · ${tabs[currentSub]?.textContent ?? ""}`
    : slides[current].dataset.title;
  navCurrent.textContent = `0${current + 1} · ${label}`;

  setMenu(false);
  window.scrollTo({ top: 0 });
  if (push) post("/api/slide", { slide: current, sub: currentSub });
}

// One flat sequence across slides and panels, so ← → and the phone never skip a panel.
function step(dir) {
  let slide = current;
  let sub = currentSub + dir;
  if (sub < 0) {
    slide -= 1;
    sub = slide >= 0 ? Math.max(panelsFor(slide).length - 1, 0) : 0;
  } else if (sub > Math.max(panelsFor(slide).length - 1, 0)) {
    slide += 1;
    sub = 0;
  }
  if (slide < 0 || slide >= slides.length) return;
  go(slide, sub, true);
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") return setMenu(false);
  if (e.target.matches("input, textarea")) return;
  if (e.key === "ArrowRight" || e.key === "PageDown") step(1);
  else if (e.key === "ArrowLeft" || e.key === "PageUp") step(-1);
  else if (/^[1-5]$/.test(e.key)) go(Number(e.key) - 1, 0, true);
});

// Sub-slide tabs. Keyed on position rather than data-sub, so a panel can be
// removed at build time without renumbering everything that follows it.
document.querySelectorAll(".subnav").forEach((nav) => {
  nav.addEventListener("click", (e) => {
    const tab = e.target.closest("button");
    if (!tab) return;
    go(current, tabsFor(current).indexOf(tab), true);
  });
});

// collapsible phases
document.querySelectorAll(".phase-head").forEach((head) => {
  head.addEventListener("click", () => {
    const phase = head.closest(".phase");
    const open = phase.dataset.open !== "true";
    phase.dataset.open = String(open);
    head.setAttribute("aria-expanded", String(open));
  });
});

// let the ask-the-document box jump to a slide
window.deckGo = (slide, sub) => go(slide, sub, true);

// the global V1 / V2 control
const navVersion = document.getElementById("nav-version");

navVersion.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn || btn.dataset.version === version) return;
  version = btn.dataset.version;
  navVersion.querySelectorAll("button").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.version === version))
  );
  go(current, 0, true); // land on the first panel this version actually has
});

go(0, 0, false);

// ---------------------------------------------------------------- map

const regions = [...document.querySelectorAll(".region")];
const legend = [...document.querySelectorAll(".map-legend button")];

function selectRegion(name) {
  const already = regions.find((r) => r.dataset.region === name)?.dataset.selected === "true";
  regions.forEach((r) => r.setAttribute("data-selected", String(!already && r.dataset.region === name)));
  legend.forEach((b) => b.setAttribute("aria-pressed", String(!already && b.dataset.region === name)));
}

regions.forEach((r) => r.addEventListener("click", () => selectRegion(r.dataset.region)));
legend.forEach((b) => b.addEventListener("click", () => selectRegion(b.dataset.region)));

// ---------------------------------------------------------------- transport

async function post(path, body) {
  try {
    await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body || {}),
    });
  } catch (err) {
    console.error("post failed", path, err);
  }
}

fetch("/api/info")
  .then((r) => r.json())
  .then(({ companionUrl }) => {
    document.getElementById("companion-url").textContent = companionUrl;
  })
  .catch(() => {});

const stream = new EventSource("/api/events");
stream.onmessage = (e) => render(JSON.parse(e.data));

// ---------------------------------------------------------------- render

function render(state) {
  if (state.slide !== current || state.sub !== currentSub) go(state.slide, state.sub, false);
  renderBottlenecks(state.bottlenecks);
  renderGeneration(state.generation);
}

function renderBottlenecks(items) {
  emptyState.hidden = items.length > 0;
  generateBtn.disabled = items.length === 0;

  // don't rebuild mid-drag or when nothing changed — it would fight the pointer
  const signature = items.map((b) => `${b.id}:${b.text}`).join("|");
  if (signature === lastRenderedIds) return;
  lastRenderedIds = signature;

  bottleneckList.innerHTML = "";
  items.forEach((item, i) => {
    const li = document.createElement("li");
    li.className = "bottleneck";
    li.draggable = true;
    li.dataset.id = String(item.id);
    li.innerHTML = `<span class="rank">${i + 1}</span><span class="text">${esc(item.text)}</span><span class="grip">···</span>`;
    bottleneckList.appendChild(li);
  });
}

function renderGeneration(gen) {
  if (gen.status === "running") {
    genStatus.innerHTML = '<span class="spinner"></span>searching and drafting — this takes a moment';
    generateBtn.disabled = true;
    return;
  }

  generateBtn.disabled = bottleneckList.children.length === 0;

  if (gen.status === "idle") {
    genStatus.textContent = "";
    results.hidden = true;
    lastGenStamp = "";
    return;
  }

  if (gen.status === "error") {
    genStatus.textContent = `couldn't generate — ${gen.error}`;
    return;
  }

  const stamp = String(gen.finishedAt);
  if (stamp === lastGenStamp) return;
  lastGenStamp = stamp;

  const seconds = Math.round((gen.finishedAt - gen.startedAt) / 1000);
  genStatus.textContent = `${gen.rows.length} rows · ${seconds}s`;
  results.hidden = false;
  rowsEl.innerHTML = gen.rows.map(rowHtml).join("");
  sourceNote.textContent =
    gen.source === "live"
      ? "Generated live, grounded in web search. Verify links before circulating."
      : gen.source === "live-unverified"
      ? "Generated live, but without web search — examples come from the model's own knowledge. Check the links before relying on them."

      : "From the offline library — no live model call was made.";
}

// Example marks: a locally cached favicon where we have one, the site's own as a
// last resort when online, and nothing at all rather than a broken frame.
function markHtml(url) {
  let host;
  try {
    host = new URL(url).host;
  } catch {
    return "";
  }
  const slug = host.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const chain = [`/img/ex/${slug}.png`, `/img/ex/${slug}.svg`, `https://${host}/favicon.ico`];
  const onerror = `this.dataset.step=(+this.dataset.step||0)+1;const c=${JSON.stringify(chain)};if(c[this.dataset.step]){this.src=c[this.dataset.step]}else{this.remove()}`;
  return `<img class="ex-mark" src="${esc(chain[0])}" alt="" data-step="0" loading="lazy" onerror="${esc(onerror)}" />`;
}

function cellHtml(cell, kind) {
  const examples = (cell?.examples || [])
    .map((ex) => {
      const url = safeUrl(ex.url);
      const name = url ? `<a href="${esc(url)}" target="_blank" rel="noreferrer">${esc(ex.name)}</a>` : esc(ex.name);
      return `<li>${url ? markHtml(url) : ""}<span>${name} — <em>${esc(ex.note)}</em></span></li>`;
    })
    .join("");
  return `<div class="cell ${kind}">
    <p class="solution">${esc(cell?.solution)}</p>
    <p class="how">${esc(cell?.how || "")}</p>
    <ul class="examples">${examples}</ul>
  </div>`;
}

function rowHtml(row) {
  return `<div class="row">
    <p class="row-title">${esc(row.bottleneck)}</p>
    <p class="row-theme">${esc(row.theme || "")}</p>
    <div class="cells">${cellHtml(row.web3, "web3")}${cellHtml(row.web2, "web2")}</div>
  </div>`;
}

// ---------------------------------------------------------------- drag to prioritise

let dragged = null;

bottleneckList.addEventListener("dragstart", (e) => {
  dragged = e.target.closest(".bottleneck");
  if (!dragged) return;
  dragged.dataset.dragging = "true";
  e.dataTransfer.effectAllowed = "move";
});

bottleneckList.addEventListener("dragover", (e) => {
  e.preventDefault();
  const over = e.target.closest(".bottleneck");
  if (!over || !dragged || over === dragged) return;
  const { top, height } = over.getBoundingClientRect();
  const after = e.clientY > top + height / 2;
  bottleneckList.insertBefore(dragged, after ? over.nextSibling : over);
});

bottleneckList.addEventListener("dragend", () => {
  if (!dragged) return;
  delete dragged.dataset.dragging;
  dragged = null;
  [...bottleneckList.children].forEach((li, i) => (li.querySelector(".rank").textContent = i + 1));
  const ids = [...bottleneckList.children].map((li) => Number(li.dataset.id));
  lastRenderedIds = ""; // let the next broadcast re-sync ranks
  post("/api/bottlenecks/reorder", { ids });
});

// ---------------------------------------------------------------- actions

const captureForm = document.getElementById("capture");
const entry = document.getElementById("entry");

captureForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = entry.value.trim();
  if (!text) return;
  entry.value = "";
  post("/api/bottlenecks", { text });
});

generateBtn.addEventListener("click", () => post("/api/generate", {}));
// Two-tap clear — no modal dialog to block the room, no accidental wipe mid-talk.
let clearArmed = null;
resetBtn.addEventListener("click", () => {
  if (clearArmed) {
    clearTimeout(clearArmed);
    clearArmed = null;
    resetBtn.textContent = "Clear";
    post("/api/reset", {});
    return;
  }
  resetBtn.textContent = "Tap again to clear";
  clearArmed = setTimeout(() => {
    clearArmed = null;
    resetBtn.textContent = "Clear";
  }, 3000);
});
