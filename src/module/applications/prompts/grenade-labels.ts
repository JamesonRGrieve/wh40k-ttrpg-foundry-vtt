/**
 * @file The live labels the grenade views read (#135, #622): the langpack through `t()`
 * and the characteristic names. The views themselves stay pure and take these injected,
 * so their stories and tests pass their own.
 */

import { characteristicLabel } from '../../helpers/characteristic-labels.ts';
import { t } from '../../i18n/t.ts';
import type { GrenadeLabels } from './grenade-throw-view.ts';

/** The langpack and the characteristic names, as the grenade dialog and the chat cards read them. */
export const GRENADE_LABELS: GrenadeLabels = {
    localize: t,
    characteristic: characteristicLabel,
    // Read when a label is built, so a language change after load still picks the right plural.
    get lang(): string {
        return game.i18n.lang;
    },
};
