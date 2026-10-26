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
 * It also refuses any reference to the unlicensed `_vendored-ui` icon packs
 * (#625), wherever in the document it appears.
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
    'primitive',
    'las',
    'solid-projectile',
    'solid_projectile',
    'bolt',
    'melta',
    'plasma',
    'flame',
    'launcher',
    'explosive',
    'power',
    'chain',
    'shock',
    'force',
    'exotic',
    'xenos',
    'energy',
    'melee',
    'shield',
    'low-tech',
    'impact',
    'grenade',
    'rending',
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

// Mirror `RIDER_TEST_CHARACTERISTICS` / `RIDER_DURATION_KINDS` / `RIDER_AREA_MEASURES` /
// `RIDER_AFFECTS` (src/module/rules/grenade-rider.ts); tests/validate-pack-schema.test.ts pins the match.
export const RIDER_TEST_CHARACTERISTIC = [
    '',
    'weaponSkill',
    'ballisticSkill',
    'strength',
    'toughness',
    'agility',
    'intelligence',
    'perception',
    'willpower',
    'fellowship',
];
export const RIDER_DURATION_KIND = ['', 'degreesOfFailure', 'roll', 'encounter'];
export const RIDER_AREA_MEASURE = ['radius', 'diameter'];
export const RIDER_AFFECTS = ['', 'psyker'];
/** A condition registry id (`blinded`, `stunned`): a condition document's `system.identifier`, or '' for none. */
export const RIDER_CONDITION_ID = /^(?:[a-z0-9]+(?:-[a-z0-9]+)*)?$/;

/**
 * A grenade's rider (#135): its test, who it touches, the condition a failure applies,
 * its area, duration, effect-roll step and effect, authored whole (#623).
 */
export const grenadeRiderShape = z
    .object({
        test: z.object({ characteristic: z.enum(RIDER_TEST_CHARACTERISTIC), modifier: z.number().int(), psykerModifier: z.number().int() }).strict(),
        affects: z.enum(RIDER_AFFECTS),
        condition: z.string().regex(RIDER_CONDITION_ID),
        area: z.object({ size: z.string(), measure: z.enum(RIDER_AREA_MEASURE) }).strict(),
        duration: z.object({ kind: z.enum(RIDER_DURATION_KIND), base: z.number().int().nonnegative(), formula: z.string() }).strict(),
        effectRollShift: z.object({ perDegree: z.number().int().nonnegative(), max: z.number().int().nonnegative() }).strict(),
        // Optional: the DataModel fills a rider that deals none (#698).
        characteristicDamage: z
            .object({ characteristic: z.enum(RIDER_TEST_CHARACTERISTIC), formula: z.string(), perDegree: z.number().int().nonnegative() })
            .strict()
            .optional(),
        effect: z.string().min(1),
    })
    .strict()
    .refine((rider) => (rider.duration.kind === 'roll') === (rider.duration.formula !== ''), {
        message: 'duration.formula is set exactly when duration.kind is "roll"',
    })
    .refine(
        (rider) =>
            rider.characteristicDamage === undefined || (rider.characteristicDamage.characteristic === '') === (rider.characteristicDamage.formula === ''),
        {
            message: 'characteristicDamage.formula is set exactly when characteristicDamage.characteristic is',
        },
    );

/** Weapon `system` — strict only on the corruption-prone fields; extras pass. */
export const weaponSystemSchema = z
    .object({
        class: variant(z.enum(WEAPON_CLASS)).nullable().optional(),
        type: variant(z.enum(WEAPON_TYPE)).nullable().optional(),
        melee: variant(z.boolean()).nullable().optional(),
        attack: variant(attackShape).nullable().optional(),
        damage: variant(z.union([z.string(), damageProfileShape])).optional(),
        // A line's explicit null branch is "this line prints no rider" (#622).
        rider: variant(grenadeRiderShape.nullable()).optional(),
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
 * Art the system holds no licence for: the GameDevMarket icon packs, parked
 * unserved in the private submodule's `_vendored-ui/`, and the old served
 * location they were pulled from (#625). Every match renders a broken icon and
 * trips Foundry's invalid-asset error, so the gate refuses it anywhere in a
 * document — `img`, an embedded item's `img`, a token texture, an effect icon.
 */
export const UNLICENSED_ART = /_vendored-ui\/|systems\/wh40k-rpg\/icons\/(?:talents|psykana|items)\//;

/**
 * JSON-pointer-style paths of every string in `node` that references
 * {@link UNLICENSED_ART}.
 * @param {unknown} node
 * @param {string} [at]
 * @returns {string[]}
 */
export function unlicensedArtPaths(node, at = '') {
    if (typeof node === 'string') return UNLICENSED_ART.test(node) ? [at || '<root>'] : [];
    if (Array.isArray(node)) return node.flatMap((v, i) => unlicensedArtPaths(v, `${at}/${i}`));
    if (node !== null && typeof node === 'object') return Object.entries(node).flatMap(([k, v]) => unlicensedArtPaths(v, `${at}/${k}`));
    return [];
}

/**
 * The file extensions Foundry accepts on an image field — a mirror of core's
 * `CONST.IMAGE_FILE_EXTENSIONS` (common/constants.mjs), which this Node gate
 * cannot import because the licensed Foundry install is optional here.
 */
export const IMAGE_FILE_EXTENSIONS = ['apng', 'avif', 'bmp', 'gif', 'jpeg', 'jpg', 'png', 'svg', 'tiff', 'webp'];

/**
 * Foundry's own `hasFileExtension` test (common/data/validators.mjs): the
 * extension may be followed by a query string, nothing else.
 */
const IMAGE_EXTENSION = new RegExp(`\\.(?:${IMAGE_FILE_EXTENSIONS.join('|')})(?:\\?.*)?$`, 'i');

/**
 * True when `key` (on `node`, whose own key is `parentKey`) is a Foundry image
 * FilePathField: a document or embedded document's `img`, an active effect's
 * legacy `icon`, a token or tile `texture.src`, a scene `background.src`, or an
 * image journal page's `src`.
 * @param {string} key
 * @param {Record<string, unknown>} node
 * @param {string} parentKey  The key holding `node` (for an array element, the array's key).
 */
function isImageField(key, node, parentKey) {
    if (key === 'img') return true;
    if (key === 'icon') return parentKey === 'effects';
    if (key !== 'src') return false;
    return parentKey === 'texture' || parentKey === 'background' || node['type'] === 'image';
}

/**
 * Pointer paths of every image field in `node` whose path Foundry's image
 * validation rejects: it has no allowed image extension (#626 — the Fandom
 * `…/revision/latest?cb=…` form, which logged ~1,744 load warnings and dropped
 * the art). Blank paths and inline `data:image/…` blobs are valid and skipped.
 * @param {unknown} node
 * @param {string} [at]
 * @param {string} [parentKey]
 * @returns {string[]}
 */
export function extensionlessImagePaths(node, at = '', parentKey = '') {
    if (Array.isArray(node)) return node.flatMap((v, i) => extensionlessImagePaths(v, `${at}/${i}`, parentKey));
    if (node === null || typeof node !== 'object') return [];
    return Object.entries(node).flatMap(([key, value]) => {
        const here = `${at}/${key}`;
        const bad =
            typeof value === 'string' && value !== '' && !value.startsWith('data:image/') && isImageField(key, node, parentKey) && !IMAGE_EXTENSION.test(value);
        return [...(bad ? [here] : []), ...extensionlessImagePaths(value, here, key)];
    });
}

/**
 * The document classes whose `type` must be a sub-type the system registers in
 * `system.json` `documentTypes`, mapped to the class their embedded `items[]`
 * belong to (an Actor embeds Items).
 */
const TYPED_CLASSES = { Item: null, Actor: 'Item' };

/**
 * Errors for a `type` the system does not register (#136). Foundry silently
 * drops a document of an unregistered sub-type: compendium weapon mods typed
 * `weapon.modification` (the Item type is `weaponModification`) never reached
 * an actor, and nothing failed. Checks the document's own `type` against its
 * pack's class, and an Actor's embedded `items[].type` against the Item types.
 * @param {unknown} doc  Parsed `_source/*.json`.
 * @param {string | undefined} documentClass  The class its pack declares (`Item`, `Actor`, …).
 * @param {Record<string, Record<string, unknown>>} documentTypes  `system.json` `documentTypes`.
 * @returns {string[]}
 */
export function unregisteredTypeIssues(doc, documentClass, documentTypes) {
    if (doc === null || typeof doc !== 'object' || documentClass === undefined || !(documentClass in TYPED_CLASSES)) return [];
    const errors = [];
    const registered = (cls, type) => Object.hasOwn(documentTypes[cls] ?? {}, type);
    if (typeof doc.type === 'string' && !registered(documentClass, doc.type)) {
        errors.push(`type: "${doc.type}" is not a registered ${documentClass} type (system.json documentTypes) — Foundry drops the document`);
    }
    const embeddedClass = TYPED_CLASSES[documentClass];
    if (embeddedClass !== null && Array.isArray(doc.items)) {
        doc.items.forEach((item, i) => {
            if (item !== null && typeof item === 'object' && typeof item.type === 'string' && !registered(embeddedClass, item.type)) {
                errors.push(`items.${i}.type: "${item.type}" is not a registered ${embeddedClass} type (system.json documentTypes) — Foundry drops the item`);
            }
        });
    }
    return errors;
}

/**
 * Validate one `_source` document. Returns an array of human-readable error
 * strings (empty when the document is well-formed).
 * @param {unknown} doc  Parsed `_source/*.json`.
 * @param {{ documentClass?: string, documentTypes?: Record<string, Record<string, unknown>> }} [context]
 *   The class the document's pack declares and the system's registered sub-types;
 *   when given, an unregistered `type` is an error.
 * @returns {string[]}
 */
export function validateDoc(doc, context = {}) {
    const errors = unlicensedArtPaths(doc).map(
        (at) => `${at}: references unlicensed art (_vendored-ui) — use the game-icons.net icon scripts/pack-icon-map.mjs picks for the document`,
    );
    errors.push(
        ...extensionlessImagePaths(doc).map(
            (at) => `${at}: image path has no allowed image extension (${IMAGE_FILE_EXTENSIONS.join(', ')}) — Foundry rejects it at load`,
        ),
    );
    // Whole-file `reference` stubs are pointers to another pack's canonical document
    // (resolved at build time); they carry no name/type/system, so skip them.
    if (doc !== null && typeof doc === 'object' && typeof doc.reference === 'string' && doc.type === undefined) return errors;
    if (context.documentTypes !== undefined) errors.push(...unregisteredTypeIssues(doc, context.documentClass, context.documentTypes));
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

/** `system.json` `documentTypes`: the sub-types the system registers per document class. */
function systemDocumentTypes() {
    return JSON.parse(fs.readFileSync('src/system.json', 'utf8')).documentTypes ?? {};
}

/**
 * Pack name → document class, from the system manifest's `packs` and each pack
 * root's `system.packs.json` (the private declarations merged at build).
 * @param {string[]} roots
 * @returns {Map<string, string>}
 */
function packClasses(roots) {
    const declared = [...(JSON.parse(fs.readFileSync('src/system.json', 'utf8')).packs ?? [])];
    for (const root of roots) {
        const manifest = path.join(root, 'system.packs.json');
        if (fs.existsSync(manifest)) declared.push(...(JSON.parse(fs.readFileSync(manifest, 'utf8')).packs ?? []));
    }
    return new Map(declared.map((pack) => [pack.name, pack.type]));
}

function main() {
    const report = process.argv.includes('--report');
    const roots = packRoots();
    const documentTypes = systemDocumentTypes();
    const classes = packClasses(roots);
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
            // `<pack>/_source/<doc>.json`: the pack is the folder holding `_source`.
            const documentClass = classes.get(path.basename(path.dirname(path.dirname(file))));
            const errs = validateDoc(doc, { documentClass, documentTypes });
            if (errs.length > 0) {
                failed++;
                failures.push(`${file}:\n  - ${errs.join('\n  - ')}`);
            }
        }
    }
    const out = (line) => process.stdout.write(`${line}\n`);
    for (const f of failures.slice(0, 100)) out(f);
    if (failures.length > 100) out(`… and ${failures.length - 100} more`);
    out(`\n[validate-pack-schema] scanned ${scanned} document(s) in [${roots.join(', ') || 'no pack roots'}] — ${failed} failed.`);
    if (failed > 0 && !report) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
