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
    grants: Record<string, any> | null;
    /** Optional specialization sub-choices (e.g. weapon groups for Weapon Training) */
    specializations: string[] | null;
}

export interface NormalizedGrants {
    skills: any[];
    talents: any[];
    traits: any[];
    equipment: any[];
    aptitudes: string[];
    specialAbilities: any[];
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
    requirements: { previousSteps: string[]; excludedSteps: string[] };
    grants: NormalizedGrants;
    modifiers: { characteristics: Record<string, number> };
    isAdvanced: boolean;
    xpCost: number;
    hasChoices: boolean;
    gameSystem: string;
    /** Raw system data preserved for compatibility */
    system: any;
}

/* -------------------------------------------- */
/*  Normalization Functions                     */
/* -------------------------------------------- */

/**
 * Strip HTML tags from text.
 */
function stripHtml(html: string): string {
    if (!html) return '';
    // Use a simple regex for server-side or pre-render contexts
    return html.replace(/<[^>]*>/g, '').trim();
}

/**
 * Normalize a single choice entry.
 */
export function normalizeChoice(raw: any): NormalizedChoice {
    return {
        label: raw.label || raw.name || '',
        type: raw.type || '',
        count: raw.count || 1,
        options: (raw.options || []).map((opt: any) => {
            if (typeof opt === 'string') {
                return { value: opt, label: opt, description: null, uuid: null, grants: null, specializations: null };
            }
            return {
                value: opt.value || opt.name || '',
                label: opt.label || opt.name || '',
                description: opt.description || null,
                uuid: opt.uuid || null,
                grants: opt.grants || null,
                specializations: opt.specializations || null,
            };
        }),
    };
}

/**
 * Normalize grants from raw origin data.
 */
function normalizeGrants(raw: any): NormalizedGrants {
    const grants = raw || {};
    return {
        skills: grants.skills || [],
        talents: grants.talents || [],
        traits: grants.traits || [],
        equipment: grants.equipment || [],
        aptitudes: grants.aptitudes || [],
        specialAbilities: grants.specialAbilities || [],
        choices: (grants.choices || []).map(normalizeChoice),
        woundsFormula: grants.woundsFormula || null,
        fateFormula: grants.fateFormula || null,
    };
}

/**
 * Resolve a stable, non-null ID for an origin document.
 *
 * Priority: uuid (always unique for compendium items) > _id > id > synthetic
 */
function resolveId(doc: any): string {
    if (doc.uuid) return doc.uuid;
    if (doc._id) return doc._id;
    if (doc.id) return doc.id;
    // Synthetic fallback for edge cases (manually constructed objects)
    return `synthetic:${doc.name || 'unknown'}:${doc.system?.step || 'unknown'}`;
}

/**
 * Resolve positions array from raw origin data.
 * Handles three legacy field names and ensures a sorted array.
 */
function resolvePositions(system: any): number[] {
    const raw = system?.pathPositions ?? system?.allPositions ?? system?.positions;
    if (Array.isArray(raw) && raw.length > 0) {
        return [...raw].sort((a, b) => a - b);
    }
    return [4]; // Center default
}

/**
 * Transform a raw Foundry compendium document into a NormalizedOrigin.
 * Call once per document during _loadOrigins().
 */
export function normalizeOrigin(doc: any): NormalizedOrigin {
    const system = doc.system || {};
    const grants = normalizeGrants(system.grants);
    const positions = resolvePositions(system);
    const description = system.description?.value || '';
    const stripped = stripHtml(description);

    return {
        id: resolveId(doc),
        uuid: doc.uuid || null,
        name: doc.name || '',
        img: doc.img || '',
        step: system.step || '',
        stepIndex: system.stepIndex || 0,
        identifier: system.identifier || '',
        positions: positions,
        primaryPosition: system.primaryPosition ?? positions[Math.floor(positions.length / 2)] ?? 4,
        description: description,
        shortDescription: stripped.length > 150 ? stripped.substring(0, 150) + '...' : stripped,
        requirements: {
            previousSteps: system.requirements?.previousSteps || [],
            excludedSteps: system.requirements?.excludedSteps || [],
        },
        grants: grants,
        modifiers: {
            characteristics: system.modifiers?.characteristics || {},
        },
        isAdvanced: system.isAdvancedOrigin || false,
        xpCost: system.xpCost || 0,
        hasChoices: grants.choices.length > 0,
        gameSystem: system.gameSystem || '',
        system: system,
    };
}
