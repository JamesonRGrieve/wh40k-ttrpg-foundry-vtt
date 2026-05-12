// Pulls in @total-typescript/ts-reset's lib augmentations. The package's
// `index.d.ts` is itself the trigger — importing the package's name (or its
// reset file) from a `.d.ts` activates every override:
//
//   - JSON.parse() returns `unknown` instead of `any`
//   - Response.json() returns `unknown`
//   - Array.isArray narrows to `readonly unknown[]` (no silent `any[]` widening)
//   - .filter(Boolean) narrows to the truthy variant
//   - Array.includes / Set.has accept a wider type (no false-negative narrowing)
//
// This is intentionally project-wide. The accompanying `: unknown ...` boundary
// rule in `.eslintrc.json` and the strict-flag ratchet make sure callers parse
// these wider types instead of casting them away.
import '@total-typescript/ts-reset';
