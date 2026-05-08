# TypeScript Typing Standards

This codebase is on **strict-mode TypeScript with a hard typecheck gate**. `tsc --noEmit` must pass with zero errors — every commit, no exceptions. New code must obey the rules below.

## Compiler configuration

Canonical Foundry type source: `fvtt-types`. The duplicate `@league-of-foundry-developers/foundry-vtt-types`
package is not used directly in this repo and should not be reintroduced. Base V13 types come from
`fvtt-types`; local V14 deltas belong in `foundry-v14-overrides.d.ts`; project-specific augmentations belong
under `src/module/types/`, not in the V14 override file.

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

`pnpm typecheck` runs as a hard pre-commit gate — any tsc error blocks the commit. The `pnpm lint:ratchet` script (baseline in `.eslint-warning-baseline`) still ratchets ESLint warnings downward. Both run in `.husky/pre-commit` after `lint-staged`.

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

## When the typecheck gate fails

`pre-commit` runs `pnpm typecheck`. If it fails:

1. **You added new errors.** Read them and fix. Common causes: a new file touched a previously-typed surface, or a type narrowed somewhere in your changes.
2. **You can't fix them in this commit.** Bail out: revert the offending change. Don't disable the hook (`--no-verify`).

## What `100% strong typing` means here

- `strict: true`, `strictNullChecks: true`, `allowJs: false` — enforced by `tsconfig.json`.
- Zero tsc errors — enforced by the pre-commit hard gate.
- Zero `@ts-ignore` (verified in CI).
- Zero unused `@ts-expect-error` (TS2578 — caught by the typecheck gate).
- Foundry globals are real interfaces, not `any`.
- The `any` count ratchets downward via `pnpm ts:ratchet`.
