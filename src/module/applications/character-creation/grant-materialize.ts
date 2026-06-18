/**
 * Shared origin-path grant materialization tail (#306).
 *
 * The "resolve a compendium source → `toObject()`/`deepClone` → strip the source
 * `_id` → stamp grant flags (+ specialization)" step was copied across the
 * equipment and talent appliers in `origin-path-builder.ts`. This extracts that
 * common tail. Per-site specifics deliberately stay at the call site — equipment
 * ammo-clip sizing / auto-clip generation, talent name+specialization dedupe, and
 * freeform content-item authoring are genuinely different and are NOT collapsed
 * into a mode-switched mega-helper.
 *
 * The returned shape is defined locally (a structural subset of the builder's
 * `ItemDataLike`) so this stays a dependency-free leaf — importing the builder's
 * `types.ts` would join the pre-existing `types ↔ global.d.ts ↔ _module` import
 * cycle.
 */

/** Cloned item-data this helper produces — structurally compatible with the builder's ItemDataLike. */
interface GrantItemData {
    _id?: string | null;
    name?: string;
    type?: string;
    img?: string;
    uuid?: string;
    system?: { specialization?: string; quantity?: number };
    flags?: { core?: { sourceId?: string } } & Record<string, { sourceId?: string } | undefined>;
}

/** Which grant flags / fields to stamp onto a cloned item. */
interface GrantStamp {
    /** Compendium source UUID — written to `flags.core.sourceId`. */
    sourceId?: string;
    /** Mark the item as origin-path-granted — sets `flags.wh40k-rpg.originPathGranted`. */
    originPathGranted?: boolean;
    /** Specialization to stamp onto `system.specialization` (talents). */
    specialization?: string | undefined;
}

/**
 * Clone a compendium source document into `createEmbeddedDocuments`-ready item
 * data: prefer `toObject()`, else `deepClone`; strip the source `_id`; stamp the
 * requested grant flags and specialization. The caller owns dedupe and any
 * type-specific follow-up (ammo sizing, etc.).
 */
export function cloneGrantedItemData(source: object, stamp: GrantStamp = {}): GrantItemData {
    const sourceDoc = source as { toObject?: () => GrantItemData };
    const itemData: GrantItemData = sourceDoc.toObject ? sourceDoc.toObject() : foundry.utils.deepClone(source);
    delete itemData._id;

    if (stamp.specialization !== undefined && stamp.specialization !== '') {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- `.system ?? {}` is banned by no-restricted-syntax for DataModel-backed fields; explicit undefined check instead
        const system: { specialization?: string; quantity?: number } = itemData.system === undefined ? {} : itemData.system;
        system.specialization = stamp.specialization;
        itemData.system = system;
    }

    if (stamp.sourceId !== undefined || stamp.originPathGranted === true) {
        const flags: { 'core'?: { sourceId?: string }; 'wh40k-rpg'?: { originPathGranted?: boolean } } & GrantItemData['flags'] = itemData.flags ?? {};
        if (stamp.sourceId !== undefined) {
            const core = flags.core ?? {};
            core.sourceId = stamp.sourceId;
            flags.core = core;
        }
        if (stamp.originPathGranted === true) {
            const wh = flags['wh40k-rpg'] ?? {};
            wh.originPathGranted = true;
            flags['wh40k-rpg'] = wh;
        }
        itemData.flags = flags;
    }

    return itemData;
}
