# Per-system theme adoption — grinder recipe

**Task:** Add per-system Tailwind variants (`bc:tw-*`, `dh1e:tw-*`, `dh2e:tw-*`, `dw:tw-*`, `ow:tw-*`, `rt:tw-*`, `im:tw-*`) to one Handlebars template so its visual treatment differs per game system. The `pnpm theme:coverage` adopted-template count must rise by exactly 1 (when adopting a previously-unadopted template).

**Worked example:** PR for `src/templates/dialogs/advancement-dialog.hbs` added a `data-wh40k-system` attribute on the dialog root (sourced from `_gameSystemId` in context) and per-system text-color variants on the XP-available element. Read that diff before starting.

---

## Ratchet contract

You may land your edit ONLY if **all** of the following hold:

| Metric | Direction | Command |
| --- | --- | --- |
| Adopted templates count | MUST RISE by ≥1 (or stay equal if template was already adopted and you are adding more variants) | `pnpm theme:coverage` |
| Animation declarations in monolith | MUST NOT RISE | `pnpm animation:coverage` |
| TSC total errors | MUST NOT RISE | `pnpm typecheck` |
| ESLint warnings | MUST NOT RISE | `pnpm lint` |
| Vitest suite | MUST PASS | `pnpm test` |
| Preload drift | MUST PASS (hard gate) | `pnpm preload:drift` |

After landing, run `pnpm theme:ratchet:update`. Commit the baseline change in the same commit.

**Detection rule:** the coverage script (`scripts/theme-coverage.mjs`) considers a template adopted when its file content matches `\b(bc|dh1e|dh2e|dw|ow|rt|im):tw-`. Calls to `{{themeClassFor 'role'}}` do NOT qualify the template for adoption — the helper emits a bare `tw-*` class at render time, which the static scan can't see. Use the helper for repeated surfaces, but always include at least one inline `<id>:tw-*` chain so the file registers.

---

## Recipe

### 1. Pick a target

Find a template that:

- Currently uses hardcoded gold/bronze/crimson colors (`var(--wh40k-color-gold)`, `tw-text-bronze`, etc.) without per-system divergence.
- Has at least one element where divergence is meaningful (header, accent border, primary call-to-action).
- Is rendered inside a `wh40k-rpg` ancestor (any sheet, dialog with `classes: ['wh40k-rpg', …]`, or chat card whose root carries the class — see `.foundry/CLAUDE.md` "Check the `.wh40k-rpg` ancestor for ALL `tw-*` utilities").

High-impact unadopted templates as of wave 1: `combat-quick-panel.hbs`, `degree-meter-panel.hbs`, `chat-card-shell.hbs`, `roll-card-shell.hbs`, `weapon-roll-prompt.hbs`. Refer to the explore report in the wave-1 plan for a fuller list.

### 2. Wire the system attribute

Variants only fire when an ancestor in the rendered DOM carries `data-wh40k-system="<id>"`. Confirm this is true for your target:

- **Inside a sheet:** sheets that use `PrimarySheetMixin` already set `_gameSystemId` on context and surface the attribute on the sheet root. Variants on inner partials work automatically.
- **Inside a dialog (ApplicationV2):** add `_gameSystemId` to the context in `_prepareContext`, then add `data-wh40k-system="{{_gameSystemId}}"` on the template's outer `<div>`. Reference: `src/module/applications/dialogs/advancement-dialog.ts` `_prepareContext`.
- **Inside a chat card:** templates rendered into `<ol id="chat-log">` have NO `wh40k-rpg` ancestor by default. The `renderChatMessageHTML` hook in `src/module/actions/basic-action-manager.ts` adds the class to the message element. For per-system variants, also accept a `gameSystem` hash param on the partial and emit `data-wh40k-system="{{gameSystem}}"` on the card root. Pattern: `src/templates/chat/item-card-chat.hbs:3`.
- **Inside a prompt rendered against the canvas:** verify the dialog root carries the class and surface the attribute the same way as a regular dialog.

If you can't satisfy the ancestor requirement, stop and ask — adding the attribute requires touching TS plumbing and may exceed grinder scope.

### 3. Read the system theme blocks

Each system config under `src/module/config/game-systems/<id>-config.ts` declares a `theme` block:

```ts
readonly theme = {
    primary: 'bronze',       // → tw-bg-bronze, tw-text-bronze, tw-border-bronze
    accent:  'gold-raw',
    border:  'gold-raw-d10',
} as const;
```

Per-system accent/primary/border colors as of wave 1:

| System | primary           | accent             | border            |
| ------ | ----------------- | ------------------ | ----------------- |
| bc     | crimson           | crimson-light      | crimson-dark      |
| dh1e   | gold-raw          | gold-raw-l5        | gold-raw-d15      |
| dh2e   | bronze            | gold-raw           | gold-raw-d10      |
| dw     | bronze            | accent-combat      | accent-combat-d10 |
| im     | crimson-light     | failure            | failure-l10       |
| ow     | brass             | brass-l20          | brass-d15         |
| rt     | accent-dynasty    | gold               | gold-dark         |

These values may drift; re-read the configs before relying on this table.

### 4. Apply variants

#### 4a. Inline variant chain (preferred for ≤2 reuse surfaces)

Write the chain literally on the element. Order is alphabetical for grep-ability:

```hbs
<span class="wh40k-adv__xp-available
             bc:tw-text-crimson-light
             dh1e:tw-text-gold-raw-l5
             dh2e:tw-text-gold-raw
             dw:tw-text-accent-combat
             im:tw-text-failure
             ow:tw-text-brass-l20
             rt:tw-text-gold">
```

Tailwind's static template scan sees these literally and emits the underlying utilities — no safelisting needed. **DO NOT add inline-variant classes to the safelist.**

#### 4b. `themeClassFor` helper (preferred for ≥3 reuse surfaces in one file)

```hbs
<button class="wh40k-btn {{themeClassFor 'border'}} {{themeClassFor 'primary'}}">
```

The helper reads `@root._gameSystemId` and returns a bare `tw-<role>-<value>` class. Tailwind can't see this through the static scan, so the resolved class names MUST be added to `tailwind.config.js` `safelist`. Pattern in `tailwind.config.js`:

```js
safelist: [
    { pattern: /^tw-animate-/ },
    'tw-border-bronze', 'tw-border-gold-raw-d10', /* … one per system */
],
```

When you add a helper call, walk the 7 system configs and add the resolved classes to the safelist if they are not already present.

#### 4c. Mixed approach (allowed)

Use the helper for the primary semantic role (e.g., border on every panel) and inline variants for one-shot decorative dressings.

### 5. Don't touch existing CSS rules

Adoption work does NOT delete the underlying CSS. Hardcoded colors in the monolith stay until the css ratchet drives that template to `tailwind-only`. Variants overlay on top of the CSS via Tailwind's `important: '.wh40k-rpg'` config — utilities win the cascade.

### 6. Gate

```bash
pnpm theme:coverage       # confirm rise (or stable if extending)
pnpm animation:coverage   # confirm not rising
pnpm preload:drift        # hard gate
pnpm typecheck            # no new errors
pnpm lint                 # no new warnings
pnpm test                 # vitest passes
```

Then `pnpm theme:ratchet:update` and commit (template + optional TS context + optional safelist + baseline) in one atomic commit.

---

## Forbidden moves

- Hardcoding hex values or new CSS variables in the template. Theme values come from system configs only.
- Inventing a new `theme.<role>` key without updating ALL seven configs and the `SystemTheme` type in `src/module/config/game-systems/types.ts`.
- Adding inline `<id>:tw-*` classes to `safelist` (they are already visible to Tailwind's static scan and adding them to safelist obscures whether the static scan is working).
- Leaving a `themeClassFor`-emitted class out of the safelist — the build will pass but the class won't render.
- Skipping the `data-wh40k-system` attribute check for non-sheet roots (chat, popout, canvas-anchored prompts). The variant chain will be inert without it.
- Adopting more than one template per commit. Reviewers need atomic adoption units.

## Scope

One template per commit. The adopted count rises by exactly 1.
