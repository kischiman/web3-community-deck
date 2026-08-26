// Shared state for the budget model.
//
// Everyone with the URL sees the same numbers and the same claims. State is held in
// memory and mirrored to a JSON file so a restart doesn't lose the day's work — but
// note that free hosting tiers have ephemeral disks, so treat Export as the real backup.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILE = process.env.BUDGET_FILE || path.join(HERE, "..", "budget-state.json");

export const PHASES = [
  { id: "p1", title: "Phase 1 · Residency", note: "3 months, one researcher living in the district." },
  { id: "p2a", title: "Phase 2 · The two weeks", note: "Week one education, week two design sprint." },
  { id: "p2b", title: "Phase 2 · Build", note: "Research prototypes, not products. Plus the pipeline, which does not scale down." },
  { id: "p2c", title: "Phase 2 · Keeping it in use", note: "Adoption is a deliverable with an owner." },
  { id: "p3", title: "Phase 3 · Assessment", note: "Closing survey, analysis, written outputs." },
];

export const DEFAULT_RATES = {
  principal: 1100,
  researcher: 650,
  designer: 700,
  engineer: 800,
  pm: 600,
  apartment: 2600,
  perdiem: 70,
  contingency: 18,
};

const DAYS_PER_MONTH = 21;

// role: which rate drives the line. "fixed" lines carry their own amount.
function seed() {
  const t = (phase, name, note, qty, role, unit, kind) => ({
    id: `${phase}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 28)}`,
    phase, name, note, qty, role, unit,
    kind: kind || "fee",
    claim: null,
  });

  return [
    t("p1", "Resident researcher", "Three months in place — ethnography, infrastructure baseline, community organising", 3 * DAYS_PER_MONTH, "researcher", "days"),
    t("p1", "Apartment", "For the duration, not a hotel", 3, "apartment", "months", "expense"),
    t("p1", "Per diem", "Living costs while resident", 3 * DAYS_PER_MONTH, "perdiem", "days", "expense"),
    t("p1", "Research lead oversight", "Fieldwork design, weekly supervision, quality of the record", 12, "principal", "days"),
    t("p1", "Baseline survey fieldwork", "300 completions across three neighbourhoods, incl. enumerators", 18, "researcher", "days"),
    t("p1", "Translation", "Instrument and consent forms — Mandarin, Malay, Tamil", 4500, "fixed", "fixed", "expense"),
    t("p1", "Participant incentives · wave 1", "300 respondents", 7000, "fixed", "fixed", "expense"),
    t("p1", "Synthesis and Phase 2 scoping", "Fieldwork report, primitive mapping, and the Phase 2 scope and price", 10, "principal", "days"),
    t("p1", "Project management", "Across the phase", 32, "pm", "days"),

    t("p2a", "Kickoff design and preparation", "Week-one curriculum, week-two sprint structure, materials", 12, "designer", "days"),
    t("p2a", "Week 1 · education workshops", "Facilitation, two people in the room", 10, "designer", "days"),
    t("p2a", "Week 2 · design sprint", "Facilitation plus an engineer for feasibility in the room", 10, "designer", "days"),
    t("p2a", "Principal, both weeks", "Leading the room", 10, "principal", "days"),
    t("p2a", "Venue, catering and materials", "Two weeks — the space where people get to know each other", 9000, "fixed", "fixed", "expense"),
    t("p2a", "Participant incentives · workshops", "Attendance across two weeks", 5500, "fixed", "fixed", "expense"),

    t("p2b", "Web 2.0 prototype", "One person assembling a working prototype as they go, from tools that already exist. Not custom development", 12, "engineer", "days"),
    t("p2b", "Web 3.0 prototype", "The harder of the two — custom, but research-grade rather than production", 30, "engineer", "days"),
    t("p2b", "Design across both", "Interface, onboarding flows, plain-language content", 20, "designer", "days"),
    t("p2b", "Data pipeline", "IRB-compliant: consent, withdrawal that deletes, scheduled destruction. Adapted from Kaeru-chan. Does not scale down with user numbers", 18, "engineer", "days"),
    t("p2b", "Technical direction", "Architecture, review, the handoff plan per tool", 8, "principal", "days"),

    t("p2c", "Deployment and onboarding", "Getting people to first use, in person", 12, "researcher", "days"),
    t("p2c", "Retention and support", "Six months — check-ins, fixes, noticing when a group goes quiet", 24, "researcher", "days"),
    t("p2c", "Interim in-app surveys", "Instrument, deployment, and reading what comes back", 8, "researcher", "days"),
    t("p2c", "Maintenance engineering", "Six months of breakages — research-scale, tens of users per site", 9, "engineer", "days"),
    t("p2c", "Project management", "Across the phase", 67, "pm", "days"),

    t("p3", "Closing survey fieldwork", "Same respondents, plus the residents who built the tools", 18, "researcher", "days"),
    t("p3", "Participant incentives · wave 2", "300 respondents", 7000, "fixed", "fixed", "expense"),
    t("p3", "Telemetry and comparative analysis", "Against each neighbourhood's own baseline, then across", 20, "principal", "days"),
    t("p3", "Community engagement manual", "The deliverable the proposal promises to ministries", 12, "designer", "days"),
    t("p3", "Policy briefs and publication support", "One or two briefs, plus support to the journal paper", 12, "principal", "days"),
    t("p3", "Findings sessions", "Participants first, then citizens and policymakers", 6, "principal", "days"),
  ];
}

let state = load();

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
    if (Array.isArray(raw.tasks) && raw.rates) return raw;
  } catch {
    // no file yet, or it's unreadable — start from the seed
  }
  return { rates: { ...DEFAULT_RATES }, tasks: seed(), updatedAt: Date.now() };
}

function persist() {
  state.updatedAt = Date.now();
  try {
    fs.writeFileSync(FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error("[budget] could not persist:", err.message);
  }
}

// ---------------------------------------------------------------- reads

export const getState = () => state;

/**
 * Amount for one line. Fixed lines carry their own figure. Otherwise it's qty × rate,
 * where a claimant's own rate, if they gave one, beats the role rate for that line.
 */
export function rateOf(task, rates) {
  if (task.role === "fixed") return null;
  return Number(task.rateOverride) || Number(rates[task.role]) || 0;
}

export function amountOf(task, rates) {
  if (task.role === "fixed") return Number(task.qty) || 0;
  return (Number(task.qty) || 0) * rateOf(task, rates);
}

export function totals() {
  const { rates, tasks } = state;
  const byPhase = Object.fromEntries(PHASES.map((p) => [p.id, 0]));
  for (const t of tasks) byPhase[t.phase] = (byPhase[t.phase] || 0) + amountOf(t, rates);
  const net = Object.values(byPhase).reduce((a, b) => a + b, 0);
  const contingency = net * ((Number(rates.contingency) || 0) / 100);
  return { byPhase, net, contingency, total: net + contingency };
}

// ---------------------------------------------------------------- writes

export function setRate(key, value) {
  if (!(key in state.rates)) return false;
  state.rates[key] = Number(value) || 0;
  persist();
  return true;
}

export function claim(id, { name, qty, rate, notes }) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return false;

  if (qty !== undefined && qty !== null && qty !== "") task.qty = Number(qty) || 0;

  // A claimant's own rate applies to this line only; it never touches the rate card.
  const ownRate = Number(rate);
  task.rateOverride = Number.isFinite(ownRate) && ownRate > 0 ? ownRate : null;

  task.claim = {
    name: String(name || "").trim().slice(0, 60) || "Unnamed",
    notes: String(notes || "").trim().slice(0, 600),
    at: Date.now(),
  };

  persist();
  return true;
}

export function unclaim(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task || !task.claim) return false;
  task.claim = null;
  task.rateOverride = null;
  persist();
  return true;
}

export function addTask({ phase, name, note, qty, role, unit }) {
  if (!PHASES.some((p) => p.id === phase)) return false;
  const clean = String(name || "").trim().slice(0, 90);
  if (!clean) return false;

  state.tasks.push({
    id: `${phase}-${Date.now().toString(36)}`,
    phase,
    name: clean,
    note: String(note || "").trim().slice(0, 300),
    qty: Number(qty) || 0,
    role: role && (role in state.rates || role === "fixed") ? role : "researcher",
    unit: unit || (role === "fixed" ? "fixed" : "days"),
    kind: role === "fixed" ? "expense" : "fee",
    claim: null,
    added: true,
  });
  persist();
  return true;
}

export function removeTask(id) {
  const before = state.tasks.length;
  state.tasks = state.tasks.filter((t) => t.id !== id);
  if (state.tasks.length === before) return false;
  persist();
  return true;
}

export function reset() {
  state = { rates: { ...DEFAULT_RATES }, tasks: seed(), updatedAt: Date.now() };
  persist();
}

export function replaceState(next) {
  if (!next || !Array.isArray(next.tasks) || !next.rates) return false;
  state = { rates: { ...DEFAULT_RATES, ...next.rates }, tasks: next.tasks, updatedAt: Date.now() };
  persist();
  return true;
}
