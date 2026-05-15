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
