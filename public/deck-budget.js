// The budget, mounted into the deck in two places.
//
//  · slide 2 — the work lines for each phase, steps first and the folded Delivery line
//    under them, each with its scope, whoever has proposed themselves, and the propose
//    button. Expenses stay on the budget sheet.
//  · slide 4 — the whole board
//
// Both come from budget-core.js, so a proposal made on either slide, on the phone, or
// on /budget shows up everywhere at once over the same live connection.
//
// Without a server there is no budget: the static artifact keeps the plain step list
// that is already in the markup, and this file never replaces it.

(function () {
  if (!window.Budget) return;

  const board = document.getElementById("deck-budget-board");
  const summary = document.getElementById("deck-budget-summary");
  const liveEl = document.getElementById("deck-budget-live");
  const stepHosts = [...document.querySelectorAll("[data-budget-phases]")];

  if (!board && !stepHosts.length) return;

  const { esc, money, lineHtml } = Budget;

  // ------------------------------------------------ slide 2 · the process steps

  function renderSteps(state) {
    for (const host of stepHosts) {
      const phases = host.dataset.budgetPhases.split(/\s+/);
      // The work for this phase: the steps, and the Delivery line the fold put the rest
      // of the effort into. Expenses are the budget sheet's business — an apartment or
      // a translation bill is not a step anyone carries out.
      const lines = state.tasks
        .filter((t) => phases.includes(t.phase) && t.kind !== "expense")
        // Steps read first; the folded and expense lines complete the picture under
        // them. Sort is stable, so each group keeps the board's own order.
        .sort((a, b) => (b.fromProcess ? 1 : 0) - (a.fromProcess ? 1 : 0));
      // No process lines for this phase yet — leave the static list alone rather than
      // replacing a readable fallback with an empty box.
      if (!lines.length) continue;
      host.innerHTML =
        lines.map(lineHtml).join("") +
        `<div class="plines-add">
          <button class="btn ghost small" data-add="${phases[0]}" data-add-choices="${phases.join(" ")}" data-add-process="1">
            + Add task
          </button>
        </div>`;
      host.classList.add("budget-scope", "plines-live");
    }
  }

  // ------------------------------------------------------- slide 4 · the board

  function renderBoard(state) {
    if (!board) return;

    board.innerHTML = state.phases
      .map((p) => {
        const tasks = state.tasks.filter((t) => t.phase === p.id);
        if (!tasks.length) return "";
        const open = tasks.filter((t) => !t.assigned).length;
        const proposed = tasks.reduce(
          (a, t) => a + t.proposals.reduce((b, x) => b + (t.assigned === x.id ? x.amount : 0), 0),
          0
        );
        return `<section class="phase">
          <header>
            <div>
              <h2>${esc(p.title)}</h2>
              <p class="note">${esc(p.note)}</p>
            </div>
            <span class="amount">${open} open${
              state.money && proposed ? ` · ${money(proposed)} committed` : ""
            }</span>
          </header>
          ${tasks.map(lineHtml).join("")}
        </section>`;
      })
      .join("");

    if (!summary) return;
    const all = state.tasks;
    const proposals = all.reduce((a, t) => a + t.proposals.length, 0);
    const staffed = all.filter((t) => t.assigned).length;
    const committed = all.reduce((a, t) => {
      const p = t.proposals.find((x) => x.id === t.assigned);
      return a + (p ? p.amount : 0);
    }, 0);

    const rows = `
      <div class="row"><span>Lines</span><span class="v">${all.length}</span></div>
      <div class="row"><span>Proposals submitted</span><span class="v">${proposals}</span></div>
      <div class="row"><span>Lines with someone on them</span><span class="v">${staffed}</span></div>`;

    summary.innerHTML = state.money
      ? `${rows}<div class="row total"><span>Committed so far</span><span class="v">${money(committed)}</span></div>`
      : rows;
  }

  Budget.onRender((state) => {
    renderSteps(state);
    renderBoard(state);
  });

  Budget.start({
    onStatus(kind, msg) {
      if (!liveEl) return;
      if (kind === "live") {
        liveEl.textContent = "live";
        liveEl.setAttribute("data-on", "true");
        return;
      }
      liveEl.removeAttribute("data-on");
      liveEl.textContent = kind === "error" ? msg : kind === "offline" ? "offline" : "reconnecting…";
    },
  });
})();
