# Tailwind Migration Handbook

This document is the recipe for porting `.hbs` templates from monolithic CSS to Tailwind utilities. Both human and agent contributors follow it. Coverage is tracked by `pnpm css:coverage` and ratcheted by `pnpm css:ratchet` (pre-commit gate).

## What we are doing and why

`src/css/wh40k-rpg.css` is a single ~60k-line concatenation of the original component CSS files. The original boundaries are preserved as markers like:

```css
/* ── source: src/css/item/_weapon.css ── */
```

`tailwind.config.js` is fully wired. Templates progressively swap classes from custom CSS to Tailwind utilities (`tw-*` prefix). When a template no longer references any rule from a given source-block, the block is deleted from the monolith via `pnpm css:block delete <source-path>`. The monolith shrinks toward the trailing two `@tailwind` directives plus a small Foundry-chrome residual layer.

The win is incremental. A single PR may port one template and delete one source-block — the ratchet gates the regression direction; agents grind in the other direction.

## Invariants

1. **Never edit `src/css/wh40k-rpg.css` to add new rules.** All new styling is Tailwind utilities inline on templates, or — only when truly cross-cutting — a Tailwind component plugin in `tailwind.config.js`.
2. **Use the `tw-` prefix.** It is configured globally; raw class names like `flex` will not be emitted.
3. **Inline `@apply` is not allowed in template-scoped CSS.** When a ported template's source-block uses `@apply`, inline the underlying utilities at the call site and discard the `@apply` rule.
4. **Foundry chrome stays.** Any selector targeting `.ProseMirror`, `.editor-content`, `#chat-log`, `#chat-controls`, `.app`, `.application`, `.window-content`, `.form-fields`, `.filepicker`, or other Foundry-V14 internals does not get ported — it survives in the residual CSS layer. When deleting a block that contains both component rules and Foundry-chrome rules, salvage the chrome rules into `src/css/foundry-chrome.css` (creating it on first use) and delete the rest.
5. **Never delete a block whose template still uses the rules.** Verify the target template has been fully ported (`pnpm css:coverage` shows it as `tailwind-only`) before running `pnpm css:block delete`.
6. **Per-system homologation.** A migrated template should serve all 7 game systems unless an explicit per-system variant exists (`header-bc.hbs`, `header-im.hbs`, etc.). When porting, do not introduce `wh40k-rpg`-keyed branches that did not exist in the source — keep system-agnostic.

## Workflow per template

1. **Pick a target** — anything reported as `mixed` or `css-only` in `pnpm css:coverage` is fair game. Prefer leaf partials (no children) before composing partials, so each port is self-contained.
2. **Read the template.** Identify the class tokens it uses.
3. **Find the relevant source-block(s).** The fastest way: `grep -n '\.<class-name>' src/css/wh40k-rpg.css` and then look up the surrounding `── source: ── ` marker. Cross-reference with `pnpm css:block list` to see all the source paths.
4. **Translate each rule using the token map** at `scripts/css-token-map.json`. Common patterns:
   - `padding: var(--wh40k-space-4)` → `tw-p-2`
   - `color: var(--wh40k-color-gold)` → `tw-text-gold`
   - `font-family: var(--wh40k-font-display)` → `tw-font-display`
   - `border-radius: var(--wh40k-radius-md)` → `tw-rounded-md`
5. **Replace classes on the template.** Inline the utilities. Where a class is used by JS for selection (`document.querySelector('.foo')`), keep the class but pair it with Tailwind utilities — selectors used as JS hooks are not styling concerns.
6. **Re-run `pnpm css:coverage --quiet`** and confirm the file moves toward `tailwind-only`.
7. **Delete the source-block** if and only if no other unported template still uses it. `pnpm css:block delete src/css/item/_weapon.css` removes every range for that path and regenerates `.css-blocks.json`.
8. **Run `pnpm css:ratchet:update`** to lower the baseline.
9. **Commit.** The pre-commit ratchet validates non-regression.

## Token translation cheat sheet

The exhaustive map lives at `scripts/css-token-map.json`. Highlights:

| CSS variable / value | Tailwind utility (without `tw-` prefix) |
| --- | --- |
| `var(--wh40k-color-gold)` | `text-gold` (or `bg-gold`, `border-gold`, etc.) |
| `var(--wh40k-color-crimson)` | `text-crimson` |
| `var(--wh40k-color-success)` | `text-success` |
| `var(--wh40k-color-accent-combat)` | `text-accent-combat` |
| `var(--wh40k-space-4)` | `2` (use as `m-2`, `p-2`, `gap-2`, etc.) |
| `var(--wh40k-space-3)` | `1.5` |
| `var(--wh40k-font-display)` | `font-display` |
| `var(--wh40k-font-body)` | `font-body` |
| `var(--wh40k-font-size-sm)` | `text-sm` |
| `var(--wh40k-radius-md)` | `rounded-md` |
| `var(--wh40k-shadow-md)` | `shadow-md` |
| `display: flex` | `flex` (use `flex flex-col` for vertical) |
| `display: grid` | `grid` (with `grid-cols-N` or named `grid-cols-skill-row`) |
| `align-items: center` | `items-center` |
| `justify-content: space-between` | `justify-between` |
| `position: absolute` | `absolute` |
| `cursor: pointer` | `cursor-pointer` |

For arbitrary values (e.g. an unusual `min-height`), use Tailwind's bracket syntax: `tw-min-h-[80px]`. Prefer extending `tailwind.config.js` over many one-off bracket values for a recurring number.

## Keyframes

`tailwind.config.js` already ships `flash-gold` and `fury-pulse`. The monolith contains roughly thirty more (`statIncrease`, `statDecrease`, `pulse-warn-intense`, `wh40k-pulse`, `bolt-glow`, etc.). When a template you are porting uses an animation:

1. Find the `@keyframes <name> { ... }` block in the monolith.
2. Add it to `theme.extend.keyframes` in `tailwind.config.js`.
3. Add an `animation: { '<name>': '<name> <duration> <timing>' }` entry in `theme.extend.animation`.
4. Use `tw-animate-<name>` on the template.
5. Delete the original `@keyframes` rule from the monolith as part of the source-block deletion (or, if it lives outside any marked block, delete it explicitly and note it in the commit).

## Per-system templates

`header-dh.hbs` (DH2 default), `header-dh1.hbs`, `header-im.hbs`, `header-bc.hbs`, `header-rt.hbs` etc. are sibling files. Port each independently — do not collapse them into one. The whole point of the per-system variant pattern is that each system can diverge visually without polluting the others. A change that improves one of them must, at minimum, not regress the other six; verify by spot-checking the corresponding sheet in Storybook for each system you can.

## When to extract a Tailwind component plugin

Almost never. The bar is: the same exact class combination appears on >5 templates, with no per-template variation, AND it represents a *named visual concept* (e.g. `wh40k-stat-card`, not "row of three centered things"). The existing `.form-group` plugin is a fair example — every dialog uses it. If you decide to extract one, add it to the `addComponents` block in `tailwind.config.js`, NOT a new CSS file. Inside `addComponents`, prefer raw CSS over `@apply` — the `tw-` prefix configuration leaks into `@apply` in confusing ways.

## How to recognise progress

```bash
pnpm css:coverage         # markdown table per directory
pnpm css:block list       # every remaining source-path with line counts
node -e "console.log(JSON.parse(require('fs').readFileSync('.css-blocks.json')).summary)"
```

Goals (long-term, not per-PR):

- `summary.distinctSources` heads to a single residual `src/css/foundry-chrome.css` block.
- `summary.coveredLines` heads toward 0 (everything else above is just the trailing `@tailwind` directives).
- `byDir["css-only"]` heads to 0 in every row of the table.

## When the recipe doesn't fit

Stop and document. Real cases that break the recipe:

- A rule depends on a `:has()` selector that Foundry's stylesheet emits — fine to leave behind in the residual.
- A computed style depends on a runtime CSS variable from a parent component — port the parent first.
- A rule targets generated DOM from `ProseMirror` or another vendored editor — chrome layer.

When you stop, leave the source-block in place and add a short note in your commit so the next agent doesn't re-attempt the same port.
