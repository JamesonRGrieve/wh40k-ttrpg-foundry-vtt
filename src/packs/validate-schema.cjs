/*
 * Build-time canonical pack-schema validator.
 *
 * Walks every `_source/*.json` under the packs tree and WARNS (never
 * fails) on any deviation from the canonical item schema documented in
 * docs/pack-authoring.md. The warning output doubles as the migration
 * worklist: legacy-shaped files keep building, but every deviation is
 * surfaced.
 *
 * Usage:
 *   node src/packs/validate-schema.cjs [--verbose]   # standalone CLI
 *   require('./validate-schema.cjs').validatePackSources({ ... })  # gulp
 *
 * When the canonical schema in docs/pack-authoring.md changes, update the rule tables
 * below in the same change.
 */
'use strict';

const fs = require('fs');
const path = require('path');

/** Supported game-line ids (variant-container keys). */
const LINES = ['dh1', 'dh2', 'rt', 'dw', 'bc', 'ow', 'im'];
const LINE_SET = new Set(LINES);

/** Valid `system.source.<line>.provenance` values. */
const PROVENANCE = new Set(['raw', 'homebrew', 'derived']);

/**
 * Identity/presentation keys a whole-file `reference` stub may carry alongside
 * `reference`. The build resolver (`resolvePackSourceDocument` in gulpfile.js)
 * merges these OVER the resolved canonical body as a shallow top-level spread,
 * so a pack can ride a SHARED body while carrying its own name, id, and art —
 * e.g. an Astartes-named weapon over a DH2 weapon body, or an RT item with
 * line-specific art. Anything outside this set (notably `system`) cannot be
 * deep-patched by a shallow spread and would silently replace the whole body,
 * so it stays a deviation.
 */
const STUB_OVERRIDE_KEYS = new Set(['name', '_id', 'img']);

/**
 * Canonical native acquisition field per line, and whether the line
 * carries a `homebrew` block (and which keys it holds). Mirrors the
 * "Standard Cost Shape" section of docs/pack-authoring.md.
 */
const COST_SHAPE = {
    dh1: { native: 'throneGelt', homebrew: null },
    dh2: { native: 'influence', homebrew: ['requisition', 'throneGelt'] },
    rt: { native: 'profitFactor', homebrew: ['throneGelt'] },
    dw: { native: 'requisition', homebrew: ['throneGelt'] },
    bc: { native: 'infamy', homebrew: ['throneGelt'] },
    ow: { native: 'logistics', homebrew: ['throneGelt'] },
    // im is the newest line and post-dates the 6-line cost shape, so a cost.im
    // branch is optional; when present it carries the native `solars` and no
    // homebrew block (like dh1's native gelt).
    im: { native: 'solars', homebrew: null, optional: true },
};

/**
 * Item types whose `system.cost` (when present) is an XP / advancement cost — a
 * plain number, or a per-line `{ line: xp }` map — NOT an acquisition-currency
 * object. The currency-shape check below does not apply to them; their cost is a
 * NumberField validated by the data model. Talents cost XP ("900 XP"), not gelt.
 */
const XP_COST_TYPES = new Set(['talent', 'trait', 'psychicPower']);

/**
 * Affliction item types with NO acquisition cost at all. Malignancies, mutations, and
 * mental disorders are GAINED from Corruption/Insanity, never bought, and their
 * DataModels (DescriptionTemplate + ModifiersTemplate, no PhysicalItemTemplate) carry
 * no `system.cost` field — so the currency-shape check must be skipped for them.
 */
const NO_COST_TYPES = new Set(['malignancy', 'mutation', 'mentalDisorder']);

/**
 * Transient runtime state that must live under `system.state`, never
 * flat on `system.*`.
 */
const STATE_FIELDS = ['equipped', 'stowed', 'inBackpack', 'inShipStorage', 'activated', 'overloaded'];

/**
 * Every `system.*` key the vehicle DataModels declare, keyed by craft scale.
 *
 * A key outside this set is silently DROPPED by Foundry's SchemaField.clean on
 * load — the actor's stored JSON keeps it and nothing ever renders it. That is
 * how the Sentinel Walker's whole weapon table lived in `system.parts` while
 * its sheet showed "No weapons", and how all 85 RT ships rendered blank with
 * their hull integrity under `system.hull`. The failure is invisible at every
 * layer except the table, so it gets a validator rule.
 *
 * Mirrors src/module/data/actor/{vehicle,aircraft,watercraft,voidcraft}.ts —
 * update both together.
 */
const VEHICLE_BASE_FIELDS = [
    'gameSystem',
    'gameSystems',
    // Declared on ActorDataModel, so every actor type carries it: the UUID of
    // the unnamed class a named individual is an instance of ('' when this doc
    // IS the base). See PROBLEMS.md P76 — content used this before the schema
    // had a slot, and SchemaField.clean was dropping it.
    'variantOf',
    'locomotion',
    'size',
    'sizeDescriptor',
    'faction',
    'subfaction',
    'type',
    'weapons',
    'specialRules',
    'traitsText',
    'availability',
    'renown',
    'description',
    'source',
    // Named weapon hardpoints (id/label/capacity/accepts): the "what CAN be
    // mounted" loadout definition declared on the vehicle class. A weapon fills
    // one via its own `hardpoint` field. See docs/pack-authoring.md "Animate vehicles".
    'hardpoints',
];

const CONVENTIONAL_CRAFT_FIELDS = [
    ...VEHICLE_BASE_FIELDS,
    'characteristics',
    'vehicleClass',
    'threatLevel',
    'armour',
    'speed',
    'crew',
    'passengers',
    'manoeuverability',
    'carryingCapacity',
    'integrity',
];

const VOIDCRAFT_FIELDS = [
    ...VEHICLE_BASE_FIELDS,
    'hullType',
    'hullClass',
    'dimensions',
    'mass',
    'acceleration',
    'complement',
    'crew',
    'speed',
    'manoeuvrability',
    'detection',
    'armour',
    'voidShields',
    'voidShieldsStatus',
    'turretRating',
    'hullIntegrity',
    'space',
    'power',
    'shipPoints',
    'components',
    'machineSpiritOddities',
    'pastHistory',
    'complications',
    'weaponCapacity',
    'notes',
    'shipStatuses',
    'priorTurnDamage',
];

/**
 * Choice-constrained vehicle fields. A `StringField` with `choices` rejects
 * anything outside the list, so an out-of-band value is as invisible as an
 * undeclared key — 103 craft carried a `system.type` of 'ground', 'fighter', or
 * nothing at all. `locomotion` is not listed: it is required with a per-scale
 * default, so an absent one silently becomes 'wheeled', which is a real
 * mechanical error on a tracked tank but not a validation failure.
 */
const VEHICLE_ENUMS = {
    type: new Set(['vehicle', 'walker', 'flyer', 'skimmer', 'bike', 'tank']),
    locomotion: new Set([
        // emplaced — no drive at all; the Tarantula sentry guns, the Sabre gun
        // platform and the Scutum bunker all print the Immobile Vehicle Trait.
        'immobile',
        'wheeled',
        'tracked',
        'walker',
        'hover',
        'flyer',
        'skimmer',
        'vtol',
        'hull',
        'submersible',
        'hydrofoil',
        'voidship',
    ]),
    vehicleClass: new Set(['ground', 'air', 'water', 'space', 'walker']),
    renown: new Set(['', 'initiate', 'respected', 'distinguished', 'famed', 'hero']),
};

/** Craft-scale suffix on the actor `type` → the schema key set it may use. */
const VEHICLE_SCHEMAS = {
    terracraft: new Set(CONVENTIONAL_CRAFT_FIELDS),
    aircraft: new Set([...CONVENTIONAL_CRAFT_FIELDS, 'altitude', 'ceiling']),
    watercraft: new Set([...CONVENTIONAL_CRAFT_FIELDS, 'draught']),
    voidcraft: new Set(VOIDCRAFT_FIELDS),
    starship: new Set(VOIDCRAFT_FIELDS),
    vehicle: new Set(VEHICLE_BASE_FIELDS),
};

/**
 * Resolve an actor `type` (`dh2-terracraft`, `rt-voidcraft`, bare `aircraft`)
 * to its schema key set, or null when the document is not a vehicle.
 */
function vehicleSchemaFor(type) {
    if (typeof type !== 'string' || type === '') return null;
    const bare = type.includes('-') ? type.slice(type.indexOf('-') + 1) : type;
    return VEHICLE_SCHEMAS[bare] || null;
}

/**
 * Lore / rules fields that must be authored as per-line variant
 * containers rather than flat values. `source` is validated separately
 * (it has the provenance shape) so it is not listed here.
 */
const VARIANT_FIELDS = [
    'description',
    'effect',
    'notes',
    'category',
    'consumable',
    'uses',
    'duration',
    'requiredTraining',
    // Skill rules content (see "Skill Example Fields"): both differ by line,
    // so each is authored as a per-line container collapsed by the line
    // resolver before the flat skill DataModel sees it.
    'exampleDifficulties',
    'exampleAdditionalUses',
    // Content-driven re-roll variant (talents/traits — see the system repo's
    // reroll-template.ts): which test, what modifier, how often differ by line,
    // so the `reroll` block is authored as a per-line container.
    'reroll',
];

/**
 * Recognised `system.modifiers` sub-fields: personal-scale channels + tracking
 * (ModifiersTemplate / the creature aggregator), the data-driven hook channels
 * (Direction #7), and the ship/vehicle-scale modifier keys. A top-level modifier
 * key outside this set — and that is not a per-line variant container (the whole
 * `modifiers` block may be variantized per line) — is almost always a typo the
 * ModifiersTemplate schema silently DROPS on load, so it earns a warning, exactly
 * paralleling the vehicle unknown-field rule. Keep in sync with
 * src/module/data/shared/modifiers-template.ts and the ship/vehicle modifier
 * schemas when a channel is added.
 */
const MODIFIER_SUBFIELDS = new Set([
    // Personal-scale + tracking channels.
    'characteristics',
    'characteristicBonuses',
    'skills',
    'combat',
    'resources',
    'other',
    'situational',
    'wounds',
    'fate',
    'movement',
    // Data-driven hook channels (Direction #7).
    'dynamicModifiers',
    'grantedEffects',
    'grantedQualities', // legacy alias folded forward by ModifiersTemplate._migrateData
    'craftsmanshipGated',
    // Ship / vehicle-scale modifier channels.
    'speed',
    'manoeuvrability',
    'armour',
    'detection',
    'hullIntegrity',
    'turretRating',
    'voidShields',
    'morale',
    'crewRating',
    'damage',
    'penetration',
    'range',
    'rateOfFire',
    'rangeMultiplier',
    'integrity',
    'weight',
    'armourPoints',
    'maxAgility',
    'clip',
    'toHit',
    'attack',
]);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True when an object's keys are all game-line ids (a variant container). */
function isLineKeyed(value) {
    if (!isPlainObject(value)) return false;
    const keys = Object.keys(value);
    return keys.length > 0 && keys.every((k) => LINE_SET.has(k));
}

/** True when an object is a book-variant container ({ __books, __canonical }). */
function isBookVariant(value) {
    return isPlainObject(value) && isPlainObject(value.__books);
}

function nonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

/* ------------------------------------------------------------------ */
/*  Per-document validation                                            */
/* ------------------------------------------------------------------ */

/**
 * Validate one parsed document. Pushes `{ rule, file, detail }` entries
 * onto `warnings`.
 */
function validateDocument(doc, relFile, warnings) {
    const warn = (rule, detail) => warnings.push({ rule, file: relFile, detail: detail || '' });

    // Reference stub: `reference` (required) plus an OPTIONAL identity/presentation
    // override set (STUB_OVERRIDE_KEYS). The build resolves the stub as
    // `{ ...resolvedTargetBody, ...stubKeysMinusReference }`, so overriding
    // name/_id/img rides the shared body while carrying local identity + art.
    if (isPlainObject(doc) && Object.prototype.hasOwnProperty.call(doc, 'reference')) {
        if (typeof doc.reference !== 'string') warn('stub-bad-reference', 'reference is not a string');
        const extra = Object.keys(doc).filter((k) => k !== 'reference' && !STUB_OVERRIDE_KEYS.has(k));
        if (extra.length > 0) warn('stub-extra-keys', `stub has non-override keys: ${extra.join(', ')}`);
        // A declared override must still be a valid value for its field.
        if ('_id' in doc && !nonEmptyString(doc._id)) warn('stub-override-id', 'reference override _id is empty');
        if ('name' in doc && !nonEmptyString(doc.name)) warn('stub-override-name', 'reference override name is empty');
        if ('img' in doc && !nonEmptyString(doc.img)) warn('stub-override-img', 'reference override img is empty');
        return;
    }

    // Identity fields (apply to every document type).
    if (!nonEmptyString(doc.name)) warn('identity-name', 'missing or empty name');
    if (!nonEmptyString(doc._id)) warn('identity-id', 'missing or empty _id');
    // JournalEntry (pages[]), RollTable (results[]) and Scene (grid object +
    // walls/tokens layers) documents carry no Item/Actor `type` discriminator —
    // only typed documents must declare one.
    const isScene = isPlainObject(doc.grid) && Array.isArray(doc.walls) && Array.isArray(doc.tokens);
    if (!Array.isArray(doc.pages) && !Array.isArray(doc.results) && !isScene && !nonEmptyString(doc.type)) {
        warn('identity-type', 'missing or empty type');
    }

    const system = isPlainObject(doc.system) ? doc.system : null;
    if (!system) return;

    // State must be namespaced under system.state.
    for (const field of STATE_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(system, field)) {
            warn('state-not-namespaced', `system.${field} should be system.state.${field}`);
        }
    }
    // `container` is state too, but legitimately empty-string on many
    // legacy docs; flag it under the same rule when flat.
    if (Object.prototype.hasOwnProperty.call(system, 'container')) {
        warn('state-not-namespaced', 'system.container should be system.state.container');
    }

    // Variantizable fields must be a per-line variant container or a
    // book-variant container ({ __books, __canonical } — intra-line stat
    // divergence). A line container's branches may themselves be book variants.
    for (const field of VARIANT_FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(system, field)) continue;
        const value = system[field];
        if (value === null) continue; // unauthored
        if (isBookVariant(value)) {
            if (Object.keys(value.__books).length === 0) warn('book-variant-empty', `system.${field}.__books is empty`);
            continue;
        }
        if (!isLineKeyed(value)) {
            warn('field-not-variantized', `system.${field} is not a per-line variant container`);
        }
    }

    // Recognised `system.modifiers` sub-fields. A top-level modifier key that is
    // neither a known channel nor a per-line variant container is a typo the
    // ModifiersTemplate schema drops on load (e.g. `craftmanshipGated`), so it is
    // surfaced the same way the vehicle unknown-field rule surfaces dropped keys.
    if (isPlainObject(system.modifiers)) {
        for (const key of Object.keys(system.modifiers)) {
            if (MODIFIER_SUBFIELDS.has(key) || LINE_SET.has(key)) continue;
            warn('modifier-subfield-unknown', `system.modifiers.${key} is not a recognised modifier sub-field; Foundry drops it on load`);
        }
    }

    // A vehicle actor may only carry `system` keys its DataModel declares —
    // anything else is dropped on load and renders nowhere.
    const vehicleSchema = vehicleSchemaFor(doc.type);
    if (vehicleSchema) {
        for (const key of Object.keys(system)) {
            if (!vehicleSchema.has(key)) {
                warn('vehicle-field-not-in-schema', `system.${key} is not a field on ${doc.type}; Foundry drops it on load`);
            }
        }
        for (const [field, allowed] of Object.entries(VEHICLE_ENUMS)) {
            if (!Object.prototype.hasOwnProperty.call(system, field)) continue;
            const value = system[field];
            if (value === null || value === undefined) continue;
            if (!allowed.has(value)) {
                warn('vehicle-enum-out-of-range', `system.${field} = ${JSON.stringify(value)} is not an allowed choice`);
            }
        }
        // A craft with no armour and no structural integrity was never sourced
        // from a stat block — the same "defaults to 30s" tell the NPC audit uses.
        //
        // EXCEPT a variant: a named individual authored as a `variantOf` its
        // unnamed class carries only what makes it that individual and inherits
        // the stats through the actor join in compendium-hydrate.ts. Stating
        // none of its own is exactly right there, and flagging it would push
        // authors back toward duplicating the class (P76).
        const isVariant = typeof system.variantOf === 'string' && system.variantOf !== '';
        const facings = isPlainObject(system.armour) ? system.armour : null;
        const anyArmour = facings
            ? ['front', 'side', 'rear'].some((f) => isPlainObject(facings[f]) && Number(facings[f].value) > 0)
            : Number(system.armour) > 0;
        const integrity = isPlainObject(system.integrity)
            ? Number(system.integrity.max)
            : isPlainObject(system.hullIntegrity)
              ? Number(system.hullIntegrity.max)
              : 0;
        if (!anyArmour && !integrity && !isVariant) {
            warn('vehicle-unstatted', 'no armour on any facing and no structural integrity');
        }
    }

    // variantOf must be a Foundry UUID reference (or empty).
    if (typeof system.variantOf === 'string' && system.variantOf !== '') {
        if (!/^Compendium\.|^Item\.|^[A-Za-z0-9]{16}$/.test(system.variantOf)) {
            warn('variant-of-not-uuid', 'system.variantOf should be a Foundry UUID or empty');
        }
    }

    if (!XP_COST_TYPES.has(doc.type) && !NO_COST_TYPES.has(doc.type)) validateCost(system.cost, warn);
    validateSource(system.source, warn);
}

/** Validate `system.cost` against the asymmetric canonical shape. */
function validateCost(cost, warn) {
    if (cost === undefined || cost === null) return; // no cost block (non-physical item)
    if (!isPlainObject(cost)) {
        warn('cost-shape-mismatch', 'system.cost is not an object');
        return;
    }
    if ('value' in cost || 'currency' in cost) {
        warn('cost-legacy-value', 'legacy system.cost.value / system.cost.currency present');
    }

    for (const line of LINES) {
        const shape = COST_SHAPE[line];
        const entry = cost[line];
        if (entry === undefined) {
            // Optional lines (im) need not declare a cost branch.
            if (!shape.optional) warn('cost-shape-mismatch', `missing cost.${line}`);
            continue;
        }
        if (!isPlainObject(entry)) {
            warn('cost-shape-mismatch', `cost.${line} is not an object`);
            continue;
        }
        if (!(shape.native in entry)) {
            warn('cost-shape-mismatch', `cost.${line} missing native field "${shape.native}"`);
        }
        const hasHomebrew = isPlainObject(entry.homebrew);
        if (shape.homebrew === null) {
            // dh1 / im: no homebrew block at all.
            if ('homebrew' in entry) warn('cost-no-homebrew', `cost.${line} must not carry a homebrew block`);
        } else {
            if (!hasHomebrew) {
                warn('cost-shape-mismatch', `cost.${line} missing homebrew block`);
            } else {
                // requisition is dh2-only.
                if (line !== 'dh2' && 'requisition' in entry.homebrew) {
                    warn('cost-requisition-non-dh2', `cost.${line}.homebrew.requisition only allowed on dh2`);
                }
                for (const key of shape.homebrew) {
                    if (!(key in entry.homebrew)) {
                        warn('cost-shape-mismatch', `cost.${line}.homebrew missing "${key}"`);
                    }
                }
            }
        }
    }
}

/** Validate `system.source` against the per-line provenance shape. */
function validateSource(source, warn) {
    if (source === undefined || source === null) return;
    if (typeof source === 'string') {
        warn('source-legacy-string', `bare-string source "${source}" — use the per-line provenance shape`);
        return;
    }
    if (!isLineKeyed(source)) {
        warn('field-not-variantized', 'system.source is not a per-line provenance container');
        return;
    }
    for (const line of Object.keys(source)) {
        const entry = source[line];
        if (!isPlainObject(entry)) {
            warn('source-shape-mismatch', `source.${line} is not an object`);
            continue;
        }
        if (!PROVENANCE.has(entry.provenance)) {
            warn('source-bad-provenance', `source.${line}.provenance must be raw|homebrew|derived`);
            continue;
        }
        if ('custom' in entry) {
            warn('source-custom-deprecated', `source.${line}.custom is deprecated — use url`);
        }
        if ('errata' in entry && typeof entry.errata !== 'boolean') {
            warn('source-errata-not-boolean', `source.${line}.errata must be a boolean`);
        }
        if (entry.provenance === 'raw') {
            if (!nonEmptyString(entry.book) || !nonEmptyString(entry.page)) {
                warn('source-raw-missing-citation', `raw source.${line} needs book + page`);
            }
            if ('url' in entry && entry.url !== null) {
                warn('source-raw-has-url', `raw source.${line} should cite book/page, not url`);
            }
        } else {
            // homebrew / derived
            if ('book' in entry || 'page' in entry) {
                warn('source-homebrew-has-citation', `${entry.provenance} source.${line} must not carry book/page`);
            }
            if (entry.provenance === 'derived' && 'derivedFrom' in entry && !LINE_SET.has(entry.derivedFrom)) {
                warn('source-bad-derivedfrom', `source.${line}.derivedFrom must be a line id`);
            }
        }
    }
}

/* ------------------------------------------------------------------ */
/*  Reference graph (UUID dereference)                                 */
/* ------------------------------------------------------------------ */

/**
 * Matches a `Compendium.wh40k-rpg.<pack>.<Class>.<id>` reference anywhere in a
 * string — a structured UUID field (`variantOf`, grants, origin steps), an
 * embedded item's `_stats.compendiumSource`, an adventure scenario's
 * encounter/reward/scene UUID, or an inline `@UUID[…]` / `{{Compendium.…}}`
 * token in rules HTML. The pack segment is lazy so the real `.Class.` boundary
 * wins (pack names contain a lowercase `actors`/`items`, never the capitalised
 * class token). Ids are `[A-Za-z0-9]` (random or readable), so `{6,}` is safe.
 */
const COMPENDIUM_UUID_RE = /Compendium\.wh40k-rpg\.([A-Za-z0-9._-]+?)\.(Actor|Item|JournalEntry|RollTable|Scene|Adventure|Cards|Macro|Playlist)\.([A-Za-z0-9]{6,})/g;

/** The pack directory name for a repo-relative source path
 *  (`<group>/<pack>/_source/<file>.json` → `<pack>`). */
function packNameForRel(rel) {
    const parts = rel.split(path.sep);
    return parts.length >= 2 ? parts[1] : null;
}

/** Resolve a reference-stub target path the way the gulp build does
 *  (`resolveReferencePath` in gulpfile.js), so stub chains index to their real
 *  `_id`. `rootDir` is the packs root; the repo root is two levels up. */
function resolveStubTargetPath(reference, fromFile, rootDir) {
    if (path.isAbsolute(reference)) return reference;
    // "packs/…" and "src/packs/…" name a sibling pack within the ACTIVE pack
    // root (`rootDir` — src/packs or src/packs-private), so anchor them there,
    // mirroring gulpfile.js `resolveReferencePath`.
    if (reference.startsWith('packs/')) return path.resolve(rootDir, reference.slice('packs/'.length));
    if (reference.startsWith('src/packs/')) return path.resolve(rootDir, reference.slice('src/packs/'.length));
    const repoRoot = path.resolve(rootDir, '..', '..');
    if (reference.startsWith('src/')) return path.resolve(repoRoot, reference);
    return path.resolve(path.dirname(fromFile), reference);
}

/**
 * The effective `_id` a source file contributes once the build resolves it: a
 * full document's own `_id`, a reference-override stub's `_id`, or — for a bare
 * stub — the `_id` at the end of its reference chain. Returns null when no id
 * resolves (a dangling stub target). `docCache` maps absolute path → parsed doc.
 */
function effectiveSourceId(file, docCache, rootDir, seen) {
    const abs = path.resolve(file);
    if (seen.has(abs)) return null; // circular chain
    seen.add(abs);
    let doc = docCache.get(abs);
    if (doc === undefined) {
        try {
            doc = JSON.parse(fs.readFileSync(abs, 'utf8'));
        } catch {
            return null;
        }
        docCache.set(abs, doc);
    }
    if (isPlainObject(doc) && typeof doc.reference === 'string') {
        if (nonEmptyString(doc._id)) return doc._id; // override stub carries its own id
        const target = resolveStubTargetPath(doc.reference, abs, rootDir);
        if (!fs.existsSync(target)) return null;
        return effectiveSourceId(target, docCache, rootDir, seen);
    }
    return isPlainObject(doc) && nonEmptyString(doc._id) ? doc._id : null;
}

/** Build `pack → Set<effective _id>` across every parsed source file. */
function buildPackIdIndex(parsed, rootDir) {
    const docCache = new Map();
    for (const { file, doc } of parsed) docCache.set(path.resolve(file), doc);
    const packIds = new Map();
    for (const { file, rel } of parsed) {
        const pack = packNameForRel(rel);
        if (pack === null) continue;
        const id = effectiveSourceId(file, docCache, rootDir, new Set());
        if (id === null) continue;
        let set = packIds.get(pack);
        if (set === undefined) {
            set = new Set();
            packIds.set(pack, set);
        }
        set.add(id);
    }
    return packIds;
}

/** Deep-walk a value collecting every distinct wh40k-rpg compendium UUID as a
 *  `pack\0id` key. */
function collectUuidRefs(value, out) {
    if (typeof value === 'string') {
        COMPENDIUM_UUID_RE.lastIndex = 0;
        let m = COMPENDIUM_UUID_RE.exec(value);
        while (m !== null) {
            out.add(`${m[1]} ${m[3]}`);
            m = COMPENDIUM_UUID_RE.exec(value);
        }
    } else if (Array.isArray(value)) {
        for (const v of value) collectUuidRefs(v, out);
    } else if (isPlainObject(value)) {
        for (const v of Object.values(value)) collectUuidRefs(v, out);
    }
}

/**
 * Warn on every UUID reference whose target `_id` is absent from the pack it
 * names — a dangling reference that Foundry's `fromUuid` resolves to null (a
 * missing encounter actor, a moved item, a stale `variantOf`/`compendiumSource`,
 * a broken `@UUID[…]` link). A reference-stub's own `reference` file-path is not
 * a Compendium UUID and is unaffected.
 */
function validateReferences(doc, rel, warnings, packIds) {
    const refs = new Set();
    collectUuidRefs(doc, refs);
    for (const ref of refs) {
        const sep = ref.indexOf(' ');
        const pack = ref.slice(0, sep);
        const id = ref.slice(sep + 1);
        const set = packIds.get(pack);
        if (set === undefined) {
            warnings.push({ rule: 'reference-unknown-pack', file: rel, detail: `Compendium.wh40k-rpg.${pack}.*.${id} → pack "${pack}" has no source documents` });
        } else if (!set.has(id)) {
            warnings.push({ rule: 'reference-unresolved', file: rel, detail: `Compendium.wh40k-rpg.${pack}.*.${id} → no document with _id "${id}" in pack "${pack}"` });
        }
    }
}

/* ------------------------------------------------------------------ */
/*  Filesystem walk                                                    */
/* ------------------------------------------------------------------ */

/** Collect every _source/*.json path under rootDir. */
function collectSourceFiles(rootDir) {
    const results = [];
    const skipDirs = new Set(['_backups', '_templates', '.build', 'node_modules']);

    function walkPackGroup(groupDir) {
        for (const packName of fs.readdirSync(groupDir)) {
            if (/\.backup|backup-\d/.test(packName)) continue; // stale backup pack dir
            const packDir = path.join(groupDir, packName);
            if (!fs.statSync(packDir).isDirectory()) continue;
            const sourceDir = path.join(packDir, '_source');
            if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) continue;
            for (const entry of fs.readdirSync(sourceDir)) {
                if (entry.endsWith('.json')) results.push(path.join(sourceDir, entry));
            }
        }
    }

    for (const group of fs.readdirSync(rootDir)) {
        if (skipDirs.has(group)) continue;
        const groupPath = path.join(rootDir, group);
        if (!fs.statSync(groupPath).isDirectory()) continue;
        walkPackGroup(groupPath);
    }
    return results;
}

/* ------------------------------------------------------------------ */
/*  Public entry point                                                 */
/* ------------------------------------------------------------------ */

/**
 * Validate all pack source documents under rootDir.
 *
 * @param {object} [opts]
 * @param {string} [opts.rootDir]  Packs root (defaults to this file's dir).
 * @param {boolean} [opts.verbose] List offending files under each rule.
 * @param {(msg: string) => void} [opts.log] Sink for output lines.
 * @returns {{ filesScanned: number, filesWithWarnings: number, warnings: Array, byRule: Record<string, number> }}
 */
function validatePackSources(opts) {
    const options = opts || {};
    const rootDir = options.rootDir || __dirname;
    const verbose = Boolean(options.verbose);
    const log = typeof options.log === 'function' ? options.log : (msg) => process.stdout.write(`${msg}\n`);

    const files = collectSourceFiles(rootDir);
    const warnings = [];

    // Parse every source file once, then build the pack → _id index that the
    // reference-graph check dereferences against (a UUID reference is only
    // resolvable if its target _id exists in the pack it names).
    const parsed = [];
    for (const file of files) {
        const rel = path.relative(rootDir, file);
        let doc;
        try {
            doc = JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch (err) {
            warnings.push({ rule: 'parse-error', file: rel, detail: err.message });
            continue;
        }
        parsed.push({ file, rel, doc });
    }

    const packIds = buildPackIdIndex(parsed, rootDir);

    for (const { rel, doc } of parsed) {
        validateDocument(doc, rel, warnings);
        validateReferences(doc, rel, warnings, packIds);
    }

    const byRule = {};
    const filesWithWarnings = new Set();
    for (const w of warnings) {
        byRule[w.rule] = (byRule[w.rule] || 0) + 1;
        filesWithWarnings.add(w.file);
    }

    // ---- Report ----
    log('=== pack schema validation (warn-only) ===');
    log(`scanned ${files.length} source file(s)`);
    if (warnings.length === 0) {
        log('no deviations from canonical schema 🎉');
    } else {
        log(`${warnings.length} deviation(s) across ${filesWithWarnings.size} file(s):`);
        const rules = Object.keys(byRule).sort((a, b) => byRule[b] - byRule[a]);
        for (const rule of rules) {
            log(`  ${rule.padEnd(28)} ${byRule[rule]}`);
            if (verbose) {
                for (const w of warnings.filter((x) => x.rule === rule)) {
                    log(`      ${w.file}${w.detail ? ` — ${w.detail}` : ''}`);
                }
            }
        }
        if (!verbose) log('  (run with --verbose for the per-file list under each rule)');
    }

    return { filesScanned: files.length, filesWithWarnings: filesWithWarnings.size, warnings, byRule };
}

module.exports = { validatePackSources, validateDocument, validateCost, validateSource, buildPackIdIndex, validateReferences, collectUuidRefs };

// CLI shim.
if (require.main === module) {
    const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');
    validatePackSources({ verbose });
    // Warn-only: always succeed.
    process.exit(0);
}
