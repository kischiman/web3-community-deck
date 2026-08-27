// Builds the shareable single-file version of the deck.
//
// Same content and same design as the local deck, but self-contained: CSS and images
// inlined, and slide 5 driven by the bundled library instead of the server. Re-run this
// after editing public/index.html so the shared copy stays in step.
//
//   node build-artifact.js   →   dist/deck.html

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(HERE, "public");
const OUT = path.join(HERE, "dist", "deck.html");

// The artifact carries both versions. GitHub Pages is world-readable and indexed,
// so V2 is stripped from that build unless --with-v2 says otherwise.
const PUBLISH_V2 = process.argv.includes("--with-v2");

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml" };

function dataUri(relPath) {
  const file = path.join(PUB, relPath.replace(/^\//, ""));
  const mime = MIME[path.extname(file)];
  return `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
}

let html = fs.readFileSync(path.join(PUB, "index.html"), "utf8");
const css = fs.readFileSync(path.join(PUB, "deck.css"), "utf8");
const library = fs.readFileSync(path.join(HERE, "lib", "library.js"), "utf8");
const askJs = fs.readFileSync(path.join(PUB, "ask.js"), "utf8");

// --- strip the document shell; the artifact host supplies it
html = html.replace(/^[\s\S]*?<body>\s*/, "").replace(/\s*<\/body>[\s\S]*$/, "");
html = html.replace(/<script src="\/deck\.js"><\/script>/, "");
html = html.replace(/<script src="\/ask\.js"><\/script>/, "");

// --- inline every image
html = html.replace(/src="(\/img\/[^"]+)"/g, (_, p) => `src="${dataUri(p)}"`);

// --- the phone companion has no counterpart in a static page.
// The capture form itself is real markup in index.html, so nothing needs injecting here —
// only the two places that point at a phone need rewording.
const replace = (pattern, replacement) => {
  if (!pattern.test(html)) throw new Error(`build: pattern no longer matches — ${pattern}`);
  html = html.replace(pattern, replacement);
};

// no phone to point at, and the page explains itself — drop the card entirely
replace(/<div class="companion-card">[\s\S]*?<\/div>/, "");

// --- example marks, keyed by domain slug
const marks = {};
for (const file of fs.readdirSync(path.join(PUB, "img", "ex"))) {
  marks[path.basename(file, path.extname(file))] = dataUri(`/img/ex/${file}`);
}

const clientLibrary = library.replace(/^export /gm, "");

const script = `
${clientLibrary}

const MARKS = ${JSON.stringify(marks)};

const slides = [...document.querySelectorAll(".slide")];
const navItems = document.getElementById("nav-items");
const list = document.getElementById("bottlenecks");
const empty = document.getElementById("bottlenecks-empty");
const generateBtn = document.getElementById("generate");
const resetBtn = document.getElementById("reset");
const genStatus = document.getElementById("gen-status");
const results = document.getElementById("results");
const rowsEl = document.getElementById("rows");
const sourceNote = document.getElementById("source-note");
const form = document.getElementById("capture");
const entry = document.getElementById("entry");

let current = 0;
let currentSub = 0;
let items = [];
let nextId = 1;

let version = document.querySelector('[data-version="2"]') ? "2" : "1";
const forVersion = (el) => !el.dataset.version || el.dataset.version === version;
const panelsFor = (i) => [...slides[i].querySelectorAll(".panel")].filter(forVersion);
const tabsFor = (i) => [...slides[i].querySelectorAll(".subnav button")].filter(forVersion);

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// -- navigation
slides.forEach((slide, i) => {
  const btn = document.createElement("button");
  btn.className = "nav-item";
  btn.innerHTML = '<b>0' + (i + 1) + '</b>' + esc(slide.dataset.title);
  btn.addEventListener("click", () => go(i, 0));
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

function go(index, sub) {
  current = Math.max(0, Math.min(slides.length - 1, index));
  const panels = panelsFor(current);
  currentSub = Math.max(0, Math.min(Math.max(panels.length - 1, 0), sub || 0));

  slides.forEach((s, i) => s.setAttribute("data-active", String(i === current)));
  [...navItems.children].forEach((b, i) => b.setAttribute("aria-current", String(i === current)));
  panels.forEach((p, i) => p.setAttribute("data-active", String(i === currentSub)));

  slides.forEach((s) => {
    s.querySelectorAll(".panel").forEach((p) => { if (!forVersion(p)) p.setAttribute("data-active", "false"); });
    s.querySelectorAll(".subnav button").forEach((b) => { b.hidden = !forVersion(b); });
  });

  document.querySelectorAll("#nav-version button").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.version === version))
  );

  const tabs = tabsFor(current);
  tabs.forEach((t, i) => t.setAttribute("aria-selected", String(i === currentSub)));

  const label = tabs.length
    ? slides[current].dataset.title + " · " + (tabs[currentSub] ? tabs[currentSub].textContent : "")
    : slides[current].dataset.title;
  navCurrent.textContent = "0" + (current + 1) + " · " + label;

  setMenu(false);
  window.scrollTo({ top: 0 });
}

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
  go(slide, sub);
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") return setMenu(false);
  if (e.target.matches("input, textarea")) return;
  if (e.key === "ArrowRight" || e.key === "PageDown") step(1);
  else if (e.key === "ArrowLeft" || e.key === "PageUp") step(-1);
  else if (/^[1-5]$/.test(e.key)) go(Number(e.key) - 1, 0);
});

// keyed on position, so a stripped panel needs no renumbering
document.querySelectorAll(".subnav").forEach((nav) => {
  nav.addEventListener("click", (e) => {
    const tab = e.target.closest("button");
    if (!tab) return;
    go(current, tabsFor(current).indexOf(tab));
  });
});

document.querySelectorAll(".phase-head").forEach((head) => {
  head.addEventListener("click", () => {
    const phase = head.closest(".phase");
    const open = phase.dataset.open !== "true";
    phase.dataset.open = String(open);
    head.setAttribute("aria-expanded", String(open));
  });
});

go(0, 0);

// -- map
const regions = [...document.querySelectorAll(".region")];
const legend = [...document.querySelectorAll(".map-legend button")];

function selectRegion(name) {
  const already = regions.find((r) => r.dataset.region === name)?.dataset.selected === "true";
  regions.forEach((r) => r.setAttribute("data-selected", String(!already && r.dataset.region === name)));
  legend.forEach((b) => b.setAttribute("aria-pressed", String(!already && b.dataset.region === name)));
}

regions.forEach((r) => r.addEventListener("click", () => selectRegion(r.dataset.region)));
legend.forEach((b) => b.addEventListener("click", () => selectRegion(b.dataset.region)));

// -- capture
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = entry.value.trim();
  if (!text) return;
  items.push({ id: nextId++, text });
  entry.value = "";
  render();
});

function render() {
  empty.hidden = items.length > 0;
  generateBtn.disabled = items.length === 0;
  list.innerHTML = items
    .map(
      (item, i) =>
        '<li class="bottleneck" draggable="true" data-id="' + item.id + '">' +
        '<span class="rank">' + (i + 1) + '</span>' +
        '<span class="text">' + esc(item.text) + '</span>' +
        '<span class="grip">···</span></li>'
    )
    .join("");
}

render();

// -- drag to prioritise
let dragged = null;

list.addEventListener("dragstart", (e) => {
  dragged = e.target.closest(".bottleneck");
  if (!dragged) return;
  dragged.dataset.dragging = "true";
  e.dataTransfer.effectAllowed = "move";
});

list.addEventListener("dragover", (e) => {
  e.preventDefault();
  const over = e.target.closest(".bottleneck");
  if (!over || !dragged || over === dragged) return;
  const { top, height } = over.getBoundingClientRect();
  list.insertBefore(dragged, e.clientY > top + height / 2 ? over.nextSibling : over);
});

list.addEventListener("dragend", () => {
  if (!dragged) return;
  delete dragged.dataset.dragging;
  dragged = null;
  const order = [...list.children].map((li) => Number(li.dataset.id));
  items = order.map((id) => items.find((b) => b.id === id)).filter(Boolean);
  render();
});

// -- generate
function markHtml(url) {
  let host;
  try { host = new URL(url).host; } catch { return ""; }
  const slug = host.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const src = MARKS[slug];
  return src ? '<img class="ex-mark" src="' + src + '" alt="" />' : "";
}

function cellHtml(cell, kind) {
  const examples = (cell.examples || [])
    .map((ex) => {
      const link = '<a href="' + esc(ex.url) + '" target="_blank" rel="noreferrer">' + esc(ex.name) + '</a>';
      return '<li>' + markHtml(ex.url) + '<span>' + link + ' — <em>' + esc(ex.note) + '</em></span></li>';
    })
    .join("");
  return '<div class="cell ' + kind + '">' +
    '<p class="solution">' + esc(cell.solution) + '</p>' +
    '<ul class="examples">' + examples + '</ul></div>';
}

generateBtn.addEventListener("click", () => {
  genStatus.innerHTML = '<span class="spinner"></span>matching';
  generateBtn.disabled = true;

  setTimeout(() => {
    const rows = libraryRows(items.map((b) => b.text));
    rowsEl.innerHTML = rows
      .map(
        (row) =>
          '<div class="row"><p class="row-title">' + esc(row.bottleneck) + '</p>' +
          '<p class="row-theme">' + esc(row.theme) + '</p>' +
          '<div class="cells">' + cellHtml(row.web3, "web3") + cellHtml(row.web2, "web2") + '</div></div>'
      )
      .join("");
    results.hidden = false;
    genStatus.textContent = rows.length + (rows.length === 1 ? " row" : " rows");
    generateBtn.disabled = false;
    sourceNote.textContent =
      "Matched against the library bundled into this page. In the live version this table is written by Claude, with web search, against whatever the room actually said.";
  }, 400);
});

let clearArmed = null;
resetBtn.addEventListener("click", () => {
  if (clearArmed) {
    clearTimeout(clearArmed);
    clearArmed = null;
    resetBtn.textContent = "Clear";
    items = [];
    results.hidden = true;
    genStatus.textContent = "";
    render();
    return;
  }
  resetBtn.textContent = "Tap again to clear";
  clearArmed = setTimeout(() => { clearArmed = null; resetBtn.textContent = "Clear"; }, 3000);
});

// the global V1 / V2 control
const navVersion = document.getElementById("nav-version");
if (navVersion) {
  navVersion.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn || btn.dataset.version === version) return;
    version = btn.dataset.version;
    navVersion.querySelectorAll("button").forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.version === version))
    );
    go(current, 0);
  });
}

window.deckGo = (slide, sub) => go(slide, sub);

${askJs}
`;

// .capture now lives in deck.css — only the static copy's own quirks belong here
const extraCss = `
.companion-card { max-width: 340px; }
.bottleneck { cursor: grab; }
`;

const page = `<title>Web3 for Social Resilience</title>
<style>
${css}
${extraCss}
</style>
${html}
<script>
${script}
</script>
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });

// The artifact host supplies its own document shell, so dist/deck.html is a fragment.
// GitHub Pages does not — so emit a complete standalone document for it too.
const PAGES = path.join(HERE, "docs", "index.html");

// Strip V2 from the public build. Removing the panel alone would leave the toggle
// pointing at nothing, so the nav control goes with it.
function stripV2(src) {
  // every V2 panel, plus the nav control that would otherwise point at nothing
  let out = src.replace(
    /\n *<div class="panel" data-version="2">[\s\S]*?\n *<\/div>(?=\n\s*(<\/div>|<!--))/g,
    ""
  );
  out = out.replace(/\n *<div class="nav-version"[\s\S]*?<\/div>\n/, "\n");
  out = out.replace(/ data-version="1"/g, "");

  // Match markup, not the selector string the script uses to detect a V2 panel.
  const leaks = ['<div class="panel" data-version="2"', '<div class="nav-version"'].filter((x) =>
    out.includes(x)
  );
  if (leaks.length) {
    throw new Error(`build: V2 leaked into the public build (${leaks.join(", ")}) — refusing to write`);
  }
  return out;
}


const pagesHtml = PUBLISH_V2 ? page : stripV2(page);


// the artifact sent to the client — both versions, switched in the nav
fs.writeFileSync(OUT, page);
console.log(`wrote ${OUT} — ${(fs.statSync(OUT).size / 1e6).toFixed(2)} MB  (client copy — V1 + V2)`);

const standalone = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="description" content="Web3 for community building and social resilience — a proposal, its precedents, and a live workshop." />
<meta name="color-scheme" content="light" />
${pagesHtml.slice(0, pagesHtml.indexOf("</style>") + "</style>".length)}
</head>
<body>
${pagesHtml.slice(pagesHtml.indexOf("</style>") + "</style>".length)}
</body>
</html>
`;

fs.mkdirSync(path.dirname(PAGES), { recursive: true });
fs.writeFileSync(PAGES, standalone);
console.log(
  `wrote ${PAGES} — ${(fs.statSync(PAGES).size / 1e6).toFixed(2)} MB` +
    (PUBLISH_V2 ? "  ⚠ INCLUDING proposal V2" : "  (proposal V2 stripped)")
);
