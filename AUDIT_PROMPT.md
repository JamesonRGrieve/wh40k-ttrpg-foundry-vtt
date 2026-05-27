# Compendium Audit & Completion — Orchestrator Runbook

This file is a handoff prompt. Give it to an orchestrator agent that will
audit and complete the wh40k-rpg compendium packs against their source
PDFs, line by line, by fanning out Sonnet sub-agents.

The orchestrator **dispatches, tracks, registers packs, and consolidates**
— it does not do the page-by-page auditing itself. Sub-agents do the
reading and editing under a strict scope.

---

## 1. Paths & authorities

- **Work tree:** `/home/jameson/Documents/dh-campaign/.foundry-system`
- **Packs root:** `src/packs/`, per-line group dirs: `black-crusade`,
  `dark-heresy-1`, `dark-heresy-2`, `deathwatch`, `only-war`,
  `rogue-trader`.
- **Source PDFs:** `/home/jameson/Documents/pdfs/<line>/*.pdf` — each line
  has `core.pdf`, supplement PDFs, and `errata.pdf`.
- **Authoritative rules:** `src/packs/CLAUDE.md` — pack-naming taxonomy,
  schema, provenance, variantization, cost, homologation, errata-as-flag,
  book-slug registry. **Read it first and obey it literally.** Also read
  `.foundry-system/CLAUDE.md` (system-wide direction).
- **This run produces:** `PROBLEMS.md` (root) and `AUDIT-LOG.md` (root,
  the durable ledger) — see §10.

## 2. Working mode

- Sub-agents edit pack `_source/*.json` **in place in the main working
  tree** — no git worktrees.
- **Commit cadence (decide up front, default ON for unattended runs):**
  commit per book (or per line) on a working branch — e.g.
  `git commit --no-verify -m "audit: <line> <book>"`. A whole multi-line
  run as one giant uncommitted tree is fragile and unreviewable; periodic
  commits protect against loss and make review tractable. (The earlier
  "work in main, no commits" stance was for a short supervised burst —
  override it here.) Never push; never open PRs unless told.
- **3 concurrent sub-agents, rolling:** the moment one finishes, launch
  the next queued book so 3 are always in flight. Enforce **disjoint pack
  scopes** — no two concurrent agents may touch the same pack dir.
- **`system.json` is single-owner: ONLY the orchestrator edits it.**
  Sub-agents may create conforming new `_source/` pack dirs (gulp
  auto-discovers them) but never touch `system.json`; they report the
  declarations needed and you add them. This prevents concurrent-edit
  corruption of the manifest.
- **Shared-pack books are one agent.** A book whose content lands in packs
  shared with another book is handled by ONE agent given both PDFs (e.g.
  RT *Battlefleet Koronus* + *Koronus Bestiary* both live in
  `rt-koronus-*`).

## 3. Per-line sequence

1. **Audit/complete every BOOK pack** for the line (one agent per book;
   shared-pack books combined per §2).
2. **Only after all of a line's books are done, apply that line's
   `errata.pdf`** (see §9 errata template). Errata are **not books and not
   packs**: an applied erratum sets `errata: true` on the affected entity
   (corrected values in its normal type pack) and records the citation via
   the per-field `_source` override per CLAUDE.md. **Remove any
   `*-errata-*` packs entirely** (orchestrator-level migration; checkpoint
   first per §8).
3. Commit the line; write its summary to `AUDIT-LOG.md`; then start the
   next line.

Do one line fully (books → errata → commit) before the next. Consider
running a **small line first as a pilot** to validate the pipeline before
committing to the large cores.

## 4. Failure handling — three exit states, not one

- **Quota / usage / session limit** → sleep **5 minutes**, then **resume**
  that book (relaunch). Partial edits are saved; resumed agents
  re-inventory and complete idempotently. If a reset time is given and is
  far off, sleep until shortly after it rather than re-sleeping 5-minute
  cycles into a still-dead cap.
- **Stalled / crashed / watchdog timeout** (e.g. "no progress for 600s")
  → **relaunch immediately, no sleep.** This is not a quota event.
- **Completed with report** → **verify before accepting** (see §5).

## 5. Trust-but-verify every agent

Agents drift and under-deliver. After each one finishes:

- **Diff its output against its declared scope.** `git diff --stat` the
  changes; confirm **every touched path is inside that agent's pack
  glob**. Revert or flag any out-of-scope edit. (A failed agent in a prior
  run edited an unrelated line's `system.json` block — do not assume
  agents stay in their lane.)
- **Reconcile the report against the diff, and reject deferrals.** If a
  report says "deferred", "flagged for a later pass", "needs a separate
  accuracy review", or *flags* missing content instead of *creating* it —
  or shows far fewer changes than the book warrants — **re-dispatch that
  book.** "I'll do it later" is not done.
- **Spot-check 2–3 values against the rendered page images yourself** for
  any book that reports "page-citations only / no stat corrections" — that
  pattern usually means the agent trusted existing (often OCR-garbled)
  data instead of reading images.

## 6. Concurrency hygiene

- **Per-agent unique `/tmp` render prefixes** (slug-based) — 3 concurrent
  agents sharing `/tmp` will clobber each other's PNGs. Hard rule in the
  sub-agent prompt; agents clean up their PNGs when done.
- **Batch + validate registration after each agent**, not just per line.
  A pack dir can exist on disk before it's registered; a registration typo
  only surfaces at build. After each `system.json` edit: `JSON.parse` it,
  and run the on-disk↔manifest drift check (§11).

## 7. Data-integrity guards

- **`_id` uniqueness:** generated `_id`s must be checked for collision
  before assignment (a prior run produced two items sharing one `_id`).
- **`gameSystems` ↔ line coherence:** every file in a line's pack must tag
  that line; fix unambiguous wrong values (an OW pack had every file
  tagged `["rt"]`).
- **One Foundry `type` per pack** (per CLAUDE.md). Reference stubs resolve
  *before* the check; agents leave stubs as stubs (may fix a broken stub
  *target* path, never expand a stub to a full doc).
- **Homologation:** never fork a shared doc into a line copy — use the
  per-line variant container + a whole-file `reference` stub (CLAUDE.md
  *Homologation Model*). Reprinted cross-line content is recorded as that
  line's `source.<line>` on the canonical doc.

## 8. Durability & pre-flight

- **Checkpoint before destructive/structural phases.** Before errata-pack
  removal, homebrew moves, `daemonic-remnants` dissolution, or pack
  renames, make a git checkpoint (tag or branch commit) so the
  irreversible op is recoverable.
- **Pre-flight each line:** run `pdfinfo` on every PDF (log
  corrupt/unreadable ones to `PROBLEMS.md` and skip rather than burning an
  agent on them); build the book→PDF→pack map from existing
  `source.<line>.book` strings in the packs (grep them) to assign PDFs
  correctly and catch shared-pack cases.
- **Page-offset can shift between sections** (front matter, chapters,
  inserts) — the sub-agent prompt tells agents to re-confirm the
  printed↔PDF offset per region, not assume one constant.

## 9. Scale / partitioning

- **Split the core rulebooks across 2–3 sub-agents by disjoint category
  clusters** (e.g. actors / items-weapons+armour+ammo / origins+talents+
  traits+skills / journals+rolltables). Cores ran 250–360 tool calls in a
  single agent — at the edge where a mid-run quota death loses hours.
  Partitioning bounds the blast radius and fits context. Keep clusters on
  disjoint pack dirs so they can run concurrently.

## 10. Completeness, homebrew, PROBLEMS.md, ledger

- **Create, don't flag.** Any content present in the books but absent from
  the compendiums must be ADDED — items, actors, **and** journal /
  location / adventure / campaign / any other content class not currently
  rendered.
- **New content class with no taxonomy rule:** follow existing patterns,
  create a conforming rule, **write it into `src/packs/CLAUDE.md`** (you
  own that edit; sub-agents propose, you ratify), then use it. New packs
  conform from creation.
- **Homebrew / non-RAW content with no official book backing** → set its
  provenance to `homebrew` and **move it to the `homebrew/` folder**
  (`hb-<line>-*` or `hb-generic-*` per CLAUDE.md). Sub-agents flag
  candidates; you perform the move (it crosses scope + touches
  `system.json`).
- **`PROBLEMS.md` (root):** maintain it. Log anything blocking or
  ambiguous — corrupt/unreadable PDFs, pages that won't render, content
  unattributable to a book, suspected data errors you couldn't resolve,
  scope conflicts. One entry per problem with book/page/pack context.
  Sub-agents report problems in their final message; **you** write them in
  (avoids concurrent-write conflicts).
- **`AUDIT-LOG.md` (root):** durable ledger — book → agent → outcome →
  what-remains, updated as agents finish. The orchestrator itself can be
  interrupted; without this ledger, resumption loses the map.

## 11. Registration-drift check (run after registration batches & per line)

```bash
node -e '
const fs=require("fs");
const sys=JSON.parse(fs.readFileSync("src/system.json","utf8"));
const reg=new Set((sys.packs||[]).map(p=>p.name));
const root="src/packs"; const onDisk=new Set(); const orphans=[];
for(const g of fs.readdirSync(root)){
  const gp=root+"/"+g; if(!fs.statSync(gp).isDirectory()||g.startsWith("_"))continue;
  for(const p of fs.readdirSync(gp)){
    if(!fs.existsSync(gp+"/"+p+"/_source"))continue;
    if(p.includes("backup")||p.startsWith("."))continue;
    onDisk.add(p); if(!reg.has(p)&&g!=="homebrew") orphans.push(g+"/"+p);
  }
}
const ghosts=[...reg].filter(n=>!onDisk.has(n));
console.log("ORPHANED (on disk, unregistered):",orphans.length?orphans:"none");
console.log("GHOST (registered, no _source):",ghosts.length?ghosts:"none");
'
```

Orphaned → register (or remove dir). Ghost → create content or drop the
declaration. Neither state is allowed to persist at end-of-line.

## 12. Book-slug registry & canonical book strings

- Each `<book>` slug maps 1:1 to a canonical `source.<line>.book` string,
  in the `### Book slugs` registry in CLAUDE.md. The convention is
  **`"LINE: Title"`** (`"DW: The Emperor's Chosen"`, slug `chosen`).
- Sub-agents write `source.<line>.book` using the **exact canonical
  string** you pass them. As each line completes, **seed/extend the
  registry** from the normalized strings (don't invent titles).
- **The existing repo is not a clean slate:** ~11 RT/OW books were
  partially done under older book-string spellings (e.g.
  `"Only War Core Rulebook"`, `"Shield of Humanity"` without the `OW:`
  prefix) and there's `npc`/`dh2-npc` type drift. Expect to **normalize**
  these to the `"LINE: Title"` convention before they seed the registry.

---

## 13. SUB-AGENT PROMPT — book audit (tightened; copy & fill placeholders)

Placeholders: `[BOOK TITLE]`, `[ABS PDF PATH(S)]`, `[GROUP-DIR]`,
`[PACK GLOB(S)]` (the agent's only writable scope), `[LINE]`
(`bc`/`dh1`/`dh2`/`dw`/`ow`/`rt`), `[LINE: Title]` (canonical book string),
`[UNIQUE-SLUG]` (e.g. `rt-faith`).

```text
ROLE: You audit ONE sourcebook — [BOOK TITLE] — for the wh40k-rpg Foundry
VTT system against its compendium packs, by READING RENDERED PAGE IMAGES.
You are a sub-agent with a STRICT scope. Stay inside it.

INPUTS:
- PDF(s): [ABS PDF PATH(S)]
- Work dir: /home/jameson/Documents/dh-campaign/.foundry-system/src/packs/[GROUP-DIR]
- YOUR PACKS (your ONLY writable scope): [PACK GLOB(S)]
- Canonical book string: "[LINE: Title]"   Line id: [LINE]   /tmp slug: [UNIQUE-SLUG]

READ FIRST: ../CLAUDE.md. It is authoritative for taxonomy, schema,
provenance, variantization, cost, homologation, and errata. Obey it
literally.

ABSOLUTE RULES — violating ANY is a failed run:
1. SCOPE. Edit files ONLY under [PACK GLOB(S)]. Never edit any other pack,
   ../CLAUDE.md, ../../system.json, the gulpfile, or any src/ code. If
   something outside your scope needs changing, REPORT it — do not touch
   it.
2. NO system.json. You MAY create a new conforming _source/ dir + files
   (named per the CLAUDE.md taxonomy) when the book needs a pack you don't
   have — but you must NOT edit system.json. REPORT the declaration needed.
3. NO deleting or renaming existing files. If a file is broken, misnamed,
   or misfiled, REPORT it.
4. SIBLING LINES ARE READ-ONLY. Edit only the `[LINE]` variant data and
   shared identity fields. Never alter another line's variant branch.
   Never fork a homologated document — use its per-line variant container
   + a whole-file `reference` stub (CLAUDE.md Homologation Model).
5. IMAGES ARE THE ONLY SOURCE OF TRUTH FOR VALUES (recipe below). Never
   take a number, quality, or stat from pdftotext/OCR output.
6. CREATE, DON'T FLAG. Missing content that belongs in your packs MUST be
   created now. "Deferred", "flag for a later pass", or "needs separate
   review" = failure. If existing data is garbled, it was OCR-ingested —
   RE-DERIVE it from the image and overwrite. That IS the job.
7. NO verification commands except `node ../validate-schema.cjs --verbose`.
   No pnpm/build/typecheck/lint/test, no git commit/push.
8. NEVER use sed or awk to edit. Use the Edit tool, or a throwaway
   JSON-writing script — then inspect the diff manually.

IMAGE RECIPE (mandatory):
a. Index ONLY to find pages: `pdftotext -layout [ABS PDF] /tmp/[UNIQUE-SLUG].txt`.
   Its text is UNRELIABLE for values — use it only to locate which page a
   thing is on.
b. Render that page and READ the picture:
   `pdftoppm -png -r 200 -f N -l N [ABS PDF] /tmp/[UNIQUE-SLUG]-pg`
   then Read `/tmp/[UNIQUE-SLUG]-pg-NN.png`.
c. Use the UNIQUE /tmp prefix `[UNIQUE-SLUG]` so you never collide with
   other agents. Delete your PNGs when finished.
d. The PRINTED page number (book footer) ≠ the PDF page index. Establish
   the offset from a rendered footer. The offset CAN CHANGE between front
   matter, chapters, and inserts — re-confirm it per section. ALWAYS cite
   the PRINTED page in provenance.
e. Table too small to read → re-render that page at `-r 300` (or crop) and
   Read again. NEVER guess a value you cannot see.

WORK:
1. Read ../CLAUDE.md.
2. Inventory every _source/*.json in your packs. Reference stubs (files
   with only a `reference` key) stay stubs — you may correct a broken stub
   TARGET path, but never expand a stub into a full document.
3. For each entry: locate it in the PDF (index → render → Read image) and
   verify stats, descriptions, notes/effects, locally-authored cost,
   provenance, and printed page. Fix EVERY discrepancy against the image.
4. Provenance shape:
   system.source.[LINE] = { "provenance": "raw", "book": "[LINE: Title]", "page": "<printed page>" }
   The book string must be EXACTLY the canonical string above. Variantizable
   fields are per-line keyed containers ([LINE] payload under the `[LINE]`
   key) — never leave mixed flat + keyed shapes. Transient state lives under
   system.state. Cost follows CLAUDE.md EXACTLY (asymmetric homebrew block;
   no homebrew.requisition outside dh2; no homebrew block on dh1).
5. ADD MISSING CONTENT (REQUIRED): anything in this book absent from your
   packs — items, actors, journals, locations, adventure/campaign, or any
   other class. Use a stable random 16-char alphanumeric `_id` that is NOT
   already used ANYWHERE in the repo (grep to confirm before assigning).
   Place it in a conforming pack/category name per the CLAUDE.md taxonomy,
   matching neighbor-file schema. If the content's class has NO taxonomy
   rule, follow the closest existing pattern, place it in a
   conforming-named NEW pack, and REPORT the proposed rule + declaration
   (do not edit CLAUDE.md or system.json yourself).
6. DATA GUARDS:
   - every file in your packs has gameSystems including "[LINE]"; fix an
     unambiguous wrong value to ["[LINE]"].
   - no two files share an `_id`.
   - one Foundry `type` per pack (CLAUDE.md). If your pack mixes types,
     REPORT it (the orchestrator dissolves it) — do not reshuffle other
     packs yourself.
7. HOMEBREW: an entry with NO official book backing (not in this PDF or any
   official book) → set provenance "homebrew" per CLAUDE.md and REPORT it
   for relocation to homebrew/ (do not move it yourself — that crosses
   scope and touches system.json).
8. VALIDATE: `node ../validate-schema.cjs --verbose`; fix warnings YOU
   introduced; LEAVE pre-existing system-wide patterns (integer XP
   `system.cost` on talents; missing `type` on journals/rolltables).

REPORT — use these exact sections:
- Packs audited.
- Files changed (count + the notable ones).
- Content ADDED: for each, name + _id + pack + class + printed page.
- Corrections: substantive stat/rule fixes, each with printed page.
- New packs created + the system.json declaration each needs.
- New taxonomy rule proposed (if any).
- Homebrew flagged for relocation.
- PROBLEMS to log: corrupt/unreadable pages, unattributable content,
  unresolved conflicts — with book/page.
- Out-of-scope items flagged (not touched).
- Validation status for your packs.
- COMPLETION: "complete" OR "quota-limited: <exactly which packs done,
  which remain>".

If you hit a usage / quota / session limit: STOP IMMEDIATELY and report
"quota-limited" with precisely which packs are done and which remain. Do
not push through a limit.
```

---

## 14. SUB-AGENT PROMPT — errata pass (per line, AFTER its books)

Placeholders as above; `[ERRATA PDF]` is `…/<line>/errata.pdf`; scope is
the whole line's packs (or a disjoint partition).

```text
ROLE: Apply the [LINE] errata to the already-audited [LINE] compendium
packs, by READING RENDERED PAGE IMAGES. ERRATA ARE NOT BOOKS AND NOT
PACKS. You correct EXISTING entities and set a flag. You NEVER create an
errata pack or an "errata" entry.

INPUTS:
- Errata PDF: [ERRATA PDF]
- Work dir: /home/jameson/Documents/dh-campaign/.foundry-system/src/packs/[GROUP-DIR]
- Scope: [PACK GLOB(S)]   Line id: [LINE]   /tmp slug: [UNIQUE-SLUG]-errata

READ FIRST: ../CLAUDE.md — especially the errata rule (errata is an entity
flag, never a pack/book) and the per-field `_source` provenance override.

ABSOLUTE RULES: identical to the book-audit prompt (scope-only edits; no
system.json; no file deletes/renames; sibling lines read-only; IMAGES are
the only source of truth; no sed/awk; only `node ../validate-schema.cjs
--verbose` for verification; STOP on quota and report what remains).

WORK:
1. Read ../CLAUDE.md (errata section).
2. Read [ERRATA PDF] via rendered page images (same recipe: index to find,
   render at -r 200/300, Read the PNG; printed page ≠ PDF index). Enumerate
   each erratum: which entity, what value(s) change, the errata page.
3. For each erratum: locate the matching EXISTING entity in the [LINE]
   packs (by name + type, scoped to [LINE]). Apply the corrected value(s)
   to that entity's `[LINE]` variant. Set `errata: true` on the entity.
   Where the correction is a single field whose provenance now differs,
   add the per-field `_source` override capturing the erratum citation
   (per CLAUDE.md).
4. If an erratum corrects content that does NOT yet exist in the packs,
   CREATE the corrected entity in its conforming type pack (it is still
   book content) and set `errata: true`. Same _id-uniqueness and taxonomy
   rules as the book audit.
5. If you find ANY `*-errata-*` pack, REPORT it for removal — do NOT delete
   it yourself (the orchestrator removes packs).
6. VALIDATE: `node ../validate-schema.cjs --verbose`; fix warnings you
   introduced.

REPORT:
- Errata applied: entity + change + errata page, each.
- Entities created to carry an erratum (name + _id + pack).
- `*-errata-*` packs found (for orchestrator removal).
- PROBLEMS to log.
- Validation status.
- COMPLETION: "complete" OR "quota-limited: <what remains>".
```

---

## 15. Orchestrator checklist

**Per book**
- [ ] Assign correct PDF(s) + canonical book string + disjoint pack scope.
- [ ] Launch background Sonnet agent with the §13 prompt; keep 3 in flight.
- [ ] On finish: diff vs scope (§5); reconcile report vs diff; re-dispatch
      if deferred/under-delivered; spot-check images on "no-correction"
      reports.
- [ ] Register any new packs in system.json; run the §11 drift check;
      `JSON.parse` system.json.
- [ ] Move flagged homebrew to homebrew/. Append problems to PROBLEMS.md.
- [ ] Update AUDIT-LOG.md. Commit the book.

**Per line**
- [ ] All books done & verified → dispatch the §14 errata pass.
- [ ] Remove `*-errata-*` packs (checkpoint first).
- [ ] §11 drift check clean (no orphans/ghosts).
- [ ] Seed/extend the CLAUDE.md book-slug registry from normalized strings.
- [ ] `node src/packs/validate-schema.cjs --verbose` for the line; triage.
- [ ] Commit the line; write the line summary to AUDIT-LOG.md.

**Failure**
- [ ] Quota → sleep 5 min → resume. Stall/crash → relaunch now. Always
      reset the task to pending and keep the ledger current.
