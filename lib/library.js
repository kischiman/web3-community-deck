// Curated offline fallback for slide 5.
//
// Used when there's no ANTHROPIC_API_KEY, or when the live call fails mid-talk.
// Keyword-matched against whatever the room says, so the table is never empty.
// Each theme answers the same two questions the live call answers:
//   web3 — what only works, or works markedly better, with Web3 primitives
//   web2 — what already worked without a chain, and is often the honest first move

export const THEMES = [
  {
    id: "funding",
    label: "Funding & resourcing",
    keys: ["fund", "money", "grant", "budget", "capital", "donat", "sponsor", "revenue", "resourc", "treasury"],
    web3: {
      solution:
        "Quadratic / retroactive funding rounds: the crowd signals what matters, a matching pool amplifies breadth of support rather than size of cheque. Payouts are on-chain and legible to everyone who contributed.",
      examples: [
        { name: "Gitcoin Grants", note: "Quadratic funding rounds; >$60M distributed to public goods", url: "https://www.gitcoin.co/" },
        { name: "Optimism RetroPGF", note: "Pays for impact after it has been demonstrated, not for promises", url: "https://retrofunding.optimism.io/" },
      ],
    },
    web2: {
      solution:
        "Participatory budgeting and matched community funds. Same mechanic — distributed signal, pooled match — administered by a trusted institution instead of a contract.",
      examples: [
        { name: "Participatory budgeting, Porto Alegre", note: "Residents allocate a slice of the municipal budget directly", url: "https://en.wikipedia.org/wiki/Participatory_budgeting" },
        { name: "Open Collective", note: "Transparent group budgets with public ledgers, no chain required", url: "https://opencollective.com/" },
      ],
    },
  },
  {
    id: "trust",
    label: "Trust & legitimacy",
    keys: ["trust", "scam", "credib", "legitim", "sceptic", "skeptic", "suspicio", "reputation risk", "brand"],
    web3: {
      solution:
        "Verifiable receipts: commitments, spending and decisions written where nobody can quietly revise them. Trust shifts from 'believe the org' to 'check the record yourself'.",
      examples: [
        { name: "Hypercerts", note: "Impact claims issued as verifiable, transferable certificates", url: "https://hypercerts.org/" },
        { name: "Safe multisig", note: "Shared treasuries where every movement is public and co-signed", url: "https://safe.global/" },
      ],
    },
    web2: {
      solution:
        "Radical transparency by convention: open books, published minutes, third-party audit. Slower to verify, but it demands nothing new of the member.",
      examples: [
        { name: "Buffer's open salaries & revenue", note: "Trust built by publishing the uncomfortable numbers", url: "https://buffer.com/open" },
        { name: "GuideStar / Candid transparency seals", note: "Independent verification of nonprofit reporting", url: "https://www.guidestar.org/" },
      ],
    },
  },
  {
    id: "onboarding",
    label: "Onboarding & education",
    keys: ["onboard", "educat", "learn", "confus", "complex", "jargon", "wallet", "understand", "literacy", "training", "newcomer", "beginner"],
    web3: {
      solution:
        "Account abstraction and embedded wallets remove seed phrases and gas from first contact — someone joins with an email and only meets the chain later, if ever.",
      examples: [
        { name: "Coinbase Smart Wallet / ERC-4337", note: "Passkey login, sponsored gas, no seed phrase", url: "https://www.coinbase.com/wallet/smart-wallet" },
        { name: "Base Onchain Summer", note: "Learn-by-doing onboarding built around low-stakes minting", url: "https://www.base.org/" },
      ],
    },
    web2: {
      solution:
        "Progressive disclosure and a human first contact: a buddy, a 20-minute call, one obvious first task. Nothing about this is Web3-specific, and it out-performs documentation almost every time.",
      examples: [
        { name: "Duolingo streaks & scaffolding", note: "Competence built in small graded steps", url: "https://www.duolingo.com/" },
        { name: "Wikipedia Teahouse", note: "A staffed, low-stakes room for new contributors' first questions", url: "https://en.wikipedia.org/wiki/Wikipedia:Teahouse" },
      ],
    },
  },
  {
    id: "governance",
    label: "Decision-making & governance",
    keys: ["govern", "decision", "decid", "vote", "voting", "consensus", "power", "authority", "bureaucra", "politic", "stuck in meetings", "hierarch"],
    web3: {
      solution:
        "On-chain proposal → vote → automatic execution, so an approved decision cannot quietly fail to happen. Delegation lets people lend voice without attending everything.",
      examples: [
        { name: "Snapshot", note: "Gasless off-chain voting used by most DAOs", url: "https://snapshot.org/" },
        { name: "Optimism Citizens' House", note: "Two-house governance separating token power from citizen power", url: "https://community.optimism.io/citizens-house/citizens-house-overview" },
      ],
    },
    web2: {
      solution:
        "Sociocracy / consent-based circles: clear domains, delegates between circles, objections resolved rather than out-voted. Handles nuance far better than a token vote.",
      examples: [
        { name: "Sociocracy 3.0", note: "Open pattern library for consent-based governance", url: "https://sociocracy30.org/" },
        { name: "Loomio", note: "Async proposal-and-consent tooling for co-ops and councils", url: "https://www.loomio.com/" },
      ],
    },
  },
  {
    id: "participation",
    label: "Participation & engagement",
    keys: ["engag", "participat", "apath", "silent", "lurk", "turnout", "attend", "show up", "shows up", "showing up", "turn up", "meeting", "motivat", "activ", "inactive", "dormant", "nobody", "no one"],
    web3: {
      solution:
        "Contribution becomes a durable asset: attendance, work and vouching mint a token that persists across contexts, so effort compounds instead of evaporating when the channel goes quiet.",
      examples: [
        { name: "POAP", note: "Proof-of-attendance badges; a portable record of showing up", url: "https://poap.xyz/" },
        { name: "SourceCred / Coordinape", note: "Peer-allocated recognition for contribution", url: "https://coordinape.com/" },
      ],
    },
    web2: {
      solution:
        "Ritual and role: a fixed weekly rhythm, named responsibilities, and public thanks. Cheap, immediate, and the strongest predictor of a community staying alive.",
      examples: [
        { name: "Parkrun", note: "Same time, same place, every week — volunteer roles rotate", url: "https://www.parkrun.com/" },
        { name: "Stack Overflow reputation", note: "Visible standing earned by useful contribution", url: "https://stackoverflow.com/help/whats-reputation" },
      ],
    },
  },
  {
    id: "identity",
    label: "Identity & reputation",
    keys: ["identit", "reputation", "credential", "verif", "sybil", "bot", "fake", "who is", "proof", "kyc", "anonym"],
    web3: {
      solution:
        "Portable, user-held credentials: reputation earned in one community travels to the next without asking the first for permission, and can be proven without exposing the underlying data.",
      examples: [
        { name: "Ethereum Attestation Service", note: "Open infrastructure for signed, portable attestations", url: "https://attest.org/" },
        { name: "Gitcoin Passport", note: "Sybil resistance from a stack of independent credentials", url: "https://passport.gitcoin.co/" },
      ],
    },
    web2: {
      solution:
        "Vouching and federated verification: an existing member sponsors a newcomer, or an institution confirms a fact. Well-understood, legally clear, no key management.",
      examples: [
        { name: "Couchsurfing / BeWelcome vouching", note: "Trust conferred by people who already hold it", url: "https://www.bewelcome.org/" },
        { name: "OpenBadges (1EdTech)", note: "Portable verified credentials without a chain", url: "https://openbadges.org/" },
      ],
    },
  },
  {
    id: "coordination",
    label: "Coordination across groups",
    keys: ["coordinat", "silo", "align", "collaborat", "partner", "fragment", "duplicat", "across organ", "stakeholder", "agenc"],
    web3: {
      solution:
        "A shared treasury and shared rules that no single partner administers — the neutral ground several organisations can commit to without one of them becoming the host.",
      examples: [
        { name: "MolochDAO / minimal grant DAOs", note: "Pooled funds with ragequit — you can always exit with your share", url: "https://molochdao.com/" },
        { name: "Metagov", note: "Research collective building shared governance infrastructure", url: "https://metagov.org/" },
      ],
    },
    web2: {
      solution:
        "Collective impact: a backbone organisation, a shared measurement system, and a standing table. Boring, staffed, and repeatedly effective at city scale.",
      examples: [
        { name: "Collective Impact (Kania & Kramer)", note: "The five-condition model used across civic coalitions", url: "https://ssir.org/articles/entry/collective_impact" },
        { name: "Strive Partnership, Cincinnati", note: "Cross-sector coalition around shared indicators", url: "https://www.strivetogether.org/" },
      ],
    },
  },
  {
    id: "retention",
    label: "Burnout & retention",
    keys: ["burnout", "burn out", "retent", "churn", "volunteer", "tired", "overload", "same people", "exhaust", "capacity", "unpaid"],
    web3: {
      solution:
        "Streaming payments and automated splits: contributors are paid continuously and by rule, so compensation stops depending on someone remembering to raise an invoice.",
      examples: [
        { name: "Superfluid", note: "Money streamed by the second under a contract", url: "https://www.superfluid.finance/" },
        { name: "0xSplits", note: "Revenue automatically divided among contributors at source", url: "https://splits.org/" },
      ],
    },
    web2: {
      solution:
        "Term limits, rotation and explicit succession. Design the exit before the burnout: every role has an end date and a named understudy.",
      examples: [
        { name: "Debian project leader term", note: "Annual election, hard rotation of the top role", url: "https://www.debian.org/devel/leader" },
        { name: "Rotating chair in co-ops", note: "Facilitation rotates so no one person carries the load", url: "https://www.uk.coop/" },
      ],
    },
  },
  {
    id: "transparency",
    label: "Transparency & accountability",
    keys: ["transparen", "accountab", "audit", "where did the money", "report", "opaque", "black box", "corrupt", "misuse"],
    web3: {
      solution:
        "The ledger is the report. Spending, votes and disbursements are queryable in real time by anyone, which collapses the reporting lag from quarterly to instant.",
      examples: [
        { name: "Safe + Dune dashboards", note: "Live public views of a community treasury", url: "https://dune.com/" },
        { name: "Giveth", note: "Traceable donations from giver to project", url: "https://giveth.io/" },
      ],
    },
    web2: {
      solution:
        "Open finance dashboards and published minutes. Same accountability, achieved by policy rather than cryptography — and readable by people who will never open a block explorer.",
      examples: [
        { name: "Open Collective public ledgers", note: "Every expense and receipt visible by default", url: "https://opencollective.com/" },
        { name: "IATI standard", note: "Common open format for aid and grant reporting", url: "https://iatistandard.org/" },
      ],
    },
  },
  {
    id: "privacy",
    label: "Privacy & data ownership",
    keys: ["privac", "data", "surveil", "gdpr", "pdpa", "consent", "sensitive", "confidential", "personal information", "own their"],
    web3: {
      solution:
        "Prove without revealing: zero-knowledge proofs let someone demonstrate eligibility — resident, over 18, previously vetted — without the community ever holding the underlying document.",
      examples: [
        { name: "Semaphore", note: "Anonymous signalling and membership proofs", url: "https://semaphore.pse.dev/" },
        { name: "MACI", note: "Collusion-resistant voting that hides individual ballots", url: "https://maci.pse.dev/" },
      ],
    },
    web2: {
      solution:
        "Data minimisation: don't collect it. Verify at the door, store a boolean, delete the evidence. The cheapest privacy technology remains the decision not to hold the data.",
      examples: [
        { name: "Singapore PDPA guidance", note: "Purpose limitation and minimisation as statutory defaults", url: "https://www.pdpc.gov.sg/" },
        { name: "Signal's data model", note: "A service that keeps almost nothing about its users", url: "https://signal.org/bigbrother/" },
      ],
    },
  },
  {
    id: "measurement",
    label: "Measuring impact",
    keys: ["measur", "impact", "metric", "kpi", "evidence", "outcome", "prove that", "evaluat", "roi", "success look"],
    web3: {
      solution:
        "Impact certificates make outcomes tradeable and fundable after the fact — an audit trail of who did what, which later funders can buy into rather than re-verify.",
      examples: [
        { name: "Hypercerts", note: "Standard for claiming and transferring impact", url: "https://hypercerts.org/" },
        { name: "Optimism RetroPGF", note: "Retroactive payment as a measurement mechanism", url: "https://retrofunding.optimism.io/" },
      ],
    },
    web2: {
      solution:
        "Contribution analysis and a shared indicator set agreed before the work starts. Qualitative evidence, honestly gathered, beats a precise number nobody believes.",
      examples: [
        { name: "Theory of Change", note: "Explicit causal chain agreed with stakeholders up front", url: "https://www.theoryofchange.org/" },
        { name: "Most Significant Change", note: "Systematic collection of participant-selected stories", url: "https://www.betterevaluation.org/methods-approaches/approaches/most-significant-change" },
      ],
    },
  },
  {
    id: "moderation",
    label: "Moderation & conflict",
    keys: ["moderat", "conflict", "toxic", "harass", "spam", "dispute", "safe", "abuse", "troll", "disagree"],
    web3: {
      solution:
        "Explicit, appealable dispute resolution with staked jurors — the rules and the outcomes are public, so moderation stops looking arbitrary.",
      examples: [
        { name: "Kleros", note: "Decentralised arbitration with economic incentives for honest jurors", url: "https://kleros.io/" },
        { name: "Token-curated registries", note: "Community-maintained allow/deny lists with skin in the game", url: "https://ethereum.org/" },
      ],
    },
    web2: {
      solution:
        "A published code of conduct, a named enforcement team, and a documented appeal path. Restorative rather than punitive where possible.",
      examples: [
        { name: "Contributor Covenant", note: "The most widely adopted CoC template", url: "https://www.contributor-covenant.org/" },
        { name: "Restorative circles", note: "Facilitated repair instead of expulsion-by-default", url: "https://www.iirp.edu/" },
      ],
    },
  },
  {
    id: "gating",
    label: "Membership & access",
    keys: ["member", "gate", "access", "exclusiv", "who can join", "invite", "tier", "subscription", "belong"],
    web3: {
      solution:
        "Token-gated access that the member actually holds: they can carry membership between platforms, and losing your Discord doesn't lose the community.",
      examples: [
        { name: "Unlock Protocol", note: "Memberships as NFTs, portable across apps", url: "https://unlock-protocol.com/" },
        { name: "Guild.xyz", note: "Role and access management driven by on-chain credentials", url: "https://guild.xyz/" },
      ],
    },
    web2: {
      solution:
        "Invitation with a sponsor, plus a visible member directory. Access controlled by relationship rather than by asset — usually warmer and easier to appeal.",
      examples: [
        { name: "Lobste.rs invite tree", note: "Public invitation graph; sponsors carry responsibility", url: "https://lobste.rs/" },
        { name: "Community co-op membership", note: "Share purchase plus a member register", url: "https://www.uk.coop/" },
      ],
    },
  },
  {
    id: "resilience",
    label: "Resilience & continuity",
    keys: ["resilien", "crisis", "disaster", "emergency", "continuity", "shock", "mutual aid", "depend on one", "single point", "shut down"],
    web3: {
      solution:
        "No single operator to switch off: membership, funds and rules survive the failure of any one organiser, platform or venue because the state isn't held by any of them.",
      examples: [
        { name: "Grassroots Economics (Sarafu)", note: "Community currencies sustaining trade where cash is scarce", url: "https://www.grassrootseconomics.org/" },
        { name: "Circles UBI", note: "Trust-graph currency issued by people, not an institution", url: "https://aboutcircles.com/" },
      ],
    },
    web2: {
      solution:
        "Redundant relationships and offline fallbacks: phone trees, printed lists, two people who know how to do everything. Mutual aid networks scaled fast in 2020 on exactly this.",
      examples: [
        { name: "Mutual Aid UK networks", note: "Street-level WhatsApp groups with paper backup", url: "https://mutualaid.wiki/" },
        { name: "Time banks", note: "Hour-for-hour exchange building reciprocal obligation", url: "https://timebanks.org/" },
      ],
    },
  },
];

const GENERIC = {
  id: "generic",
  label: "General",
  web3: {
    solution:
      "Make the shared thing legible and jointly owned: put the record, the money or the membership somewhere no single participant controls, so cooperation doesn't depend on trusting the convenor.",
    examples: [
      { name: "Safe multisig", note: "Shared control of a common pot", url: "https://safe.global/" },
      { name: "Snapshot", note: "Lightweight, verifiable collective decisions", url: "https://snapshot.org/" },
    ],
  },
  web2: {
    solution:
      "Start with the social protocol, not the platform: name the decision rights, the rhythm, and who is accountable. Most community failures are structural, not technical.",
    examples: [
      { name: "Ostrom's design principles", note: "Eight empirically-derived rules for durable commons", url: "https://en.wikipedia.org/wiki/Elinor_Ostrom#Design_principles_for_Common_Pool_Resource_(CPR)_institution" },
      { name: "Sociocracy 3.0", note: "Patterns for structure without hierarchy", url: "https://sociocracy30.org/" },
    ],
  },
};

export function matchTheme(text) {
  const lower = text.toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const theme of THEMES) {
    const score = theme.keys.reduce((n, key) => (lower.includes(key) ? n + key.length : n), 0);
    if (score > bestScore) {
      bestScore = score;
      best = theme;
    }
  }
  return best || GENERIC;
}

export function libraryRows(bottlenecks) {
  return bottlenecks.map((text) => {
    const theme = matchTheme(text);
    return { bottleneck: text, theme: theme.label, web3: theme.web3, web2: theme.web2 };
  });
}
