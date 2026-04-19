#!/usr/bin/env python3
"""
Backfill `system.gameSystems` on every item JSON in src/packs/**/_source/.

**Inference is source-string driven**, not pack-directory driven — `source`
already identifies the actual rulebook and is present on ~93% of items.
Pack directory is only the fallback when `source` is absent.

Source prefix → system:
    "DH2e " / "DH 2E: " / "DH2: "            → dh2e
    "DH: " / "Dark Heresy: "                  → dh1e
    "RT: " / "Rogue Trader "                  → rt
    "BC: " / "Black Crusade"                  → bc
    "OW: " / "Only War "                      → ow
    "DW: " / "Deathwatch"                     → dw
    "Homebrew"                                → dh2e (campaign default)

Pack directory fallback:
    dark-heresy-2 → dh2e, dark-heresy-1 → dh1e, rogue-trader → rt,
    black-crusade → bc, only-war → ow, deathwatch → dw, homebrew → dh2e

Rules:
    - Skip actors (typed via the new (system, kind) ids).
    - If `gameSystems` already contains the inferred system, leave it alone.
    - If `gameSystems` has a single wrong tag (common historical artifact:
      packs were copy-pasted and everything got `['rt']` by default),
      replace with the source-inferred value.
    - Multi-system arrays (len > 1) are left alone — may be intentional
      (e.g. bolter appears in both DH2 and RT books).
    - Normalise dict-shaped `source` (`{book, page, custom}`) to the book
      string for consistency.

Idempotent. Rerunning produces no further changes.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

# Pack-directory fallback when `source` is missing or un-parseable.
PACK_SYSTEM_MAP = {
    'dark-heresy-2': 'dh2e',
    'dark-heresy-1': 'dh1e',
    'rogue-trader': 'rt',
    'black-crusade': 'bc',
    'only-war': 'ow',
    'deathwatch': 'dw',
    'homebrew': 'dh2e',
}

ACTOR_TYPE_PREFIXES = ('dh1-', 'dh2-', 'rt-', 'bc-', 'ow-', 'dw-')

# Source-string → system inference patterns. Ordered: more specific first.
# We match against the start of the source (case-insensitive).
SOURCE_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r'^\s*DH\s?2[eE]?\b', re.I), 'dh2e'),
    (re.compile(r'^\s*DH\s?2:', re.I), 'dh2e'),
    (re.compile(r'^\s*DH:\s*', re.I), 'dh1e'),
    (re.compile(r'^\s*Dark\s+Heresy:', re.I), 'dh1e'),
    (re.compile(r'^\s*RT:', re.I), 'rt'),
    (re.compile(r'^\s*Rogue\s+Trader\b', re.I), 'rt'),
    (re.compile(r'^\s*BC:', re.I), 'bc'),
    (re.compile(r'^\s*Black\s+Crusade\b', re.I), 'bc'),
    (re.compile(r'^\s*OW:', re.I), 'ow'),
    (re.compile(r'^\s*Only\s+War\b', re.I), 'ow'),
    (re.compile(r'^\s*DW:', re.I), 'dw'),
    (re.compile(r'^\s*Deathwatch\b', re.I), 'dw'),
    (re.compile(r'^\s*Homebrew\b', re.I), 'dh2e'),
]


def normalize_source(raw) -> str | None:
    """Convert a source field to a string. Handles the common dict shape."""
    if raw is None:
        return None
    if isinstance(raw, str):
        s = raw.strip()
        return s if s else None
    if isinstance(raw, dict):
        book = raw.get('book') or raw.get('value') or raw.get('text')
        if isinstance(book, str):
            s = book.strip()
            return s if s else None
    return None


def infer_from_source(source: str | None) -> str | None:
    if not source:
        return None
    for pattern, system in SOURCE_PATTERNS:
        if pattern.match(source):
            return system
    return None


def derive_expected(path: Path, source: str | None) -> str | None:
    """Prefer source-string inference; fall back to pack directory."""
    inferred = infer_from_source(source)
    if inferred:
        return inferred
    for part in path.parts:
        if part in PACK_SYSTEM_MAP:
            return PACK_SYSTEM_MAP[part]
    return None


def decide_new_tag(current, expected: str) -> list[str] | None:
    """Return new gameSystems list, or None to leave unchanged."""
    if current is None or (isinstance(current, list) and len(current) == 0):
        return [expected]
    if not isinstance(current, list):
        return [str(current)]  # normalise scalar
    if expected in current:
        return None  # already correct
    # Historical artifact: many items were copy-pasted from RT packs and left
    # with ['rt']. If it's a single tag and doesn't match, override.
    if len(current) == 1:
        return [expected]
    # Multi-system arrays are treated as intentional — leave alone.
    return None


def process(path: Path, dry_run: bool) -> str:
    try:
        with path.open('r', encoding='utf-8') as f:
            doc = json.load(f)
    except Exception as exc:
        return f'error: {exc}'

    if not isinstance(doc, dict):
        return 'skipped: non-object'

    t = doc.get('type', '')
    if isinstance(t, str) and t.startswith(ACTOR_TYPE_PREFIXES):
        return 'skipped: actor'

    sys = doc.get('system')
    if not isinstance(sys, dict):
        return 'skipped: no system obj'

    source = normalize_source(sys.get('source'))
    expected = derive_expected(path, source)
    if not expected:
        return 'skipped: cannot derive system'

    # Normalise dict-shaped source into a string for consistency.
    changed = False
    if isinstance(sys.get('source'), dict) and source is not None:
        sys['source'] = source
        changed = True

    current = sys.get('gameSystems')
    new = decide_new_tag(current, expected)
    if new is not None:
        sys['gameSystems'] = new
        changed = True

    if not changed:
        return 'unchanged'

    if dry_run:
        return f'DRY source={source!r} → gameSystems={sys["gameSystems"]!r}'
    with path.open('w', encoding='utf-8') as f:
        json.dump(doc, f, indent=2, ensure_ascii=False)
        f.write('\n')
    return f'source={source!r} → gameSystems={sys["gameSystems"]!r}'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--root', default='src/packs')
    ap.add_argument('--quiet', action='store_true')
    args = ap.parse_args()

    root = Path(args.root)
    if not root.is_dir():
        print(f'No such pack root: {root}', file=sys.stderr)
        sys.exit(1)

    counter = Counter()
    by_pack = Counter()
    by_system = Counter()
    for path in sorted(root.rglob('*.json')):
        if '_source' not in path.parts:
            continue
        status = process(path, args.dry_run)
        if status == 'unchanged':
            counter['unchanged'] += 1
        elif status.startswith('skipped'):
            counter['skipped'] += 1
        elif status.startswith('error'):
            counter['error'] += 1
            if not args.quiet:
                print(f'  {path.relative_to(root)}: {status}', file=sys.stderr)
        else:
            counter['updated'] += 1
            # Track pack-root + final system distribution.
            for p in path.parts:
                if p in PACK_SYSTEM_MAP:
                    by_pack[p] += 1
                    break
            m = re.search(r"gameSystems=\['(\w+)'\]", status)
            if m:
                by_system[m.group(1)] += 1
            if not args.quiet:
                print(f'  {path.relative_to(root)}: {status}')

    print()
    print(f'Updated:   {counter["updated"]}')
    print(f'Unchanged: {counter["unchanged"]}')
    print(f'Skipped:   {counter["skipped"]}')
    print(f'Errors:    {counter["error"]}')
    if by_pack:
        print('\nUpdated by pack:')
        for pack, n in sorted(by_pack.items()):
            print(f'  {pack:<20} {n:>6}')
    if by_system:
        print('\nFinal gameSystems distribution (updated rows only):')
        for sys_id, n in sorted(by_system.items()):
            print(f'  {sys_id:<10} {n:>6}')


if __name__ == '__main__':
    main()
