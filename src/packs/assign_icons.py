#!/usr/bin/env python3
"""
Bulk-assign icons to Foundry VTT compendium items.

Deterministically assigns appropriate icons based on item type and name,
using a hash of the item name to select from available icon pools.
Only modifies the "img" field in each JSON file.

Usage: python3 assign_icons.py [--dry-run]
"""

import json
import hashlib
import os
import re
import sys
from pathlib import Path
from collections import defaultdict

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

PACKS_DIR = Path(__file__).parent
ICONS_SRC_DIR = PACKS_DIR.parent / "icons"
RUNTIME_PREFIX = "systems/wh40k-rpg/icons"

# Dead icon paths that should be remapped
DEAD_PATHS = [
    "systems/rogue-trader/assets/icons/",
    "systems/rogue-trader/",
    "modules/game-icons-net/",
]

# Generic/placeholder icons that should be replaced (for types that get custom icons)
GENERIC_ICONS = {
    "icons/svg/backpack.svg",
    "icons/svg/target.svg",
    "icons/svg/eye.svg",
    "icons/svg/aura.svg",
    "icons/svg/gears.svg",
    "icons/svg/shield.svg",
    "icons/svg/book.svg",
    "icons/svg/ammo.svg",
    "icons/svg/sword.svg",
    "icons/svg/item-bag.svg",
    "icons/svg/combat.svg",
    "icons/svg/mystery-man.svg",
    "icons/svg/daze.svg",
    "icons/svg/skull.svg",
    "icons/svg/dice-target.svg",
    "icons/svg/lightning.svg",
    "icons/svg/upgrade.svg",
    "icons/svg/anchor.svg",
    "icons/svg/compass.svg",
    "icons/svg/scroll.svg",
    "icons/svg/crew.svg",
    "icons/svg/energy.svg",
    "icons/svg/d20.svg",
    "icons/svg/blood.svg",
    "icons/svg/blind.svg",
    "icons/svg/deaf.svg",
    "icons/svg/fire.svg",
    "icons/svg/ship.svg",
    "icons/svg/car.svg",
    "icons/svg/coins.svg",
}

DRY_RUN = "--dry-run" in sys.argv


# ---------------------------------------------------------------------------
# Icon catalog: scan source dirs to build runtime path lists
# ---------------------------------------------------------------------------

def scan_icon_dir(subdir, prefix_filter=None, suffix_filter=None):
    """Scan an icon directory under src/icons and return runtime paths."""
    full_path = ICONS_SRC_DIR / subdir
    if not full_path.is_dir():
        return []
    icons = []
    for f in sorted(full_path.iterdir()):
        if not f.is_file():
            continue
        name = f.name
        if prefix_filter and not any(name.lower().startswith(p) for p in prefix_filter):
            continue
        if suffix_filter and not any(name.lower().endswith(s) for s in suffix_filter):
            continue
        # Build runtime path
        runtime = f"{RUNTIME_PREFIX}/{subdir}/{name}"
        icons.append(runtime)
    return icons


def scan_icon_dir_b_variants(subdir, prefix):
    """Scan for _b (dark background) variants only."""
    full_path = ICONS_SRC_DIR / subdir
    if not full_path.is_dir():
        return []
    icons = []
    for f in sorted(full_path.iterdir()):
        if not f.is_file():
            continue
        name_lower = f.name.lower()
        if name_lower.startswith(prefix) and "_b." in name_lower:
            runtime = f"{RUNTIME_PREFIX}/{subdir}/{f.name}"
            icons.append(runtime)
    return icons


# Build icon pools
PISTOL_ICONS = scan_icon_dir("items/pistols")
RIFLE_ICONS = scan_icon_dir("items/rifles")
HEAVY_ICONS = scan_icon_dir("items/heavy")
MACHINE_GUN_ICONS = scan_icon_dir("items/machine gun")
GRENADE_ICONS = scan_icon_dir("items/grenade")
GUN_ICONS = scan_icon_dir_b_variants("items/guns", "gun_")

# Melee weapons - prefer _b variants
SWORD_ICONS = scan_icon_dir_b_variants("items/swords", "swords_")
AXE_ICONS = scan_icon_dir_b_variants("items/axes", "axe_")
MACE_ICONS = scan_icon_dir_b_variants("items/maces", "mace_")
DAGGER_ICONS = scan_icon_dir_b_variants("items/daggers", "dagger_")
FIST_ICONS = scan_icon_dir_b_variants("items/fist_weapon", "fist_weapon_")
FLAIL_ICONS = scan_icon_dir_b_variants("items/flail", "flail_")
SPEAR_ICONS = scan_icon_dir_b_variants("items/spear", "stave_")
STAVE_ICONS = scan_icon_dir_b_variants("items/staves", "stave_")
BOW_ICONS = scan_icon_dir_b_variants("items/bows", "bow_")

# Armour
ARMOR_ICONS = scan_icon_dir("items/armor", prefix_filter=["armor_s"])
HELMET_ICONS = scan_icon_dir("items/armor", prefix_filter=["helmet_s"])
BOOTS_ICONS = scan_icon_dir("items/armor", prefix_filter=["boots_s"])
GLOVES_ICONS = scan_icon_dir("items/armor", prefix_filter=["gloves_s"])
SHOULDERS_ICONS = scan_icon_dir("items/armor", prefix_filter=["shoulders_s"])
BRACERS_ICONS = scan_icon_dir("items/armor", prefix_filter=["bracers_s"])
BELT_ICONS = scan_icon_dir("items/armor", prefix_filter=["belt_s"])
PANTS_ICONS = scan_icon_dir("items/armor", prefix_filter=["pants_s"])

# Ammo - prefer _b variants of ammunition_, plus ammo_ series
AMMO_B_ICONS = scan_icon_dir_b_variants("items/ammo", "ammunition_")
AMMO_PLAIN = scan_icon_dir("items/ammo", prefix_filter=["ammo_"])
AMMO_ICONS = AMMO_B_ICONS + AMMO_PLAIN if AMMO_B_ICONS else AMMO_PLAIN

# Talents - cycle through colors
TALENT_BLUE = scan_icon_dir("talents/blue", prefix_filter=["b_"])
TALENT_GREEN = scan_icon_dir("talents/green", prefix_filter=["g_"])
TALENT_RED = scan_icon_dir("talents/red", prefix_filter=["r_"])
TALENT_VIOLET = scan_icon_dir("talents/violet", prefix_filter=["p_"])
TALENT_POOLS = [TALENT_BLUE, TALENT_GREEN, TALENT_RED, TALENT_VIOLET]
TALENT_POOL_NAMES = ["blue", "green", "red", "violet"]

# Psykana
PSYKANA_ICONS = scan_icon_dir("psykana")

# Fallback for melee default
DEFAULT_MELEE = f"{RUNTIME_PREFIX}/items/swords/swords_01_b.png"


# ---------------------------------------------------------------------------
# Helper: deterministic selection from a pool via name hash
# ---------------------------------------------------------------------------

def pick_from_pool(pool, name):
    """Deterministically pick an icon from a pool based on item name hash."""
    if not pool:
        return None
    h = int(hashlib.md5(name.encode("utf-8")).hexdigest(), 16)
    return pool[h % len(pool)]


def pick_talent_icon(name):
    """Pick a talent icon cycling through color pools based on name hash."""
    h = int(hashlib.md5(name.encode("utf-8")).hexdigest(), 16)
    pool_idx = h % len(TALENT_POOLS)
    pool = TALENT_POOLS[pool_idx]
    if not pool:
        return None
    return pool[h % len(pool)]


def pick_psykana_icon(name):
    """Pick a psykana icon based on name hash."""
    if not PSYKANA_ICONS:
        return None
    return pick_from_pool(PSYKANA_ICONS, name)


# ---------------------------------------------------------------------------
# Classification helpers
# ---------------------------------------------------------------------------

def is_dead_path(img):
    """Check if an icon path references a dead/missing location."""
    if not img:
        return False
    return any(img.startswith(p) for p in DEAD_PATHS)


def is_generic_icon(img):
    """Check if an icon is a generic placeholder."""
    return img in GENERIC_ICONS


def already_has_custom_icon(img):
    """Check if item already has a working custom icon from our system."""
    if not img:
        return False
    return img.startswith(f"{RUNTIME_PREFIX}/")


def should_reassign(img):
    """Determine if this icon should be reassigned."""
    if not img:
        return True
    if already_has_custom_icon(img):
        return False
    if is_dead_path(img):
        return True
    if is_generic_icon(img):
        return True
    return False


# ---------------------------------------------------------------------------
# Weapon classification
# ---------------------------------------------------------------------------

def classify_melee_weapon(name):
    """Classify a melee weapon by name keywords and return appropriate icon pool."""
    name_lower = name.lower()

    # Sword/blade keywords
    if any(kw in name_lower for kw in [
        "sword", "blade", "sabre", "saber", "chainsword", "power sword",
        "eviscerator", "cutlass", "falchion", "scimitar", "rapier",
        "mono-sword", "great weapon"
    ]):
        return SWORD_ICONS

    # Axe keywords
    if any(kw in name_lower for kw in [
        "axe", "hatchet", "chain-axe", "chainaxe", "power axe",
        "mono-axe", "war axe", "greataxe"
    ]):
        return AXE_ICONS

    # Hammer/mace/maul keywords
    if any(kw in name_lower for kw in [
        "hammer", "mace", "maul", "club", "bludgeon", "warhammer",
        "thunder hammer", "power maul", "truncheon", "shock maul"
    ]):
        return MACE_ICONS

    # Knife/dagger keywords
    if any(kw in name_lower for kw in [
        "knife", "dagger", "stiletto", "mono-knife", "skinning",
        "shiv", "kris", "tanto", "combat knife", "bayonet"
    ]):
        return DAGGER_ICONS

    # Fist/gauntlet/claw keywords
    if any(kw in name_lower for kw in [
        "fist", "gauntlet", "claw", "knuckle", "brass knuck",
        "power fist", "lightning claw", "shock glove", "unarmed",
        "cestus", "punch"
    ]):
        return FIST_ICONS

    # Chain/flail/whip keywords
    if any(kw in name_lower for kw in [
        "flail", "whip", "chain ", "neural whip", "electro-flail",
        "cat o' nine", "lash", "morning star", "morningstar",
        "aether whip"
    ]):
        return FLAIL_ICONS

    # Spear/halberd/lance keywords
    if any(kw in name_lower for kw in [
        "spear", "halberd", "lance", "pike", "trident", "glaive",
        "polearm", "partisan", "naginata", "hunting lance"
    ]):
        return SPEAR_ICONS

    # Staff/stave/rod/force keywords
    if any(kw in name_lower for kw in [
        "staff", "stave", "rod", "force weapon", "force staff",
        "witchblade", "channeling rod", "singing spear", "sceptre",
        "scepter", "wand", "psyk-out"
    ]):
        return STAVE_ICONS

    # Default melee
    return None


def get_weapon_icon(item_data):
    """Determine the appropriate icon for a weapon item."""
    name = item_data.get("name", "")
    system = item_data.get("system", {})
    weapon_class = system.get("class", "").lower()
    is_melee = system.get("melee", False)
    attack_type = system.get("attack", {}).get("type", "").lower() if isinstance(system.get("attack"), dict) else ""
    name_lower = name.lower()

    # Check for grenade/thrown first
    if weapon_class == "thrown" or "grenade" in name_lower or "bomb" in name_lower:
        return pick_from_pool(GRENADE_ICONS, name)

    # Pistol
    if weapon_class == "pistol" or "pistol" in name_lower:
        return pick_from_pool(PISTOL_ICONS, name)

    # Basic (rifles/lasguns)
    if weapon_class == "basic":
        # Check if it's more like a shotgun or assault weapon
        if any(kw in name_lower for kw in ["shotgun", "combat shotgun"]):
            return pick_from_pool(GUN_ICONS or RIFLE_ICONS, name)
        return pick_from_pool(RIFLE_ICONS, name)

    # Heavy weapons
    if weapon_class == "heavy":
        # Heavy automatic weapons get machine gun icons
        rof = system.get("attack", {}).get("rateOfFire", {}) if isinstance(system.get("attack"), dict) else {}
        if isinstance(rof, dict) and (rof.get("full", 0) or rof.get("semi", 0)):
            return pick_from_pool(MACHINE_GUN_ICONS or HEAVY_ICONS, name)
        return pick_from_pool(HEAVY_ICONS, name)

    # Melee weapons
    if weapon_class == "melee" or is_melee or attack_type == "melee":
        pool = classify_melee_weapon(name)
        if pool:
            return pick_from_pool(pool, name)
        return DEFAULT_MELEE

    # Exotic/crossbow-like
    if any(kw in name_lower for kw in ["bow", "crossbow", "needle"]):
        return pick_from_pool(BOW_ICONS, name)

    # Vehicle-mounted / ship weapons — skip or use heavy
    if weapon_class in ("vehicle", "ship"):
        return pick_from_pool(HEAVY_ICONS, name)

    # Fallback: try to infer from name
    if any(kw in name_lower for kw in ["pistol", "laspistol", "stub"]):
        return pick_from_pool(PISTOL_ICONS, name)
    if any(kw in name_lower for kw in ["rifle", "lasgun", "autogun", "musket", "carbine"]):
        return pick_from_pool(RIFLE_ICONS, name)
    if any(kw in name_lower for kw in ["cannon", "lascannon", "multi-melta", "missile"]):
        return pick_from_pool(HEAVY_ICONS, name)

    # Last resort for ranged-looking weapons
    if not is_melee and attack_type != "melee":
        return pick_from_pool(RIFLE_ICONS, name)

    return DEFAULT_MELEE


def get_armour_icon(item_data):
    """Determine the appropriate icon for an armour item."""
    name = item_data.get("name", "")
    name_lower = name.lower()
    system = item_data.get("system", {})
    coverage = system.get("coverage", [])

    # Check specific coverage for targeted icon
    if isinstance(coverage, list):
        if coverage == ["head"]:
            return pick_from_pool(HELMET_ICONS, name)
        if all(c in ("leftLeg", "rightLeg") for c in coverage) and len(coverage) > 0:
            return pick_from_pool(PANTS_ICONS or BOOTS_ICONS, name)

    # Name-based classification
    if any(kw in name_lower for kw in ["helmet", "helm", "headgear", "mask", "hood"]):
        return pick_from_pool(HELMET_ICONS, name)
    if any(kw in name_lower for kw in ["boot", "greave", "sabatons"]):
        return pick_from_pool(BOOTS_ICONS, name)
    if any(kw in name_lower for kw in ["glove", "gauntlet", "mitts"]):
        return pick_from_pool(GLOVES_ICONS, name)
    if any(kw in name_lower for kw in ["pauldron", "shoulder"]):
        return pick_from_pool(SHOULDERS_ICONS, name)
    if any(kw in name_lower for kw in ["bracer", "vambrace"]):
        return pick_from_pool(BRACERS_ICONS, name)
    if any(kw in name_lower for kw in ["belt", "girdle"]):
        return pick_from_pool(BELT_ICONS, name)

    # Default: main armor body icon
    return pick_from_pool(ARMOR_ICONS, name)


# ---------------------------------------------------------------------------
# Main processing
# ---------------------------------------------------------------------------

def process_file(json_path):
    """Process a single JSON file and return (changed, old_img, new_img, item_type, item_name)."""
    with open(json_path, "r", encoding="utf-8") as f:
        try:
            data = json.load(f)
        except json.JSONDecodeError:
            return None

    if not isinstance(data, dict):
        return None

    name = data.get("name", "")
    item_type = data.get("type", "")
    old_img = data.get("img", "")

    if not item_type or not name:
        return None

    # Skip items that already have a working custom icon
    if not should_reassign(old_img):
        return ("skipped", old_img, old_img, item_type, name)

    new_img = None

    # Determine new icon based on type
    if item_type == "weapon":
        new_img = get_weapon_icon(data)

    elif item_type == "armour":
        new_img = get_armour_icon(data)

    elif item_type in ("ammo", "ammunition"):
        new_img = pick_from_pool(AMMO_ICONS, name)

    elif item_type == "talent":
        new_img = pick_talent_icon(name)

    elif item_type == "psychicPower":
        new_img = pick_psykana_icon(name)

    elif item_type == "skill":
        # Keep book.svg — appropriate for skills
        if old_img == "icons/svg/book.svg":
            return ("skipped", old_img, old_img, item_type, name)
        new_img = "icons/svg/book.svg"

    elif item_type == "trait":
        new_img = pick_talent_icon(name)

    elif item_type == "gear":
        # Keep backpack.svg — appropriate for generic gear
        if old_img == "icons/svg/backpack.svg":
            return ("skipped", old_img, old_img, item_type, name)
        new_img = "icons/svg/backpack.svg"

    elif item_type == "navigatorPower":
        new_img = pick_psykana_icon(name)

    elif item_type == "order":
        new_img = pick_talent_icon(name)

    elif item_type == "ritual":
        new_img = pick_psykana_icon(name)

    elif item_type == "cybernetic":
        new_img = "icons/svg/gears.svg"

    elif item_type in ("armourCustomisation", "armourModification"):
        new_img = pick_from_pool(ARMOR_ICONS, name)

    elif item_type == "weaponQuality":
        new_img = pick_talent_icon(name)

    elif item_type == "background":
        new_img = pick_talent_icon(name)

    elif item_type == "condition":
        new_img = pick_psykana_icon(name)

    elif item_type == "criticalInjury":
        new_img = pick_psykana_icon(name)

    elif item_type == "shipComponent":
        new_img = pick_talent_icon(name)

    elif item_type == "shipWeapon":
        new_img = pick_from_pool(HEAVY_ICONS, name)

    elif item_type in ("shipUpgrade", "vehicleUpgrade"):
        new_img = pick_talent_icon(name)

    elif item_type == "shipRole":
        new_img = pick_talent_icon(name)

    elif item_type == "originPath":
        new_img = pick_talent_icon(name)

    elif item_type == "vehicleTrait":
        new_img = pick_talent_icon(name)

    elif item_type == "starship":
        # Keep ship.svg — appropriate
        if old_img == "icons/svg/ship.svg":
            return ("skipped", old_img, old_img, item_type, name)
        new_img = "icons/svg/ship.svg"

    elif item_type == "vehicle":
        # Keep car.svg — appropriate
        if old_img == "icons/svg/car.svg":
            return ("skipped", old_img, old_img, item_type, name)
        new_img = "icons/svg/car.svg"

    elif item_type == "npc":
        # Keep mystery-man.svg — appropriate
        if old_img == "icons/svg/mystery-man.svg":
            return ("skipped", old_img, old_img, item_type, name)
        new_img = "icons/svg/mystery-man.svg"

    else:
        # Unknown type — leave as-is unless it's a dead path
        if is_dead_path(old_img):
            new_img = "icons/svg/backpack.svg"
        else:
            return ("skipped", old_img, old_img, item_type, name)

    if new_img is None:
        return ("skipped", old_img, old_img, item_type, name)

    # For skills, traits, gear with appropriate icons already — don't change
    if new_img == old_img:
        return ("skipped", old_img, old_img, item_type, name)

    # Write the change
    if not DRY_RUN:
        data["img"] = new_img
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")

    return ("changed", old_img, new_img, item_type, name)


def main():
    if DRY_RUN:
        print("=" * 60)
        print("DRY RUN — no files will be modified")
        print("=" * 60)

    # Print icon pool sizes
    print("\n--- Icon Pool Sizes ---")
    pools = {
        "Pistols": PISTOL_ICONS,
        "Rifles": RIFLE_ICONS,
        "Heavy": HEAVY_ICONS,
        "Machine Guns": MACHINE_GUN_ICONS,
        "Grenades": GRENADE_ICONS,
        "Guns (generic)": GUN_ICONS,
        "Swords (_b)": SWORD_ICONS,
        "Axes (_b)": AXE_ICONS,
        "Maces (_b)": MACE_ICONS,
        "Daggers (_b)": DAGGER_ICONS,
        "Fist weapons (_b)": FIST_ICONS,
        "Flails (_b)": FLAIL_ICONS,
        "Spears (_b)": SPEAR_ICONS,
        "Staves (_b)": STAVE_ICONS,
        "Bows (_b)": BOW_ICONS,
        "Armor": ARMOR_ICONS,
        "Helmets": HELMET_ICONS,
        "Boots": BOOTS_ICONS,
        "Gloves": GLOVES_ICONS,
        "Shoulders": SHOULDERS_ICONS,
        "Bracers": BRACERS_ICONS,
        "Belts": BELT_ICONS,
        "Pants": PANTS_ICONS,
        "Ammo": AMMO_ICONS,
        "Talent Blue": TALENT_BLUE,
        "Talent Green": TALENT_GREEN,
        "Talent Red": TALENT_RED,
        "Talent Violet": TALENT_VIOLET,
        "Psykana": PSYKANA_ICONS,
    }
    for label, pool in pools.items():
        print(f"  {label}: {len(pool)}")

    # Walk all pack source directories
    stats = defaultdict(int)
    changes_by_type = defaultdict(int)
    skipped_by_type = defaultdict(int)
    dead_path_fixes = 0
    sample_changes = []

    pack_dirs = sorted(PACKS_DIR.iterdir())
    for pack_dir in pack_dirs:
        source_dir = pack_dir / "_source"
        if not source_dir.is_dir():
            continue

        for json_file in sorted(source_dir.glob("*.json")):
            stats["total"] += 1
            result = process_file(json_file)

            if result is None:
                stats["errors"] += 1
                continue

            status, old_img, new_img, item_type, item_name = result

            if status == "skipped":
                stats["skipped"] += 1
                skipped_by_type[item_type] += 1
            elif status == "changed":
                stats["changed"] += 1
                changes_by_type[item_type] += 1
                if is_dead_path(old_img):
                    dead_path_fixes += 1
                # Collect samples (first 3 per type)
                type_samples = sum(1 for s in sample_changes if s[3] == item_type)
                if type_samples < 3:
                    sample_changes.append((item_name, old_img, new_img, item_type))

    # Print summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"  Total files processed: {stats['total']}")
    print(f"  Changed:               {stats['changed']}")
    print(f"  Skipped (already OK):  {stats['skipped']}")
    print(f"  Errors:                {stats['errors']}")
    print(f"  Dead path fixes:       {dead_path_fixes}")

    print("\n--- Changes by item type ---")
    for itype in sorted(changes_by_type.keys()):
        print(f"  {itype}: {changes_by_type[itype]} changed, {skipped_by_type.get(itype, 0)} skipped")

    # Show types that were only skipped
    for itype in sorted(skipped_by_type.keys()):
        if itype not in changes_by_type:
            print(f"  {itype}: 0 changed, {skipped_by_type[itype]} skipped")

    print("\n--- Sample changes ---")
    for item_name, old_img, new_img, item_type in sample_changes:
        print(f"  [{item_type}] {item_name}")
        print(f"    {old_img}")
        print(f"    → {new_img}")

    if DRY_RUN:
        print("\n[DRY RUN] No files were modified. Run without --dry-run to apply changes.")


if __name__ == "__main__":
    main()
