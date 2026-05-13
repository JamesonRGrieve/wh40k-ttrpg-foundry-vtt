# Prompting agents — operator's notebook

Living doc for spawning background coding agents (cheap LLMs, Claude subagents, mixed). Update as new models / failure modes / patterns are discovered. CLAUDE.md's "Background ratcheting via cheap LLMs" section is a one-paragraph summary; the field notes here are the long form.

## Audit principle

**Git diff is the audit, not chat output.** Agents run in their own git worktree, modify only files in their declared scope, and never touch `main` directly. After they finish, `git -C <worktree> diff` is the source of truth for what they did. We do not read the agent's chat transcript — that burns operator context for no information that the diff doesn't already carry.

This means three things:

1. Every agent gets a **worktree path** (`-w` for gemini, `isolation: "worktree"` for Claude subagents) — never let one loose on the main checkout.
2. Every agent gets an **explicit file allowlist** in its brief — "modify only these paths; do not touch `src/css/wh40k-rpg.css`; do not touch any file outside the listed templates."
3. Every agent gets a **terse output instruction** — one short summary at the end, not a step-by-step running commentary.

If an agent leaves the worktree (touches `main`, deletes another agent's files, edits the monolith CSS or other shared state), kill it and re-scope. The orchestrator merges by reading manifests + diffs, never by re-running the agent's narrative.

Any failure detected during the audit step belongs back in this document. When a reviewer finds a recurring prompt failure mode in the diff — missing behavior hooks, dropped labels, out-of-scope edits, false "ported" claims, or similar — add a short note here so the next brief can prevent it instead of relearning it.

## Model registry

Each entry: invocation, auth scope, observed strengths, observed failure modes, when to use.

### `ai gemini 1` — Gemini 3.1 Flash Lite Preview (self-contained slot)

**Invocation:**

```bash
ai gemini 1 --model gemini-3.1-flash-lite-preview -p '<brief>'
# or with approval mode for file edits:
ai gemini 1 --model gemini-3.1-flash-lite-preview --approval-mode yolo -p '<brief>'
```

- Slot 1+ uses self-contained config under `.ai-sessions/gemini/<N>/`. **No env override needed**, works from any shell (including this Claude session where `$HOME` is redirected to a harness session dir).
- The `ai` bash function is defined in `~/.bashrc` but `.bashrc` short-circuits on non-interactive shells (`case $- in *i*) ;; *) return;; esac`), so in a non-interactive bash you must invoke the underlying script directly: `python3 /home/jameson/source/harness/ai.py gemini 1 …`.
- For `gemini` flags directly: `-y` (yolo, accept all tool calls), `--approval-mode {default,auto_edit,yolo,plan}`, `-w <name>` (auto-create worktree), `-s` (sandbox), `-o {text,json,stream-json}` (output format), `--include-directories` (extend workspace).

**Observed strengths:** quick, cheap, deterministic for very narrow tasks (one template port, one cast removal). Reasonable at following an explicit recipe step-by-step.

**Observed failure modes (this is what "stupid" means in practice — populate as evidence accumulates):**

- *Will skip work it judges as "entangled"* — fine if your symmetry/coverage gates allow incremental progress, dangerous if you assumed full completion.
- *May invent symbols* (file paths, function names, template names) when the brief is vague. Always pin the file list.
- *Treats fixing a sibling problem as in-scope* unless the brief says "modify only X" — give it the allowlist.

**When to use:** atomic, recipe-driven work that has a passing pre-commit gate to catch the worst regressions. Good fit for: one template port, one specific `as any` → narrow type substitution at a known line, one missing `*.test.ts` scaffold, one `game.i18n.localize → t()` migration. Bad fit for: anything requiring judgment about whether code structure is correct.

### `ai gemini 0` — Gemini 3.1 Flash Lite Preview (host real-$HOME slot)

**Invocation:**

```bash
HOME=/home/jameson ai gemini 0 --model gemini-3.1-flash-lite-preview -p '<brief>'
# Or directly:
HOME=/home/jameson python3 /home/jameson/source/harness/ai.py gemini 0 \
    --model gemini-3.1-flash-lite-preview -p '<brief>'
```

- Slot 0 uses the host's **real `$HOME`** (`~/.gemini/{settings.json,oauth_creds.json,google_accounts.json}`). From a TTY where `$HOME=/home/jameson`, no override is needed.
- From this Claude session, `$HOME` is redirected to `/home/jameson/source/harness/.ai-sessions/claude/1/`, which has no Gemini auth. Setting `HOME=/home/jameson` for the call works **only after** adding a Bash permission rule for that exact prefix; without the permission, the harness rejects the override as a scope-escalation.

**When to use vs. slot 1:** slot 0 is the human operator's primary. Prefer slot 1 for spawned background work — it's self-contained and doesn't need permission grants. Use slot 0 only when slot 1's auth is broken or quota-exhausted, and only with the explicit `HOME=/home/jameson` permission already granted.

### Claude subagents (general-purpose, Plan, Explore)

**Invocation:** `Agent` tool with `subagent_type` and (usually) NO isolation flag. Background via `run_in_background: true`.

**Model selection:** Make this deterministic per agent based on the work:
- **Opus** for: schema-deep refactors, anything where "should I delete this cast / widen this signature / add this guard" is a judgment call, multi-file API decisions (Documents/Rolls/DataModels), cop-out elimination (`as Record<string, unknown>` → real types), exactOptionalPropertyTypes decisions (TS2375/2379/2412).
- **Sonnet** for: mechanical sweeps where the recipe is mostly pattern-substitution (TS4111 bracket access, TS4114 override keyword, biome-ignore on framework signatures), leaf cleanup, lint warning grinding on top offenders.

Don't waste Opus on Sonnet work, but DO use Opus where Sonnet has historically introduced regressions (cast removal, signature widening, mixin return-type guessing). Sonnet regressions cost real orchestrator time to clean up — that's the actual price comparison, not the per-token rate.

**When to use vs. Gemini:** Claude subagents are 10–100× more expensive but can do open-ended exploration, judgment calls, and multi-file refactors. Don't use Claude subagents for grinding work that has a clean recipe — that's gemini's job.

### Critical: agents WRITE, orchestrator COMMITS

The default pattern is: **agents modify files on disk and stop. They do NOT run git, do NOT commit, do NOT stash. The orchestrator gathers all changes via `git status` after agents finish, runs gates once, and creates the commits.**

This avoids three failure modes that previously killed batches:

1. **`git stash` triggers the harness classifier.** Any agent that hits a situation where it wants to stash to compare states gets killed mid-run. The agent rarely recovers. Just don't let agents touch stash.
2. **`lint-staged --hide-unstaged` clobbers staged TS4114 (`override`) additions.** When an agent runs `git commit`, the husky hook stashes its WIP, runs fixers on the staged content, re-applies the stash — and somewhere in that flow the `override` keyword additions get dropped from the final commit. Bypassing with `--no-verify` works but only if you also manually run all the ratchets before committing.
3. **Parallel-agent ratchet contention.** When 5 agents share a working directory and each makes uncommitted `noUncheckedIndexedAccess` guards (which the lint rule sees as `no-unnecessary-condition`), the global lint count is inflated until they all commit. Each agent's `pnpm lint:ratchet` gate then fails — even when its own diff is small — because it sees the combined uncommitted state. The agent thrashes trying to reconcile, eventually gets killed or gives up.

Removing commits from the agent contract makes all three problems vanish. The orchestrator runs gates once on the union of all agents' edits, makes the commit decisions, and handles per-file or per-category commit granularity.

**When an agent really needs to revert a file:** instruct it to use `git checkout -- <file>` directly, never stash. That's safe and the classifier allows it.

### Why worktrees fail for ratchet sweeps

`isolation: "worktree"` was the original recommendation but it doesn't work for ratchet sweeps because:

1. **`node_modules` lives in the parent checkout, not the worktree.** Agents run `pnpm strict:ratchet` in their worktree and get "command not found" or "tsc not installed" — they then incorrectly conclude the ratchet infrastructure doesn't exist and skip gating entirely. (Observed with C1, C2 Opus agents in batch C.)
2. **The worktree branch is created from a stale base.** Whatever HEAD the harness picks may be hours or days behind `dev`. Agents work against stale context and their diffs require painful cherry-pick conflict resolution back to current dev.
3. **The auto-cleanup is destructive.** When a killed agent's worktree gets cleaned up, all uncommitted work is lost.
4. **The merge cost dominates.** Even when agents succeed, cherry-picking 5 branches back to dev with conflicts can cost as much orchestrator time as the agent work itself.

**Pattern that works**: agents operate directly in dev's working tree with strictly-disjoint file allowlists. The orchestrator partitions by directory so two agents never touch the same file. Agents write changes and stop. Orchestrator commits.

This requires careful directory partitioning — see "Common partition shapes" below.

## Brief template (for Claude subagents on ratchet sweeps)

Every brief should have these eight sections, in order:

1. **One-line goal**, e.g. "Drive `pnpm strict:ratchet` errors in `src/module/data/**` to 0 by tightening DataModel schemas."
2. **READ FIRST**: a hard-coded list of files the agent must read before editing (CLAUDE.md, this file, current `.strict-coverage-baseline`, recent commits via `git log --oneline -10 -- <scope>`). No globs. The agent should know the established patterns before deciding what to change.
3. **YOUR SCOPE**: the exhaustive whitelist of files the agent may modify. No "or any related files." Disjoint from every other concurrent agent.
4. **PROCESS PER FILE**: a numbered, mechanical recipe. Each step takes one verb. Include the priority order of fixes (e.g. TS4111 → TS4114 → noUncheckedIndexedAccess → biome errors → ESLint warnings).
5. **DO NOT**: the explicit blacklist. Repeat sensitive paths from section 3 here in negation. Always include:
   - `git stash`, `git pull`, `git rebase`, `git reset --hard`, `git checkout <branch>`, `git worktree`. *"THE CLASSIFIER KILLS AGENTS THAT USE STASH"* — make this loud.
   - `git commit`, `git add` — agents WRITE files, orchestrator COMMITS.
   - `pnpm install`, `pnpm build`, `*:ratchet:update`.
   - New `as any`, `as Record<string, unknown>` (except documented framework boundaries), `@ts-ignore`, `@ts-expect-error`. Skip the file instead.
   - Widening typed signatures to `Record<string, unknown>` — the POINT is to eliminate these.
   - Removing `override` modifiers. Using `=== undefined` instead of `== null` (the codebase prefers `== null`).
   - Touching generated `*.d.ts` files (`ts-reset`, `i18n-keys`, `icon-keys`).
6. **OUTPUT**: the final state of the working tree. Optionally a `.agent-manifest.json` summarising what was touched and what gates pass. The orchestrator inspects `git status` + `git diff --stat` directly — the manifest is supplementary, not the source of truth.
7. **TERSE FINAL MESSAGE**: ≤80 words. State files-touched count, metric deltas (strict-in-scope before/after, biome before/after), stoppedReason. No file-by-file log.
8. **STOP WHEN**: explicit termination — scope metric = 0, OR N files processed, OR M consecutive gate-failure skips, OR ~80% context. Never "when you're satisfied."

### Gating pattern (orchestrator-side commit, no agent commits)

The orchestrator gates AFTER all agents finish:

```bash
# After all subagents return:
git status --short                                  # see the union of WIP
pnpm typecheck                                      # 0 errors hard gate
pnpm strict:ratchet  pnpm ts:ratchet                # per-code, per-dir
pnpm lint:ratchet  pnpm biome:ratchet               # warning counts
# … and the rest of the ratchet suite

# Decide what to commit. Usually: stage everything, single rollup commit
# per metric category, or per scope.
git add <files>
git commit --no-verify -m "ratchet(<batch>): <category> — <metrics>"
```

The agent brief still tells each agent to run gates SELF-CHECK style — that is, after each file edit, run `pnpm typecheck` and the relevant ratchet to confirm its own diff hasn't regressed anything obviously. But the agent doesn't act on the result with a commit; if a gate fails, the agent uses `git checkout -- <file>` (NOT stash) to revert that file and moves on.

The lint:ratchet contention problem disappears because no agent's gate-read happens at a moment when another agent has uncommitted-but-staged work — they all just have working-tree changes, which the orchestrator's final gate sees as a coherent union.

## Worktree hygiene (legacy — prefer direct-on-dev for ratchet sweeps)

```bash
# Create
git worktree add /home/jameson/Documents/dh-campaign/.foundry/.claude/worktrees/agent-<N> HEAD

# Audit (post-run; do not read chat transcript)
git -C .claude/worktrees/agent-<N> status --short
git -C .claude/worktrees/agent-<N> diff --stat
cat .claude/worktrees/agent-<N>/.migration-manifest.json

# Merge (orchestrator only; never an agent)
cp .claude/worktrees/agent-<N>/path/to/touched.hbs path/to/touched.hbs
# … then for each declared safe-to-delete source-block:
pnpm css:block delete <source-path>

# Cleanup (after merge, with explicit user approval)
git worktree remove .claude/worktrees/agent-<N>
git branch -D worktree-agent-<N>   # if branch was created
```

**Never** let an agent run `git worktree remove`, `git push`, `git reset --hard`, or any operation on a checkout other than its own. Those belong to the orchestrator.

Worktree isolation is still useful for **template porting**, **CSS migration**, and other tasks where the agent's diff doesn't need to read live ratchet output (i.e., the agent doesn't need `node_modules`). For TS strictness / lint / biome sweeps, worktrees are a trap — use direct-on-dev with disjoint allowlists and the agents-write-orchestrator-commits pattern instead.

## Output minimisation patterns

- For `gemini`, prefer `-o text` over `-o stream-json` unless you actually need the structured trace. Discard stdout to a file in the worktree (e.g. `> .agent-stdout.log 2>&1`) and only read the manifest, not the log.
- For Claude subagents in background: the output file path is returned but the harness explicitly warns against reading it (`Do NOT Read or tail this file via the shell tool — it is the full sub-agent JSONL transcript and reading it will overflow your context window`). Trust the agent's final summary message and the diff.
- Never `cat` an agent's stdout in the orchestrator's main loop. If you must inspect, `head -200` or `tail -50` only.

## Common partition shapes

For 10 parallel agents on this codebase:

- **5 CSS migration**: partition `.css-only` templates by directory + alphabet so no two agents claim the same file. Each agent ports 4–6 templates.
- **5 TS strictness**: partition by file in `src/module/applications/`. Top offenders by `as any` count: `actor/character-sheet.ts` (180), `actor/npc-sheet.ts` (88), `prompts/unified-roll-dialog.ts` (86), `character-creation/origin-path-builder.ts` (79), `actor/base-actor-sheet.ts` (67). Each agent gets one of these and removes 5–15 specific casts at named lines.

For larger fan-outs, partition further (panels A-K vs L-Z; one item-type sheet per agent). Resist the urge to give one agent "all the actor panels" — it will skip most.

### Ratchet-sweep partition (5 agents, observed working shape)

The partition that survives 5 parallel agents in dev's working tree without collision:

- **Agent 1 (Opus)** — `src/module/data/**`. Schema-deep work. Eliminates `Record<string, unknown>` cop-outs by tightening DataModel `defineSchema()` definitions. Tackles exactOptional (TS2375/2379/2412) since most lives here.
- **Agent 2 (Opus)** — `src/module/applications/actor/**` (optionally + `applications/item/**` if the actor set is small). Sheet decisions, typed cache replacements, narrowing. Watch for cross-scope DataModel dependencies and coordinate with Agent 1.
- **Agent 3 (Sonnet)** — `src/module/applications/{api,base,dialogs,popouts,prompts,character-creation}/**` + top-level `applications/*.ts`. Mechanical TS4111/TS4114/biome cleanup since the heavy schema work was done in prior batches.
- **Agent 4 (Opus)** — `src/module/{documents,rolls,rules}/**`. Document and Roll API surfaces — decisions here ripple to every caller, so judgment-heavy.
- **Agent 5 (Sonnet)** — `src/module/{actions,canvas,config,handlebars,helpers,hooks,i18n,icons,managers,migrations,transactions,utils,types}/**` (exclude generated `*.d.ts`) + `src/module/*.ts` top-level + optional Phase 2 lint sweep across its scope.

Critically: **NO two agents share files.** Each is given an exhaustive allowlist, and the DO NOT section names every other agent's directory explicitly.

For special purposes alongside the 5:
- **Biome-error specialist (Opus)** — cross-scope file pattern, restricted to files the other 5 agents are NOT touching that week. Drives biome errors specifically.
- **Lint warning sweep (Sonnet)** — when strict-TSC is mostly done and lint warnings dominate. Phase 1 = strict-TSC closeout in scope, Phase 2 = lint warnings on top offending files in scope.

## When an agent fails

Failure modes and responses:

- **Agent ran `git stash` and got killed** — the classifier won't allow stash. Add an emphatic `**THE CLASSIFIER KILLS AGENTS THAT USE STASH**` line to the DO NOT section in caps. Tell the agent to use `git checkout -- <file>` to revert a single file instead.
- **Agent reports "strict-ratchet doesn't exist"** — it's running in a worktree without `node_modules`. Switch to direct-on-dev (no `isolation: "worktree"`) and re-run. The ratchet infrastructure DOES exist; the agent just can't see it.
- **Agent's `lint:ratchet` fails even though its own diff is small** — parallel-agent contention (another agent's uncommitted noUncheckedIndexedAccess guards inflated the global count). Switch to the no-commit pattern: agents WRITE, orchestrator COMMITS. The contention disappears.
- **Agent's commits silently dropped TS4114 (`override`) keyword additions** — `lint-staged --hide-unstaged` clobbered them during the husky hook. Either bypass with `--no-verify` after manual gate verification, or (better) use the no-commit pattern so the orchestrator stages and commits as one batch with hooks disabled.
- **Agent committed directly to dev when it was supposed to be on its worktree branch** — observed multiple times. Mechanism unclear (harness worktree-isolation appears leaky for some Claude subagent configs). Workaround: don't use worktree isolation; design briefs to be parallel-safe with file allowlists instead.
- **Agent claims "ratchet infrastructure doesn't exist" or sees wrong tsc errors** — its CWD is wrong (stuck in a different worktree path that doesn't have current dev's state). Verify via `pwd` and `git rev-parse --abbrev-ref HEAD` early in the brief's READ FIRST.
- **Audit finds a regression even though the diff is in scope** — common patterns:
  - widened typed signature to `Record<string, unknown>` (forbidden, but Sonnet does it anyway under stress)
  - removed inner type cast that was load-bearing (e.g. `Array.from((x as Set<string>) ?? new Set())`)
  - added explicit mixin return type without listing every method (breaks callers)
  - replaced `!` non-null with `?? ''` silent fallback (masks invariant violations)
  Capture each new failure mode here and add to the brief's DO NOT for next time.

The framework's pre-commit gates catch most slop. Trust the gates; do not fight them by lowering severity.

## What `.auto-fix` adds for the bulk grind

`.auto-fix/run.py` runs the cheap-LLM ladder (Qwen → gemini flash-lite → gemini flash → codex) against per-file manifests. It uses the same ratchet gates as the manual flow, plus a gemini-flash sanity check that asks "does this diff only change typing / fix lint, not change behavior?" before each commit. Use it for:

- TS4111 bulk: ~1000+ mechanical bracket-access conversions where the underlying type is genuinely `Record<string, unknown>`. Cheap models handle this fine; Sonnet/Opus is overkill.
- TS4114 bulk: adding `override` modifiers. Pattern-match only.
- ESLint warning per-file grinds.

When to NOT use `.auto-fix`:
- The user wants Sonnet floor (no cheap-LLM fallback).
- The fix requires understanding the surrounding class / DataModel / API surface.
- exactOptional decisions, cast-removal judgment, schema-deep work.

`.auto-fix` and the agent pattern compose: run `.auto-fix` first for the mechanical tail, then spawn Sonnet/Opus agents on the remaining judgment-heavy items.

## Legacy: when a template-port / CSS agent fails

These apply to worktree-isolated CSS / template porting agents (the original use case):

- **Worktree dirty after run, no manifest, no useful diff** — agent went off the rails. Discard the worktree, re-scope tighter, retry.
- **Manifest claims success but `pnpm check` fails** — recipe was wrong. Fix the recipe in the brief; re-run.
- **Agent claims "skipped because entangled"** — verify by reading the templates. If genuinely entangled, leave; if not, the brief was missing context the agent needed.
- **Agent edited a file outside scope** — the brief's DO NOT section was incomplete. Discard the worktree, expand the blacklist explicitly, retry.

The framework's pre-commit gates catch most slop. Trust the gates; do not fight them by lowering severity.
