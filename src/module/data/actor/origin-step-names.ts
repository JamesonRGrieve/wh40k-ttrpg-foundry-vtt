/**
 * Pure helper: derive an actor's `originPath` step→name map from its owned
 * origin-path items (#243).
 *
 * Characters store this in a schema field written during data prep; NPCs had a
 * stub that returned all-empty, so their origin-path bubbles, header rows, and
 * `originPathComplete` flag never reflected the origins actually on the NPC.
 * This computes the same step→name mapping from the owned `originPath` items so
 * NPCs (and any actor) can share one source of truth.
 *
 * Foundry-free so it is unit-testable; callers pass the actor's item collection.
 */

/**
 * Origin-path step keys across all seven systems. Matches the `originPath`
 * object shape so every key is always present (unfilled steps are `''`).
 */
export const ORIGIN_STEP_KEYS = [
    // RT / shared
    'homeWorld',
    'birthright',
    'lureOfTheVoid',
    'trialsAndTravails',
    'motivation',
    'career',
    // DH2e
    'background',
    'role',
    'elite',
    'divination',
    // BC
    'race',
    'archetype',
    'pride',
    'disgrace',
    // OW / DW
    'regiment',
    'speciality',
    'chapter',
] as const;

/**
 * Origin steps stored as free text on the actor rather than derived from a
 * backing origin-path item. Divination is the DH2 Emperor's Tarot quote: the
 * player rolls (or types) a phrase saved straight to
 * `system.originPath.divination`, so there is no owned `originPath` item from
 * which {@link mapOriginStepNames} could resolve a name. Such steps must survive
 * data prep — the item-derived map seeds them to `''`, which would otherwise
 * clobber the stored quote (the #272 regression that blanked the italic
 * divination line under the character-sheet portrait).
 */
export const FREE_TEXT_ORIGIN_STEPS = ['divination'] as const;

/**
 * Restore free-text origin steps ({@link FREE_TEXT_ORIGIN_STEPS}) into a resolved
 * step→name map when no owned item produced a name for them, so the actor's
 * stored value (e.g. the divination quote) is preserved instead of being
 * overwritten with `''`. Mutates and returns `resolved`. An item-derived name
 * already present (non-empty) is left untouched.
 */
export function preserveFreeTextStepNames(
    resolved: Record<string, string>,
    prior: Partial<Record<(typeof FREE_TEXT_ORIGIN_STEPS)[number], string>>,
): Record<string, string> {
    for (const key of FREE_TEXT_ORIGIN_STEPS) {
        const stored = prior[key];
        if (resolved[key] === '' && typeof stored === 'string' && stored !== '') {
            resolved[key] = stored;
        }
    }
    return resolved;
}

/** Minimal shape of an owned item this helper reads. */
export interface OriginItemLike {
    type?: string;
    name?: string | null;
    system?: { step?: string | null } | null;
}

/**
 * Build a `{ step: name }` record from owned items. Every {@link ORIGIN_STEP_KEYS}
 * key is present; a step with no matching `originPath` item is `''`. Items whose
 * `type` is not `originPath`, or whose `step` isn't a known key, are ignored.
 */
export function mapOriginStepNames(items: Iterable<OriginItemLike>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const key of ORIGIN_STEP_KEYS) out[key] = '';
    for (const item of items) {
        if (item.type !== 'originPath') continue;
        const step = item.system?.step;
        if (typeof step === 'string' && step in out) out[step] = item.name ?? '';
    }
    return out;
}
