#!/usr/bin/env python3
"""
Split shared WH40K RPG Foundry VTT compendium packs into game-specific packs
based on each item's system.source field.

Only moves files — does NOT modify any JSON content.
"""

import json
import os
import shutil
from collections import defaultdict

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "src", "packs")

# Packs to split (mixed sources)
PACKS_TO_SPLIT = [
    "wh40k-items-ammo",
    "wh40k-items-armour",
    "wh40k-items-armour-customisations",
    "wh40k-items-gear",
    "wh40k-items-psychic-powers",
    "wh40k-items-skills",
    "wh40k-items-talents",
    "wh40k-items-traits",
    "wh40k-items-weapons",
]

# Pack to move entirely to OW
PACK_MOVE_ENTIRELY = "wh40k-items-vehicle-upgrades"

# Prefix rules for classification — check longer prefixes first
# Each entry: (game_key, list_of_prefixes)
# We sort by prefix length descending at match time
CLASSIFICATION_RULES = [
    ("dh2e", ["DH2", "DH 2E", "Dark Heresy 2E", "DH2e"]),
    ("dh1e", ["DH:", "Dark Heresy:", "Dark Heresy Core", "DH Core"]),
    ("rt",   ["RT:", "RT ", "Rogue Trader", "Into the Storm"]),
    ("dw",   ["DW:", "Deathwatch"]),
    ("ow",   ["OW:", "Only War"]),
    ("bc",   ["BC:", "Black Crusade"]),
    ("homebrew", ["Homebrew", "HB", "ChatGPT"]),
]

# Build a flat list of (prefix, game) sorted by prefix length descending
PREFIX_MAP = []
for game, prefixes in CLASSIFICATION_RULES:
    for prefix in prefixes:
        PREFIX_MAP.append((prefix, game))
PREFIX_MAP.sort(key=lambda x: -len(x[0]))


def extract_source_string(data):
    """Extract the source string from a JSON item, handling both string and dict formats."""
    source = data.get("system", {}).get("source", "")
    if isinstance(source, dict):
        # Some items store source as {"book": "...", "page": "...", "custom": "..."}
        return source.get("book", "")
    if isinstance(source, str):
        return source
    return ""


def classify_source(source_str):
    """Classify a source string to a game line."""
    if not source_str or not isinstance(source_str, str):
        return "unknown"

    source_str = source_str.strip()
    if not source_str:
        return "unknown"

    # Check "None" literal
    if source_str == "None":
        return "unknown"

    for prefix, game in PREFIX_MAP:
        if source_str.startswith(prefix):
            return game

    return "unknown"


def get_category_from_pack(pack_name):
    """Extract category from wh40k-{category} pack name."""
    if pack_name.startswith("wh40k-"):
        return pack_name[len("wh40k-"):]
    return pack_name


def split_pack(pack_name):
    """Split a single pack by source classification."""
    source_dir = os.path.join(BASE, pack_name, "_source")
    if not os.path.isdir(source_dir):
        print(f"  WARNING: {source_dir} not found, skipping")
        return

    category = get_category_from_pack(pack_name)

    # Classify all items
    moves = defaultdict(list)  # game -> [(filename, source_str)]
    stay = []  # Items staying in shared pack

    for filename in sorted(os.listdir(source_dir)):
        if not filename.endswith(".json"):
            continue
        filepath = os.path.join(source_dir, filename)
        with open(filepath) as f:
            data = json.load(f)
        source_str = extract_source_string(data)
        game = classify_source(source_str)

        if game in ("unknown", "homebrew"):
            stay.append((filename, source_str, game))
        else:
            moves[game].append((filename, source_str))

    # Report
    total = sum(len(v) for v in moves.values()) + len(stay)
    print(f"\n{'='*60}")
    print(f"Pack: {pack_name} ({total} items)")
    print(f"  Staying in shared pack: {len(stay)} items (unknown/homebrew)")

    for game in sorted(moves.keys()):
        items = moves[game]
        target_pack = f"{game}-{category}"
        target_dir = os.path.join(BASE, target_pack, "_source")

        # Check if target pack already exists
        if os.path.isdir(os.path.join(BASE, target_pack)):
            print(f"  SKIPPING {target_pack}: directory already exists ({len(items)} items would have moved)")
            continue

        # Create target directory
        os.makedirs(target_dir, exist_ok=True)
        print(f"  -> {target_pack}: {len(items)} items")

        # Move files
        for filename, source_str in items:
            src = os.path.join(source_dir, filename)
            dst = os.path.join(target_dir, filename)
            shutil.move(src, dst)


def move_entire_pack(pack_name, target_game):
    """Move all items from a shared pack to a game-specific pack."""
    source_dir = os.path.join(BASE, pack_name, "_source")
    if not os.path.isdir(source_dir):
        print(f"  WARNING: {source_dir} not found, skipping")
        return

    category = get_category_from_pack(pack_name)
    target_pack = f"{target_game}-{category}"
    target_dir = os.path.join(BASE, target_pack, "_source")

    # Check if target pack already exists
    if os.path.isdir(os.path.join(BASE, target_pack)):
        print(f"\n{'='*60}")
        print(f"Pack: {pack_name}")
        print(f"  SKIPPING: {target_pack} already exists")
        return

    files = [f for f in os.listdir(source_dir) if f.endswith(".json")]
    if not files:
        print(f"\n{'='*60}")
        print(f"Pack: {pack_name}")
        print(f"  SKIPPING: no JSON files found")
        return

    os.makedirs(target_dir, exist_ok=True)

    print(f"\n{'='*60}")
    print(f"Pack: {pack_name} -> {target_pack} ({len(files)} items, entire pack)")

    for filename in sorted(files):
        src = os.path.join(source_dir, filename)
        dst = os.path.join(target_dir, filename)
        shutil.move(src, dst)

    # Check if source dir is now empty and remove it
    remaining = [f for f in os.listdir(source_dir) if f.endswith(".json")]
    if not remaining:
        print(f"  Original pack _source/ is now empty")


def main():
    print("=" * 60)
    print("WH40K Pack Splitter")
    print("=" * 60)
    print(f"Base directory: {BASE}")

    # First, handle packs to split by source
    for pack in PACKS_TO_SPLIT:
        split_pack(pack)

    # Then, handle pack to move entirely
    move_entire_pack(PACK_MOVE_ENTIRELY, "ow")

    # Summary: list all pack directories
    print(f"\n{'='*60}")
    print("FINAL PACK DIRECTORY LISTING:")
    print(f"{'='*60}")
    for entry in sorted(os.listdir(BASE)):
        full = os.path.join(BASE, entry)
        if os.path.isdir(full) and not entry.startswith("_"):
            source_dir = os.path.join(full, "_source")
            if os.path.isdir(source_dir):
                count = len([f for f in os.listdir(source_dir) if f.endswith(".json")])
                print(f"  {entry}: {count} items")
            else:
                print(f"  {entry}: (no _source/ directory)")


if __name__ == "__main__":
    main()
