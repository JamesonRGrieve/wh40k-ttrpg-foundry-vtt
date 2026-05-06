# CSS-to-Tailwind port — grinder recipe

**Task:** Port one Handlebars template from legacy `wh40k-*` / project CSS classes to inline Tailwind utilities (`tw-*`). When the template is the sole consumer of its primary source-block in `src/css/wh40k-rpg.css`, the block is deleted from the monolith via `pnpm css:block delete`. The `pnpm css:coverage` `tailwind-only` count must rise by exactly 1 (and `mixed` drop by 1) per template.

**Worked example:** PR for `src/templates/character-creation/origin-detail-dialog.hbs` (the canonical wave-1 PR) — 70 distinct `wh40k-*` / `origin-*` / `grant-tag` etc. selectors stripped, tab-pane visibility moved to `tw-hidden [&.active]:tw-block`, single Foundry-chrome `.window-content` rule salvaged into a new `src/css/foundry-chrome.css` source-block in the monolith. Read the diff before starting.

---

## Ratchet contract

You may land your edit ONLY if **all** of the following hold:

| Metric                                            | Direction          | Command                       |
| ------------------------------------------------- | ------------------ | ----------------------------- |
| `tailwind-only` template count                    | MUST RISE by ≥1    | `pnpm css:coverage`           |
| `mixed` template count                            | MUST NOT RISE      | `pnpm css:coverage`           |
| `css-only` template count                         | MUST NOT RISE      | `pnpm css:coverage`           |
| Animation declarations in monolith                | MUST NOT RISE      | `pnpm animation:coverage`     |
| Per-system theme adoption                         | MUST NOT FALL      | `pnpm theme:coverage`         |
| TSC total errors                                  | MUST NOT RISE      | `pnpm typecheck`              |
| ESLint warnings                                   | MUST NOT RISE      | `pnpm lint`                   |
| Vitest suite                                      | MUST PASS          | `pnpm test`                   |
| Storybook integration tests                       | MUST PASS          | (pre-commit)                  |
| Preload drift                                     | MUST PASS (hard)   | `pnpm preload:drift`          |

After landing, run `pnpm css:ratchet:update`. Commit the baseline change in the same commit as the port. The orchestrator (`.auto-fix/run.py --mode css`) does this automatically; manual ports must do it explicitly.

**Detection rule:** the coverage script (`scripts/css-coverage.mjs`) classifies a template as `tailwind-only` when every class token in every `class="…"` attribute is a `tw-*` utility, a JS-hook in the allowlist, a Font Awesome / Material Icons token, or a Handlebars-fragment artefact. Any other token (a stripped legacy class) makes the template `mixed`. JS hooks must be added to `JS_HOOKS` in `scripts/css-coverage.mjs` AND mirrored in `CSS_JS_HOOKS` in `.auto-fix/run.py`.

---

## Tier classification

The grinder's `--mode css --scrape` step writes `.auto-fix/css-port-manifest.json` with three tiers:

| Tier | Conditions                                                                                                                                            | Who drives it       |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| 1    | Single consumer of primary block, ≤1 Foundry-chrome rule, primary block ≤800 lines, **zero** `@keyframes` / `animation:` / `[data-wh40k-system="..."]` in the block(s). | Cheap-LLM grinders. |
| 2    | Multiple consumers OR >1 chrome rule OR primary block >800 lines OR no identifiable primary block. Visual port still safe; deletion is gated on the **last** consumer being ported. | Human review.       |
| 3    | Any animation or theming entanglement in the block(s).                                                                                                | OUT OF SCOPE for this workstream. Owned by `animation-port.md` and `theme-adoption.md`. |

Tier 3 deferral is enforced TWICE: in the scraper (`classify_css_target` writes Tier 3 for any block with `animation_count > 0` or `theming_count > 0`) AND in the prompt (the model is told to emit `TIER3_ENTANGLED` if it sees a `@keyframes` or `[data-wh40k-system]` inside the source-block).

---

## Recipe

### 1. Pick a target

`./auto-fix/run.py --mode css --scrape --dry` rebuilds the manifest. Browse `.auto-fix/css-port-manifest.json` and look at `tiers["1"]` for grindable candidates. Each entry has:

- `file` — the `.hbs` path under `src/templates/`.
- `class_count` / `classes` — the legacy styling tokens still on the template.
- `source_blocks[].source` — which `src/css/...` source-blocks own the rules for those classes (in the monolith).
- `primary_block_source` / `primary_block_lines` — the largest block; this is what `pnpm css:block delete` removes after the port lands.
- `consumer_count` / `consumers` — how many other templates reference classes from the primary block. **Block deletion only runs when `consumer_count == 1`.**

Smallest-first ordering keeps cycles short. Avoid Tier 2 entries with `no identified primary block` — they typically depend on shared component CSS (`_unified-components.css`, `_collapsible-panels.css`, `_grids.css`) and there is no clean block to delete.

### 2. Read the source-block

```
pnpm css:block show <primary-block-source>
```

Note any:

- Foundry-chrome selectors (`.window-content`, `.ProseMirror`, `.editor-content`, `.form-fields`, `.app`, `.application`, `.filepicker`) — these need salvage into a `── source: src/css/foundry-chrome.css ──` marker block in the monolith **before** running `pnpm css:block delete`. The handbook eventually wants these in a separate `src/css/foundry-chrome.css` file with a build-pipeline change; until then, an in-monolith marker preserves them past block deletion.
- State classes (`.active`, `&.active`, `.tab.active`) — these MUST keep working after the port. Use the arbitrary-variant pattern `tw-hidden [&.active]:tw-block` on the consuming element (matches `src/templates/dialogs/threat-scaler.hbs`).
- Generic class names that other templates also use (`.tab`, `.section-header`, `.category-header`) — verify with `grep -l '\.<class-name>\b' src/templates/` before deletion.

### 3. Translate classes inline

Walk every `class="…"` attribute in the template:

| CSS                                              | Tailwind utility (with `tw-` prefix)                |
| ------------------------------------------------ | --------------------------------------------------- |
| `var(--wh40k-space-sm)` (in `gap`/`padding`/`margin`) | `tw-gap-1`, `tw-p-1`, `tw-m-1` (token map driven)   |
| `var(--wh40k-radius-sm)`                         | `tw-rounded-sm`                                     |
| `var(--wh40k-gold)`                              | `tw-text-gold` / `tw-bg-gold` / `tw-border-gold`    |
| `display: flex`                                  | `tw-flex` (`tw-flex-col` / `tw-flex-row` for axis)  |
| `display: grid`                                  | `tw-grid` (`tw-grid-cols-N`)                        |
| `align-items: center`                            | `tw-items-center`                                   |
| `justify-content: space-between`                 | `tw-justify-between`                                |
| `position: absolute`                             | `tw-absolute`                                       |
| `cursor: pointer`                                | `tw-cursor-pointer`                                 |
| One-off `rgba(...)` / `#xxxxxx`                  | `tw-bg-[rgba(0,0,0,0.3)]` / `tw-text-[#ce93d8]` (inline arbitrary value) |
| `&:hover { background: X }`                      | `hover:tw-bg-[X]`                                   |
| `&.active { display: block }`                    | `[&.active]:tw-block`                               |

The exhaustive token mapping is in `scripts/css-token-map.json`. The full handbook lives in `docs/tailwind-migration.md`.

**JS hooks stay.** Cross-reference the matching application class (`src/module/applications/.../<sheet>.ts`) for `querySelector` / `closest` / Foundry tabs `navSelector` / `contentSelector` references. Every class queried from JS must remain on its element; pair it with the new Tailwind utilities. Add new hooks to `JS_HOOKS` in `scripts/css-coverage.mjs` AND `CSS_JS_HOOKS` in `.auto-fix/run.py`.

**Don't** extend `tailwind.config.js` for one-off literals. Inline arbitrary values are cheaper and the only sustainable pattern for a 121-template port queue. Reserve `theme.extend.colors` / `theme.extend.spacing` for tokens used in 3+ templates.

### 4. Salvage Foundry chrome (if any)

For each Foundry-internal selector in the source-block, append the rule to the in-monolith foundry-chrome marker block:

```css
/* ── source: src/css/foundry-chrome.css ── */
…
/* salvaged from src/css/components/_<your-block>.css */
.<your-app-class> {
    .window-content { … }
}
```

If the marker doesn't exist yet (first salvage of the wave-1 cycle), create it just above the trailing `@tailwind components;` / `@tailwind utilities;` directives in `src/css/wh40k-rpg.css`.

### 5. Delete the source-block

```
pnpm css:block delete <primary-block-source>
```

This removes the marker and every line up to the next marker. The block-index regenerates automatically. Skip this step if `consumer_count > 1` — other templates still reference the rules. Wait until you (or another grinder) ports the last consumer.

### 6. Refresh and ratchet

```
pnpm css:coverage --quiet            # writes .css-coverage.json
pnpm css:ratchet:update              # lowers .css-coverage-baseline
```

### 7. Commit

The pre-commit hook runs the full ratchet pipeline (`typecheck` / `lint` / `css` / `animation` / `theme` / `symmetry` / `preload-drift` / `vitest` / `storybook integration`). Do NOT `--no-verify`. If a hook fails, inspect the failure and fix the root cause; never silence a ratchet that flagged a real regression.

The grinder commits with `--no-verify` because each step has already passed its own ratchet check inline. Manual operators should NOT skip hooks.

---

## Hard rules (drilled into the prompt and the sanity check)

The CSS-mode grinder is told these rules in `CSS_HARD_RULES` (in `.auto-fix/run.py`) and they're audited again by the Gemini sanity check on the diff. They are non-negotiable:

1. **Class attributes only.** Modify `class="…"` and `class={{...}}` attributes. Nothing else changes — not DOM structure, element types, attributes (`data-action`, `data-tab`, `data-group`, `data-uuid`, `data-tooltip`, `name=`, `value=`, `for=`, `id=`, `src=`, `alt=`), Handlebars logic (`{{#if}}`, `{{#each}}`, `{{else}}`, `{{> partial}}`), or `{{localize ...}}` keys.
2. **`tw-` prefix on every utility.** Bare `flex`, `bg-gold`, etc. won't be emitted by Tailwind.
3. **JS hooks are sacred.** Foundry's tabs API (`navSelector`, `contentSelector`), `roll-control__*` listeners in `basic-action-manager.ts`, `wh40k-expandable*` toggles, and `active` state classes must remain on their original elements.
4. **No animations.** No new `tw-animate-*` utilities, no new `@keyframes`, no `animation:` rule changes. Animation porting is owned by `animation-port.md`.
5. **No theming.** No new `bc:tw-*` / `dh1e:tw-*` / `dh2e:tw-*` / `dw:tw-*` / `ow:tw-*` / `rt:tw-*` / `im:tw-*` variants, no new `data-wh40k-system=` attributes. Theming is owned by `theme-adoption.md`.
6. **No narrative comments.** No `{{!-- Migrated to Tailwind --}}`, no "Replaced .foo with tw-bar" trailers. The diff documents the change.
7. **TIER3_ENTANGLED is the abort sentinel.** If the model sees `@keyframes` or `[data-wh40k-system="..."]` inside the source-block during inference, it emits exactly `TIER3_ENTANGLED` inside the fence and the grinder records the file as `skipped` (not `failed`). The scraper should have caught this in classification, but the prompt-level guard catches manifest staleness too.

---

## Operator workflow

```bash
# Refresh the manifest after a coverage drift.
./.auto-fix/run.py --mode css --scrape --dry

# Grind tier 1 only — clean leaves, single consumer, no chrome residue.
./.auto-fix/run.py --mode css 1

# Grind tier 1 + tier 2 — tier 2 needs human review of the diff before push.
./.auto-fix/run.py --mode css

# Reset progress and start fresh (e.g. after a major rebase).
./.auto-fix/run.py --mode css --reset

# Limit to N templates per session (good for cost control on metered models).
./.auto-fix/run.py --mode css --limit 5

# Skip the local Qwen3-Coder model and start at Gemini Flash-Lite.
./.auto-fix/run.py --mode css --gemini

# Disable the post-ratchet sanity check (NOT recommended outside debugging).
./.auto-fix/run.py --mode css --no-sanity
```

Tracker state lives at:

- `.auto-fix/css-port-manifest.json` — current scan output (regenerate via `--scrape`).
- `.auto-fix/progress-css.json` — per-template `completed` / `failed` / `skipped` lists.
- `.auto-fix/file-logs/<sanitized-template>__attempt<N>.<outcome>.log` — full prompt + model output + diff + sanity verdict for every attempted edit. Inspect these when prompt-tuning or diagnosing a stuck file.

---

## Tier 2 caveats

Tier 2 templates land on the queue because something about them defeats clean automation. Common cases and the operator's path through them:

- **No identified primary block** (`actor/panel/*-panel.hbs`, `actor/partial/*.hbs`): the template's classes are defined in shared component CSS (`_unified-components.css`, `_collapsible-panels.css`, `_grids.css`, `_form_fields.css`). Porting the template to inline Tailwind is fine, but `pnpm css:block delete` is NOT safe — the shared block still has other consumers. The grinder will skip the deletion step (the `consumer_count > 1` guard) and only the template + ratchet baseline get committed.
- **Multi-consumer block** (`item/_skill.css` → 4 templates): port one template at a time. Each port flips its own template to `tailwind-only` and lowers the css-baseline by 1; the source-block stays in the monolith until the last consumer is ported. Track progress in `.auto-fix/progress-css.json`.
- **>1 Foundry-chrome rule**: salvage each rule individually into the in-monolith foundry-chrome marker. Multiple chrome rules usually mean the dialog has both a `.window-content` override and a `.ProseMirror` / editor override; they need to land in the chrome block before the source-block is deleted.
- **Primary block >800 lines**: token volume is too large for a single Qwen3-Coder turn (32K context, 8K out). Split the template into partials first (a separate refactor), then port each partial as its own grinder pass.

---

## When to stop and ask

The grinder's sanity check catches behavioral changes, but it can't catch judgment calls. Pause and route to a human when:

- A class appears to be a JS hook (queried from `*.ts` via `querySelector` / `closest`) but is NOT in `JS_HOOKS` / `CSS_JS_HOOKS`. Decision: add it to both lists OR remove the JS query and rely on `data-*` attributes. Both options are valid; the choice is project policy.
- A `var(--wh40k-*)` token has no entry in `scripts/css-token-map.json`. Decision: extend the token map (preferred when it'll be reused) OR inline the `var()` reference inside an arbitrary-value utility (`tw-bg-[var(--wh40k-foo)]`).
- The template renders inside multiple Application classes with different system roots and the per-system divergence is non-trivial. Decision: route to `theme-adoption.md` instead of porting blind.
- The Foundry-chrome salvage requires **renaming** the original Foundry-internal class (e.g. wrapping `.window-content` with a more-specific ancestor). Decision: that's a chrome refactor, not a CSS port — open a separate PR.
