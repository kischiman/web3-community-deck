# Web3 · Community & Social Resilience

A four-slide, semi-interactive client proposal with a phone capture companion. Several people
can be on it at once from anywhere, each browsing on their own. Runs entirely on
your machine — no hosting, no accounts, no build step.

## Run it

```bash
cd presentation
npm install
npm start
```

```
Big screen   http://localhost:4400
Phone        http://<your-lan-ip>:4400/m     ← printed on start, and shown in the deck's top bar
```

The phone must be on the same Wi-Fi. Change the port with `PORT=5000 npm start`.

## Live features

Two things call a model. Both work without one — they just aren't live.

| Feature | With a key | Without |
|---|---|---|
| **Ask this document** (nav bar) | Answers your question from the deck's own text | Shows the matching passages, click to jump |
| **Slide 4 table** | Generated with web search, so examples are real and current | A curated library of 14 common bottlenecks (`lib/library.js`) |

**Nothing ever shows an error in front of a client** — if a call fails mid-talk, it falls back
silently and a footnote says which source produced what you're looking at.

```bash
cp .env.example .env      # then paste your key into .env
npm run models            # optional: see which model ids your key can use
npm start
```

Works with **Gemini**, **OpenAI** or **Anthropic** — set whichever key you have and the provider
layer in `lib/llm.js` picks it up. First one found wins, in that order. Defaults are
`gemini-2.5-flash`, `gpt-5.5` and `claude-opus-5`, each overridable (`GEMINI_MODEL=…`). Web search
is on for slide 4 in all three: Google Search grounding, the OpenAI web-search tool, or Anthropic's.

The startup banner tells you which provider is live, so you can confirm before a session.

## Where it can run

| | Deck | Phone companion | Live model calls |
|---|---|---|---|
| **Local** (`npm start`) | ✅ | ✅ same Wi-Fi | ✅ |
| **Deployed** (below) | ✅ | ✅ anywhere | ✅ |
| **GitHub Pages** (`docs/index.html`) | ✅ | ❌ no server | ❌ offline fallbacks |

The Pages copy carries `noindex`: the link works for anyone who has it, search engines
leave it alone.

The deck's budget slide frames the admin panel, which needs a server and `ADMIN_PASSWORD`:
both static builds drop the slide, and the process steps fall back to the plain list in the markup.
The public propose-yourself board stays at `/budget`.

Everyone browses independently — opening a slide moves nobody else's screen. What *is*
shared is the content: budget lines and proposals, and the bottlenecks captured on
slide 4. Those arrive live on every open device over SSE, which static hosting cannot
provide, so the Pages build is the deck alone.

The phone companion is for adding to slide 4 from a phone while you read the deck on
something larger. It is no longer a remote: there is no screen to drive.

## Deploying

Both configs are in the repo. **Never commit the key** — set it in the host's dashboard.

**Render** (no card needed): dashboard → New → Blueprint → pick this repo. `render.yaml`
does the rest; then add `GEMINI_API_KEY` under the service's Environment tab.

**Fly.io** (container, `Dockerfile` + `fly.toml`):

```bash
fly auth login
fly launch --copy-config --no-deploy
fly secrets import < .env     # sets the key without printing it
fly deploy
```

Once deployed, the address shown in the deck's top bar becomes the public URL, so the phone
can join from any network. Free tiers sleep when idle — set `min_machines_running = 1`
before a live session so the first request isn't a cold start.

## Driving it

| | |
|---|---|
| Any device | `←` `→` to move, `1`–`4` to jump, or the top nav — your own view only |
| Any slide | Has its own address — `#/proposal`, `#/process`, `#/process/argentina`, `#/budget`. Opening one lands you there without moving the presenter's screen; after that you follow along as usual. |
| Phone (`/m`) | Capture bottlenecks and reorder them; they appear for everyone |
| Slide 1 | Click a region of the map (or a legend card) to highlight it |
| Slide 4 | Type on the phone → appears on screen · drag rows on screen, or `↑`/`↓` on the phone, to prioritise · **Generate solutions** from either surface |

## Where to edit

| What | Where |
|---|---|
| Slides 1–4 copy | `public/index.html` — search `PLACEHOLDER` |
| Research-process steps | `public/index.html` slide 2 — each step is also a line in `lib/budget-store.js`, so change both together |
| Budget lines, dialogs | `public/budget-core.js` — shared by `/budget` and the deck's process slide |
| Add-task button | On the process slide it asks which budget phase, since the deck's Phase 2 covers three of them; tasks added there are marked `fromProcess` so they show up in both places |
| Budget shape | The process steps are the board: on first boot after this change, every other fee line is folded into a per-phase **Delivery** line by `foldIntoProcess` in `lib/budget-store.js`. Expenses are untouched, phase totals are unchanged, and proposals move onto the folded line. It runs once and records that it has. |
| Line order | Drag lines in the admin panel; the order is stored and the process slide renders in it. A line only moves within its own budget phase. |
| Private notes | Each line has a `memo`, edited in the admin panel only. `publicView` names the fields it exposes, so a memo cannot reach `/budget`, the process slide or the static builds. |
| Dividers | `+ Add divider` in a phase makes a marker rather than a line of work: it carries a span, never a price, is excluded from every total, and shows on the process page to delineate a stretch mid-phase. |
| Work / expense | A switcher on every line in the admin panel. Expenses stay on the budget sheet; work also appears on the process page. It is a decision now, not derived from the unit, and editing a line no longer overrules it. |
| Slide list | `public/index.html` **and** `DECK` in `server.js` — the phone reads its labels from the server, so both must agree |
| Budget styling | `public/budget.css`; then re-run `node build-budget-embed.mjs` so the deck's scoped copy keeps up |
| The Singapore map | `public/index.html`, the `<svg>` on slide 1 (stylised — swap for real geography) |
| Look and feel | `public/deck.css`, tokens at the top |
| Model provider / model id | `lib/llm.js` |
| Generation prompt | `lib/generate.js` → `SYSTEM` |
| Ask-the-document prompt | `lib/ask.js` → `SYSTEM` |
| Offline fallback content | `lib/library.js` |

## Sources

Slides 1 and 4 are drawn from three documents:

| Slide | Source |
|---|---|
| 1 · goals, hypotheses, the neighbourhoods | *Research Proposal: Digital Technologies for Community-Building and Social Resilience* (NUS) |
| 2 · process | The same proposal, following the **green-annotated revisions** on its Phase 1 and Phase 2 pages |
| 2 · Argentina | *Participatory Unblocking of Blockchain Use Cases* — Cossar, Björna & Shimony, BlockchainGov |
| 2 · Australia | *Policy experiments and the digital divide*, Ch. 16 — Ellie Rennie |

## Images

| Asset | Source |
|---|---|
| `argentina-residency.jpg` | Extracted from the BlockchainGov PDF (p. 13) |
| `central-australia.jpg` | Wikimedia Commons, *Desert Tracks Central Australia*, CC BY-SA 3.0 |
| `bored-ape.png` | BAYC #0 via IPFS — Yuga Labs released the BAYC artwork under CC0 in 2024 |
| `ethereum/tether/zcash/discord.svg` | Simple Icons (CC0 icon data; marks remain the trademarks of their owners) |
| `usdc.svg`, `dao.svg` | Drawn for this deck |
| `hypercerts.png` | hypercerts.org site icon |
| `img/ex/*` | Site icons for 29 of the 51 example domains in the library, fetched once so slide 4 works offline. Missing ones fall back to the live site icon, then to no icon. |

## Still open

- **Slide 2** — "Gitcoin" assumed for the reputation example. Correct if another project was meant.
- **Slide 1** — the map is stylised, and the three areas are placed illustratively. Swap in the real
  planning district once the neighbourhoods are chosen.
