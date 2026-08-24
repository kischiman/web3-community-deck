# Web3 · Community & Social Resilience

A five-slide, semi-interactive client presentation with a phone companion app. Runs entirely on
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
| **Slide 5 table** | Generated with web search, so examples are real and current | A curated library of 14 common bottlenecks (`lib/library.js`) |

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
is on for slide 5 in all three: Google Search grounding, the OpenAI web-search tool, or Anthropic's.

The startup banner tells you which provider is live, so you can confirm before a session.

## Driving it

| | |
|---|---|
| Big screen | `←` `→` to move, `1`–`5` to jump, or the top nav |
| Phone | `←` `→` at the bottom moves the big screen too |
| Slide 1 | Click a region of the map (or a legend card) to highlight it |
| Slide 5 | Type on the phone → appears on screen · drag rows on screen, or `↑`/`↓` on the phone, to prioritise · **Generate solutions** from either surface |

## Where to edit

| What | Where |
|---|---|
| Slides 1–4 copy | `public/index.html` — search `PLACEHOLDER` |
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
| 1 · goals, hypotheses, three neighbourhoods | *Research Proposal: Digital Technologies for Community-Building and Social Resilience* (NUS) |
| 4 · process | The same proposal, following the **green-annotated revisions** on its Phase 1 and Phase 2 pages |
| 4 · Argentina | *Participatory Unblocking of Blockchain Use Cases* — Cossar, Björna & Shimony, BlockchainGov |
| 4 · Australia | *Policy experiments and the digital divide*, Ch. 16 — Ellie Rennie |

## Images

| Asset | Source |
|---|---|
| `argentina-residency.jpg` | Extracted from the BlockchainGov PDF (p. 13) |
| `central-australia.jpg` | Wikimedia Commons, *Desert Tracks Central Australia*, CC BY-SA 3.0 |
| `bored-ape.png` | BAYC #0 via IPFS — Yuga Labs released the BAYC artwork under CC0 in 2024 |
| `ethereum/tether/zcash/discord.svg` | Simple Icons (CC0 icon data; marks remain the trademarks of their owners) |
| `usdc.svg`, `dao.svg` | Drawn for this deck |
| `hypercerts.png` | hypercerts.org site icon |
| `img/ex/*` | Site icons for 29 of the 51 example domains in the library, fetched once so slide 5 works offline. Missing ones fall back to the live site icon, then to no icon. |

## Still open

- **Slide 2** — "Gitcoin" assumed for the reputation example. Correct if another project was meant.
- **Slide 1** — the map is stylised, and the three areas are placed illustratively. Swap in the real
  planning district once the neighbourhoods are chosen.
