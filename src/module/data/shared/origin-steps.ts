/**
 * Shared origin-path step labelling.
 *
 * The step-key → display-label map was duplicated between
 * `CharacterData._getStepLabel` (21 entries, no i18n) and
 * `OriginPathData.stepLabel` (8 entries, with i18n fallback). Centralise the
 * superset map + the localization lookup so the two stay in sync and both
 * resolve `WH40K.OriginPath.<Step>` when the langpack defines it.
 */

/** Canonical origin-path step → fallback English label (superset of all 7 systems). */
export const ORIGIN_STEP_LABELS: Record<string, string> = {
    // Rogue Trader
    homeWorld: 'Home World',
    birthright: 'Birthright',
    lureOfTheVoid: 'Lure of the Void',
    trialsAndTravails: 'Trials and Travails',
    motivation: 'Motivation',
    career: 'Career',
    lineage: 'Lineage',
    eliteAdvance: 'Elite Advance',
    // Dark Heresy 2e
    background: 'Background',
    role: 'Role',
    elite: 'Elite Advance',
    divination: 'Divination',
    // Black Crusade
    race: 'Race',
    archetype: 'Archetype',
    pride: 'Pride',
    disgrace: 'Disgrace',
    // Only War / Deathwatch
    regiment: 'Regiment',
    speciality: 'Speciality',
    chapter: 'Chapter',
};

/**
 * Localized label for an origin-path step. Tries
 * `WH40K.OriginPath.<Capitalized>`, falls back to the shared English map,
 * then the raw step key.
 */
export function originStepLabel(step: string): string {
    const key = step ? step.charAt(0).toUpperCase() + step.slice(1) : '';
    const localizationKey = key !== '' ? `WH40K.OriginPath.${key}` : '';
    if (localizationKey !== '' && game.i18n.has(localizationKey)) {
        return game.i18n.localize(localizationKey);
    }
    return ORIGIN_STEP_LABELS[step] || step || '';
}
