/*
 * Build-time actor-COMPLETENESS validator (companion to validate-schema.cjs).
 *
 * validate-schema.cjs checks document SHAPE. This checks that every NPC-family
 * actor (bestiary / npcs / reinforcements / mounts) is actually PLAYABLE — that
 * it has real stats, a rendering weapon, migrated skills, its inventory present
 * as resolvable embedded items, and art. These are the "correctness, not shape"
 * gaps validate-schema.cjs explicitly does not cover (see docs/pack-authoring.md
 * and the audit-wh40k-actors skill's five per-actor dimensions).
 *
 * It is WARN-ONLY on its own (the output is the migration worklist); regression
 * gating is layered on top by scripts/actors-ratchet.mjs, exactly like the other
 * quality ratchets.
 *
 * Usage:
 *   node src/packs/validate-actors.cjs [--verbose]
 *   require('./validate-actors.cjs').validateActorPacks({ rootDir, verbose })
 *
 * Every rule is grounded in a documented failure mode; see the comment on each.
 */
'use strict';

const fs = require('fs');
const path = require('path');

/* ------------------------------------------------------------------ */
/*  What counts as an NPC-family actor                                 */
/* ------------------------------------------------------------------ */

/** Pack dirs holding the `npc` Foundry type (per docs/pack-authoring.md "Actor atomization"). */
const ACTOR_PACK_RE = /actors-(bestiary|npcs|reinforcements|mounts)$/;

/** The nine DH characteristic keys. */
const CHARACTERISTICS = ['ws', 'bs', 's', 't', 'ag', 'int', 'per', 'wp', 'fel'];

/** Default characteristic value the DataModel falls back to when none is authored. */
const DEFAULT_CHARACTERISTIC = 30;

/** img values that mean "no real art" (see Artwork & Tokens in the authoring skill). */
const PLACEHOLDER_IMG_RE = /(mystery-man|item-bag)\.svg$|^icons\/svg\//;

/** True for a bare `npc` or any `<line>-npc` type. bestiary/npcs/reinforcements/mounts are all this type. */
function isNpcFamily(type) {
    return type === 'npc' || (typeof type === 'string' && /-npc$/.test(type));
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function isPlainObject(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function nonEmptyString(v) {
    return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Split a prose talents/traits line into candidate entries.
 * The house format is e.g. "Swift Attack. | Bestial, Burrower, ... , Sturdy."
 * Entries are separated by comma, period, or the pipe that divides talents from
 * traits. Parentheticals ("(All 8)", "(Disturbing)") are kept for counting but
 * are not names of their own.
 */
function splitProseAbilities(line) {
    if (!nonEmptyString(line)) return [];
    return (
        line
            .split(/[,.|]/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0 && /[A-Za-z]/.test(s))
            // Size is authored as system.size, never an embedded item (skill rule).
            .filter((s) => !/^size\b/i.test(s))
    );
}

/* ------------------------------------------------------------------ */
/*  Compendium _id index (for dangling-reference resolution)          */
/* ------------------------------------------------------------------ */

const SKIP_DIRS = new Set(['_backups', '_templates', '.build', 'node_modules']);

/** Walk every pack's _source and return { packName -> Set(_id) }. */
function buildIdIndex(rootDir) {
    const index = {};
    for (const group of fs.readdirSync(rootDir)) {
        if (SKIP_DIRS.has(group)) continue;
        const groupPath = path.join(rootDir, group);
        if (!fs.statSync(groupPath).isDirectory()) continue;
        for (const packName of fs.readdirSync(groupPath)) {
            if (/\.backup|backup-\d/.test(packName)) continue;
            const sourceDir = path.join(groupPath, packName, '_source');
            if (!fs.existsSync(sourceDir)) continue;
            const ids = new Set();
            for (const entry of fs.readdirSync(sourceDir)) {
                if (!entry.endsWith('.json')) continue;
                try {
                    const d = JSON.parse(fs.readFileSync(path.join(sourceDir, entry), 'utf8'));
                    if (isPlainObject(d) && nonEmptyString(d._id)) ids.add(d._id);
                } catch {
                    /* parse errors are validate-schema's job */
                }
            }
            index[packName] = ids;
        }
    }
    return index;
}

/** Resolve a `Compendium.wh40k-rpg.<pack>.<DocType>.<id>` ref against the index. */
function resolveRef(ref, index) {
    const m = /^Compendium\.wh40k-rpg\.([^.]+)\.(?:Item|Actor)\.(.+)$/.exec(ref);
    if (!m) return 'bad-format';
    const [, pack, id] = m;
    if (!(pack in index)) return 'pack-missing';
    return index[pack].has(id) ? 'ok' : 'id-missing';
}

/* ------------------------------------------------------------------ */
/*  Per-actor completeness validation                                 */
/* ------------------------------------------------------------------ */

function validateActor(doc, relFile, index, warnings) {
    const warn = (rule, detail) => warnings.push({ rule, file: relFile, detail: detail || '' });

    // Reference stubs resolve elsewhere; the resolved doc is validated in its home pack.
    if (isPlainObject(doc) && Object.prototype.hasOwnProperty.call(doc, 'reference')) return;
    if (!isNpcFamily(doc.type)) return; // vehicles/ships/loot in these packs are out of scope here

    const system = isPlainObject(doc.system) ? doc.system : null;
    if (!system) {
        warn('actor-no-system', 'no system block — actor is empty');
        return;
    }

    const items = Array.isArray(doc.items) ? doc.items : [];

    // A named individual authored as a `variantOf` its base class inherits stats,
    // inventory and skills through the compendium join (compendium-hydrate.ts), so
    // it legitimately carries only its overrides. Completeness of the *base* is
    // checked on the base doc; flagging the variant would push authors to
    // duplicate the class. (Mirrors validate-schema's vehicle-unstatted exemption.)
    const isVariant = nonEmptyString(system.variantOf);

    /* ---- Dangling references (checked even on variants — a dropped ref is a
     * silently vanished item on any actor; see the deploy skill's referential
     * integrity note). ---- */
    for (const it of items) {
        const src = isPlainObject(it._stats) ? it._stats.compendiumSource : undefined;
        if (nonEmptyString(src)) {
            const status = resolveRef(src, index);
            if (status !== 'ok') warn('inventory-dangling-ref', `${it.name || it._id}: ${src} (${status})`);
        }
        if (nonEmptyString(it.system && it.system.variantOf)) {
            const status = resolveRef(it.system.variantOf, index);
            if (status !== 'ok') warn('inventory-dangling-ref', `${it.name || it._id}: variantOf ${it.system.variantOf} (${status})`);
        }
    }
    if (nonEmptyString(system.variantOf) && /^Compendium\./.test(system.variantOf)) {
        const status = resolveRef(system.variantOf, index);
        if (status !== 'ok') warn('variant-dangling-ref', `variantOf ${system.variantOf} (${status})`);
    }

    if (isVariant) return; // remaining rules concern the self-contained stat block a variant inherits

    /* ---- Stats ---- */
    const chars = isPlainObject(system.characteristics) ? system.characteristics : null;
    if (!chars) {
        warn('stats-no-characteristics', 'system.characteristics missing');
    } else {
        // "Defaults to 30s" tell: no stat block was ever applied. A `—` char is
        // authored as 0, so an all-30 grid is the unmistakable untouched default,
        // not a legitimately-average creature (which varies at least one stat).
        const values = CHARACTERISTICS.map((k) => Number(chars[k]));
        if (values.every((v) => v === DEFAULT_CHARACTERISTIC)) {
            warn('stats-all-default', 'every characteristic is the unedited default (30) — no stat block applied');
        }
    }
    // Wounds — a horde/swarm tracks Magnitude instead of Wounds, so it is excluded.
    const horde = isPlainObject(system.horde) ? system.horde : null;
    const isHorde = !!(horde && (horde.enabled === true || (isPlainObject(horde.magnitude) && Number(horde.magnitude.max) > 0)));
    const woundsMax = isPlainObject(system.wounds) ? Number(system.wounds.max) : NaN;
    if (!isHorde && !(woundsMax > 0)) warn('stats-no-wounds', 'system.wounds.max is missing or 0 (and not a horde)');

    // NOTE: armour completeness is intentionally NOT validated here. `armourPoints` is a
    // free-form field authored many ways — clean "H4 AR4 AL4 B4 LR4 LL4", d100-interleaved
    // "H- (01-10) 4 ...", "12 (All)", "Scavenged Armour (4 All)", "Metal Mask (Head 10)",
    // "None" — and the runtime `migrateArmour` (npc.ts) parses it into
    // `system.armour.locations`. Whether the limbs end up defined can only be judged from
    // that MIGRATED result, not a source-string parse (which false-positives on every
    // "(All)"/named/partial form). A reliable limb-armour check belongs in a boot-the-
    // DataModel integration test, not this static validator.

    /* ---- Weapons ---- */
    // tab-npc.hbs DISPLAYS system.weapons.simple[], but only embedded weapon ITEMS are
    // clickable/rollable (they carry data-item-id + the item-edit handler). An inline
    // simple[] weapon is display-only text — the GM cannot roll it and its qualities /
    // special rules aren't wired — so it is NOT usable in play. That is a hard defect,
    // not a render bug: the audit target is UUID-linked embedded items. A truly
    // weaponless actor is a separate soft flag (legitimate for many civilians).
    const w = isPlainObject(system.weapons) ? system.weapons : null;
    const embeddedWeapons = items.filter((it) => it.type === 'weapon');
    const simple = w && Array.isArray(w.simple) ? w.simple : [];
    if (embeddedWeapons.length === 0 && simple.length === 0) {
        warn('weapons-none', 'no weapon (no embedded weapon item and no inline weapon)');
    } else if (simple.length > 0) {
        // ANY inline weapon is a defect, even alongside embedded ones — it displays but
        // isn't a clickable/rollable Item, so it isn't usable in play.
        warn(
            'weapons-inline-not-embedded',
            `${simple.length} weapon(s) exist only as inline display text, not clickable/rollable embedded Items — not usable in play`,
        );
    }

    /* ---- Skills ---- */
    // docs/pack-authoring.md "NPC Trained Skills": a REAL skill list present only as prose has no
    // runtime skills (the schema keeps only trainedSkills). But `system.skills` is also
    // where "None."/"Uses host's skills"/leaked description prose lands — that is NOT an
    // un-migrated list, and its empty trainedSkills is correct. So flag only when the
    // prose actually looks like a skill list: a (Char) tag or a +N advance.
    const proseSkills = typeof system.skills === 'string' ? system.skills : '';
    const looksLikeSkillList = /\((?:WS|BS|S|T|Ag|Int|Per|WP|Fel)\)/i.test(proseSkills) || /\+\s*\d0\b/.test(proseSkills);
    const trained = isPlainObject(system.trainedSkills) ? system.trainedSkills : null;
    const hasTrained = trained && Object.keys(trained).length > 0;
    if (looksLikeSkillList && !hasTrained) {
        warn('skills-prose-not-migrated', 'system.skills is a real skill list (has (Char)/+N) but system.trainedSkills is empty — skills will not render');
    }

    /* ---- Talents / traits (review-grade count heuristic) ---- */
    // Precise prose→item name matching is defeated by SPEC renames (prose
    // "Unnatural Strength (x2)" ↔ item "Unnatural Characteristic"; "Fear 1
    // (Disturbing)" ↔ "Fear"), so this compares COUNTS instead: fewer embedded
    // talent/trait items than prose entries (Size excluded) means abilities the
    // statblock lists were never captured as items — exactly the Ambull's missing
    // Fear + Improved Natural Weapons. Flagged for review, not as a hard claim.
    const proseAbilities = splitProseAbilities(system.talents_traits);
    const embeddedAbilities = items.filter((it) => it.type === 'talent' || it.type === 'trait').length;
    if (proseAbilities.length > 0 && embeddedAbilities < proseAbilities.length) {
        warn('traits-fewer-embedded-than-prose', `${embeddedAbilities} embedded talent/trait item(s) vs ${proseAbilities.length} listed in prose`);
    }

    /* ---- Image (soft) ---- */
    if (!nonEmptyString(doc.img) || PLACEHOLDER_IMG_RE.test(doc.img)) {
        warn('image-placeholder', 'no real portrait (placeholder/default img)');
    }
}

/* ------------------------------------------------------------------ */
/*  Filesystem walk (actor packs only)                                */
/* ------------------------------------------------------------------ */

function collectActorFiles(rootDir) {
    const results = [];
    for (const group of fs.readdirSync(rootDir)) {
        if (SKIP_DIRS.has(group)) continue;
        const groupPath = path.join(rootDir, group);
        if (!fs.statSync(groupPath).isDirectory()) continue;
        for (const packName of fs.readdirSync(groupPath)) {
            if (!ACTOR_PACK_RE.test(packName)) continue;
            if (/\.backup|backup-\d/.test(packName)) continue;
            const sourceDir = path.join(groupPath, packName, '_source');
            if (!fs.existsSync(sourceDir)) continue;
            for (const entry of fs.readdirSync(sourceDir)) {
                if (entry.endsWith('.json')) results.push(path.join(sourceDir, entry));
            }
        }
    }
    return results;
}

/* ------------------------------------------------------------------ */
/*  Public entry point                                                */
/* ------------------------------------------------------------------ */

/** Rules that are hard defects (broken/dropped content) vs soft/review flags. */
const SOFT_RULES = new Set(['image-placeholder', 'weapons-none', 'traits-fewer-embedded-than-prose']);

function validateActorPacks(opts) {
    const options = opts || {};
    const rootDir = options.rootDir || __dirname;
    const verbose = Boolean(options.verbose);
    const log = typeof options.log === 'function' ? options.log : (msg) => process.stdout.write(`${msg}\n`);

    const index = buildIdIndex(rootDir);
    const files = collectActorFiles(rootDir);
    const warnings = [];

    for (const file of files) {
        const rel = path.relative(rootDir, file);
        let doc;
        try {
            doc = JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch (err) {
            warnings.push({ rule: 'parse-error', file: rel, detail: err.message });
            continue;
        }
        validateActor(doc, rel, index, warnings);
    }

    const byRule = {};
    const filesWithWarnings = new Set();
    for (const wn of warnings) {
        byRule[wn.rule] = (byRule[wn.rule] || 0) + 1;
        filesWithWarnings.add(wn.file);
    }

    log('=== actor completeness validation (warn-only) ===');
    log(`scanned ${files.length} NPC-family actor file(s)`);
    if (warnings.length === 0) {
        log('every actor has full stats, weapons, skills, inventory and art 🎉');
    } else {
        log(`${warnings.length} issue(s) across ${filesWithWarnings.size} file(s):`);
        const rules = Object.keys(byRule).sort((a, b) => byRule[b] - byRule[a]);
        for (const rule of rules) {
            const tag = SOFT_RULES.has(rule) ? ' (soft)' : '';
            log(`  ${(rule + tag).padEnd(38)} ${byRule[rule]}`);
            if (verbose) {
                for (const wn of warnings.filter((x) => x.rule === rule)) {
                    log(`      ${wn.file}${wn.detail ? ` — ${wn.detail}` : ''}`);
                }
            }
        }
        if (!verbose) log('  (run with --verbose for the per-file list under each rule)');
    }

    return { filesScanned: files.length, filesWithWarnings: filesWithWarnings.size, warnings, byRule, softRules: [...SOFT_RULES] };
}

module.exports = { validateActorPacks, validateActor, buildIdIndex, isNpcFamily, splitProseAbilities, SOFT_RULES };

// CLI shim (warn-only; always exits 0 — the ratchet does the gating).
if (require.main === module) {
    const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');
    validateActorPacks({ verbose });
    process.exit(0);
}
