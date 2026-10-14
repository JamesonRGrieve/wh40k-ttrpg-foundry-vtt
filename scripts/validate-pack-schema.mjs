#!/usr/bin/env node
/**
 * Zod v4 compendium content-schema gate.
 *
 * Walks every `_source/*.json` under the active pack root(s) and validates each
 * document's authoring shape with Zod v4 — fail-loud, unlike the warn-only
 * `src/packs/validate-schema.cjs`. It is deliberately scoped to the fields whose
 * corruption has actually bitten (weapon `class`/`type`/`attack` coherence,
 * vehicle-trait `crewExposure`), so genuine authoring/import errors — a ranged
 * weapon stored as `class: "melee"`, a blank-but-required enum — are caught at
 * commit time rather than silently dropped when the DataModel loads it in play.
 *
 * Every content field may be authored plainly OR as a per-line variant container
 * (`{ dh2: … , dw: … }`) OR a per-book container (`{ __books: … }`); the `variant`
 * combinator accepts all three, so the gate never false-fails on the homologated
 * authoring format.
 *
 * Usage:
 *   node scripts/validate-pack-schema.mjs            # gate: exit 1 on any error
 *   node scripts/validate-pack-schema.mjs --report   # count only, always exit 0
 *   WH40K_PACKS_SRC=src/packs-private node scripts/validate-pack-schema.mjs
 *
 * Exports `validateDoc(doc)` and the schemas for unit tests.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { z } from 'zod';

/** Game-line ids that key a per-line variant container. */
export const LINES = ['dh1', 'dh2', 'rt', 'dw', 'bc', 'ow', 'im'];

/**
 * A value authored plainly, OR as a per-line variant container (`{ dw: v, … }`),
 * OR as a per-book container (`{ __books: { <book>: v }, __canonical?: string }`).
 * @param {z.ZodTypeAny} inner  Schema for the resolved scalar value.
 * @returns {z.ZodTypeAny}
 */
export function variant(inner) {
    // A per-line container holds a SUBSET of the lines (e.g. `{dh2, ow, dh1}`), so it
    // must be a PARTIAL record — Zod v4's `z.record(enum, …)` is exhaustive (would
    // require all seven line keys). Keys are constrained to line ids so a plain
    // scalar-object (e.g. `attack: {type, characteristic}`) is not mistaken for one.
    const lineContainer = z.record(z.string(), inner).refine((obj) => Object.keys(obj).length > 0 && Object.keys(obj).every((k) => LINES.includes(k)), {
        message: 'expected a per-line variant container keyed by game-line id',
    });
    const bookContainer = z.object({ __books: z.record(z.string(), inner), __canonical: z.string().optional() });
    return z.union([inner, lineContainer, bookContainer]);
}

// The authored value set across ALL six/seven lines, not just the FFG DataModel's
// `WEAPON_CLASS_CHOICES` — some lines carry their own values the DataModel normalises
// at load (`ranged` = Imperium Maledictum; `vehicle` = Only War mounts; the `energy`/
// `melee`/`solid_projectile` types + underscore spelling are OW/legacy). The gate's
// job is to catch a genuinely-NEW deviation, so it accepts the established set and the
// coherence check below is what flags a ranged weapon mis-typed as melee.
// Must stay a superset of WEAPON_CLASS_CHOICES (src/module/data/shared/weapon-class.ts);
// tests/validate-pack-schema.test.ts pins that so a new DataModel class can't be rejected here.
export const WEAPON_CLASS = ['melee', 'pistol', 'basic', 'heavy', 'thrown', 'exotic', 'placed', 'ranged', 'vehicle', 'mounted'];
export const WEAPON_TYPE = [
    'primitive', 'las', 'solid-projectile', 'solid_projectile', 'bolt', 'melta', 'plasma', 'flame', 'launcher', 'explosive',
    'power', 'chain', 'shock', 'force', 'exotic', 'xenos', 'energy', 'melee', 'shield', 'low-tech', 'impact', 'grenade', 'rending',
];
export const ATTACK_KIND = ['ranged', 'melee', 'thrown'];
export const CREW_EXPOSURE = ['', 'open', 'enclosed'];
// Mirrors `DAMAGE_TYPE_CHOICES` / `DAMAGE_SOURCE_CHOICES` (src/module/rules/damage-profile.ts);
// tests/validate-pack-schema.test.ts pins the match.
export const DAMAGE_TYPE = ['impact', 'rending', 'explosive', 'energy', 'fire', 'shock', 'cold', 'toxic'];
export const DAMAGE_SOURCE = ['', 'mount', 'wielder-melee'];
/** A compendium RollTable UUID, the only document a `damage.table` may name. */
export const ROLL_TABLE_UUID = /^Compendium\.[\w-]+\.[\w-]+\.RollTable\.[A-Za-z0-9]{16}$/;

const attackShape = z
    .object({
        type: z.enum(ATTACK_KIND).optional(),
        characteristic: z.string().optional(),
    })
    .loose();

/** One range band of a band-profile weapon (#608). */
export const damageBandShape = z
    .object({
        maxRange: z.number().nonnegative().nullable(),
        formula: z.string().min(1),
        type: z.enum(DAMAGE_TYPE),
        penetration: z.number().int().nonnegative(),
        bonus: z.number().int(),
        qualities: z.array(z.string().min(1)),
    })
    .strict();

/**
 * Bands are picked in authored order, so their bounds must rise and only the last
 * may be unbounded — a later band behind an unbounded or wider one is unreachable.
 */
function bandsAscending(bands) {
    return bands.every((band, i) => {
        if (i === 0) return true;
        const previous = bands[i - 1].maxRange;
        return previous !== null && (band.maxRange === null || band.maxRange > previous);
    });
}

/**
 * A damage profile: the #608 shapes (bands / table / borrowed) are validated; the
 * long-established fields pass as authored (the IM line stores damage as a string).
 */
export const damageProfileShape = z
    .object({
        bands: z.array(damageBandShape).refine(bandsAscending, { message: 'bands must rise in maxRange, with only the last unbounded' }).optional(),
        table: z.union([z.literal(''), z.string().regex(ROLL_TABLE_UUID)]).optional(),
        from: z.enum(DAMAGE_SOURCE).optional(),
    })
    .loose();

// Mirror `RIDER_TEST_CHARACTERISTICS` / `RIDER_DURATION_KINDS` / `RIDER_AREA_MEASURES`
// (src/module/rules/grenade-rider.ts); tests/validate-pack-schema.test.ts pins the match.
export const RIDER_TEST_CHARACTERISTIC = [
    '', 'weaponSkill', 'ballisticSkill', 'strength', 'toughness', 'agility', 'intelligence', 'perception', 'willpower', 'fellowship',
];
export const RIDER_DURATION_KIND = ['', 'degreesOfFailure', 'roll', 'encounter'];
export const RIDER_AREA_MEASURE = ['radius', 'diameter'];

/** A grenade's rider (#135): its test, area, duration, effect-roll step and effect, authored whole. */
export const grenadeRiderShape = z
    .object({
        test: z.object({ characteristic: z.enum(RIDER_TEST_CHARACTERISTIC), modifier: z.number().int() }).strict(),
        area: z.object({ size: z.string(), measure: z.enum(RIDER_AREA_MEASURE) }).strict(),
        duration: z.object({ kind: z.enum(RIDER_DURATION_KIND), base: z.number().int().nonnegative(), formula: z.string() }).strict(),
        effectRollShift: z.object({ perDegree: z.number().int().nonnegative(), max: z.number().int().nonnegative() }).strict(),
        effect: z.string().min(1),
    })
    .strict()
    .refine((rider) => (rider.duration.kind === 'roll') === (rider.duration.formula !== ''), {
        message: 'duration.formula is set exactly when duration.kind is "roll"',
    });

/** Weapon `system` — strict only on the corruption-prone fields; extras pass. */
export const weaponSystemSchema = z
    .object({
        class: variant(z.enum(WEAPON_CLASS)).nullable().optional(),
        type: variant(z.enum(WEAPON_TYPE)).nullable().optional(),
        melee: variant(z.boolean()).nullable().optional(),
        attack: variant(attackShape).nullable().optional(),
        damage: variant(z.union([z.string(), damageProfileShape])).optional(),
        rider: variant(grenadeRiderShape).nullable().optional(),
    })
    .loose();

/** The damage a RollTable result carries for a table-damage weapon (#608). */
export const tableResultDamageShape = z
    .object({
        formula: z.string().min(1),
        bonus: z.number().int().optional(),
        type: z.enum(DAMAGE_TYPE).optional(),
        penetration: z.number().int().nonnegative().optional(),
        qualities: z.array(z.string().min(1)).optional(),
    })
    .strict();

/** Errors in a RollTable's result damage profiles (`flags['wh40k-rpg'].damageProfile`). */
function tableResultIssues(results) {
    const errors = [];
    results.forEach((result, i) => {
        const profile = result?.flags?.['wh40k-rpg']?.damageProfile;
        if (profile === undefined) return;
        const res = tableResultDamageShape.safeParse(profile);
        if (res.success) return;
        for (const issue of res.error.issues) errors.push(`results.${i}.flags.wh40k-rpg.damageProfile.${issue.path.join('.')}: ${issue.message}`);
    });
    return errors;
}

/** Vehicle-trait `system` — the `crewExposure` enum whose blank default crashed hydration. */
export const vehicleTraitSystemSchema = z
    .object({
        effects: z
            .object({ crewExposure: variant(z.enum(CREW_EXPOSURE)).optional() })
            .loose()
            .optional(),
    })
    .loose();

/** Per-`type` `system` schema; unlisted types are envelope-checked only (incremental). */
export const SYSTEM_SCHEMAS = {
    weapon: weaponSystemSchema,
    vehicleTrait: vehicleTraitSystemSchema,
};

/** The document envelope every `_source` file shares. */
export const documentEnvelope = z
    .object({
        name: z.string().min(1),
        // `type` (the Item/Actor sub-type discriminator) is absent on JournalEntry /
        // RollTable / Scene / Playlist docs, which carry no `system` to validate.
        type: z.string().min(1).optional(),
        system: z.unknown().optional(),
    })
    .loose();

/** Is the plain scalar (post any single-key collapse) a clearly-ranged weapon class? */
function coherenceIssue(system) {
    // Only check when both are plainly authored scalars (skip variant containers —
    // resolving them per-line is the runtime materialiser's job, not this gate's).
    const cls = typeof system.class === 'string' ? system.class : null;
    const attack = system.attack;
    const attackType = attack !== null && typeof attack === 'object' && !Array.isArray(attack) && typeof attack.type === 'string' ? attack.type : null;
    if (cls === null || attackType === null) return null;
    const RANGED_CLASSES = new Set(['pistol', 'basic', 'heavy']);
    if (cls === 'melee' && attackType !== 'melee') return `class "melee" but attack.type "${attackType}" (expected "melee")`;
    if (RANGED_CLASSES.has(cls) && attackType === 'melee') return `class "${cls}" (ranged) but attack.type "melee"`;
    return null;
}

/**
 * Validate one `_source` document. Returns an array of human-readable error
 * strings (empty when the document is well-formed).
 * @param {unknown} doc  Parsed `_source/*.json`.
 * @returns {string[]}
 */
export function validateDoc(doc) {
    const errors = [];
    // Whole-file `reference` stubs are pointers to another pack's canonical document
    // (resolved at build time); they carry no name/type/system, so skip them.
    if (doc !== null && typeof doc === 'object' && typeof doc.reference === 'string' && doc.type === undefined) return errors;
    const env = documentEnvelope.safeParse(doc);
    if (!env.success) {
        for (const issue of env.error.issues) errors.push(`${issue.path.join('.') || '<root>'}: ${issue.message}`);
        return errors;
    }
    const { type, system } = env.data;
    if (Array.isArray(doc.results)) errors.push(...tableResultIssues(doc.results));
    const schema = SYSTEM_SCHEMAS[type];
    if (schema !== undefined && system !== undefined) {
        const res = schema.safeParse(system);
        if (!res.success) {
            for (const issue of res.error.issues) errors.push(`system.${issue.path.join('.')}: ${issue.message}`);
        }
        if (type === 'weapon' && system !== null && typeof system === 'object') {
            const coherence = coherenceIssue(system);
            if (coherence !== null) errors.push(`system: incoherent weapon — ${coherence}`);
        }
    }
    return errors;
}

/* -------------------------------------------- */
/*  CLI walker                                  */
/* -------------------------------------------- */

function packRoots() {
    const override = process.env['WH40K_PACKS_SRC'];
    const candidates = override !== undefined && override !== '' ? [override] : ['src/packs', 'src/packs-private'];
    return candidates.filter((root) => fs.existsSync(root));
}

function findSourceFiles(root) {
    const out = [];
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.isFile() && entry.name.endsWith('.json') && full.includes(`${path.sep}_source${path.sep}`)) out.push(full);
        }
    };
    if (fs.existsSync(root)) walk(root);
    return out;
}

function main() {
    const report = process.argv.includes('--report');
    const roots = packRoots();
    let scanned = 0;
    let failed = 0;
    const failures = [];
    for (const root of roots) {
        for (const file of findSourceFiles(root)) {
            scanned++;
            let doc;
            try {
                doc = JSON.parse(fs.readFileSync(file, 'utf8'));
            } catch (e) {
                failed++;
                failures.push(`${file}: invalid JSON — ${e instanceof Error ? e.message : String(e)}`);
                continue;
            }
            const errs = validateDoc(doc);
            if (errs.length > 0) {
                failed++;
                failures.push(`${file}:\n  - ${errs.join('\n  - ')}`);
            }
        }
    }
    for (const f of failures.slice(0, 100)) console.log(f);
    if (failures.length > 100) console.log(`… and ${failures.length - 100} more`);
    console.log(`\n[validate-pack-schema] scanned ${scanned} document(s) in [${roots.join(', ') || 'no pack roots'}] — ${failed} failed.`);
    if (failed > 0 && !report) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
