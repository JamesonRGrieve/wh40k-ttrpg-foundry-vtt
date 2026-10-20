/**
 * Shared origin-path step labelling.
 *
 * The step-key → display-label lookup was duplicated between
 * `CharacterData._getStepLabel` and `OriginPathData.stepLabel`. Both now
 * resolve through {@link originStepLabel}, which reads the
 * `WH40K.OriginPath.<Step>` langpack entry (the superset of all 7 systems'
 * steps lives there).
 */

/** The langpack key of an origin-path step's label, `WH40K.OriginPath.<Capitalized>`; '' for no step. */
export function originStepLabelKey(step: string): string {
    return step === '' ? '' : `WH40K.OriginPath.${step.charAt(0).toUpperCase()}${step.slice(1)}`;
}

/**
 * Localized label for an origin-path step ({@link originStepLabelKey}), falling
 * back to the raw step key when the langpack has no entry.
 */
export function originStepLabel(step: string): string {
    const localizationKey = originStepLabelKey(step);
    if (localizationKey !== '' && game.i18n.has(localizationKey)) {
        return game.i18n.localize(localizationKey);
    }
    return step || '';
}
