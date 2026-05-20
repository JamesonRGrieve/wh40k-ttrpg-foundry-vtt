/**
 * Profane Object item shape (within.md p. 52-57).
 *
 * Profane Objects are gear items that carry an aura or per-action
 * corruption hook. They live in the existing `gear` item type via an
 * extension flag — same approach as #74 (Lead in JournalEntry).
 *
 * Auras have a radius and a per-tick effect (every round / minute /
 * hour the actor is within range). Per-action hooks fire when the
 * wielder performs a triggering action (kill, blessing, etc.).
 */

export interface ProfaneObjectAura {
    radiusMetres: number;
    label: string;
    /** Active-Effect change keys applied to actors inside the radius. */
    effects: Array<{ key: string; mode: number; value: number }>;
}

export interface ProfaneObjectPerActionHook {
    /** Action category that triggers the hook (kill / blessing / heal / etc.). */
    trigger: 'killTarget' | 'blessAlly' | 'invokeFaith' | 'manifestPower' | 'manual';
    /** Corruption gained by the holder per trigger. */
    corruptionPerTrigger: number;
    /** Insanity gained per trigger. Many profane objects shed Insanity over time. */
    insanityPerTrigger: number;
}

export interface ProfaneObjectDefinition {
    /** Slug identifying the canonical object (Eye of Tzeentch, etc.). */
    id: string;
    label: string;
    /** Optional aura active while held. */
    aura?: ProfaneObjectAura;
    /** Optional per-action hook. */
    hook?: ProfaneObjectPerActionHook;
}

/**
 * Canonical Profane Objects from within.md p. 52-57. Lookups by slug
 * surface aura + hook metadata to the gear sheet and (eventually) to
 * the corruption-accrual engine.
 */
export const PROFANE_OBJECT_REGISTRY: Record<string, ProfaneObjectDefinition> = {
    'eye-of-tzeentch': {
        id: 'eye-of-tzeentch',
        label: 'Eye of Tzeentch',
        aura: {
            radiusMetres: 10,
            label: 'Whispers of the Architect — psychic phenomena bleed within range.',
            effects: [{ key: 'system.psy.willpowerCheck.bonus', mode: 2, value: 10 }],
        },
        hook: {
            trigger: 'manifestPower',
            corruptionPerTrigger: 1,
            insanityPerTrigger: 0,
        },
    },
    'foundation-stone-of-house-dane': {
        id: 'foundation-stone-of-house-dane',
        label: 'Foundation Stone of House Dane',
        aura: {
            radiusMetres: 20,
            label: 'Anchor of a fallen lineage — allies inside the radius cannot be moved against their will.',
            effects: [{ key: 'system.movement.forcedDisplacement', mode: 5, value: 0 }],
        },
        hook: {
            trigger: 'killTarget',
            corruptionPerTrigger: 1,
            insanityPerTrigger: 1,
        },
    },
    'hammer-of-saint-lucillius': {
        id: 'hammer-of-saint-lucillius',
        label: 'Hammer of Saint Lucillius',
        aura: {
            radiusMetres: 5,
            label: 'A relic blade that demands witnesses — allies gain +10 Willpower vs Fear inside the radius.',
            effects: [{ key: 'system.skills.willpower.fearBonus', mode: 2, value: 10 }],
        },
        hook: {
            trigger: 'invokeFaith',
            corruptionPerTrigger: 0,
            insanityPerTrigger: 1,
        },
    },
    'libris-maleficarum': {
        id: 'libris-maleficarum',
        label: 'Libris Maleficarum',
        aura: {
            radiusMetres: 3,
            label: 'Forbidden lore radiates from the open page — Forbidden Lore (Heresy) tests at +20.',
            effects: [{ key: 'system.skills.forbiddenLore.heresy.bonus', mode: 2, value: 20 }],
        },
        hook: {
            trigger: 'manual',
            corruptionPerTrigger: 2,
            insanityPerTrigger: 1,
        },
    },
};

/**
 * Resolve a Profane Object slug into its canonical definition. Returns
 * `undefined` when the id is empty, null, or not present in the
 * registry — callers should treat the gear as ordinary in that case.
 */
export function getProfaneObjectDefinition(id: string | null | undefined): ProfaneObjectDefinition | undefined {
    if (id === null || id === undefined || id === '') return undefined;
    return PROFANE_OBJECT_REGISTRY[id];
}
