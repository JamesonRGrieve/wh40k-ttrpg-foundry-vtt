/**
 * Shared internal types for the character-creation builders.
 *
 * These interfaces exist to replace inline `Record<string, unknown>` casts
 * sprinkled through `origin-path-builder.ts`. They describe the runtime shape
 * of state that is threaded through the builder — flag payload, item-data
 * snapshots, foundry framework boundaries — without committing to specific
 * DataModel typings (which differ per system).
 */

import type { WH40KItemModifiers } from '../../types/global.d.ts';

/**
 * A loosely-typed bag used to describe a property keyed object whose value
 * shape is locally narrowed at the call site. This is the project's preferred
 * alternative to `Record<string, unknown>` where the index signature really is
 * the right model (e.g. a foundry `update()` payload).
 */
export interface KeyedAnyBag {
    [key: string]: KeyedValue;
}

export type KeyedValue = string | number | boolean | null | undefined | KeyedAnyBag | KeyedValue[];

/**
 * Shape of an entry stored in the equipment-selections map. Every field is
 * optional because compendium index data is sparsely populated.
 */
export interface EquipmentEntry {
    uuid: string;
    id?: string;
    name?: string;
    img?: string;
    type?: string;
    identifier?: string | null;
    clipMax?: number | null;
    weaponTypes?: string[];
    availability?: string;
    availabilityLabel?: string;
    availabilityOrder?: number;
    requisition?: number | null;
    throneGelt?: number | null;
}

/**
 * Snapshot of builder state persisted to actor flags. All fields are optional
 * because legacy flag payloads may be missing newer fields.
 */
export interface BuilderFlagState {
    equipmentSelections?: Record<string, EquipmentEntry> | null;
    charRolls?: number[] | null;
    charAssignments?: Record<string, number | null> | null;
    charAdvancedMode?: boolean | null;
    charCustomBases?: Record<string, number> | null;
    charGenMode?: 'point-buy' | 'roll' | 'roll-pool-hb' | null;
    divination?: string | null;
    influenceRolled?: number | null;
}

/**
 * Shape of the `system.characterGeneration` slice on the actor. Mirrors the
 * frontmatter-style fields used by the builder; falls back to {} when the
 * actor predates this slice.
 */
export interface CharacterGenerationSlice {
    rolls?: number[];
    assignments?: Record<string, number | null>;
    customBases?: Record<string, number> & { enabled?: boolean };
    mode?: 'point-buy' | 'roll' | 'roll-pool-hb';
}

/**
 * Minimal shape of the `core` flag namespace on a Foundry item — only the
 * fields the builder actually reads or writes.
 */
export interface CoreFlags {
    sourceId?: string;
}

/**
 * Minimal shape of an item-data plain object as returned by `item.toObject()`
 * or `foundry.utils.deepClone(item)`. The builder treats these payloads as
 * mutable update bundles before handing them to `createEmbeddedDocuments`.
 */
export interface ItemDataLike {
    _id?: string | null;
    _sourceUuid?: string | null;
    _actorItemId?: string | null;
    uuid?: string;
    name?: string;
    type?: string;
    img?: string;
    flags?: { core?: CoreFlags } & Record<string, CoreFlags | undefined>;
    system?: ItemSystemLike;
}

/**
 * Minimal shape of an item's `system` slice as seen by the builder. Maps
 * loosely onto fields the builder reads from origin-paths, weapons, and
 * ammunition — concrete typings live in each DataModel.
 */
export interface ItemSystemLike {
    step?: string;
    identifier?: string;
    quantity?: number;
    availability?: string;
    clip?: { current?: number; max?: number };
    weaponTypes?: string[];
    description?: { value?: string; chat?: string; summary?: string };
    requirements?: { text?: string };
    activeModifiers?: ActiveModifier[];
    homebrew?: { throneGelt?: string; thrones?: string };
    modifiers?: WH40KItemModifiers;
    selectedChoices?: Record<string, string[] | string>;
    rollResults?: Record<string, { rolled?: number; breakdown?: string } | undefined>;
    grants?: GrantsSlice;
    cost?: { dh2?: { homebrew?: { requisition?: number; throneGelt?: number } } };
}

/**
 * Single entry on `system.activeModifiers` — the resolved-choice modifiers
 * the builder reads when collecting characteristic bonuses.
 */
export interface ActiveModifier {
    type?: string;
    key?: string;
    value?: number | string;
    [extra: string]: string | number | boolean | null | undefined;
}

/**
 * Shape of `system.grants` — kept loose since each grant kind has its own
 * downstream consumer.
 */
export interface GrantsSlice {
    characteristics?: Record<string, number>;
    skills?: GrantSkillRaw[];
    talents?: GrantTalentRaw[];
    traits?: GrantTraitRaw[];
    choices?: GrantChoiceRaw[];
    equipment?: GrantEquipmentRaw[];
    woundsFormula?: string;
    fateFormula?: string;
}

export interface GrantSkillRaw {
    name?: string;
    specialization?: string;
    level?: string;
    uuid?: string;
}

export interface GrantTalentRaw {
    name?: string;
    uuid?: string;
    specialization?: string;
}

export interface GrantTraitRaw {
    name?: string;
    uuid?: string;
}

export interface GrantChoiceRaw {
    label?: string;
    name?: string;
    type?: string;
    count?: number;
    options?: Array<{ value?: string; name?: string; label?: string; grants?: WH40KItemModifiers }>;
}

export interface GrantEquipmentRaw {
    name?: string;
    uuid?: string;
    quantity?: number;
}

/**
 * Single entry in the preview summary's skill / talent / trait lists.
 * Fields beyond `name` are optional because preview is a flatten of multiple
 * grant sources and not every source carries every field.
 */
export interface PreviewGrantEntry {
    name?: string | null;
    uuid?: string | null;
    specialization?: string | null;
    level?: string;
    advance?: number;
    tooltip?: string;
    source?: string;
    fromChoice?: boolean;
    tooltipData?: string;
}

/**
 * Single equipment entry shown in the preview summary.
 */
export interface PreviewEquipmentEntry {
    name: string;
}

/**
 * Aggregated preview returned by OriginPathBuilder._calculatePreview.
 */
export interface PreviewSummary {
    characteristics: Array<{ key: string; short: string; value: number }>;
    skills: PreviewGrantEntry[];
    talents: PreviewGrantEntry[];
    traits: PreviewGrantEntry[];
    aptitudes: string[];
    equipment: PreviewEquipmentEntry[];
    wounds: number | null;
    fate: number | null;
}
