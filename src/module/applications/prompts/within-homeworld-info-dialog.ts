/**
 * @file WithinHomeworldInfoDialog — GM-only reference card grid for
 * the three new homeworld traits introduced by the Within supplement
 * (within.md L632-808): Agri World, Feudal World, Frontier World.
 *
 * This is a read-only surface: it displays each homeworld's
 * characteristic modifiers, fate threshold (with Emperor's Blessing
 * breakpoint), home-world bonus rules text, key aptitude(s), and
 * starting wounds expression. No actor mutation, no chat card —
 * application of a homeworld to a fresh character lives in its own
 * flow (the registry in `within-homeworlds.ts` is the data source).
 *
 * Built from the shared info-card-dialog factory (#287), matching the
 * Without / Beyond homeworld info dialogs.
 *
 * See GitHub issue #139.
 */

import { characteristicLabel, formatCharacteristicMods, formatWounds } from '../../helpers/characteristic-labels.ts';
import { WITHIN_HOMEWORLDS, WITHIN_HOMEWORLD_IDS, type WithinHomeworldDef, type WithinHomeworldId } from '../../rules/within-homeworlds.ts';
import { defineInfoCardDialog } from './define-info-card-dialog.ts';

/** i18n label keys for each homeworld id. */
const HOMEWORLD_LABEL_KEYS: Record<WithinHomeworldId, string> = {
    agriWorld: 'WH40K.WithinHomeworld.AgriWorld',
    feudalWorld: 'WH40K.WithinHomeworld.FeudalWorld',
    frontierWorld: 'WH40K.WithinHomeworld.FrontierWorld',
};

/**
 * Accent palette per homeworld — drives the card border / accent
 * color so each Within homeworld reads distinctly at a glance.
 *
 *   - Agri    → wheat / amber  (golden harvest fields)
 *   - Feudal  → emerald        (knightly heraldry / verdant fiefdoms)
 *   - Frontier → desert / tan   (arid borderworlds)
 */
interface AccentClasses {
    readonly border: string;
    readonly accentText: string;
    readonly accentBg: string;
}

const HOMEWORLD_ACCENTS: Record<WithinHomeworldId, AccentClasses> = {
    agriWorld: {
        border: 'tw-border-amber-600',
        accentText: 'tw-text-amber-300',
        accentBg: 'tw-bg-amber-900/30',
    },
    feudalWorld: {
        border: 'tw-border-emerald-600',
        accentText: 'tw-text-emerald-300',
        accentBg: 'tw-bg-emerald-900/30',
    },
    frontierWorld: {
        border: 'tw-border-yellow-700',
        accentText: 'tw-text-yellow-200',
        accentBg: 'tw-bg-yellow-900/30',
    },
};

/** Card view-model — one entry per homeworld rendered in the grid. */
interface HomeworldCard {
    id: WithinHomeworldId;
    labelKey: string;
    label: string;
    bonusName: string;
    bonusDescription: string;
    characteristicModsLabel: string;
    fateThresholdLabel: string;
    woundsLabel: string;
    keyAptitudes: readonly string[];
    accent: AccentClasses;
}

function localize(key: string): string {
    return game.i18n.localize(key);
}

function formatFateThreshold(def: WithinHomeworldDef): string {
    return `${String(def.fateThreshold.base)} (${def.fateThreshold.emperorsBlessingMin.toString()}+)`;
}

/** Build the per-homeworld card view-models injected under `cards` each render. */
function buildWithinCards(): HomeworldCard[] {
    return WITHIN_HOMEWORLD_IDS.map((id) => {
        const def = WITHIN_HOMEWORLDS[id];
        return {
            id,
            labelKey: HOMEWORLD_LABEL_KEYS[id],
            label: localize(HOMEWORLD_LABEL_KEYS[id]),
            bonusName: def.homeWorldBonus.name,
            bonusDescription: def.homeWorldBonus.description,
            characteristicModsLabel: formatCharacteristicMods(def.characteristicMods.positive, def.characteristicMods.negative),
            fateThresholdLabel: formatFateThreshold(def),
            woundsLabel: formatWounds(def.wounds.flat, def.wounds.dice, def.wounds.faces),
            keyAptitudes: def.keyAptitudes.map((c) => characteristicLabel(c)),
            accent: HOMEWORLD_ACCENTS[id],
        };
    });
}

/**
 * GM-only reference dialog: three Tailwind-styled homeworld cards, themed in
 * distinct palettes so the set reads at a glance. Read-only; built from the
 * shared info-card-dialog factory (#287).
 */
const WithinHomeworldInfoDialog = defineInfoCardDialog({
    id: 'within-homeworld-info-dialog',
    titleKey: 'WH40K.WithinHomeworld.DialogTitle',
    template: 'systems/wh40k-rpg/templates/prompt/within-homeworld-info-dialog.hbs',
    contextKey: 'cards',
    extraClasses: ['standard-form'],
    cards: buildWithinCards,
});
export default WithinHomeworldInfoDialog;

/** Convenience opener for the dialog. */
export function openWithinHomeworldInfoDialog(): void {
    void new WithinHomeworldInfoDialog().render({ force: true });
}
