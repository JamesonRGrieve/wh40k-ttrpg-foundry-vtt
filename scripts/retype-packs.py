#!/usr/bin/env python3
"""
Retype actor JSON files in every pack _source/ directory to the new
(system, kind) concrete type ids.

Translation:
    type=character + gameSystem=<sys>  → type=<sys>-character
    type=npc       + gameSystem=<sys>  → type=<sys>-npc
    type=vehicle   + gameSystem=<sys>  → type=<sys>-vehicle
    type=starship  + gameSystem=<sys>  → type=<sys>-starship  (rt only)

If `gameSystem` is missing, the pack directory path tells us (e.g.
src/packs/dark-heresy-2/... → dh2). The dir name prefix maps:
    dark-heresy-2 → dh2
    dark-heresy-1 → dh1
    rogue-trader  → rt
    black-crusade → bc
    only-war      → ow
    deathwatch    → dw
    homebrew      → dh2  (homebrew is treated as DH2 by default)

Run from the .foundry/ directory:
    python3 scripts/retype-packs.py [--dry-run]

Idempotent: files already on the new scheme are left alone.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

PACK_SYSTEM_MAP = {
    'dark-heresy-2': 'dh2',
    'dark-heresy-1': 'dh1',
    'rogue-trader': 'rt',
    'black-crusade': 'bc',
    'only-war': 'ow',
    'deathwatch': 'dw',
    'homebrew': 'dh2',
}

LEGACY_TYPES = {'character', 'npc', 'vehicle', 'starship'}


def derive_system(path: Path, fallback: str | None) -> str | None:
    """Walk upward until we hit a recognised pack-system directory, else fallback."""
    if fallback:
        return fallback
    for part in path.parts:
        if part in PACK_SYSTEM_MAP:
            return PACK_SYSTEM_MAP[part]
    return None


def new_type_for(old: str, system: str) -> str:
    kind_map = {'character': 'character', 'npc': 'npc', 'vehicle': 'vehicle', 'starship': 'starship'}
    kind = kind_map[old]
    return f'{system}-{kind}'


def process_file(path: Path, dry_run: bool) -> tuple[str, str | None]:
    """Return (status, new_type) where status is 'updated' | 'skipped' | 'unknown'."""
    try:
        with path.open('r', encoding='utf-8') as f:
            doc = json.load(f)
    except Exception as exc:
        return (f'error: {exc}', None)

    if not isinstance(doc, dict):
        return ('skipped: not an object', None)

    old_type = doc.get('type')
    if old_type not in LEGACY_TYPES:
        # Either already migrated or not an actor (likely an item).
        return ('skipped: not legacy actor', None)

    system_from_data = doc.get('system', {}).get('gameSystem') if isinstance(doc.get('system'), dict) else None
    system = derive_system(path, system_from_data)
    if not system:
        return ('unknown: could not derive system', None)

    new_type = new_type_for(old_type, system)
    doc['type'] = new_type
    if isinstance(doc.get('system'), dict) and 'gameSystem' not in doc['system']:
        # Stamp the gameSystem field explicitly so runtime lookups stay correct.
        doc['system']['gameSystem'] = f'{system}e' if system in ('dh1', 'dh2') else system

    if dry_run:
        return (f'DRY would update → {new_type}', new_type)

    with path.open('w', encoding='utf-8') as f:
        json.dump(doc, f, indent=2, ensure_ascii=False)
        f.write('\n')
    return (f'updated → {new_type}', new_type)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--root', default='src/packs')
    args = ap.parse_args()

    root = Path(args.root)
    if not root.is_dir():
        print(f'No such pack root: {root}', file=sys.stderr)
        sys.exit(1)

    stats = {'updated': 0, 'skipped': 0, 'unknown': 0, 'error': 0}
    for path in sorted(root.rglob('*.json')):
        # Only _source/ tree — compiled NeDB files are regenerated from _source.
        if '_source' not in path.parts:
            continue
        status, _ = process_file(path, args.dry_run)
        if status.startswith('updated') or status.startswith('DRY'):
            stats['updated'] += 1
            print(f'  {path.relative_to(root)}: {status}')
        elif status.startswith('skipped'):
            stats['skipped'] += 1
        elif status.startswith('unknown'):
            stats['unknown'] += 1
            print(f'  {path.relative_to(root)}: {status}', file=sys.stderr)
        elif status.startswith('error'):
            stats['error'] += 1
            print(f'  {path.relative_to(root)}: {status}', file=sys.stderr)

    print()
    print(f'Summary: {stats["updated"]} updated, {stats["skipped"]} skipped,',
          f'{stats["unknown"]} unknown-system, {stats["error"]} errors')


if __name__ == '__main__':
    main()
