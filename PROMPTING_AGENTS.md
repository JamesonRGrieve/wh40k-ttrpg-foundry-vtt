# Prompting agents — operator's notebook

Living doc for spawning background coding agents (cheap LLMs, Claude subagents, mixed). Update as new models / failure modes / patterns are discovered. CLAUDE.md's "Background ratcheting via cheap LLMs" section is a one-paragraph summary; the field notes here are the long form.

## Audit principle

**Git diff is the audit, not chat output.** Agents run in their own git worktree, modify only files in their declared scope, and never touch `main` directly. After they finish, `git -C <worktree> diff` is the source of truth for what they did. We do not read the agent's chat transcript — that burns operator context for no information that the diff doesn't already carry.

This means three things:

1. Every agent gets a **worktree path** (`-w` for gemini, `isolation: "worktree"` for Claude subagents) — never let one loose on the main checkout.
2. Every agent gets an **explicit file allowlist** in its brief — "modify only these paths; do not touch `src/css/wh40k-rpg.css`; do not touch any file outside the listed templates."
3. Every agent gets a **terse output instruction** — one short summary at the end, not a step-by-step running commentary.

If an agent leaves the worktree (touches `main`, deletes another agent's files, edits the monolith CSS or other shared state), kill it and re-scope. The orchestrator merges by reading manifests + diffs, never by re-running the agent's narrative.

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

**Invocation:** `Agent` tool with `subagent_type` and `isolation: "worktree"`. Background via `run_in_background: true`.

**When to use vs. Gemini:** Claude subagents are 10–100× more expensive but can do open-ended exploration, judgment calls, and multi-file refactors. Use them for:
- Initial scoping / partitioning work (figuring out which 5 templates a CSS agent should own).
- Tasks where the recipe is unclear and the agent must read the codebase before deciding what to change.
- Final merge / synthesis work that needs to read multiple manifests and apply them coherently.

Don't use Claude subagents for grinding work that has a clean recipe — that's gemini's job.

## Brief template (for stupid models)

Every gemini-flash brief should have these eight sections, in order:

1. **One-line goal**, e.g. "Port these N templates from custom CSS classes to inline `tw-*` Tailwind utilities."
2. **READ FIRST**: a hard-coded list of files the agent must read before doing anything (recipe doc, token map, related TS files). No globs.
3. **YOUR SCOPE**: the exhaustive whitelist of files the agent may modify. No "or any related files."
4. **PROCESS PER FILE**: a numbered, mechanical recipe. Each step takes one verb.
5. **DO NOT**: the explicit blacklist — `src/css/wh40k-rpg.css`, `pnpm install`, `pnpm build`, anything outside scope. Repeat the sensitive paths from section 3 here in negation.
6. **OUTPUT**: the exact filename(s) the agent should write at the worktree root (e.g. `.migration-manifest.json` with a specified JSON shape). No prose summary in this file — keep machine-readable.
7. **TERSE FINAL MESSAGE**: tell the agent to end with at most one short paragraph of summary text. No stepwise log.
8. **STOP WHEN**: explicit termination condition. "When all N files are processed (ported or skipped with reason)" — never "when you're satisfied."

## Worktree hygiene

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

## Output minimisation patterns

- For `gemini`, prefer `-o text` over `-o stream-json` unless you actually need the structured trace. Discard stdout to a file in the worktree (e.g. `> .agent-stdout.log 2>&1`) and only read the manifest, not the log.
- For Claude subagents in background: the output file path is returned but the harness explicitly warns against reading it (`Do NOT Read or tail this file via the shell tool — it is the full sub-agent JSONL transcript and reading it will overflow your context window`). Trust the agent's final summary message and the diff.
- Never `cat` an agent's stdout in the orchestrator's main loop. If you must inspect, `head -200` or `tail -50` only.

## Common partition shapes

For 10 parallel agents on this codebase:

- **5 CSS migration**: partition `.css-only` templates by directory + alphabet so no two agents claim the same file. Each agent ports 4–6 templates.
- **5 TS strictness**: partition by file in `src/module/applications/`. Top offenders by `as any` count: `actor/character-sheet.ts` (180), `actor/npc-sheet.ts` (88), `prompts/unified-roll-dialog.ts` (86), `character-creation/origin-path-builder.ts` (79), `actor/base-actor-sheet.ts` (67). Each agent gets one of these and removes 5–15 specific casts at named lines.

For larger fan-outs, partition further (panels A-K vs L-Z; one item-type sheet per agent). Resist the urge to give one agent "all the actor panels" — it will skip most.

## When an agent fails

Failure modes and responses:

- **Worktree dirty after run, no manifest, no useful diff** — agent went off the rails. Discard the worktree, re-scope tighter, retry.
- **Manifest claims success but `pnpm check` fails** — recipe was wrong. Fix the recipe in the brief; re-run.
- **Agent claims "skipped because entangled"** — verify by reading the templates. If genuinely entangled, leave; if not, the brief was missing context the agent needed.
- **Agent edited a file outside scope** — the brief's DO NOT section was incomplete. Discard the worktree, expand the blacklist explicitly, retry.

The framework's pre-commit gates catch most slop. Trust the gates; do not fight them by lowering severity.
