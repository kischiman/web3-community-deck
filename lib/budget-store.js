// Shared state for the budget model.
//
// Two audiences. The public dashboard lets collaborators propose themselves for lines —
// quantity, unit, rate. The admin panel is the only place the base rate card exists, and
// the only place proposals get accepted onto the project.
//
// State is in memory and mirrored to JSON so a restart doesn't lose the day's work.
// Free hosting has an ephemeral disk, so Export is the real backup.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
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

export const UNITS = ["days", "weeks", "months", "sessions", "fixed"];

const DAYS_PER_MONTH = 21;

function seed() {
  // `role` survives only to seed a starting rate; from then on the line owns its
  // own figure and roles play no part in what anything costs.
  const t = (phase, name, note, qty, role, unit, kind) => ({
    id: `${phase}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 28)}`,
    phase, name, note, qty, unit,
    rate: role === "fixed" ? null : DEFAULT_RATES[role] ?? 0,
    kind: kind || "fee",
    proposals: [],
    assigned: null,
    prefill: false,
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

const fresh = () => ({
  rates: { ...DEFAULT_RATES },
  settings: {},
  tasks: seed(),
  updatedAt: Date.now(),
});

let state = load();

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
    if (Array.isArray(raw.tasks) && raw.rates) {
      raw.settings = raw.settings || {};
      // the prefill switch used to be global; carry it onto each task
      const wasGlobal = raw.settings.prefillRates === true;
      delete raw.settings.prefillRates;
      for (const t of raw.tasks) {
        if (typeof t.prefill !== "boolean") t.prefill = wasGlobal;
      }
      // lines used to derive their cost from a role; give each one its own rate
      for (const t of raw.tasks) {
        if (typeof t.rate !== "number" && t.rate !== null) {
          t.rate = t.role === "fixed" ? null : raw.rates?.[t.role] ?? 0;
        }
        if (t.role === "fixed") t.unit = "fixed";
        delete t.role;
      }

      // migrate the earlier single-claim shape
      for (const t of raw.tasks) {
        if (!Array.isArray(t.proposals)) {
          t.proposals = t.claim
            ? [{ id: "m" + Math.random().toString(36).slice(2, 8), name: t.claim.name, qty: t.qty, unit: t.unit, rate: t.rateOverride || null, notes: t.claim.notes, at: t.claim.at }]
            : [];
          t.assigned = null;
          delete t.claim;
          delete t.rateOverride;
        }
      }
      return raw;
    }
  } catch {
    // no file yet — start from the seed
  }
  return fresh();
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
export const isAdminEnabled = () => Boolean(process.env.ADMIN_PASSWORD);

const proposalOf = (t) => t.proposals.find((p) => p.id === t.assigned) || null;

/** The admin's own estimate for a line: a fixed sum, or quantity x rate. */
export function baseAmount(task) {
  if (task.unit === "fixed") return Number(task.qty) || 0;
  return (Number(task.qty) || 0) * (Number(task.rate) || 0);
}

/** What the line costs once someone is on it; falls back to the base estimate. */
export function effectiveAmount(task) {
  const p = proposalOf(task);
  if (!p) return baseAmount(task);
  if (p.unit === "fixed" || !p.rate) return Number(p.rate || p.qty) || 0;
  return (Number(p.qty) || 0) * (Number(p.rate) || 0);
}

export function proposalAmount(p) {
  if (p.unit === "fixed" || !p.rate) return Number(p.rate || p.qty) || 0;
  return (Number(p.qty) || 0) * (Number(p.rate) || 0);
}

export function totals(useEffective = true) {
  const { rates, tasks } = state;
  const amount = useEffective ? effectiveAmount : baseAmount;
  const byPhase = Object.fromEntries(PHASES.map((p) => [p.id, 0]));
  for (const t of tasks) byPhase[t.phase] += amount(t);
  const net = Object.values(byPhase).reduce((a, b) => a + b, 0);
  const contingency = net * ((Number(rates.contingency) || 0) / 100);
  return { byPhase, net, contingency, total: net + contingency };
}

/** What the public dashboard is allowed to see. */
export function publicView() {
  return {
    phases: PHASES,
    units: UNITS,
    // The rate card never crosses this line as a whole. A base rate travels only
    // for the individual lines marked prefill, and only as that line's suggestion.
    // The contingency percentage is a project markup, not anyone's day rate, so it
    // travels either way.
    contingency: Number(state.rates.contingency) || 0,
    rates: null,
    tasks: state.tasks.map((t) => ({
      id: t.id,
      phase: t.phase,
      name: t.name,
      note: t.note,
      unit: t.unit,
      kind: t.kind,
      added: t.added,
      suggestedQty: t.prefill ? t.qty : null,
      suggestedRate: t.prefill && t.unit !== "fixed" ? t.rate || null : null,
      prefilled: !!t.prefill,
      proposals: t.proposals.map((p) => ({ ...p, amount: proposalAmount(p) })),
      assigned: t.assigned,
    })),
    updatedAt: state.updatedAt,
  };
}

export function adminView() {
  return {
    phases: PHASES,
    units: UNITS,
    rates: state.rates,
    settings: state.settings,
    tasks: state.tasks.map((t) => ({
      ...t,
      base: baseAmount(t),
      effective: effectiveAmount(t),
      proposals: t.proposals.map((p) => ({ ...p, amount: proposalAmount(p) })),
    })),
    totals: { effective: totals(true), base: totals(false) },
    people: people(),
    updatedAt: state.updatedAt,
  };
}

/** Everyone who has proposed, with what they're on and what it comes to. */
export function people() {
  const map = new Map();
  for (const t of state.tasks) {
    for (const p of t.proposals) {
      const key = p.name.toLowerCase();
      if (!map.has(key)) map.set(key, { name: p.name, proposed: 0, assigned: 0, lines: [] });
      const rec = map.get(key);
      const amt = proposalAmount(p);
      const isAssigned = t.assigned === p.id;
      rec.proposed += amt;
      if (isAssigned) rec.assigned += amt;
      rec.lines.push({ taskId: t.id, task: t.name, phase: t.phase, amount: amt, assigned: isAssigned });
    }
  }
  return [...map.values()].sort((a, b) => b.assigned - a.assigned || b.proposed - a.proposed);
}

// ---------------------------------------------------------------- writes

export function setRate(key, value) {
  if (!(key in state.rates)) return false;
  state.rates[key] = Number(value) || 0;
  persist();
  return true;
}

/** Whether this line's base rate is offered as a suggestion on the public board. */
export function setPrefill(id, value) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return false;
  task.prefill = Boolean(value);
  persist();
  return true;
}

/** Same decision across every line at once — 31 checkboxes is not a workflow. */
export function setPrefillAll(value) {
  for (const t of state.tasks) t.prefill = Boolean(value);
  persist();
  return true;
}

/** Add or replace this person's proposal on a line. One proposal per name per line. */
export function propose(id, { name, qty, unit, rate, notes }) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return false;

  const clean = String(name || "").trim().slice(0, 60);
  if (!clean) return false;

  const proposal = {
    id: "p" + crypto.randomBytes(4).toString("hex"),
    name: clean,
    qty: Number(qty) || 0,
    unit: UNITS.includes(unit) ? unit : task.unit || "days",
    rate: Number(rate) || null,
    notes: String(notes || "").trim().slice(0, 600),
    at: Date.now(),
  };

  const existing = task.proposals.findIndex((p) => p.name.toLowerCase() === clean.toLowerCase());
  if (existing >= 0) {
    proposal.id = task.proposals[existing].id; // keep the id so an assignment survives an edit
    task.proposals[existing] = proposal;
  } else {
    task.proposals.push(proposal);
  }

  persist();
  return true;
}

export function withdraw(id, proposalId) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return false;
  const before = task.proposals.length;
  task.proposals = task.proposals.filter((p) => p.id !== proposalId);
  if (task.assigned === proposalId) task.assigned = null;
  if (task.proposals.length === before) return false;
  persist();
  return true;
}

/** Admin: put someone on the line, or take them off. */
export function assign(id, proposalId) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return false;
  if (proposalId && !task.proposals.some((p) => p.id === proposalId)) return false;
  task.assigned = proposalId || null;
  persist();
  return true;
}

/** Admin edits the line itself: what it is, how much of it, and at what rate. */
export function updateTask(id, { name, note, qty, unit, rate }) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return false;

  if (name !== undefined) {
    const clean = String(name).trim().slice(0, 90);
    if (!clean) return false;
    task.name = clean;
  }
  if (note !== undefined) task.note = String(note).trim().slice(0, 300);
  if (unit !== undefined && UNITS.includes(unit)) task.unit = unit;
  if (qty !== undefined && qty !== "") task.qty = Number(qty) || 0;
  if (rate !== undefined) task.rate = Number(rate) || 0;

  // A fixed line's amount lives in qty; leaving a rate behind would quietly
  // reappear if the unit were ever switched back.
  if (task.unit === "fixed") task.rate = null;
  task.kind = task.unit === "fixed" ? "expense" : task.kind;

  persist();
  return true;
}

export function addTask({ phase, name, note, qty, unit, rate }) {
  if (!PHASES.some((p) => p.id === phase)) return false;
  const clean = String(name || "").trim().slice(0, 90);
  if (!clean) return false;

  state.tasks.push({
    id: `${phase}-${Date.now().toString(36)}`,
    phase,
    name: clean,
    note: String(note || "").trim().slice(0, 300),
    qty: Number(qty) || 0,
    unit: UNITS.includes(unit) ? unit : "days",
    rate: unit === "fixed" ? null : Number(rate) || 0,
    kind: unit === "fixed" ? "expense" : "fee",
    proposals: [],
    assigned: null,
    prefill: false,
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
  state = fresh();
  persist();
}

export function replaceState(next) {
  if (!next || !Array.isArray(next.tasks) || !next.rates) return false;
  state = {
    rates: { ...DEFAULT_RATES, ...next.rates },
    settings: { ...(next.settings || {}) },
    tasks: next.tasks,
    updatedAt: Date.now(),
  };
  persist();
  return true;
}
