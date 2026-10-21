/**
 * Shared origin-path step labelling.
 *
 * `CharacterData._getStepLabel`, `OriginPathData.stepLabel` and the origin-path
 * sheet's step select all resolve through {@link originStepLabel}, which reads the
 * `WH40K.OriginPath.<Step>` langpack entry (the superset of all seven lines'
 * steps lives there). It sits in rules/, which the data models and the sheets may
 * both import; the sheets may not reach into data/ (#690).
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
