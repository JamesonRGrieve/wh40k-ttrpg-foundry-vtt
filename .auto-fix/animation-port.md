# Animation port — grinder recipe

**Task:** Port one `animation:` declaration from `src/css/wh40k-rpg.css` (the monolith) onto its consuming Handlebars template as a `tw-animate-<name>` utility class. Delete the source declaration. The `pnpm animation:coverage` count must drop by exactly the number of declarations you removed.

**Worked example:** PR for `src/templates/dialogs/advancement-dialog.hbs` (the canonical wave-1 PR) — six declarations ported in one pass:

- `xp-shimmer 2s infinite` (pseudo-element refactor)
- `fadeIn` × 2 (with arbitrary-value duration)
- `purchasePulse 0.6s ease-out` × 2 (default match)
- `currentPulse 1.5s ease-in-out infinite` (default match)

Read the diff for the canonical example before starting.

---

## Ratchet contract

You may land your edit ONLY if **all** of the following hold:

| Metric | Direction | Command |
| --- | --- | --- |
| Animation declarations in monolith | MUST DROP by ≥1 | `pnpm animation:coverage` |
| Tailwind-only / mixed / css-only template classification | MUST NOT REGRESS | `pnpm css:coverage` |
| Per-system theme adoption | MUST NOT FALL | `pnpm theme:coverage` |
| TSC total errors | MUST NOT RISE | `pnpm typecheck` |
| ESLint warnings | MUST NOT RISE | `pnpm lint` |
| Vitest suite | MUST PASS | `pnpm test` |
| Preload drift | MUST PASS (hard gate) | `pnpm preload:drift` |

After landing, run `pnpm animation:ratchet:update` to lower the baseline. Commit the baseline change in the same commit as the port.

---

## Recipe

### 1. Pick a target

Find an `animation:` line in the monolith whose selector you can locate in a template. Easy first targets:

- Selectors applied via a stable class in a single template (no JS-driven class toggling).
- Selectors whose timing matches an entry in `tailwind.config.js` `theme.extend.animation` (those need no arbitrary value).

Avoid selectors that:

- Are referenced from JS via dynamic `classList.add(...)` — confirm before touching.
- Live inside a `@media (prefers-reduced-motion)` or other at-rule wrapper — those need the wrapping rule preserved or moved, not deleted.

### 2. Match timing

Every `tw-animate-<name>` utility comes from `theme.extend.animation` in `tailwind.config.js`. Look up the entry; if its timing string equals the monolith's `animation:` value, you can use the bare class. Otherwise emit an arbitrary-value class:

```
tw-animate-[<name>_<duration>_<timing-fn>]
```

Examples:

- Default match: `tw-animate-purchasePulse`, `tw-animate-currentPulse`.
- Mismatched duration: `tw-animate-[fadeIn_250ms_ease]`, `tw-animate-[pulse-glow_0.8s_ease-in-out]`.

**DO NOT edit `tailwind.config.js` keyframes or animation entries.** Every keyframe used in the monolith is already wired up; if you can't find one, stop and ask.

### 3. Apply on the template

Add the class on the element that matched the selector. If the selector was a class modifier applied by Handlebars conditional, append the new class inside the same `{{#if}}` block so it only fires when the modifier is active:

```hbs
{{!-- before --}}
<div class="wh40k-adv__char-card {{#if recentlyPurchased}}wh40k-adv__char-card--purchased{{/if}}">

{{!-- after --}}
<div class="wh40k-adv__char-card {{#if recentlyPurchased}}wh40k-adv__char-card--purchased tw-animate-purchasePulse{{/if}}">
```

### 4. Pseudo-element refactor (sub-recipe)

If the source rule's selector is a pseudo (`::before`, `::after`, `::marker`), you MUST add a real DOM child to the consuming template instead of leaving the pseudo. Pseudos are NOT an acceptable terminal state — see `.foundry/CLAUDE.md` "Pseudo-element animations are refactored, not preserved."

Pattern (canonical example: `.wh40k-adv__xp-fill::after`):

```hbs
{{!-- before --}}
<div class="wh40k-adv__xp-fill" style="width: {{usedPercent}}%"></div>

{{!-- after --}}
<div class="wh40k-adv__xp-fill" style="width: {{usedPercent}}%">
  <span class="wh40k-adv__xp-fill-shimmer tw-pointer-events-none tw-absolute tw-inset-0 tw-animate-xp-shimmer
               tw-bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.2),transparent)]"></span>
</div>
```

Rules:

- New element gets a descriptive `wh40k-<component-abbr>__<role>` class — never re-use the parent's class.
- Apply `tw-pointer-events-none` and `tw-absolute tw-inset-0` (or whatever positioning the pseudo had — translate `inset: 0` → `tw-inset-0`, `top: 0; right: 0` → `tw-top-0 tw-right-0`, etc.).
- Stacked pseudos (`::before` + `::after` on the same parent) become two sibling elements.
- Inline any `background:` / `content:` / non-positioning visuals as Tailwind utilities or `style="…"` (arbitrary-value classes preferred).
- The parent element must be `position: relative` (or `tw-relative`) for the absolute child to anchor correctly. Verify in the parent rule before assuming.

### 5. Strip the monolith

Open the source rule in `src/css/wh40k-rpg.css` at the line `pnpm animation:coverage` reported.

- If the rule contains ONLY the `animation:` declaration, delete the whole rule (selector + braces).
- If the rule has other declarations, delete only the `animation:` line; leave the rest.
- For pseudo-element rules, delete the whole `&::after { … }` (or `::before`, etc.) block. Never leave a pseudo behind.

Run `pnpm animation:coverage` and confirm the count dropped.

### 6. Gate

Before commit:

```bash
pnpm animation:coverage   # confirm drop
pnpm css:coverage         # confirm classification didn't regress
pnpm theme:coverage       # confirm adoption didn't fall
pnpm preload:drift        # hard gate
pnpm typecheck            # no new errors
pnpm lint                 # no new warnings
pnpm test                 # vitest passes
```

Then `pnpm animation:ratchet:update` and commit (template + monolith + baseline) in one atomic commit.

---

## Forbidden moves

- Editing `tailwind.config.js` (keyframes, animation entries, safelist).
- Leaving a `::before`/`::after`/`::marker` animation in the monolith — pseudos must be refactored.
- Mismatching duration/timing-function/iteration-count from the monolith. A port that uses the wrong duration is a regression even when the count drops.
- Bypassing the pre-commit hook with `--no-verify`. The hook is the safety net that makes cheap-LLM grinding viable.
- Touching unrelated rules in the monolith ("opportunistic cleanup"). One port per commit.
- Deleting safelist entries — the `safelist: [{ pattern: /^tw-animate-/ }]` stays until ALL animation rules are gone.

## Scope

One template per commit. Multiple `animation:` rules whose ALL selectors live in the same template may be batched (the canonical wave-1 example batched six). Do not batch across templates.
