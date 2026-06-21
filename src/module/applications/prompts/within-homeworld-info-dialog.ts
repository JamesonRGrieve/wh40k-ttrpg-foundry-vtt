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
 * flow.
 *
 * Per Direction #7 (#338), the mechanical VALUES are read from the
 * compendium pack `dh2-within-origins-homeworlds` (each home-world is
 * an `originPath` document) via {@link readHomeworldMechanics}; the
 * Within supplement carries no supplement-specific riders, so this
 * dialog holds only DISPLAY config (the per-id label key + accent
 * palette) and the pack id.
 *
 * Built from the shared info-card-dialog factory (#287), matching the
 * Without / Beyond homeworld info dialogs.
 *
 * See GitHub issue #139.
 */

import { formatCharacteristicMods, formatWounds } from '../../helpers/characteristic-labels.ts';
import { readHomeworldMechanics, type HomeworldMechanics } from '../../rules/homeworld-compendium.ts';
import { defineInfoCardDialog } from './define-info-card-dialog.ts';

/** Fully-qualified compendium pack id holding the Within home-world `originPath` documents. */
const WITHIN_HOMEWORLD_PACK = 'wh40k-rpg.dh2-within-origins-homeworlds';

/** Compendium `system.identifier` values, in supplement (chapter) order. */
const WITHIN_HOMEWORLD_IDS = ['agri-world', 'feudal-world', 'frontier-world'] as const;
type WithinHomeworldId = (typeof WITHIN_HOMEWORLD_IDS)[number];

/** i18n label keys per home-world (keyed by compendium identifier). */
const HOMEWORLD_LABEL_KEYS: Record<WithinHomeworldId, string> = {
    'agri-world': 'WH40K.WithinHomeworld.AgriWorld',
    'feudal-world': 'WH40K.WithinHomeworld.FeudalWorld',
    'frontier-world': 'WH40K.WithinHomeworld.FrontierWorld',
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
    'agri-world': {
        border: 'tw-border-amber-600',
        accentText: 'tw-text-amber-300',
        accentBg: 'tw-bg-amber-900/30',
    },
    'feudal-world': {
        border: 'tw-border-emerald-600',
        accentText: 'tw-text-emerald-300',
        accentBg: 'tw-bg-emerald-900/30',
    },
    'frontier-world': {
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

function formatFateThreshold(mechanics: HomeworldMechanics): string {
    return `${String(mechanics.fateBase)} (${mechanics.emperorsBlessingMin.toString()}+)`;
}

/**
 * Build the per-homeworld card view-models injected under `cards` each
 * render, reading all mechanical values from the compendium. Unknown ids
 * (a pack missing a document) are skipped.
 */
async function buildWithinCards(): Promise<HomeworldCard[]> {
    const mechanicsById = await readHomeworldMechanics(WITHIN_HOMEWORLD_PACK);
    const cards: HomeworldCard[] = [];
    for (const id of WITHIN_HOMEWORLD_IDS) {
        const mechanics = mechanicsById.get(id);
        if (mechanics === undefined) continue;
        cards.push({
            id,
            labelKey: HOMEWORLD_LABEL_KEYS[id],
            label: localize(HOMEWORLD_LABEL_KEYS[id]),
            bonusName: mechanics.bonusName,
            bonusDescription: mechanics.bonusDescription,
            characteristicModsLabel: formatCharacteristicMods(mechanics.charModsPositive, mechanics.charModsNegative),
            fateThresholdLabel: formatFateThreshold(mechanics),
            woundsLabel: formatWounds(mechanics.woundsFlat, mechanics.woundsDice, mechanics.woundsFaces),
            keyAptitudes: mechanics.aptitudes,
            accent: HOMEWORLD_ACCENTS[id],
        });
    }
    return cards;
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
