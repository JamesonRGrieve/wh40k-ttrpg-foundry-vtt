/**
 * Shared origin-path step labelling.
 *
 * The step-key → display-label lookup was duplicated between
 * `CharacterData._getStepLabel` and `OriginPathData.stepLabel`. Both now
 * resolve through {@link originStepLabel}, which reads the
 * `WH40K.OriginPath.<Step>` langpack entry (the superset of all 7 systems'
 * steps lives there).
 */

/**
 * Localized label for an origin-path step: `WH40K.OriginPath.<Capitalized>`,
 * falling back to the raw step key when the langpack has no entry.
 */
export function originStepLabel(step: string): string {
    const key = step ? step.charAt(0).toUpperCase() + step.slice(1) : '';
    const localizationKey = key !== '' ? `WH40K.OriginPath.${key}` : '';
    if (localizationKey !== '' && game.i18n.has(localizationKey)) {
        return game.i18n.localize(localizationKey);
    }
    return step || '';
}
