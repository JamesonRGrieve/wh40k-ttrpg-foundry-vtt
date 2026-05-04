#!/home/jameson/.local/share/uv/tools/aider-chat/bin/python
"""
Auto-fix TSC errors or ESLint warnings using aider + local Qwen3-Coder via vLLM,
with a Gemini/Codex fallback ladder.

Usage:
    ./run.py                          # tsc mode, tiers 1+2 from existing manifest
    ./run.py --mode lint              # lint mode (eslint warnings)
    ./run.py --scrape                 # Re-scrape errors/warnings into manifest, then run
    ./run.py --scrape --dry           # Re-scrape only, don't fix anything
    ./run.py --reset                  # Clear progress and start fresh (current mode only)
    ./run.py 1                        # Run tier 1 only
    ./run.py --mode lint --scrape 1   # Re-scrape lint, then run tier 1

Each file fix is ratchet-gated:
  - tsc mode:  TSC must DROP, lint must NOT RISE, no new TS codes introduced.
  - lint mode: Lint must DROP, TSC must NOT RISE, no new lint rules introduced.

After ratchet passes, a Gemini-flash sanity check asks:
  "Does this diff only change typing and/or fix lint warnings and not change
   functionality or cause errors? YES/NO."
A NO response rolls back the file and escalates the ladder. Failures roll back
the file and log the full exchange for prompt tuning.
"""

import argparse
import json
import os
import re
import subprocess
import sys
import time
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AUTOFIX = Path(__file__).resolve().parent
LOG = AUTOFIX / "run.log"
FILE_LOGS = AUTOFIX / "file-logs"

# Mode-specific manifest and progress files. Existing tsc state stays at
# `progress.json` / `tsc-error-manifest.json` to preserve continuity.
MANIFEST_FILES = {
    "tsc": AUTOFIX / "tsc-error-manifest.json",
    "lint": AUTOFIX / "eslint-warning-manifest.json",
}
PROGRESS_FILES = {
    "tsc": AUTOFIX / "progress.json",
    "lint": AUTOFIX / "progress-lint.json",
}

os.environ["OPENAI_API_BASE"] = "http://198.51.100.9/v1"
os.environ["OPENAI_API_KEY"] = "dummy"

MODEL_NAME = "openai/cyankiwi/Qwen3-Coder-30B-A3B-Instruct-AWQ-4bit"
MAX_RETRIES = 2

# ── Fallback ladder (Gemini + Codex via harness ai.py) ──
HARNESS = "/home/jameson/source/harness/ai.py"
REAL_HOME = "/home/jameson"
GEMINI_SLOTS = [0, 1]
GEMINI_FLASH_LITE_MODELS = ["gemini-2.5-flash-lite"]
GEMINI_FLASH_MODELS = ["gemini-3-flash-preview", "gemini-2.5-flash"]
GEMINI_TIMEOUT = 600
CODEX_TIMEOUT = 900
GEMINI_BACKOFF_START = 60
GEMINI_BACKOFF_MAX = 600
GEMINI_BACKOFF_CYCLES = 3
FLASH_FAILURES_BEFORE_CODEX = 2

# Sanity-check uses the cheapest flash slot/model. Short timeout — it's a
# YES/NO answer. The check runs on the diff after ratchet acceptance.
SANITY_MODEL = "gemini-2.5-flash-lite"
SANITY_TIMEOUT = 120

MAX_FILE_LINES = 800

# ────────────────────────────────────────────────────────────────────────
# TSC error code competency (Qwen3-Coder-30B, 32K ctx, 8K out)
# ────────────────────────────────────────────────────────────────────────

EASY_CODES = {
    "TS7006", "TS7005", "TS7008", "TS7034", "TS7053", "TS7019", "TS7022",
    "TS18048", "TS18047", "TS2531", "TS2532", "TS2551",
}

MEDIUM_CODES = {
    "TS2339", "TS2345", "TS2322", "TS18046", "TS2365", "TS2367", "TS2352",
    "TS2353", "TS2564", "TS2576", "TS2571", "TS18049", "TS2488", "TS2538",
}

HARD_CODES = {
    "TS2416", "TS2740", "TS2554", "TS2769", "TS2349", "TS4113", "TS2417",
    "TS2741", "TS2739", "TS2694", "TS2314", "TS2794", "TS2790", "TS2783",
    "TS2698", "TS2683", "TS2722", "TS2707", "TS2545", "TS2774", "TS2833",
    "TS2556", "TS2363", "TS2362", "TS2355",
}

ERROR_GUIDANCE: dict[str, str] = {
    "TS7006": """TS7006 — Parameter implicitly has 'any' type.
Add an explicit type annotation to the parameter. Infer the type from how
the parameter is used in the function body: what properties are accessed,
what methods are called on it, what it's passed to. Use specific types from
the codebase imports, not `any`. For callback params in .map/.filter/.forEach,
the type comes from the array's element type. For event handlers, use the
DOM event type (MouseEvent, PointerEvent, etc.) or Foundry's event types.
Example: `(actor) =>` → `(actor: WH40KBaseActor) =>`""",

    "TS7005": """TS7005 / TS7034 — Variable implicitly has 'any' / 'any[]' type.
Add an explicit type annotation at the declaration site. Look at what gets
assigned to the variable later in the function to determine the correct type.
For arrays: `const items: SomeType[] = [];`
For objects: `const map: Record<string, SomeType> = {};`""",

    "TS7053": """TS7053 — Element implicitly has 'any' type because expression
can't index the target type. Fix by:
  1. If indexing an object with a string key: type the key as `keyof typeof obj`
     or cast: `obj[key as keyof typeof obj]`
  2. If the object should accept arbitrary keys: type it as
     `Record<string, ValueType>`
  3. If the index variable has type 'any': give it a proper type first
Example: `config[key]` where key is string → `config[key as keyof typeof config]`""",

    "TS18048": """TS18048 / TS18047 / TS2531 / TS2532 — Possibly null/undefined.
Add a null guard BEFORE the access. Preferred patterns (in order):
  1. Early return: `if (!value) return;` — best when the rest of the function
     needs the value
  2. Early throw: `if (!value) throw new Error('...');` — when absence is a bug
  3. Optional chaining: `value?.prop` — when null should silently produce undefined
  4. Non-null assertion: `value!` — ONLY when you are certain it exists (e.g.
     just checked on the line above, or it's guaranteed by the lifecycle)
Do NOT scatter `!` everywhere — prefer one early guard that narrows for the
rest of the block.""",

    "TS2339": """TS2339 — Property does not exist on type.
The variable's declared/inferred type doesn't include the accessed property.
Fix by:
  1. Check if the property exists on a more specific subtype → cast:
     `(value as SpecificType).property`
  2. Check if accessing the wrong property name → fix the name
  3. For Foundry CONFIG properties (CONFIG.ux, CONFIG.Item, CONFIG.Actor):
     cast CONFIG access: `(CONFIG as Record<string, any>).ux` — this is
     the ONE acceptable use of `any` (Foundry's CONFIG is untyped)
  4. If the type is genuinely missing the property and you control the type,
     add the property to the interface""",

    "TS2345": """TS2345 — Argument of type X is not assignable to parameter type Y.
The function expects a different type than what's being passed. Fix by:
  1. If the value IS the right type but TS can't prove it: cast at the
     call site: `fn(value as ExpectedType)`
  2. If a property is missing: add the missing property to the argument
  3. If the function signature is too narrow: widen the parameter type
Do NOT change function logic. Prefer casting at the call site.""",

    "TS2322": """TS2322 — Type X is not assignable to type Y.
A value is being assigned to a variable/property with an incompatible type.
Fix by:
  1. Cast the value: `value as TargetType`
  2. If it's a return type mismatch: adjust the return type annotation
  3. If it's a variable declaration: widen the variable's declared type
  4. For number↔string: use `String(n)` or `Number(s)`, not casts""",

    "TS18046": """TS18046 — Variable is of type 'unknown'.
Narrow the type before using it. Patterns:
  1. typeof guard: `if (typeof value === 'string') { ... }`
  2. instanceof: `if (value instanceof SomeClass) { ... }`
  3. Cast when you know the type: `const typed = value as KnownType;`
  4. For Foundry CONFIG access: `(CONFIG as Record<string, any>).propName`""",

    "TS2365": """TS2365 — Operator cannot be applied to types.
The operand types don't support the operator. Fix by:
  1. Cast the operand to number: `Number(value)` or `(value as number)`
  2. If comparing with a wrong type: fix the comparison target
  3. If the type is {} or object: narrow to the actual numeric type first""",

    "TS2367": """TS2367 — Comparison has no overlap between types.
The compiler thinks the comparison can never be true. Fix by:
  1. If comparing boolean to string (common in form data): the value comes
     from a form as a string — cast: `String(value) === 'true'`
  2. If the type is genuinely wrong: fix the type or the comparison""",

    "TS2352": """TS2352 — Type conversion may be a mistake (neither type overlaps).
Fix by double-casting through unknown:
  `value as unknown as TargetType`
Only do this when you're sure the runtime value IS the target type.""",

    "TS2353": """TS2353 — Object literal may only specify known properties.
The property exists at runtime but not in the type definition. Options:
  1. Remove the property if it's truly not needed by the target type
  2. Cast the whole object: `{ ...props } as ExtendedOptions`
  3. Extend the target interface to include the property""",

    "TS2551": """TS2551 — Property doesn't exist, did you mean X?
This is usually a typo. Rename to the compiler's suggestion.""",

    "TS2571": """TS2571 — Object is of type 'unknown'.
Same as TS18046. Narrow or cast before accessing properties.""",

    "TS2564": """TS2564 — Property has no initializer and is not assigned in constructor.
Add definite assignment assertion:
  `myProp!: SomeType;`
Use when Foundry's lifecycle (prepareData, _onRender, etc.) guarantees
assignment before access.""",

    "TS7008": """TS7008 — Member implicitly has 'any' type.
Add an explicit return type or type annotation to the class member.""",

    "TS7019": """TS7019 — Rest parameter implicitly has 'any[]' type.
Add type annotation to the rest parameter: `...args: unknown[]` or a more
specific tuple type.""",
}

# ────────────────────────────────────────────────────────────────────────
# ESLint rule competency
# ────────────────────────────────────────────────────────────────────────
#
# EASY: mechanical rewrites that don't require type-flow understanding.
# MEDIUM: type-aware fixes — narrow before use, replace `any` with a real
#         type, await/void promises, switch === to type-safe comparisons.
# HARD: structural — naming-convention churn, complexity refactors, cycles.

EASY_RULES = {
    "prefer-const",
    "no-var",
    "eqeqeq",
    "prefer-template",
    "no-useless-concat",
    "no-useless-return",
    "no-lonely-if",
    "no-unneeded-ternary",
    "prefer-arrow-callback",
    "prefer-rest-params",
    "default-case-last",
    "grouped-accessor-pairs",
    "no-duplicate-imports",
    "no-self-compare",
    "no-self-assign",
    "no-throw-literal",
    "no-template-curly-in-string",
    "prettier/prettier",
    "@typescript-eslint/consistent-type-imports",
    "@typescript-eslint/prefer-optional-chain",
    "@typescript-eslint/prefer-nullish-coalescing",
    "@typescript-eslint/no-non-null-assertion",
    "@typescript-eslint/no-non-null-asserted-optional-chain",
    "@typescript-eslint/no-confusing-non-null-assertion",
    "import/no-duplicates",
    "import/order",
    "import/no-useless-path-segments",
    "import/no-self-import",
}

MEDIUM_RULES = {
    "@typescript-eslint/no-unused-vars",
    "@typescript-eslint/no-explicit-any",
    "@typescript-eslint/no-unsafe-assignment",
    "@typescript-eslint/no-unsafe-member-access",
    "@typescript-eslint/no-unsafe-call",
    "@typescript-eslint/no-unsafe-return",
    "@typescript-eslint/no-unsafe-argument",
    "@typescript-eslint/no-unsafe-enum-comparison",
    "@typescript-eslint/no-unsafe-function-type",
    "@typescript-eslint/no-floating-promises",
    "@typescript-eslint/no-misused-promises",
    "@typescript-eslint/await-thenable",
    "@typescript-eslint/return-await",
    "@typescript-eslint/promise-function-async",
    "@typescript-eslint/require-await",
    "@typescript-eslint/restrict-template-expressions",
    "@typescript-eslint/restrict-plus-operands",
    "@typescript-eslint/no-base-to-string",
    "@typescript-eslint/strict-boolean-expressions",
    "@typescript-eslint/no-unnecessary-condition",
    "@typescript-eslint/no-unnecessary-type-assertion",
    "@typescript-eslint/no-redundant-type-constituents",
    "@typescript-eslint/unbound-method",
    "@typescript-eslint/explicit-function-return-type",
    "@typescript-eslint/ban-ts-comment",
    "@typescript-eslint/no-unused-expressions",
    "@typescript-eslint/no-implied-eval",
    "@typescript-eslint/no-for-in-array",
    "@typescript-eslint/no-shadow",
    "@typescript-eslint/no-use-before-define",
    "no-shadow",
    "no-use-before-define",
    "no-param-reassign",
    "no-await-in-loop",
    "consistent-return",
    "array-callback-return",
    "require-atomic-updates",
    "no-eval",
    "no-implied-eval",
    "no-new-func",
    "no-unreachable-loop",
    "no-constructor-return",
    "no-promise-executor-return",
    "no-constant-binary-expression",
    "no-loss-of-precision",
    "no-new-native-nonconstructor",
}

HARD_RULES = {
    "complexity",
    "max-depth",
    "@typescript-eslint/switch-exhaustiveness-check",
    "@typescript-eslint/naming-convention",
    "import/no-cycle",
}

LINT_GUIDANCE: dict[str, str] = {
    "prefer-const": """prefer-const — Replace `let` with `const` for variables
that are never reassigned after initialization.""",

    "no-var": """no-var — Replace `var` with `let` (or `const` when not reassigned).""",

    "eqeqeq": """eqeqeq — Replace `==` with `===` and `!=` with `!==`. The only
exception is `== null` (matches both null and undefined), which is still flagged
under `always` mode — rewrite as `value === null || value === undefined` or
`value == null`-equivalent guards using explicit checks.""",

    "prefer-template": """prefer-template — Replace string concatenation
(`'a' + x + 'b'`) with template literals (`` `a${x}b` ``).""",

    "no-useless-concat": """no-useless-concat — Merge adjacent string literals
that are concatenated for no reason: `'a' + 'b'` → `'ab'`.""",

    "no-useless-return": """no-useless-return — Remove a trailing `return;`
that is the last statement of a function with no value.""",

    "no-lonely-if": """no-lonely-if — Replace `else { if (...) { ... } }` with
`else if (...) { ... }`.""",

    "no-unneeded-ternary": """no-unneeded-ternary — Simplify `a ? a : b` to
`a || b` (or `a ?? b` if nullish-coalescing is preferred), and `cond ? true : false`
to just `cond`.""",

    "prefer-arrow-callback": """prefer-arrow-callback — Replace anonymous
function expressions used as callbacks with arrow functions, unless the function
needs its own `this` or `arguments`.""",

    "prefer-rest-params": """prefer-rest-params — Replace `arguments` with a
typed rest parameter: `function f(...args: T[])`.""",

    "default-case-last": """default-case-last — Move the `default:` clause of a
`switch` to the bottom.""",

    "no-duplicate-imports": """no-duplicate-imports — Merge multiple `import`
statements from the same module into one.""",

    "prettier/prettier": """prettier/prettier — Formatting only. Reformat the
flagged region (whitespace, line breaks, trailing commas, quote style) so it
matches Prettier's expected output. Do not change tokens or semantics.""",

    "@typescript-eslint/consistent-type-imports": """consistent-type-imports —
Convert imports that are only used as types to `import type { ... } from '...';`.
If an import is used both as a value and as a type, split the value parts and
the type parts into two import statements.""",

    "@typescript-eslint/prefer-optional-chain": """prefer-optional-chain —
Replace `a && a.b && a.b.c` with `a?.b?.c`. Replace `a && a.b()` with `a?.b()`.""",

    "@typescript-eslint/prefer-nullish-coalescing": """prefer-nullish-coalescing —
Replace `||` with `??` when the left operand is nullable but defined falsy
values (`0`, `''`, `false`) should pass through. The repo opts out for plain
strings (`ignorePrimitives.string: true`), so leave string-fallback `||` alone
unless the value is also nullable.""",

    "@typescript-eslint/no-non-null-assertion": """no-non-null-assertion —
Remove the `!` postfix and replace it with a real null guard:
  - `if (!x) return;` (or `throw`)
  - `x?.method()` if optional access is acceptable
  - `const v = x ?? defaultValue;`
Only keep `!` when nothing else expresses the runtime invariant cleanly, AND
the lint rule is disabled for that line with a comment explaining why.""",

    "@typescript-eslint/no-unused-vars": """no-unused-vars — Remove the unused
variable, parameter, or import. If the unused thing is a destructured rest
or a deliberately ignored callback parameter, prefix with `_` to acknowledge it.
Never delete a binding that has a side-effect on the right-hand side; use
`void <expr>;` instead.""",

    "@typescript-eslint/no-explicit-any": """no-explicit-any — Replace `any`
with a real type. Patterns:
  - For unknown object shapes: `Record<string, unknown>`
  - For function values: `(...args: unknown[]) => unknown`
  - For values you'll narrow later: `unknown` + a `typeof`/`instanceof` guard
  - For Foundry CONFIG access: cast at the use site only, not in the schema.
NEVER trade `any` for another `any`. NEVER add `// eslint-disable` to mute it.""",

    "@typescript-eslint/no-unsafe-assignment": """no-unsafe-assignment — The
right-hand side is typed `any`. Fix by:
  1. Typing the source so it is no longer `any` (preferred — fixes upstream)
  2. Casting the source to the assignment target type at the boundary:
     `const x: Foo = value as Foo;` (only when you know it's that type)
  3. For Foundry-side untyped values, cast through `unknown`:
     `const x = value as unknown as Foo;`""",

    "@typescript-eslint/no-unsafe-member-access": """no-unsafe-member-access —
A property is being accessed on a value typed `any`. Narrow first:
  - `if (value instanceof Foo) value.bar`
  - `const typed = value as { bar: string }; typed.bar`
  - `(value as Record<string, unknown>).bar`
Avoid sprinkling `as any` to silence — that just moves the problem.""",

    "@typescript-eslint/no-unsafe-call": """no-unsafe-call — Calling a value
typed `any`. Narrow to a callable type before invoking:
  `const fn = value as (...args: unknown[]) => unknown; fn(...);`
For methods, narrow the receiver first.""",

    "@typescript-eslint/no-unsafe-return": """no-unsafe-return — Returning a
value typed `any` from a function with a non-`any` return type. Cast or narrow
at the return site so the returned value matches the declared return type.""",

    "@typescript-eslint/no-unsafe-argument": """no-unsafe-argument — Passing
an `any`-typed value to a function with a typed parameter. Cast at the call
site to the parameter's expected type after verifying the runtime shape.""",

    "@typescript-eslint/no-floating-promises": """no-floating-promises — A
Promise is created but neither awaited nor handled. Pick the right fix:
  - In an async function: prepend `await` if the caller should wait.
  - Fire-and-forget intentionally: prepend `void` (`void doThing();`).
  - Handle errors: chain `.catch((err) => ...)`.
Never silence with `// eslint-disable-next-line` without one of the above
plus a comment explaining why fire-and-forget is safe.""",

    "@typescript-eslint/no-misused-promises": """no-misused-promises — A
Promise-returning function is being used where a non-Promise is expected
(commonly: an event handler or a boolean test). Either:
  - Wrap the async work and return void: `(e) => { void asyncFn(e); }`
  - Make the consumer accept Promise<void>
For boolean tests, await the promise first or check `Boolean(await p)`.""",

    "@typescript-eslint/await-thenable": """await-thenable — `await` on a
non-Promise value. Remove the `await` if the operand is not async, or fix the
operand's type if it should be returning a Promise.""",

    "@typescript-eslint/return-await": """return-await — In `try`/`catch`,
prefer `return await x;` so rejections route through `catch`. Outside try/catch,
`return x;` is fine.""",

    "@typescript-eslint/promise-function-async": """promise-function-async —
A function declared to return a Promise should be marked `async`. Add the
`async` keyword.""",

    "@typescript-eslint/require-await": """require-await — An `async` function
without an `await`. Either remove `async` (and unwrap the Promise return type)
or use `await` somewhere in the body.""",

    "@typescript-eslint/restrict-template-expressions": """restrict-template-expressions —
A template literal interpolates a value of an unsafe type (object, any, never).
Cast or convert: `` `${String(value)}` `` for arbitrary objects, or narrow first.""",

    "@typescript-eslint/restrict-plus-operands": """restrict-plus-operands —
The `+` operator's operands are not both numbers or both strings. Fix:
  - For concat: ensure both sides are strings (`String(x) + y`).
  - For arithmetic: ensure both sides are numbers (`Number(x) + y`).""",

    "@typescript-eslint/no-base-to-string": """no-base-to-string — A value's
default `toString()` returns `[object Object]`. Provide an explicit
`toString()` method on the type, or convert with `JSON.stringify(value)` for
debugging output.""",

    "@typescript-eslint/strict-boolean-expressions": """strict-boolean-expressions —
A condition uses a value that is not strictly boolean. The repo allows
`string`, `number`, and `nullable-object`, but not `nullable-boolean`,
`nullable-string`, `nullable-number`, or `any`. Tighten the predicate:
  - For nullable booleans: `flag === true` (or `flag ?? false`)
  - For nullable strings: `value !== undefined && value !== ''`
  - For nullable numbers: `value !== undefined && value !== 0`
  - For `any`: type the source first; if you can't, cast to the right type.""",

    "@typescript-eslint/no-unnecessary-condition": """no-unnecessary-condition —
The compiler can prove the condition is always-true or always-false. Either:
  - Remove the dead branch if the type is correct as-is.
  - Tighten the type annotation if the condition was guarding against a real
    runtime case the type system thought was impossible.
NEVER remove the condition if it's defending against an external/Foundry value
that genuinely could be undefined; instead, fix the upstream type so the type
system reflects reality.""",

    "@typescript-eslint/no-unnecessary-type-assertion": """no-unnecessary-type-assertion —
The `as Foo` cast doesn't narrow anything. Remove it.""",

    "@typescript-eslint/no-redundant-type-constituents": """no-redundant-type-constituents —
A union/intersection has a member subsumed by another (e.g. `string | any`,
`Foo | unknown`). Drop the redundant constituent.""",

    "@typescript-eslint/unbound-method": """unbound-method — A class method is
being passed without binding. Either:
  - Bind explicitly: `obj.method.bind(obj)`
  - Wrap in an arrow: `(arg) => obj.method(arg)`
  - Define the method as an arrow-class-field if it is genuinely unbound
    (rare; prefer the wrap pattern).""",

    "@typescript-eslint/explicit-function-return-type": """explicit-function-return-type —
Add an explicit return type annotation. Infer the right type from the function
body's actual return value(s). For void-returning callbacks, write `: void`.
The repo allows expressions/HOFs/typed function expressions to omit them.""",

    "@typescript-eslint/ban-ts-comment": """ban-ts-comment — `@ts-ignore`,
`@ts-nocheck`, and short-description `@ts-expect-error` are banned. Replace by
fixing the underlying type, or convert to `@ts-expect-error: <≥5 char reason>`
when the suppression is genuinely required and short-lived.""",

    "@typescript-eslint/no-shadow": """no-shadow — A binding shadows an outer
binding (variable or builtin). Rename the inner binding.""",

    "@typescript-eslint/no-use-before-define": """no-use-before-define — A
variable is referenced before its declaration. Move the declaration above the
use, or restructure so the reference appears after.""",

    "no-await-in-loop": """no-await-in-loop — Awaiting in each iteration
serializes the work. Replace with `Promise.all(items.map(async ...))` when the
iterations are independent. If they must be serial (state depends on prior
results), add an inline disable + comment explaining why.""",

    "no-param-reassign": """no-param-reassign — Don't reassign function
parameters. Copy to a local: `let local = param; local = ...`. Property writes
on parameter objects are allowed under the repo config.""",

    "consistent-return": """consistent-return — Either always return a value
or never. Fix by adding the missing `return` (or `return undefined`) on the
branch that is currently implicit.""",

    "import/order": """import/order — Reorder imports per groups:
builtin → external → internal → parent → sibling → index. No newlines between
groups; alphabetize within each group.""",
}


def log(msg: str) -> None:
    ts = time.strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    with open(LOG, "a") as f:
        f.write(line + "\n")


def file_log(filepath: str, attempt: int, outcome: str, content: str) -> None:
    """Write a detailed per-file log for prompt tuning."""
    FILE_LOGS.mkdir(exist_ok=True)
    safe_name = filepath.replace("/", "__").replace(".ts", "")
    log_path = FILE_LOGS / f"{safe_name}.attempt{attempt}.{outcome}.log"
    with open(log_path, "w") as f:
        f.write(content)


def check_vllm() -> bool:
    """Return True if the vLLM models endpoint is reachable."""
    import urllib.request
    try:
        req = urllib.request.Request(
            "http://198.51.100.9/v1/models",
            headers={"Authorization": "Bearer dummy"},
        )
        urllib.request.urlopen(req, timeout=5)
        return True
    except Exception:
        return False


# ────────────────────────────────────────────────────────────────────────
# Source signal extraction (TSC and ESLint)
# ────────────────────────────────────────────────────────────────────────

def run_tsc() -> list[str]:
    """Run tsc --noEmit, return all error lines."""
    result = subprocess.run(
        ["pnpm", "typecheck"],
        capture_output=True,
        text=True,
        cwd=ROOT,
        timeout=180,
    )
    output = result.stdout + "\n" + result.stderr
    return [
        line for line in output.splitlines()
        if ": error TS" in line and line.startswith("src/")
    ]


def run_eslint_json() -> list[dict]:
    """Run eslint and return parsed JSON results (one entry per file)."""
    try:
        result = subprocess.run(
            ["pnpm", "lint", "--format", "json"],
            capture_output=True,
            text=True,
            cwd=ROOT,
            timeout=300,
        )
        output = result.stdout
        idx = output.find("[")
        if idx == -1:
            return []
        return json.loads(output[idx:])
    except Exception as e:
        log(f"    ESLint parse error: {e}")
        return []


def get_eslint_warning_count() -> int:
    """Total eslint warning count across the repo."""
    results = run_eslint_json()
    if not results:
        return 999999
    return sum(r.get("warningCount", 0) for r in results)


def read_eslint_baseline() -> int:
    baseline_path = ROOT / ".eslint-warning-baseline"
    if baseline_path.exists():
        return int(baseline_path.read_text().strip())
    return 999999


def parse_tsc_errors(lines: list[str]) -> dict[str, dict[str, int]]:
    """Parse TSC error lines into {filepath: {TScode: count}}."""
    by_file: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    pattern = re.compile(r"^(src/[^(]+)\(\d+,\d+\): error (TS\d+):")
    for line in lines:
        m = pattern.match(line)
        if m:
            by_file[m.group(1)][m.group(2)] += 1
    return dict(by_file)


def parse_lint_warnings(results: list[dict]) -> dict[str, dict[str, int]]:
    """Parse eslint JSON into {relative_filepath: {ruleId: count}}."""
    by_file: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    root_str = str(ROOT) + "/"
    for entry in results:
        path = entry.get("filePath", "")
        if path.startswith(root_str):
            path = path[len(root_str):]
        if not path.startswith("src/"):
            continue
        for msg in entry.get("messages", []):
            if msg.get("severity") != 1:  # 1 = warning
                continue
            rule = msg.get("ruleId") or "<parser>"
            by_file[path][rule] += 1
    return dict(by_file)


def lint_warning_lines_for_file(results: list[dict], filepath: str) -> list[str]:
    """Return formatted `path:line:col rule message` strings for a single file."""
    root_str = str(ROOT) + "/"
    lines: list[str] = []
    for entry in results:
        path = entry.get("filePath", "")
        if path.startswith(root_str):
            path = path[len(root_str):]
        if path != filepath:
            continue
        for msg in entry.get("messages", []):
            if msg.get("severity") != 1:
                continue
            rule = msg.get("ruleId") or "<parser>"
            text = msg.get("message", "").replace("\n", " ")
            lines.append(
                f"{path}:{msg.get('line')}:{msg.get('column')} {rule} — {text}"
            )
    return lines


# ────────────────────────────────────────────────────────────────────────
# Mode-aware classification and manifest building
# ────────────────────────────────────────────────────────────────────────

def _competency_sets(mode: str) -> tuple[set[str], set[str], set[str]]:
    if mode == "tsc":
        return EASY_CODES, MEDIUM_CODES, HARD_CODES
    if mode == "lint":
        return EASY_RULES, MEDIUM_RULES, HARD_RULES
    raise ValueError(f"unknown mode {mode!r}")


def classify_file(filepath: str, items: dict[str, int], mode: str) -> str:
    """Assign a tier based on item difficulty distribution and file size."""
    try:
        lines = (ROOT / filepath).read_text().count("\n")
    except OSError:
        return "3"

    if lines > MAX_FILE_LINES:
        return "3"

    easy, medium, hard = _competency_sets(mode)
    total = sum(items.values())
    if total == 0:
        return "3"
    easy_count = sum(items.get(c, 0) for c in easy)
    medium_count = sum(items.get(c, 0) for c in medium)
    hard_count = sum(items.get(c, 0) for c in hard)

    if hard_count > 0.4 * total:
        return "3"
    if easy_count >= 0.8 * total:
        return "1"
    if (easy_count + medium_count) >= 0.6 * total:
        return "2"
    return "3"


def _guidance_for(mode: str, code: str) -> str | None:
    if mode == "tsc":
        return ERROR_GUIDANCE.get(code)
    return LINT_GUIDANCE.get(code)


def build_manifest(by_file: dict[str, dict[str, int]], mode: str) -> dict:
    """Build the full manifest from the per-file item map."""
    tiers: dict[str, list] = {"1": [], "2": [], "3": []}
    for filepath, items in sorted(by_file.items()):
        try:
            lines = (ROOT / filepath).read_text().count("\n")
        except OSError:
            lines = 0

        tier = classify_file(filepath, items, mode)
        codes_present = sorted(items.keys(), key=lambda c: -items[c])
        strategy_parts = []
        for code in codes_present[:3]:
            g = _guidance_for(mode, code)
            strategy_parts.append(g.split("\n")[0] if g else code)

        tiers[tier].append({
            "file": filepath,
            "lines": lines,
            "items": dict(items),
            "total": sum(items.values()),
            "strategy": "; ".join(strategy_parts),
        })

    summary = {}
    for tier_id in ["1", "2", "3"]:
        entries = tiers[tier_id]
        summary[f"tier{tier_id}_files"] = len(entries)
        summary[f"tier{tier_id}_items"] = sum(e["total"] for e in entries)

    return {"mode": mode, "tiers": tiers, "summary": summary}


def scrape_and_save(mode: str) -> dict:
    """Run the relevant tool, build a manifest, save to disk."""
    if mode == "tsc":
        log("Scraping TSC errors...")
        error_lines = run_tsc()
        log(f"  {len(error_lines)} error lines parsed")
        by_file = parse_tsc_errors(error_lines)
    else:
        log("Scraping ESLint warnings...")
        results = run_eslint_json()
        total = sum(r.get("warningCount", 0) for r in results)
        log(f"  {total} warnings across {len(results)} files")
        by_file = parse_lint_warnings(results)

    manifest = build_manifest(by_file, mode)
    out_path = MANIFEST_FILES[mode]
    with open(out_path, "w") as f:
        json.dump(manifest, f, indent=2)

    label = "errors" if mode == "tsc" else "warnings"
    for tier_id in ["1", "2", "3"]:
        n = manifest["summary"][f"tier{tier_id}_files"]
        e = manifest["summary"][f"tier{tier_id}_items"]
        log(f"  Tier {tier_id}: {n} files, {e} {label}")

    log(f"Manifest written to {out_path}")
    return manifest


# ────────────────────────────────────────────────────────────────────────
# Prompt construction
# ────────────────────────────────────────────────────────────────────────

# Shared output rules — apply equally to TSC and lint fixes.
COMMON_HARD_RULES = """\
- NEVER use `any` type. Use specific types, `unknown`, or generics.
  The ONE exception: Foundry's `CONFIG` object is untyped — casting a CONFIG
  access to `Record<string, any>` is acceptable.
- NEVER add `@ts-ignore`, `@ts-nocheck`, or `// eslint-disable*` comments.
- NEVER change logic, control flow, or runtime behavior.
- NEVER remove or rename existing code outside the lines that produce errors
  or warnings.
- **NEVER invent imports. NEVER add new imports.** Use only types that are
  ALREADY imported in the file or are GLOBAL builtins (string, number, boolean,
  Record, Array, Promise, Map, Set, Date, Error, Event, HTMLElement, etc.).
- **JSDoc type hints are NOT proof a type exists.** If you see `@param x {Foo}`
  in a comment but `Foo` is not in the file's import list, `Foo` does NOT exist
  in scope. Do NOT use `Foo` in your TypeScript annotation.
- **The CORRECT fallback for unknown object types is `Record<string, unknown>`**.
  This is always available, requires no imports, and accepts any object.
- For primitive params, use the primitive type directly (number, string, boolean).
- Verify before you write: scan the existing `import` statements at the top
  of the file. Only types appearing there OR global builtins are safe to use.
- Keep changes minimal — only touch lines with errors/warnings or their
  immediate context.
- DO NOT rewrite the file header, license banner, JSDoc blocks, or existing
  comments. Leave all comments byte-for-byte identical unless the comment is
  itself the cause of the issue.
- DO NOT add explanatory comments describing what you changed.
- DO NOT emit prose, status updates, "I have updated…" sentences, or any text
  outside the single ```typescript fence. The output is the file, nothing else."""


def build_tsc_prompt(filepath: str, file_error_lines: list[str]) -> str:
    """TSC-mode prompt: per-error-code guidance for codes present in the file."""
    codes_present: set[str] = set()
    pattern = re.compile(r"error (TS\d+):")
    for line in file_error_lines:
        m = pattern.search(line)
        if m:
            codes_present.add(m.group(1))

    guidance_parts = [ERROR_GUIDANCE[c] for c in sorted(codes_present) if c in ERROR_GUIDANCE]
    guidance = "\n\n".join(guidance_parts) if guidance_parts else "Use your judgment to fix the type errors."
    error_block = "\n".join(file_error_lines)

    return f"""Fix the TypeScript compiler errors in `{filepath}`. The exact errors:

{error_block}

## How to fix each error type

{guidance}

## Hard rules

{COMMON_HARD_RULES}
- Your output MUST reduce the number of TypeScript errors. Don't trade one
  error for another — if you can't fix an error cleanly, leave it alone.
- Do NOT introduce new ESLint warnings (unused imports, unused variables, etc.).
- When multiple errors share a root cause, fix the root cause once.
- Prefer type narrowing (guards, instanceof, typeof) over type assertions (as)."""


def build_lint_prompt(filepath: str, file_warning_lines: list[str]) -> str:
    """Lint-mode prompt: per-rule guidance for rules present in the file."""
    rules_present: set[str] = set()
    # Each line is `path:line:col rule — message`
    pattern = re.compile(r"^\S+\s+(\S+)\s+—")
    for line in file_warning_lines:
        m = pattern.search(line)
        if m:
            rules_present.add(m.group(1))

    guidance_parts = [LINT_GUIDANCE[r] for r in sorted(rules_present) if r in LINT_GUIDANCE]
    guidance = "\n\n".join(guidance_parts) if guidance_parts else "Use your judgment to fix the lint warnings."
    warning_block = "\n".join(file_warning_lines)

    return f"""Fix the ESLint warnings in `{filepath}`. The exact warnings:

{warning_block}

## How to fix each rule

{guidance}

## Hard rules

{COMMON_HARD_RULES}
- Your output MUST reduce the number of ESLint warnings AND must NOT introduce
  any new TypeScript compiler errors. Don't trade one warning for another.
- When multiple warnings share a root cause (e.g., a parameter typed `any`
  causing a chain of `no-unsafe-*` warnings), fix the root cause once.
- Prefer fixing the upstream type so the rule has nothing to flag, rather than
  casting at the use site, when the upstream type is in this file.
- Prefer type narrowing (guards, instanceof, typeof) over type assertions (as)."""


def build_prompt(filepath: str, items: list[str], mode: str) -> str:
    return build_tsc_prompt(filepath, items) if mode == "tsc" else build_lint_prompt(filepath, items)


def git_checkout_file(filepath: str) -> None:
    subprocess.run(
        ["git", "checkout", "--", filepath],
        cwd=ROOT,
        capture_output=True,
    )


def git_diff_file(filepath: str) -> str:
    """Get the current diff for a file."""
    result = subprocess.run(
        ["git", "diff", "--", filepath],
        capture_output=True,
        text=True,
        cwd=ROOT,
    )
    return result.stdout


def git_commit_file(filepath: str, msg: str) -> None:
    subprocess.run(["git", "add", filepath], cwd=ROOT, capture_output=True)
    subprocess.run(
        ["git", "commit", "-m", msg, "--no-verify"],
        cwd=ROOT,
        capture_output=True,
    )


def load_progress(mode: str) -> dict:
    path = PROGRESS_FILES[mode]
    if path.exists():
        with open(path) as f:
            data = json.load(f)
        # Backward-compat: tsc progress used to call this field `start_errors`.
        if "start_items" not in data and "start_errors" in data:
            data["start_items"] = data.pop("start_errors")
        data.setdefault("completed", [])
        data.setdefault("failed", [])
        data.setdefault("skipped", [])
        data.setdefault("start_items", None)
        return data
    return {"completed": [], "failed": [], "skipped": [], "start_items": None}


def save_progress(progress: dict, mode: str) -> None:
    with open(PROGRESS_FILES[mode], "w") as f:
        json.dump(progress, f, indent=2)


SYSTEM_PROMPT_TSC = """\
You are a TypeScript expert fixing compiler errors. You will be given a file's full \
source and a list of TypeScript compiler errors. Output ONLY the complete corrected \
file, inside a single ```typescript ... ``` fence. No explanation, no commentary, no \
status text, no verification summary, no diff — just the file.\
"""

SYSTEM_PROMPT_LINT = """\
You are a TypeScript expert fixing ESLint warnings. You will be given a file's full \
source and a list of ESLint warnings (file:line:col rule — message). Fix every \
warning you can without changing runtime behavior and without introducing new \
TypeScript compiler errors. Output ONLY the complete corrected file, inside a \
single ```typescript ... ``` fence. No explanation, no commentary, no status text, \
no verification summary, no diff — just the file.\
"""


def _system_prompt(mode: str) -> str:
    return SYSTEM_PROMPT_TSC if mode == "tsc" else SYSTEM_PROMPT_LINT


def _build_user_msg(filepath: str, items: list[str], mode: str) -> str:
    source = (ROOT / filepath).read_text()
    return (
        build_prompt(filepath, items, mode)
        + f"\n\n## Full file source\n\n```typescript\n{source}\n```"
        + "\n\nOutput the complete corrected file inside a single ```typescript fence."
    )


def is_usage_limited(text: str) -> bool:
    t = text.lower()
    return (
        "usage limit" in t
        or "quota" in t
        or "rate limit" in t
        or "rate-limit" in t
        or "ratelimit" in t
        or "429" in t
        or "resource_exhausted" in t
        or "you've hit your usage" in t
    )


def is_auth_error(text: str) -> bool:
    t = text.lower()
    return (
        ("auth" in t and ("required" in t or "must be configured" in t or "settings.json" in t))
        or "oauth" in t and "expired" in t
        or "credentials" in t and "invalid" in t
        or "opening authentication page" in t
    )


# ────────────────────────────────────────────────────────────────────────
# Provider calls
# ────────────────────────────────────────────────────────────────────────

def call_local(filepath: str, items: list[str], mode: str) -> tuple[str, str]:
    """Call vLLM. Returns (output, kind) where kind ∈ {'ok', 'unreachable', 'error'}."""
    if not check_vllm():
        return "", "unreachable"
    from openai import OpenAI
    user_msg = _build_user_msg(filepath, items, mode)
    client = OpenAI(
        api_key="dummy",
        base_url="http://198.51.100.9/v1",
        timeout=180,
        max_retries=0,
    )
    try:
        chunks = []
        with client.chat.completions.create(
            model=MODEL_NAME.removeprefix("openai/"),
            messages=[
                {"role": "system", "content": _system_prompt(mode)},
                {"role": "user", "content": user_msg},
            ],
            max_tokens=8192,
            temperature=0.1,
            stream=True,
        ) as stream:
            for chunk in stream:
                delta = chunk.choices[0].delta.content or ""
                chunks.append(delta)
        return "".join(chunks), "ok"
    except Exception as e:
        return f"Exception: {e}", "error"


def _call_harness(argv: list[str], slot: int, timeout: int) -> tuple[str, str]:
    """Run a harness ai.py invocation. Slot 0 forces HOME=/home/jameson so it
    doesn't resolve .gemini/.codex under a redirected session HOME. Returns
    (combined_output, kind) where kind ∈ {'ok','usage_limit','auth_error','error'}."""
    env = os.environ.copy()
    if slot == 0:
        env["HOME"] = REAL_HOME
    try:
        result = subprocess.run(
            argv,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=env,
            cwd=ROOT,
        )
    except subprocess.TimeoutExpired as e:
        return f"TimeoutExpired after {timeout}s: {e}", "error"
    out = result.stdout or ""
    err = result.stderr or ""
    combined = out + ("\n" + err if err else "")
    if is_usage_limited(combined):
        return combined, "usage_limit"
    if is_auth_error(combined):
        return combined, "auth_error"
    if result.returncode != 0 and not out.strip():
        return combined, "error"
    return combined, "ok"


def call_gemini(slot: int, model: str, filepath: str, items: list[str], mode: str) -> tuple[str, str]:
    prompt = _build_user_msg(filepath, items, mode)
    argv = [
        "python3", HARNESS, "gemini", str(slot),
        "--model", model,
        "-p", prompt,
    ]
    return _call_harness(argv, slot, GEMINI_TIMEOUT)


def call_gemini_with_cycling(
    model: str,
    filepath: str,
    items: list[str],
    mode: str,
    run_state: dict,
) -> tuple[str, str, int | None]:
    """Cycle gemini slots on usage_limit. Returns (output, kind, slot_used)."""
    backoff = GEMINI_BACKOFF_START
    start_slot = run_state.get("gemini_slot", 0)
    for cycle in range(GEMINI_BACKOFF_CYCLES):
        order = [start_slot] + [s for s in GEMINI_SLOTS if s != start_slot]
        for slot in order:
            log(f"      trying gemini {slot} {model}")
            output, kind = call_gemini(slot, model, filepath, items, mode)
            run_state["gemini_slot"] = slot
            if kind != "usage_limit":
                return output, kind, slot
            log(f"      gemini {slot} usage limited, switching slot")
        sleep_for = min(backoff, GEMINI_BACKOFF_MAX)
        log(f"      both gemini slots usage limited, backoff {sleep_for}s (cycle {cycle+1}/{GEMINI_BACKOFF_CYCLES})")
        time.sleep(sleep_for)
        backoff = min(backoff * 2, GEMINI_BACKOFF_MAX)
        start_slot = 1 - start_slot
    return "", "all_limited", None


def call_codex(filepath: str, items: list[str], mode: str) -> tuple[str, str]:
    prompt = _build_user_msg(filepath, items, mode)
    argv = [
        "python3", HARNESS, "codex", "2",
        "exec", "--json", "--full-auto", prompt,
    ]
    return _call_harness(argv, slot=2, timeout=CODEX_TIMEOUT)


# ────────────────────────────────────────────────────────────────────────
# Sanity check (gemini-flash YES/NO on the diff)
# ────────────────────────────────────────────────────────────────────────

def gemini_sanity_check(diff: str, run_state: dict) -> tuple[str, str]:
    """Ask gemini flash to certify the diff is type/lint-only. Returns
    (verdict, raw_output) where verdict ∈ {'YES', 'NO', 'unknown'}."""
    if not diff.strip():
        return "YES", "(empty diff — trivially safe)"

    prompt = (
        "Does this diff only change typing and/or fix lint warnings and not "
        "change functionality or cause errors? Respond \"YES\" or \"NO\" "
        "(uppercase, no other text).\n\n"
        "Diff:\n```diff\n" + diff + "\n```"
    )
    start_slot = run_state.get("gemini_slot", 0)
    order = [start_slot] + [s for s in GEMINI_SLOTS if s != start_slot]
    last_output = ""
    for slot in order:
        argv = [
            "python3", HARNESS, "gemini", str(slot),
            "--model", SANITY_MODEL,
            "-p", prompt,
        ]
        output, kind = _call_harness(argv, slot, SANITY_TIMEOUT)
        last_output = output
        if kind == "usage_limit":
            log(f"      sanity: gemini {slot} usage limited, trying next slot")
            continue
        if kind in ("auth_error", "error"):
            log(f"      sanity: gemini {slot} {kind}, trying next slot")
            continue
        # Look for a clean YES or NO token. Be lenient about surrounding text.
        text = output.strip()
        # Strip markdown fences if present.
        text_upper = text.upper()
        # Look at the last non-empty line first — most models put the verdict there.
        for candidate in reversed([l.strip() for l in text_upper.splitlines() if l.strip()]):
            stripped = candidate.strip("`*_-. ")
            if stripped == "YES" or stripped.startswith("YES"):
                return "YES", output
            if stripped == "NO" or stripped.startswith("NO"):
                return "NO", output
        # Fallback: scan the full body.
        if re.search(r"\bYES\b", text_upper):
            return "YES", output
        if re.search(r"\bNO\b", text_upper):
            return "NO", output
        return "unknown", output
    return "unknown", last_output


def apply_model_output(filepath: str, output: str) -> bool:
    """Extract the typescript fence from model output and write the file."""
    m = re.search(r"```typescript\n(.*?)```", output, re.DOTALL)
    if not m:
        m = re.search(r"```(?:ts)?\n(.*?)```", output, re.DOTALL)
    if not m:
        return False
    new_content = m.group(1)
    if not new_content.strip():
        return False
    (ROOT / filepath).write_text(new_content)
    return True


def _ratchet_check(
    filepath: str,
    items: list[str],
    current_tsc: int,
    current_lint: int,
    mode: str,
) -> tuple[bool, int, int, str, list[str], set[str]]:
    """Re-run tsc and eslint after an applied edit. Returns
    (accepted, new_tsc, new_lint, reason_str, new_file_items, new_codes)."""
    new_tsc_lines = run_tsc()
    new_tsc = len(new_tsc_lines)
    tsc_delta = new_tsc - current_tsc

    new_lint_results = run_eslint_json()
    new_lint = sum(r.get("warningCount", 0) for r in new_lint_results) if new_lint_results else 999999
    lint_delta = new_lint - current_lint

    if mode == "tsc":
        new_file_items = [l for l in new_tsc_lines if l.startswith(filepath + "(")]
        code_re = re.compile(r"error (TS\d+):")
        before_codes = {code_re.search(l).group(1) for l in items if code_re.search(l)}
        after_codes = {code_re.search(l).group(1) for l in new_file_items if code_re.search(l)}
        new_codes = after_codes - before_codes
        accepted = (tsc_delta < 0) and (lint_delta <= 0) and (not new_codes)
    else:
        new_file_items = lint_warning_lines_for_file(new_lint_results, filepath)
        rule_re = re.compile(r"^\S+\s+(\S+)\s+—")
        before_codes = {rule_re.search(l).group(1) for l in items if rule_re.search(l)}
        after_codes = {rule_re.search(l).group(1) for l in new_file_items if rule_re.search(l)}
        new_codes = after_codes - before_codes
        accepted = (lint_delta < 0) and (tsc_delta <= 0) and (not new_codes)

    reasons = []
    if accepted:
        if mode == "tsc":
            reasons.append(f"TSC {current_tsc}→{new_tsc} (fixed {current_tsc - new_tsc})")
            reasons.append(f"lint {current_lint}→{new_lint}")
        else:
            reasons.append(f"lint {current_lint}→{new_lint} (fixed {current_lint - new_lint})")
            reasons.append(f"TSC {current_tsc}→{new_tsc}")
    else:
        if mode == "tsc":
            if tsc_delta > 0:
                reasons.append(f"TSC +{tsc_delta}")
            elif tsc_delta == 0:
                reasons.append("TSC unchanged (no real progress)")
            if lint_delta > 0:
                reasons.append(f"lint +{lint_delta}")
        else:
            if lint_delta > 0:
                reasons.append(f"lint +{lint_delta}")
            elif lint_delta == 0:
                reasons.append("lint unchanged (no real progress)")
            if tsc_delta > 0:
                reasons.append(f"TSC +{tsc_delta}")
        if new_codes:
            label = "codes" if mode == "tsc" else "rules"
            reasons.append(f"new {label} {sorted(new_codes)}")
    return accepted, new_tsc, new_lint, ", ".join(reasons), new_file_items, new_codes


def _runner_label(kind: str, model: str | None, slot: int | None) -> str:
    if kind == "local":
        return "local vLLM"
    if kind == "codex":
        return "codex 2"
    parts = [kind]
    if slot is not None:
        parts.append(f"slot {slot}")
    if model:
        parts.append(model)
    return " ".join(parts)


def _current_signal_for_file(filepath: str, mode: str) -> tuple[list[str], int, int]:
    """Return (items_for_file, current_tsc_total, current_lint_total)."""
    all_tsc = run_tsc()
    current_tsc = len(all_tsc)
    if mode == "tsc":
        items = [l for l in all_tsc if l.startswith(filepath + "(")]
        current_lint = get_eslint_warning_count()
    else:
        results = run_eslint_json()
        current_lint = sum(r.get("warningCount", 0) for r in results) if results else 999999
        items = lint_warning_lines_for_file(results, filepath)
    return items, current_tsc, current_lint


def process_file(
    filepath: str,
    progress: dict,
    tsc_baseline: int,
    lint_baseline: int,
    run_state: dict,
    mode: str,
    sanity_enabled: bool,
) -> tuple[int, int]:
    """Fix one file via the provider ladder. Returns (new_tsc, new_lint)."""
    if filepath in progress["completed"] or filepath in progress["skipped"]:
        log(f"  SKIP {filepath} (already processed)")
        return tsc_baseline, lint_baseline

    file_items, current_tsc, current_lint = _current_signal_for_file(filepath, mode)

    if not file_items:
        log(f"  SKIP {filepath} (no current {('errors' if mode == 'tsc' else 'warnings')})")
        progress["completed"].append(filepath)
        save_progress(progress, mode)
        return current_tsc, current_lint

    label = "errors" if mode == "tsc" else "warnings"
    log(f"  FIX  {filepath} ({len(file_items)} {label}, TSC={current_tsc} lint={current_lint})")

    Phase = tuple[str, str | None]
    queue: list[Phase] = []
    if run_state["local_enabled"] and not run_state["gemini_only"]:
        queue.append(("local", None))
    for m in GEMINI_FLASH_LITE_MODELS:
        queue.append(("gemini-flash-lite", m))

    flash_unlocked = False
    flash_failures = 0
    codex_queued = False
    attempt = 0

    while queue:
        kind, model = queue.pop(0)
        attempt += 1
        log(f"    pass {attempt} — {_runner_label(kind, model, None)}")

        slot_used: int | None = None
        if kind == "local":
            output, status = call_local(filepath, file_items, mode)
            if status == "unreachable":
                log(f"    local vLLM unreachable — disabling local for the rest of this run")
                file_log(filepath, attempt, "local-unreachable", "vLLM /v1/models did not respond")
                run_state["local_enabled"] = False
                continue
        elif kind in ("gemini-flash-lite", "gemini-flash"):
            output, status, slot_used = call_gemini_with_cycling(model, filepath, file_items, mode, run_state)
            if status == "all_limited":
                log(f"    gemini all slots exhausted — aborting file")
                file_log(filepath, attempt, f"{kind}-all-limited", output)
                break
            if status == "auth_error":
                log(f"    gemini auth error — see file log; skipping this runner")
                file_log(filepath, attempt, f"{kind}-auth-error", output)
                continue
        elif kind == "codex":
            output, status = call_codex(filepath, file_items, mode)
            if status == "usage_limit":
                log(f"    codex usage limit — aborting file")
                file_log(filepath, attempt, "codex-usage-limit", output)
                break
        else:
            log(f"    unknown phase kind {kind!r}")
            continue

        if status == "error":
            log(f"    {kind} runtime error (see file log)")
            file_log(filepath, attempt, f"{kind}-error", output)
            if kind == "gemini-flash":
                flash_failures += 1
            continue

        file_log(filepath, attempt, f"{kind}-raw-output", output)

        applied = apply_model_output(filepath, output)
        if not applied:
            log(f"    no valid typescript fence in output")
            file_log(
                filepath, attempt, f"{kind}-nochange",
                f"PROMPT:\n{build_prompt(filepath, file_items, mode)}\n\nOUTPUT:\n{output}",
            )
            if kind == "gemini-flash":
                flash_failures += 1
                if flash_failures >= FLASH_FAILURES_BEFORE_CODEX and not codex_queued:
                    log(f"    codex unlocked ({flash_failures} flash failures)")
                    queue.append(("codex", None))
                    codex_queued = True
            continue

        diff = git_diff_file(filepath)
        accepted, new_tsc, new_lint, reason, new_file_items, new_codes = _ratchet_check(
            filepath, file_items, current_tsc, current_lint, mode,
        )

        log_content = (
            f"FILE: {filepath}\n"
            f"MODE: {mode}\n"
            f"ATTEMPT: {attempt}\n"
            f"RUNNER: {_runner_label(kind, model, slot_used)}\n"
            f"TSC: {current_tsc} → {new_tsc}\n"
            f"LINT: {current_lint} → {new_lint}\n"
            f"  file items before: {len(file_items)}\n"
            f"  file items after:  {len(new_file_items)}\n"
            f"  new codes/rules:   {sorted(new_codes) if new_codes else '(none)'}\n"
            f"\n{'='*60}\nMODEL OUTPUT:\n{'='*60}\n{output}\n"
            f"\n{'='*60}\nAPPLIED DIFF:\n{'='*60}\n{diff}\n"
        )
        if new_file_items:
            log_content += (
                f"\n{'='*60}\nREMAINING ISSUES IN FILE:\n{'='*60}\n"
                + "\n".join(new_file_items) + "\n"
            )

        if not accepted:
            log(f"    REJECT from {_runner_label(kind, model, slot_used)} ({reason}), rollback")
            file_log(filepath, attempt, f"{kind}-regress", log_content)
            git_checkout_file(filepath)

            if kind == "gemini-flash-lite" and not flash_unlocked:
                flash_unlocked = True
                log(f"    flash unlocked (flash-lite produced applied-but-rejected edit)")
                flash_phases: list[Phase] = [("gemini-flash", m) for m in GEMINI_FLASH_MODELS]
                queue = flash_phases + queue

            if kind == "gemini-flash":
                flash_failures += 1
                if flash_failures >= FLASH_FAILURES_BEFORE_CODEX and not codex_queued:
                    log(f"    codex unlocked ({flash_failures} flash failures)")
                    queue.append(("codex", None))
                    codex_queued = True
            continue

        # Ratchet passed. Run the gemini-flash sanity check before committing.
        if sanity_enabled:
            log(f"    sanity check ({SANITY_MODEL})…")
            verdict, sanity_raw = gemini_sanity_check(diff, run_state)
            log_content += (
                f"\n{'='*60}\nSANITY VERDICT: {verdict}\n{'='*60}\n{sanity_raw}\n"
            )
            if verdict == "NO":
                log(f"    sanity: NO — rolling back and escalating")
                file_log(filepath, attempt, f"{kind}-sanity-no", log_content)
                git_checkout_file(filepath)

                # Same escalation logic as a regress.
                if kind == "gemini-flash-lite" and not flash_unlocked:
                    flash_unlocked = True
                    log(f"    flash unlocked (sanity-rejected flash-lite edit)")
                    flash_phases = [("gemini-flash", m) for m in GEMINI_FLASH_MODELS]
                    queue = flash_phases + queue
                if kind == "gemini-flash":
                    flash_failures += 1
                    if flash_failures >= FLASH_FAILURES_BEFORE_CODEX and not codex_queued:
                        log(f"    codex unlocked ({flash_failures} flash failures)")
                        queue.append(("codex", None))
                        codex_queued = True
                continue
            if verdict == "unknown":
                log(f"    sanity: unknown response — treating as YES (logged for review)")
                file_log(filepath, attempt, f"{kind}-sanity-unknown", log_content)

        # Sanity OK (or disabled): commit and return.
        if mode == "tsc":
            commit_msg = f"fix(types): auto-fix {current_tsc - new_tsc} TSC errors in {filepath}"
        else:
            commit_msg = f"fix(lint): auto-fix {current_lint - new_lint} ESLint warnings in {filepath}"
        log(f"    OK from {_runner_label(kind, model, slot_used)}: {reason}")
        file_log(filepath, attempt, f"{kind}-success", log_content)
        git_commit_file(filepath, commit_msg)
        progress["completed"].append(filepath)
        save_progress(progress, mode)
        return new_tsc, new_lint

    log(f"    FAILED on {filepath}")
    progress["failed"].append(filepath)
    save_progress(progress, mode)
    return current_tsc, current_lint


def main() -> None:
    parser = argparse.ArgumentParser(description="Auto-fix TSC errors or ESLint warnings")
    parser.add_argument(
        "--mode", choices=["tsc", "lint"], default="tsc",
        help="What to fix: tsc errors or eslint warnings (default: tsc)",
    )
    parser.add_argument(
        "--scrape", action="store_true",
        help="Re-run the source tool and rebuild the manifest before fixing",
    )
    parser.add_argument(
        "--dry", action="store_true",
        help="With --scrape, only rebuild manifest (don't fix)",
    )
    parser.add_argument(
        "--reset", action="store_true",
        help="Clear progress.json for the current mode and start fresh",
    )
    parser.add_argument(
        "--limit", type=int, default=0,
        help="Max number of files to attempt (0 = unlimited)",
    )
    parser.add_argument(
        "--gemini", action="store_true",
        help="Skip the local model entirely; start the ladder at gemini flash-lite.",
    )
    parser.add_argument(
        "--no-sanity", action="store_true",
        help="Skip the gemini-flash YES/NO sanity check before commit.",
    )
    parser.add_argument(
        "tiers", nargs="*", default=["1", "2"],
        help="Which tiers to process (default: 1 2)",
    )
    args = parser.parse_args()

    mode = args.mode
    sanity_enabled = not args.no_sanity

    log("=" * 60)
    log(f"Auto-fix [{mode}] — tiers {', '.join(args.tiers)}")
    if args.gemini:
        log("Mode: --gemini (local skipped, starting at flash-lite)")
    if not sanity_enabled:
        log("Sanity check: DISABLED via --no-sanity")
    else:
        log(f"Sanity check: {SANITY_MODEL} on each accepted diff")
    log("=" * 60)

    log(f"Local model: {MODEL_NAME}")
    log(f"Gemini flash-lite ladder: {', '.join(GEMINI_FLASH_LITE_MODELS)}")
    log(f"Gemini flash ladder (gated by applied-but-rejected flash-lite): {', '.join(GEMINI_FLASH_MODELS)}")
    log(f"Codex last-resort: ai codex 2 (after {FLASH_FAILURES_BEFORE_CODEX} flash failures)")
    if mode == "tsc":
        log(f"EASY codes ({len(EASY_CODES)}): {', '.join(sorted(EASY_CODES))}")
        log(f"MEDIUM codes ({len(MEDIUM_CODES)}): {', '.join(sorted(MEDIUM_CODES))}")
        log(f"HARD codes ({len(HARD_CODES)}): {', '.join(sorted(HARD_CODES))}")
    else:
        log(f"EASY rules ({len(EASY_RULES)}): {', '.join(sorted(EASY_RULES))}")
        log(f"MEDIUM rules ({len(MEDIUM_RULES)}): {', '.join(sorted(MEDIUM_RULES))}")
        log(f"HARD rules ({len(HARD_RULES)}): {', '.join(sorted(HARD_RULES))}")

    manifest_path = MANIFEST_FILES[mode]
    progress_path = PROGRESS_FILES[mode]

    if args.scrape:
        manifest = scrape_and_save(mode)
        if args.dry:
            log("Dry run — exiting after scrape")
            return
    else:
        if not manifest_path.exists():
            log(f"No manifest found at {manifest_path}. Run with --scrape first.")
            sys.exit(1)
        with open(manifest_path) as f:
            manifest = json.load(f)

    if args.reset and progress_path.exists():
        progress_path.unlink()
        log(f"Progress reset ({progress_path.name})")

    progress = load_progress(mode)

    log("Measuring baselines...")
    starting_tsc = len(run_tsc())
    if mode == "tsc":
        current_lint = read_eslint_baseline()
    else:
        current_lint = get_eslint_warning_count()
    current_tsc = starting_tsc

    if progress["start_items"] is None:
        progress["start_items"] = current_tsc if mode == "tsc" else current_lint
    log(f"TSC errors: {current_tsc}")
    log(f"ESLint warnings: {current_lint}")
    save_progress(progress, mode)

    attempted = 0
    limit = args.limit or float("inf")

    run_state: dict = {
        "local_enabled": not args.gemini,
        "gemini_only": args.gemini,
        "gemini_slot": 1 if args.gemini else 0,
    }

    for tier in args.tiers:
        entries = manifest["tiers"].get(tier, [])
        log(f"\n── Tier {tier}: {len(entries)} files ──")

        entries.sort(key=lambda e: e["total"])

        for entry in entries:
            if attempted >= limit:
                log(f"  Limit reached ({args.limit}), stopping")
                break

            filepath = entry["file"]
            already = filepath in progress["completed"] or filepath in progress["skipped"]
            if not already:
                attempted += 1

            current_tsc, current_lint = process_file(
                filepath, progress, current_tsc, current_lint, run_state, mode, sanity_enabled,
            )

        if attempted >= limit:
            break

    log("\n" + "=" * 60)
    log("DONE")
    metric = "TSC errors" if mode == "tsc" else "ESLint warnings"
    end_value = current_tsc if mode == "tsc" else current_lint
    log(f"  Mode:      {mode}")
    log(f"  Start:     {progress['start_items']} {metric}")
    log(f"  End:       {end_value} {metric}")
    log(f"  Fixed:     {progress['start_items'] - end_value}")
    log(f"  Files OK:  {len(progress['completed'])}")
    log(f"  Files BAD: {len(progress['failed'])}")
    log(f"  Skipped:   {len(progress['skipped'])}")
    log("=" * 60)


if __name__ == "__main__":
    main()
