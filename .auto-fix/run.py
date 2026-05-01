#!/home/jameson/.local/share/uv/tools/aider-chat/bin/python
"""
Auto-fix TSC errors using aider + local Qwen3-Coder via vLLM.

Usage:
    ./run.py                  # Run tiers 1+2 from existing manifest
    ./run.py --scrape         # Re-scrape TSC errors into manifest, then run
    ./run.py --scrape --dry   # Re-scrape only, don't fix anything
    ./run.py --reset          # Clear progress and start fresh
    ./run.py 1                # Run tier 1 only
    ./run.py 1 2              # Run tiers 1 and 2

Each file fix is ratchet-gated: TSC error count must not rise AND ESLint
warning count must not rise. Failures roll back the file and log the full
aider exchange for prompt tuning.
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
MANIFEST = AUTOFIX / "tsc-error-manifest.json"
LOG = AUTOFIX / "run.log"
PROGRESS = AUTOFIX / "progress.json"
FILE_LOGS = AUTOFIX / "file-logs"

os.environ["OPENAI_API_BASE"] = "http://198.51.100.9/v1"
os.environ["OPENAI_API_KEY"] = "dummy"

MODEL_NAME = "openai/cyankiwi/Qwen3-Coder-30B-A3B-Instruct-AWQ-4bit"
MAX_RETRIES = 2

# ── Error code competency for Qwen3-Coder-30B (32K ctx, 8K out) ──

EASY_CODES = {
    "TS7006",  # Parameter implicitly has 'any' type → add annotation
    "TS7005",  # Variable implicitly has 'any' type → add annotation
    "TS7008",  # Member implicitly has 'any' type → add annotation
    "TS7034",  # Variable implicitly has 'any[]' → add annotation
    "TS7053",  # Element implicitly has 'any' (index expression) → type the key
    "TS7019",  # Rest parameter implicitly has 'any[]' → add annotation
    "TS7022",  # Could be instantiated with different subtype → add constraint
    "TS18048", # Value possibly undefined → add null check or !
    "TS18047", # Value possibly null → add null check or !
    "TS2531",  # Object possibly null → add null check or !
    "TS2532",  # Object possibly undefined → add null check or !
    "TS2551",  # Property doesn't exist, did you mean X → fix typo
}

MEDIUM_CODES = {
    "TS2339",  # Property does not exist on type → widen type or cast
    "TS2345",  # Argument type not assignable → fix call or param type
    "TS2322",  # Type not assignable to type → fix assignment
    "TS18046", # Variable is of type 'unknown' → narrow with guard or cast
    "TS2365",  # Operator can't be applied → fix operand types
    "TS2367",  # No overlap between types → fix comparison
    "TS2352",  # Type conversion may be mistake → cast through unknown
    "TS2353",  # Object literal may only specify known properties
    "TS2564",  # Property has no initializer → add ! or default
    "TS2576",  # Property is not assignable → mark as writable
    "TS2571",  # Object is of type 'unknown' → narrow
    "TS18049", # Value is possibly null or undefined → add check
    "TS2488",  # Type must have Symbol.iterator → add iterable constraint
    "TS2538",  # Type cannot be used as index → constrain key type
}

HARD_CODES = {
    "TS2416",  # Property incompatible with base type → class hierarchy
    "TS2740",  # Type missing N properties → structural mismatch
    "TS2554",  # Wrong number of arguments → API shape unknown
    "TS2769",  # No overload matches → complex overload resolution
    "TS2349",  # Cannot invoke expression → callable type issue
    "TS4113",  # Must have override modifier
    "TS2417",  # Class incorrectly extends base
    "TS2741",  # Property is missing in type
    "TS2739",  # Type is missing properties from type
    "TS2694",  # Namespace has no exported member
    "TS2314",  # Type argument not assignable to constraint
    "TS2794",  # Expected N args, got min N
    "TS2790",  # Operand of delete must be optional
    "TS2783",  # Required/optional property mismatch
    "TS2698",  # Spread types may only be from object types
    "TS2683",  # 'this' implicitly has type 'any'
    "TS2722",  # Cannot invoke possibly undefined
    "TS2707",  # Generic type requires type arguments
    "TS2545",  # A mixin class must have constructor
    "TS2774",  # Condition will always return true → logic issue
    "TS2833",  # Not a module
    "TS2556",  # Spread argument must be a tuple
    "TS2363",  # RHS of arithmetic must be any/number/bigint/enum
    "TS2362",  # LHS of arithmetic must be any/number/bigint/enum
    "TS2355",  # Function must return a value → logic change
}

MAX_FILE_LINES = 800

# ── Per-error-code prompt guidance ──

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


def run_tsc() -> list[str]:
    """Run tsc --noEmit, return all error lines."""
    result = subprocess.run(
        ["pnpm", "typecheck"],
        capture_output=True,
        text=True,
        cwd=ROOT,
        timeout=120,
    )
    output = result.stdout + "\n" + result.stderr
    return [
        line for line in output.splitlines()
        if ": error TS" in line and line.startswith("src/")
    ]


def get_eslint_warning_count() -> int:
    """Run eslint and return warning count."""
    try:
        result = subprocess.run(
            ["pnpm", "lint", "--format", "json"],
            capture_output=True,
            text=True,
            cwd=ROOT,
            timeout=120,
        )
        output = result.stdout
        # eslint JSON output may have pnpm wrapper text before the JSON
        # Find the JSON array start
        idx = output.find("[")
        if idx == -1:
            return 999999
        results = json.loads(output[idx:])
        return sum(r.get("warningCount", 0) for r in results)
    except Exception as e:
        log(f"    ESLint parse error: {e}")
        return 999999


def read_eslint_baseline() -> int:
    baseline_path = ROOT / ".eslint-warning-baseline"
    if baseline_path.exists():
        return int(baseline_path.read_text().strip())
    return 999999


def parse_errors(lines: list[str]) -> dict[str, dict[str, int]]:
    """Parse TSC error lines into {filepath: {TScode: count}}."""
    by_file: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    pattern = re.compile(r"^(src/[^(]+)\(\d+,\d+\): error (TS\d+):")
    for line in lines:
        m = pattern.match(line)
        if m:
            by_file[m.group(1)][m.group(2)] += 1
    return dict(by_file)


def classify_file(filepath: str, errors: dict[str, int]) -> str:
    """Assign a tier based on error codes and file size."""
    try:
        lines = (ROOT / filepath).read_text().count("\n")
    except OSError:
        return "3"

    if lines > MAX_FILE_LINES:
        return "3"

    total = sum(errors.values())
    easy_count = sum(errors.get(c, 0) for c in EASY_CODES)
    medium_count = sum(errors.get(c, 0) for c in MEDIUM_CODES)
    hard_count = sum(errors.get(c, 0) for c in HARD_CODES)

    if hard_count > 0.4 * total:
        return "3"
    if easy_count >= 0.8 * total:
        return "1"
    if (easy_count + medium_count) >= 0.6 * total:
        return "2"
    return "3"


def build_manifest(error_lines: list[str]) -> dict:
    """Build the full manifest from TSC output."""
    by_file = parse_errors(error_lines)

    tiers: dict[str, list] = {"1": [], "2": [], "3": []}
    for filepath, errors in sorted(by_file.items()):
        try:
            lines = (ROOT / filepath).read_text().count("\n")
        except OSError:
            lines = 0

        tier = classify_file(filepath, errors)
        codes_present = sorted(errors.keys(), key=lambda c: -errors[c])
        strategy_parts = []
        for code in codes_present[:3]:
            if code in ERROR_GUIDANCE:
                strategy_parts.append(ERROR_GUIDANCE[code].split("\n")[0])
            else:
                strategy_parts.append(code)

        tiers[tier].append({
            "file": filepath,
            "lines": lines,
            "errors": dict(errors),
            "total": sum(errors.values()),
            "strategy": "; ".join(strategy_parts),
        })

    summary = {}
    for tier_id in ["1", "2", "3"]:
        entries = tiers[tier_id]
        summary[f"tier{tier_id}_files"] = len(entries)
        summary[f"tier{tier_id}_errors"] = sum(e["total"] for e in entries)

    return {"tiers": tiers, "summary": summary}


def scrape_and_save() -> dict:
    """Run TSC, build manifest, save to disk."""
    log("Scraping TSC errors...")
    error_lines = run_tsc()
    log(f"  {len(error_lines)} error lines parsed")

    manifest = build_manifest(error_lines)
    with open(MANIFEST, "w") as f:
        json.dump(manifest, f, indent=2)

    for tier_id in ["1", "2", "3"]:
        n = manifest["summary"][f"tier{tier_id}_files"]
        e = manifest["summary"][f"tier{tier_id}_errors"]
        log(f"  Tier {tier_id}: {n} files, {e} errors")

    log(f"Manifest written to {MANIFEST}")
    return manifest


def build_prompt(filepath: str, file_error_lines: list[str]) -> str:
    """Build a prompt with per-error-code guidance for only the codes present."""
    codes_present: set[str] = set()
    pattern = re.compile(r"error (TS\d+):")
    for line in file_error_lines:
        m = pattern.search(line)
        if m:
            codes_present.add(m.group(1))

    guidance_parts: list[str] = []
    for code in sorted(codes_present):
        if code in ERROR_GUIDANCE:
            guidance_parts.append(ERROR_GUIDANCE[code])

    guidance = "\n\n".join(guidance_parts) if guidance_parts else "Use your judgment to fix the type errors."
    error_block = "\n".join(file_error_lines)

    return f"""Fix the TypeScript compiler errors in `{filepath}`. The exact errors:

{error_block}

## How to fix each error type

{guidance}

## Hard rules

- NEVER use `any` type. Use specific types, `unknown`, or generics.
  The ONE exception: Foundry's `CONFIG` object is untyped — casting a CONFIG
  access to `Record<string, any>` is acceptable.
- NEVER add `@ts-ignore` or `@ts-expect-error`.
- NEVER change logic, control flow, or runtime behavior.
- NEVER remove or rename existing code.
- **NEVER invent imports. NEVER add new imports.** Use only types that are
  ALREADY imported in the file or are GLOBAL builtins (string, number, boolean,
  Record, Array, Promise, Map, Set, Date, Error, Event, HTMLElement, etc.).
- **JSDoc type hints are NOT proof a type exists.** If you see `@param x {{Foo}}`
  in a comment but `Foo` is not in the file's import list, `Foo` does NOT exist
  in scope. Do NOT use `Foo` in your TypeScript annotation. The JSDoc is stale
  documentation — ignore it for type purposes.
- **The CORRECT fallback for unknown object types is `Record<string, unknown>`**.
  This is always available, requires no imports, and accepts any object. Use it
  whenever you would otherwise reach for an unimported domain type like
  `RollData`, `WeaponRollData`, `Actor`, `WH40KItem`, etc. Examples:
    `function fn(rollData)`        →  `function fn(rollData: Record<string, unknown>)`
    `function fn(actor)`           →  `function fn(actor: Record<string, unknown>)`
    `function fn(item, options)`   →  `function fn(item: Record<string, unknown>, options: Record<string, unknown>)`
- **For primitive params, use the primitive type directly**:
    `function fn(roll)` where roll is used as a number → `function fn(roll: number)`
    `function fn(name)` where name is concatenated to strings → `function fn(name: string)`
- Verify before you write: scan the existing `import` statements at the top
  of the file. Only types appearing there OR global builtins are safe to use.
- Keep changes minimal — only touch lines with errors or their immediate context.
- When adding a type annotation to a parameter, look at how it's used in the
  function body to infer the correct type.
- When multiple errors share a root cause (e.g., a variable declared without a
  type that's used in several places), fix the root cause once.
- Prefer type narrowing (guards, instanceof, typeof) over type assertions (as).
- Do NOT introduce new ESLint warnings (unused imports, unused variables, etc.).
- Your output MUST reduce the number of TypeScript errors. Don't trade one
  error for another — if you can't fix an error cleanly, leave it alone."""


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


def load_progress() -> dict:
    if PROGRESS.exists():
        with open(PROGRESS) as f:
            return json.load(f)
    return {"completed": [], "failed": [], "skipped": [], "start_errors": None}


def save_progress(progress: dict) -> None:
    with open(PROGRESS, "w") as f:
        json.dump(progress, f, indent=2)


SYSTEM_PROMPT = """\
You are a TypeScript expert fixing compiler errors. You will be given a file's full \
source and a list of TypeScript compiler errors. Output ONLY the complete corrected \
file, inside a single ```typescript ... ``` fence. No explanation, no other text.\
"""

def call_model(filepath: str, file_errors: list[str]) -> str:
    """Call vLLM directly via OpenAI streaming. Returns the raw model response."""
    from openai import OpenAI
    source = (ROOT / filepath).read_text()
    user_msg = (
        build_prompt(filepath, file_errors)
        + f"\n\n## Full file source\n\n```typescript\n{source}\n```"
        + "\n\nOutput the complete corrected file inside a single ```typescript fence."
    )

    client = OpenAI(
        api_key="dummy",
        base_url="http://198.51.100.9/v1",
        timeout=180,
        max_retries=0,  # don't retry — connection errors mean the server OOM'd
    )
    chunks = []
    with client.chat.completions.create(
        model=MODEL_NAME.removeprefix("openai/"),
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
        ],
        max_tokens=8192,
        temperature=0.1,
        stream=True,
    ) as stream:
        for chunk in stream:
            delta = chunk.choices[0].delta.content or ""
            chunks.append(delta)
    return "".join(chunks)


def apply_model_output(filepath: str, output: str) -> bool:
    """Extract the typescript fence from model output and write the file."""
    # Extract content between ```typescript ... ```
    m = re.search(r"```typescript\n(.*?)```", output, re.DOTALL)
    if not m:
        # Fallback: try ```ts or bare ```
        m = re.search(r"```(?:ts)?\n(.*?)```", output, re.DOTALL)
    if not m:
        return False
    new_content = m.group(1)
    if not new_content.strip():
        return False
    (ROOT / filepath).write_text(new_content)
    return True


def process_file(
    filepath: str,
    model: object,
    progress: dict,
    tsc_baseline: int,
    lint_baseline: int,
) -> tuple[int, int]:
    """Fix one file. Returns (new_tsc_count, new_lint_count)."""
    if filepath in progress["completed"] or filepath in progress["skipped"]:
        log(f"  SKIP {filepath} (already processed)")
        return tsc_baseline, lint_baseline

    # Fresh TSC parse for this file
    all_errors = run_tsc()
    file_errors = [l for l in all_errors if l.startswith(filepath + "(")]
    current_tsc = len(all_errors)

    if not file_errors:
        log(f"  SKIP {filepath} (no current errors)")
        progress["completed"].append(filepath)
        save_progress(progress)
        return current_tsc, lint_baseline

    log(f"  FIX  {filepath} ({len(file_errors)} errors, {current_tsc} total TSC)")

    for attempt in range(1, MAX_RETRIES + 1):
        log(f"    attempt {attempt}/{MAX_RETRIES}")

        # Wait for server to be reachable (up to 10 minutes)
        for wait_attempt in range(5):
            if check_vllm():
                break
            log(f"    vLLM unreachable, waiting 120s... ({wait_attempt+1}/5)")
            time.sleep(120)
        else:
            log(f"    vLLM unreachable after retries, aborting file")
            progress["failed"].append(filepath)
            save_progress(progress)
            return tsc_baseline, lint_baseline

        model_output = ""
        try:
            model_output = call_model(filepath, file_errors)
        except Exception as e:
            log(f"    model error: {e}, waiting 120s before next attempt")
            file_log(filepath, attempt, "error", f"Exception: {e}")
            time.sleep(120)
            continue

        file_log(filepath, attempt, "raw-output", model_output)

        applied = apply_model_output(filepath, model_output)
        if not applied:
            log(f"    no valid typescript fence in output")
            file_log(filepath, attempt, "nochange",
                     f"PROMPT:\n{build_prompt(filepath, file_errors)}\n\nOUTPUT:\n{model_output}")
            continue

        # Capture the applied diff for logging
        diff = git_diff_file(filepath)

        # Check TSC ratchet
        new_errors = run_tsc()
        new_tsc = len(new_errors)
        tsc_delta = new_tsc - current_tsc

        # Check lint ratchet
        new_lint = get_eslint_warning_count()
        lint_delta = new_lint - lint_baseline

        # Per-file error sets (compare error codes before/after)
        new_file_errors = [l for l in new_errors if l.startswith(filepath + "(")]
        code_re = re.compile(r"error (TS\d+):")
        before_codes = {code_re.search(l).group(1) for l in file_errors if code_re.search(l)}
        after_codes = {code_re.search(l).group(1) for l in new_file_errors if code_re.search(l)}
        new_codes = after_codes - before_codes  # error codes that DIDN'T exist before

        # Build detailed log
        log_content = (
            f"FILE: {filepath}\n"
            f"ATTEMPT: {attempt}\n"
            f"TSC: {current_tsc} → {new_tsc} (Δ{tsc_delta:+d})\n"
            f"  file errors before: {len(file_errors)} {sorted(before_codes)}\n"
            f"  file errors after:  {len(new_file_errors)} {sorted(after_codes)}\n"
            f"  new error codes:    {sorted(new_codes) if new_codes else '(none)'}\n"
            f"LINT: {lint_baseline} → {new_lint} (Δ{lint_delta:+d})\n"
            f"\n{'='*60}\nMODEL OUTPUT:\n{'='*60}\n{model_output}\n"
            f"\n{'='*60}\nAPPLIED DIFF:\n{'='*60}\n{diff}\n"
        )

        if new_file_errors:
            log_content += (
                f"\n{'='*60}\nREMAINING ERRORS IN FILE:\n{'='*60}\n"
                + "\n".join(new_file_errors) + "\n"
            )

        # Accept ONLY if all of:
        # - TSC count strictly decreased (no zero-delta "shuffles")
        # - Lint did not increase
        # - No new error code appeared (rejects fabricated imports / wrong type names)
        accepted = (
            tsc_delta < 0
            and lint_delta <= 0
            and not new_codes
        )
        if accepted:
            fixed_tsc = current_tsc - new_tsc
            log(f"    OK: TSC {current_tsc}→{new_tsc} (fixed {fixed_tsc}), lint {lint_baseline}→{new_lint}")
            file_log(filepath, attempt, "success", log_content)
            git_commit_file(
                filepath,
                f"fix(types): auto-fix {fixed_tsc} TSC errors in {filepath}",
            )
            progress["completed"].append(filepath)
            save_progress(progress)
            return new_tsc, new_lint
        else:
            reasons = []
            if tsc_delta > 0:
                reasons.append(f"TSC +{tsc_delta}")
            elif tsc_delta == 0:
                reasons.append("TSC unchanged (no real progress)")
            if lint_delta > 0:
                reasons.append(f"lint +{lint_delta}")
            if new_codes:
                reasons.append(f"new codes {sorted(new_codes)}")
            reason_str = ", ".join(reasons)
            log(f"    REJECT ({reason_str}), rollback")
            file_log(filepath, attempt, "regress", log_content)
            git_checkout_file(filepath)

    log(f"    FAILED after {MAX_RETRIES} attempts")
    progress["failed"].append(filepath)
    save_progress(progress)
    return current_tsc, lint_baseline


def main() -> None:
    parser = argparse.ArgumentParser(description="Auto-fix TSC errors with aider")
    parser.add_argument(
        "--scrape", action="store_true",
        help="Re-run TSC and rebuild the manifest before fixing",
    )
    parser.add_argument(
        "--dry", action="store_true",
        help="With --scrape, only rebuild manifest (don't fix)",
    )
    parser.add_argument(
        "--reset", action="store_true",
        help="Clear progress.json and start fresh",
    )
    parser.add_argument(
        "--limit", type=int, default=0,
        help="Max number of files to attempt (0 = unlimited)",
    )
    parser.add_argument(
        "tiers", nargs="*", default=["1", "2"],
        help="Which tiers to process (default: 1 2)",
    )
    args = parser.parse_args()

    log("=" * 60)
    log(f"TSC auto-fix — tiers {', '.join(args.tiers)}")
    log("=" * 60)

    # Print competency table
    log(f"Model: {MODEL_NAME}")
    log(f"EASY codes ({len(EASY_CODES)}): {', '.join(sorted(EASY_CODES))}")
    log(f"MEDIUM codes ({len(MEDIUM_CODES)}): {', '.join(sorted(MEDIUM_CODES))}")
    log(f"HARD codes ({len(HARD_CODES)}): {', '.join(sorted(HARD_CODES))}")

    if args.scrape:
        manifest = scrape_and_save()
        if args.dry:
            log("Dry run — exiting after scrape")
            return
    else:
        if not MANIFEST.exists():
            log("No manifest found. Run with --scrape first.")
            sys.exit(1)
        with open(MANIFEST) as f:
            manifest = json.load(f)

    if args.reset and PROGRESS.exists():
        PROGRESS.unlink()
        log("Progress reset")

    progress = load_progress()

    # Baselines
    log("Measuring baselines...")
    starting_tsc_errors = run_tsc()
    current_tsc = len(starting_tsc_errors)
    current_lint = read_eslint_baseline()

    if progress["start_errors"] is None:
        progress["start_errors"] = current_tsc
    log(f"TSC errors: {current_tsc}")
    log(f"ESLint warning baseline: {current_lint}")
    save_progress(progress)

    attempted = 0
    limit = args.limit or float("inf")

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
                filepath, None, progress, current_tsc, current_lint,
            )

        if attempted >= limit:
            break

    log("\n" + "=" * 60)
    log("DONE")
    log(f"  Start:     {progress['start_errors']} TSC errors")
    log(f"  End:       {current_tsc} TSC errors")
    log(f"  Fixed:     {progress['start_errors'] - current_tsc}")
    log(f"  Files OK:  {len(progress['completed'])}")
    log(f"  Files BAD: {len(progress['failed'])}")
    log(f"  Skipped:   {len(progress['skipped'])}")
    log("=" * 60)


if __name__ == "__main__":
    main()
