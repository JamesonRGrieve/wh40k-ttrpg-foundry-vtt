/**
 * Normalized Origin Types & Factory
 *
 * Transforms raw Foundry compendium documents into a clean internal
 * representation with guaranteed non-null fields. Normalizes away
 * cross-system inconsistencies (id/uuid/_id, label/name, positions arrays).
 *
 * Call normalizeOrigin() once per document during _loadOrigins().
 * All downstream code works exclusively with NormalizedOrigin.
 */

import type { Grant } from '../../utils/grants-processor.ts';

/* -------------------------------------------- */
/*  Raw input shapes (unvalidated compendium)   */
/* -------------------------------------------- */

/** Minimal type guard — narrows unknown to a plain object we can index */
// eslint-disable-next-line no-restricted-syntax -- boundary: isRecord is the validation entry point; `unknown` is narrowed to Record<string,unknown> on the next line via typeof/instanceof checks
function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Coerce an unknown value to Record<string, unknown>, returning {} when it is not an object */
// eslint-disable-next-line no-restricted-syntax -- boundary: asRecord coerces unknown compendium data; isRecord type guard on the next line narrows it
function asRecord(v: unknown): Record<string, unknown> {
    return isRecord(v) ? v : {};
}

/** Coerce an unknown value to string, returning '' when it is not a string */
// eslint-disable-next-line no-restricted-syntax -- boundary: asString coerces unknown compendium data; typeof guard on the next line narrows it
function asString(v: unknown): string {
    return typeof v === 'string' ? v : '';
}

/** Return the first argument that is a non-empty string */
// eslint-disable-next-line no-restricted-syntax -- boundary: firstString accepts unknown candidates from compendium data; typeof guard inside the loop narrows each candidate
function firstString(...candidates: unknown[]): string {
    for (const c of candidates) {
        if (typeof c === 'string' && c !== '') return c;
    }
    return '';
}

/** Coerce an unknown value to number, returning the fallback when it is not a number */
// eslint-disable-next-line no-restricted-syntax -- boundary: asNumber coerces unknown compendium data; typeof guard on the next line narrows it
function asNumber(v: unknown, fallback = 0): number {
    return typeof v === 'number' ? v : fallback;
}

/* -------------------------------------------- */
/*  Types                                       */
/* -------------------------------------------- */

export interface NormalizedChoice {
    /** Always set — prefers 'label', falls back to 'name' */
    label: string;
    type: string;
    count: number;
    options: NormalizedChoiceOption[];
}

export interface NormalizedChoiceOption {
    /** Always set — prefers 'value', falls back to 'name' */
    value: string;
    /** Always set — prefers 'label', falls back to 'name' */
    label: string;
    description: string | null;
    uuid: string | null;
    grants: Record<string, Grant[]> | null;
    /** Optional specialization sub-choices (e.g. weapon groups for Weapon Training) */
    specializations: string[] | null;
}

export interface NormalizedGrants {
    skills: Grant[];
    talents: Grant[];
    traits: Grant[];
    equipment: Grant[];
    aptitudes: string[];
    specialAbilities: Grant[];
    choices: NormalizedChoice[];
    woundsFormula: string | null;
    fateFormula: string | null;
}

export interface NormalizedOrigin {
    /** Guaranteed non-null identifier. Prefers uuid, then _id, then synthetic. */
    id: string;
    /** Compendium UUID when available */
    uuid: string | null;
    name: string;
    img: string;
    step: string;
    stepIndex: number;
    identifier: string;
    /** Always a sorted array, defaults to [4] */
    positions: number[];
    primaryPosition: number;
    /** Raw HTML description */
    description: string;
    /** Pre-stripped and truncated plain text */
    shortDescription: string;
    requirements: { text: string; previousSteps: string[]; excludedSteps: string[] };
    grants: NormalizedGrants;
    modifiers: { characteristics: Record<string, number> };
    isAdvanced: boolean;
    xpCost: number;
    hasChoices: boolean;
    gameSystem: string;
    /** Raw system data preserved for compatibility */
    // eslint-disable-next-line no-restricted-syntax -- boundary: system holds raw Foundry compendium data with no schema; consumers cast to specific shapes they need
    system: Record<string, unknown>;
}

/* -------------------------------------------- */
/*  Normalization Functions                     */
/* -------------------------------------------- */

/**
 * Strip HTML tags from text.
 */
function stripHtml(html: string): string {
    if (!html) return '';
    // Replace block-level closing tags with a space so headings don't merge with body text
    return html
        .replace(/<\/(?:h[1-6]|p|div|li|tr|blockquote)>/gi, ' ')
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Normalize a single choice entry.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: normalizeChoice accepts raw compendium data of unknown shape; all fields are accessed via string keys with type coercion helpers
export function normalizeChoice(raw: Record<string, unknown>): NormalizedChoice {
    const rawOptions = Array.isArray(raw['options']) ? raw['options'] : [];
    return {
        label: firstString(raw['label'], raw['name']),
        type: asString(raw['type']),
        count: asNumber(raw['count'], 1),
        // eslint-disable-next-line no-restricted-syntax -- boundary: rawOptions elements are untyped compendium data; typeof/isRecord guards inside the callback narrow each element
        options: rawOptions.map((opt: unknown): NormalizedChoiceOption => {
            if (typeof opt === 'string') {
                return { value: opt, label: opt, description: null, uuid: null, grants: null, specializations: null };
            }
            const o = asRecord(opt);
            const rawGrants = isRecord(o['grants']) ? o['grants'] : null;
            const grants: Record<string, Grant[]> | null = rawGrants
                ? Object.fromEntries(Object.entries(rawGrants).map(([k, v]) => [k, asGrantArray(v)]))
                : null;
            const specializations = Array.isArray(o['specializations']) ? o['specializations'].filter((s): s is string => typeof s === 'string') : null;
            return {
                value: firstString(o['value'], o['name']),
                label: firstString(o['label'], o['name']),
                description: typeof o['description'] === 'string' ? o['description'] : null,
                uuid: typeof o['uuid'] === 'string' ? o['uuid'] : null,
                grants,
                specializations,
            };
        }),
    };
}

/**
 * Narrow a raw array to Grant[]. Each element must have at least a `name` string.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: asGrantArray accepts unknown compendium data; Array.isArray and isRecord guards inside the function narrow it
function asGrantArray(raw: unknown): Grant[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((item): item is Grant => isRecord(item) && typeof item['name'] === 'string');
}

/**
 * Normalize grants from raw origin data.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: normalizeGrants accepts unknown compendium data; asRecord coerces it on the next line
function normalizeGrants(raw: unknown): NormalizedGrants {
    const grants = asRecord(raw);
    return {
        skills: asGrantArray(grants['skills']),
        talents: asGrantArray(grants['talents']),
        traits: asGrantArray(grants['traits']),
        equipment: asGrantArray(grants['equipment']),
        aptitudes: Array.isArray(grants['aptitudes']) ? grants['aptitudes'].filter((a): a is string => typeof a === 'string') : [],
        specialAbilities: asGrantArray(grants['specialAbilities']),
        choices: Array.isArray(grants['choices']) ? grants['choices'].map((c) => normalizeChoice(asRecord(c))) : [],
        woundsFormula: typeof grants['woundsFormula'] === 'string' ? grants['woundsFormula'] : null,
        fateFormula: typeof grants['fateFormula'] === 'string' ? grants['fateFormula'] : null,
    };
}

/**
 * Resolve a stable, non-null ID for an origin document.
 *
 * Priority: uuid (always unique for compendium items) > _id > id > synthetic
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: resolveId accepts raw compendium document data; all field accesses are guarded by typeof checks
function resolveId(doc: Record<string, unknown>): string {
    if (typeof doc['uuid'] === 'string' && doc['uuid']) return doc['uuid'];
    if (typeof doc['_id'] === 'string' && doc['_id']) return doc['_id'];
    if (typeof doc['id'] === 'string' && doc['id']) return doc['id'];
    // Synthetic fallback for edge cases (manually constructed objects)
    const name = asString(doc['name']) || 'unknown';
    const step = asString(asRecord(doc['system'])['step']) || 'unknown';
    return `synthetic:${name}:${step}`;
}

/**
 * Resolve positions array from raw origin data.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: resolvePositions accepts raw compendium system data; positions field is narrowed via Array.isArray and typeof number checks
function resolvePositions(system: Record<string, unknown>): number[] {
    const raw = system['positions'];
    if (Array.isArray(raw) && raw.length > 0) {
        const nums = raw.filter((v): v is number => typeof v === 'number');
        if (nums.length > 0) return [...nums].sort((a, b) => a - b);
    }
    return [4]; // Center default
}

/**
 * Transform a raw Foundry compendium document into a NormalizedOrigin.
 * Call once per document during _loadOrigins().
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: normalizeOrigin is the top-level entry point for raw Foundry compendium documents; asRecord and type coercion helpers validate every field access
export function normalizeOrigin(doc: Record<string, unknown>): NormalizedOrigin {
    const system = asRecord(doc['system']);
    const grants = normalizeGrants(system['grants']);
    const positions = resolvePositions(system);
    const descriptionRecord = asRecord(system['description']);
    const description = asString(descriptionRecord['value']);
    const name = asString(doc['name']);
    // Strip HTML and remove leading heading that duplicates the name
    let stripped = stripHtml(description);
    if (name && stripped.startsWith(name)) {
        stripped = stripped.substring(name.length).trim();
    }

    const requirements = asRecord(system['requirements']);
    const modifiers = asRecord(system['modifiers']);
    const characteristicsRaw = asRecord(modifiers['characteristics']);
    // Narrow characteristics to Record<string, number>
    const characteristics: Record<string, number> = {};
    for (const [k, v] of Object.entries(characteristicsRaw)) {
        if (typeof v === 'number') characteristics[k] = v;
    }

    const previousSteps = Array.isArray(requirements['previousSteps']) ? requirements['previousSteps'].filter((s): s is string => typeof s === 'string') : [];
    const excludedSteps = Array.isArray(requirements['excludedSteps']) ? requirements['excludedSteps'].filter((s): s is string => typeof s === 'string') : [];

    return {
        id: resolveId(doc),
        uuid: typeof doc['uuid'] === 'string' ? doc['uuid'] : null,
        name: asString(doc['name']),
        img: asString(doc['img']),
        step: asString(system['step']),
        stepIndex: asNumber(system['stepIndex']),
        identifier: asString(system['identifier']),
        positions: positions,
        primaryPosition: asNumber(system['primaryPosition'], positions[Math.floor(positions.length / 2)] ?? 4),
        description: description,
        shortDescription: stripped.length > 150 ? `${stripped.substring(0, 150)}...` : stripped,
        requirements: {
            text: asString(requirements['text']),
            previousSteps,
            excludedSteps,
        },
        grants: grants,
        modifiers: { characteristics },
        isAdvanced: system['isAdvancedOrigin'] === true,
        xpCost: asNumber(system['xpCost']),
        hasChoices: grants.choices.length > 0,
        gameSystem: asString(system['gameSystem']),
        system: system,
    };
}
