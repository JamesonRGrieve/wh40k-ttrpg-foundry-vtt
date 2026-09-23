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
export const WEAPON_CLASS = ['melee', 'pistol', 'basic', 'heavy', 'thrown', 'exotic', 'ranged', 'vehicle', 'mounted'];
export const WEAPON_TYPE = [
    'primitive', 'las', 'solid-projectile', 'solid_projectile', 'bolt', 'melta', 'plasma', 'flame', 'launcher', 'explosive',
    'power', 'chain', 'shock', 'force', 'exotic', 'xenos', 'energy', 'melee', 'shield', 'low-tech', 'impact', 'grenade', 'rending',
];
export const ATTACK_KIND = ['ranged', 'melee', 'thrown'];
export const CREW_EXPOSURE = ['', 'open', 'enclosed'];

const attackShape = z
    .object({
        type: z.enum(ATTACK_KIND).optional(),
        characteristic: z.string().optional(),
    })
    .loose();

/** Weapon `system` — strict only on the corruption-prone fields; extras pass. */
export const weaponSystemSchema = z
    .object({
        class: variant(z.enum(WEAPON_CLASS)).nullable().optional(),
        type: variant(z.enum(WEAPON_TYPE)).nullable().optional(),
        melee: variant(z.boolean()).nullable().optional(),
        attack: variant(attackShape).nullable().optional(),
    })
    .loose();

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
