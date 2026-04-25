# TypeScript Typing Standards

This codebase is on a **strict-mode TypeScript ratchet**. New code must obey the rules below; existing weak-typing islands are tracked by `.tsc-error-baseline` and are expected to shrink, not grow.

## Compiler configuration

`tsconfig.json`:

| Flag                          | Value | Notes                                        |
|-------------------------------|-------|----------------------------------------------|
| `strict`                      | true  | Enables the full strict family.              |
| `strictNullChecks`            | true  | Explicit; do not rely on the `strict` umbrella alone. |
| `noImplicitAny`               | true  |                                              |
| `noImplicitThis`              | true  |                                              |
| `useUnknownInCatchVariables`  | true  | (Set by `strict`.) `catch (e: unknown)`.     |
| `allowJs`                     | false | No `.js` files in `src/`. New files must be `.ts`. |
| `skipLibCheck`                | true  | Foundry V14 types are still in flux.         |

The `pnpm typecheck:ratchet` script gates new tsc errors via the pre-commit hook. A parallel `pnpm lint:ratchet` script gates new ESLint warnings the same way (baseline in `.eslint-warning-baseline`). Both run in `.husky/pre-commit` after `lint-staged`.

## Established patterns

| Concern              | Canonical example                                                   | Pattern |
|----------------------|---------------------------------------------------------------------|---------|
| Mixin                | `src/module/data/templates/horde-template.ts`                       | `<T extends Constructor<...>>(Base: T)` returning `class extends Base { declare ... }` |
| Data model           | `src/module/data/character.ts`                                      | `interface SystemData` + `defineSchema()` + `declare` blocks matching schema |
| Sheet composition    | `src/module/applications/sheets/base-actor-sheet.ts`                | Layered `as unknown as AnyApplicationV2Ctor` casts + per-mixin `declare` block in the final class |
| Document             | `src/module/documents/base-actor.ts`, `src/module/documents/item.ts` | `declare system: WH40K…SystemData`; instance shape inherits via `extends Actor` / `extends Item` from `ActorBase`/`ItemBase` |
| Foundry global type  | `src/module/types/global.d.ts`                                      | Project-narrow interfaces (`HooksAPI`, `RollClass`, `ChatMessageClass`, etc.) with the methods the codebase actually uses |
| V14 API gaps         | `foundry-v14-overrides.d.ts`                                        | `declare global` namespace patches; never edit `node_modules` |

When unsure how to type something new, mirror the closest example above.

## Rules

1. **No `any` in new code.** Replace with the actual type, a generic parameter, or `unknown` + a runtime narrow at the boundary. If the only correct type is genuinely a Foundry types gap, use a `// foundry-v14-bug:` comment, an `unknown` placeholder, AND a tracked upstream issue link — never a bare `any`.

2. **No `@ts-ignore`.** Use `@ts-expect-error` so the directive becomes a TS2578 error if the underlying problem is fixed. Every directive carries an inline reason (`// @ts-expect-error - <why>`).

3. **No non-null assertions (`!`).** Use a type guard, optional chaining, or restructure the call. The only allowed exception: invariants enforced elsewhere, with a `// non-null: <reason>` comment at the call site.

4. **`catch (e: unknown)`.** Narrow with `instanceof Error` (or `Error.isError`) before reading `.message`. Don't reach for `(e as any).foo`.

5. **Globals route through `src/module/types/global.d.ts`.** Don't redeclare Foundry globals locally. If a property is missing from the narrow interface there, add it to the interface — don't `as any`.

6. **System-data shapes live on `WH40KActorSystemData` / `WH40KItemSystemData`.** When you add a new schema field in `defineSchema()`, mirror it in the corresponding type. If a property is subclass-specific (vehicle-only, starship-only, etc.), put it on the subclass interface rather than the union.

## When the ratchet fails

`pre-commit` runs `pnpm typecheck:ratchet`. If it fails:

1. **You added new errors.** Read them and fix. Common causes: a new file touched a previously-typed surface, or a type narrowed somewhere in your changes.
2. **You can't fix them in this commit.** Bail out: revert the offending change. Don't disable the hook (`--no-verify`) — the baseline drift hides regressions and burns hours later.
3. **The errors are pre-existing in the file you touched** but you haven't increased the count. The ratchet should pass. If it doesn't, run `pnpm typecheck` directly and read the full output — likely there's an indirect cascade.

When you reduce the count, update the baseline in the same commit:

```sh
pnpm typecheck:ratchet:update
git add .tsc-error-baseline
```

## Incremental cleanup

The remaining error backlog (see `.tsc-error-baseline` for the current number) is concentrated in:

- `src/module/applications/actor/character-sheet.ts` (heaviest)
- `src/module/applications/actor/npc-sheet.ts`
- `src/module/applications/character-creation/origin-path-builder.ts`
- `src/module/applications/prompts/unified-roll-dialog.ts`
- `src/module/applications/actor/base-actor-sheet.ts`

These need per-file work to lift `Record<string, unknown>` render contexts to typed shapes. The pattern is: define a `<Sheet>RenderContext` interface near the class, replace `Record<string, unknown>` returns with that interface, and let the cascade resolve. Each conversion typically clears 50–100 errors.

## What `100% strong typing` means here

- `strict: true`, `strictNullChecks: true`, `allowJs: false` — enforced by `tsconfig.json`.
- Zero `@ts-ignore` (verified in CI).
- Zero unused `@ts-expect-error` (TS2578 — verified by the ratchet).
- Foundry globals are real interfaces, not `any`.
- The `any` count and tsc error count both ratchet downward; `.tsc-error-baseline` records current truth.

The goal of zero `any` and zero tsc errors is approached by ratcheting, not by a single sweep. New work pays its own way; legacy hotspots are fixed file-by-file in dedicated commits.
