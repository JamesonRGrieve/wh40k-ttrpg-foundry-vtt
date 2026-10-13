/**
 * @file Localized text for area attacks (#599, #600): the card's statement of the
 * area's mechanic and the per-target result rows. The phrase selection and scoring are
 * pure (`rules/area-template.ts`); this module only runs them through the langpack.
 */

import { t } from '../i18n/t.ts';
import { AVOIDANCE_TEST_LABEL_KEYS, type AreaTargetResult, type AreaTemplateSpec, areaShapeLabelKey, areaStatementPhrases } from '../rules/area-template.ts';

/** The quality's display label as the weapon carries it (`Spray`, `Blast (3)`). */
export function areaQualityLabel(spec: AreaTemplateSpec): string {
    return CONFIG.wh40k.getQualityLabel(spec.qualityId, spec.level);
}

/** "Spray: no attack roll. Targets in the cone test Agility (+0)." */
export function localizeAreaStatement(spec: AreaTemplateSpec, noAttackRoll: boolean): string {
    const phrases = areaStatementPhrases(spec, noAttackRoll, {
        quality: areaQualityLabel(spec),
        area: t(areaShapeLabelKey(spec.shape)),
        test: t(AVOIDANCE_TEST_LABEL_KEYS.agility),
    });
    return phrases.map((phrase) => t(phrase.key, phrase.params)).join(' ');
}

/** One provenance row of an avoidance test as the card renders it. */
export interface AreaComponentRow {
    label: string;
    value: number;
    /** JSON payload for the shared wh40k-tooltip "modifier" type. */
    tooltipData: string;
}

/** One caught creature as the card renders it. */
export interface AreaResultRow {
    name: string;
    hit: boolean;
    outcomeLabel: string;
    test: { label: string; base: number; roll: number; target: number; components: AreaComponentRow[] } | null;
}

/** The per-target rows for the resolution card, localized. */
export function areaResultRows(results: readonly AreaTargetResult[]): AreaResultRow[] {
    return results.map((result) => ({
        name: result.name,
        hit: result.hit,
        outcomeLabel: t(result.hit ? 'WH40K.AreaAttack.Outcome.Hit' : 'WH40K.AreaAttack.Outcome.Avoided'),
        test:
            result.test === null
                ? null
                : {
                      label: t('WH40K.AreaAttack.TestLabel', { test: t(AVOIDANCE_TEST_LABEL_KEYS[result.test.skill]) }),
                      base: result.test.base,
                      roll: result.test.roll,
                      target: result.test.target,
                      components: result.test.components.map((component) => {
                          const label = t(component.label);
                          return { label, value: component.value, tooltipData: JSON.stringify({ source: component.source, label, value: component.value }) };
                      }),
                  },
    }));
}
