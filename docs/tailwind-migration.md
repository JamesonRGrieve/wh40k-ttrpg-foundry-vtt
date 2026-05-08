# Tailwind Migration Handbook

This document is the recipe for porting `.hbs` templates from legacy gothic-theme component classes (`wh40k-panel`, `wh40k-tooltip__title`, etc.) to inline Tailwind utilities. Both human and agent contributors follow it. Coverage is tracked by `pnpm css:coverage` and ratcheted by `pnpm css:ratchet` (pre-commit gate).

## What we are doing and why

Styling lives in three places:

1. **`src/css/entry.css`** — the only CSS file. Twelve lines: Google Fonts `@import url(...)` plus the three `@tailwind base/components/utilities` directives. Do not add rules here.
2. **`tailwind.config.js`** — Tailwind v3 config, with `important: '.wh40k-rpg'`, `prefix: 'tw-'`, animation/keyframe definitions, the per-system `addVariant` registrations, and the `addBase` plugin that loads every legacy component file.
3. **`tailwind/*.js`** — nine CSS-in-JS plugin objects that hold the absorbed legacy gothic-theme rules:
    - `design-tokens.js` — `:root` / `body.theme-*` design-token CSS custom properties.
    - `panel-components.js` — the `.wh40k-panel*` collapsible system.
    - `legacy-components.js` — `.wh40k-rpg.sheet.item .window-content`, hit-location chat card, actor-sheet scroll/flex overrides.
    - `item-preview.js`, `wh40k-tooltip.js`, `compendium-browser.js`, `npc-sheet.js`, `foundry-chrome.js`, `weapon.js` — per-component class libraries.

The plugin files are migration debt, not the target architecture. Templates progressively swap legacy classes for inline `tw-*` utilities. When every consumer template is fully ported, the relevant rules are removed from the plugin file (or the plugin file is deleted outright and its require is dropped from `tailwind.config.js`).

The win is incremental. A single PR may port one template's worth of rules and trim the corresponding plugin object — the ratchet gates the regression direction; agents grind in the other direction.

## Invariants

1. **Never add rules to `tailwind/*.js` plugin files for new components.** All new styling is Tailwind utilities inline on templates, or — only when truly cross-cutting — a Tailwind component plugin in `tailwind.config.js`.
2. **Use the `tw-` prefix.** It is configured globally; raw class names like `flex` will not be emitted.
3. **`addBase`, not `addComponents`, for legacy class registration.** Tailwind's `prefix: 'tw-'` config prepends `tw-` to every class registered through `addComponents`, mangling the bare `wh40k-*` class names. `addBase` emits selectors literally and produces the cascade order we want (legacy → utilities).
4. **Foundry chrome stays.** Any selector targeting `.ProseMirror`, `.editor-content`, `#chat-log`, `#chat-controls`, `.app`, `.application`, `.window-content`, `.form-fields`, `.filepicker`, or other Foundry-V14 internals stays in `tailwind/foundry-chrome.js` indefinitely. They are scoped global overrides, not component CSS, and have no template-side equivalent.
5. **Never delete a plugin object whose template still uses the rules.** Verify the target template has been fully ported (`pnpm css:coverage` shows it as `tailwind-only`) before stripping the corresponding entries from a `tailwind/*.js` file.
6. **Per-system homologation.** A migrated template should serve all 7 game systems unless an explicit per-system variant exists (`header-bc.hbs`, `header-im.hbs`, etc.). When porting, do not introduce `wh40k-rpg`-keyed branches that did not exist in the source — keep system-agnostic.

## Workflow per template

1. **Pick a target** — anything reported as `mixed` or `css-only` in `pnpm css:coverage` is fair game. Prefer leaf partials (no children) before composing partials, so each port is self-contained.
2. **Read the template.** Identify the class tokens it uses.
3. **Find the relevant plugin entries.** The fastest way: `grep -rln "<class-name>" tailwind/` and look at the matching CSS-in-JS object. Each `tailwind/*.js` file is small enough to read end-to-end.
4. **Translate each rule using the token map** at `scripts/css-token-map.json`. Common patterns:
    - `padding: var(--wh40k-space-4)` → `tw-p-2`
    - `color: var(--wh40k-color-gold)` → `tw-text-gold`
    - `font-family: var(--wh40k-font-display)` → `tw-font-display`
    - `border-radius: var(--wh40k-radius-md)` → `tw-rounded-md`
5. **Replace classes on the template.** Inline the utilities. Where a class is used by JS for selection (`document.querySelector('.foo')`), keep the class but pair it with Tailwind utilities — selectors used as JS hooks are not styling concerns.
6. **Re-run `pnpm css:coverage --quiet`** and confirm the file moves toward `tailwind-only`.
7. **Strip the rules from the plugin file.** Remove every entry no longer referenced by any template. If the plugin file becomes empty, delete it and remove the matching entry from the spread in `tailwind.config.js` (`tailwind/legacy-components.js` consumer at the top of the config).
8. **Commit.** The pre-commit ratchet validates non-regression.

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

`tailwind.config.js` ships every keyframe currently used by the system in `theme.extend.keyframes` and `theme.extend.animation`. When a legacy plugin object still has an `animation: <name> ...` declaration on one of its selectors and you are porting a consumer template:

1. Confirm the keyframe is registered under `theme.extend.keyframes` in `tailwind.config.js`. If not, copy it from wherever the legacy declaration lives and add it.
2. Confirm a paired `theme.extend.animation` entry exists. If not, add one with the duration / timing-function / iteration / fill-mode copied from the legacy declaration.
3. Use `tw-animate-<name>` on the template.
4. Remove the `animation: <name> ...` declaration from the plugin object, and remove the associated rule entirely if the rule has nothing else.

## Per-system templates

`header-dh.hbs` (DH2 default), `header-dh1.hbs`, `header-im.hbs`, `header-bc.hbs`, `header-rt.hbs` etc. are sibling files. Port each independently — do not collapse them into one. The whole point of the per-system variant pattern is that each system can diverge visually without polluting the others. A change that improves one of them must, at minimum, not regress the other six; verify by spot-checking the corresponding sheet in Storybook for each system you can.

## When to extract a Tailwind component plugin

Almost never. The bar is: the same exact class combination appears on >5 templates, with no per-template variation, AND it represents a *named visual concept* (e.g. `wh40k-stat-card`, not "row of three centered things"). The existing `.form-group` plugin is a fair example — every dialog uses it. If you decide to extract one, add it to the `addComponents` block in `tailwind.config.js`, NOT a new file under `tailwind/`. Inside `addComponents`, prefer raw CSS over `@apply` — the `tw-` prefix configuration leaks into `@apply` in confusing ways. Note that `addComponents` prefixes selectors with `tw-`, so the consumer template must write `class="tw-stat-card"`, not `class="stat-card"`.

## How to recognise progress

```bash
pnpm css:coverage         # markdown table per directory
ls tailwind/              # plugin files still carrying legacy rules
wc -l tailwind/*.js       # line counts per plugin file
```

Goals (long-term, not per-PR):

- `tailwind/foundry-chrome.js` is the last legacy plugin standing. Everything else gets fully ported away over time.
- `byDir["css-only"]` stays at 0 in every row of the `pnpm css:coverage` table.
- `tailwind/*.js` plugin file count strictly decreases on every legacy port.

## When the recipe doesn't fit

Stop and document. Real cases that break the recipe:

- A rule depends on a `:has()` selector that Foundry's stylesheet emits — fine to leave behind in `tailwind/foundry-chrome.js`.
- A computed style depends on a runtime CSS variable from a parent component — port the parent first.
- A rule targets generated DOM from `ProseMirror` or another vendored editor — chrome layer.

When you stop, leave the plugin entry in place and add a short note in your commit so the next agent doesn't re-attempt the same port.
