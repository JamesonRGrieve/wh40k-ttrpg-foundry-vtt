/**
 * @file Card view-models for the home-world GM reference dialog.
 *
 * Pure projection of {@link HomeworldGroup}s (read from a line's home-world
 * packs) into what the template renders. Every value comes from the pack
 * documents; the only thing this module adds is display: formatted labels and
 * an accent palette assigned by position, so any number of home-worlds reads
 * distinctly at a glance without a per-world registry.
 */

import { formatCharacteristicMods, formatWounds } from '../../helpers/characteristic-labels.ts';
import type { HomeworldAbility, HomeworldGroup, HomeworldMechanics } from '../../rules/homeworld-compendium.ts';

/** The Tailwind classes one card's accent uses. */
export interface HomeworldAccent {
    readonly border: string;
    readonly accentText: string;
    readonly accentBg: string;
}

/** The palette cards cycle through, in order. */
export const HOMEWORLD_ACCENTS: readonly HomeworldAccent[] = [
    { border: 'tw-border-amber-600', accentText: 'tw-text-amber-300', accentBg: 'tw-bg-amber-900/30' },
    { border: 'tw-border-emerald-600', accentText: 'tw-text-emerald-300', accentBg: 'tw-bg-emerald-900/30' },
    { border: 'tw-border-yellow-700', accentText: 'tw-text-yellow-200', accentBg: 'tw-bg-yellow-900/30' },
    { border: 'tw-border-red-700', accentText: 'tw-text-red-300', accentBg: 'tw-bg-red-900/30' },
    { border: 'tw-border-slate-400', accentText: 'tw-text-slate-300', accentBg: 'tw-bg-slate-800/40' },
    { border: 'tw-border-sky-600', accentText: 'tw-text-sky-300', accentBg: 'tw-bg-sky-900/30' },
];

/** One home-world card. */
interface HomeworldCard {
    readonly id: string;
    readonly label: string;
    readonly characteristicModsLabel: string;
    /** `N (M+)` — the Fate threshold and the Emperor's Blessing face; '' when the document grants no Fate. */
    readonly fateLabel: string;
    readonly woundsLabel: string;
    readonly aptitudes: readonly string[];
    readonly abilities: readonly HomeworldAbility[];
    readonly accent: HomeworldAccent;
}

/** One pack's cards, under the pack's label. */
export interface HomeworldCardGroup {
    readonly label: string;
    readonly cards: readonly HomeworldCard[];
}

/** The accent at `index`, cycling the palette. */
function accentAt(index: number): HomeworldAccent {
    // `.at()` is typed `T | undefined` under both tsconfigs; the palette is non-empty, so the fallback never applies.
    return HOMEWORLD_ACCENTS.at(index % HOMEWORLD_ACCENTS.length) ?? { border: '', accentText: '', accentBg: '' };
}

function fateLabel(mechanics: HomeworldMechanics): string {
    if (mechanics.fateBase === 0) return '';
    return mechanics.emperorsBlessingMin > 0 ? `${mechanics.fateBase} (${mechanics.emperorsBlessingMin}+)` : String(mechanics.fateBase);
}

/** Project the read groups into cards, accents running on across groups so neighbours never match. */
export function homeworldCardGroups(groups: readonly HomeworldGroup[]): HomeworldCardGroup[] {
    let index = 0;
    return groups.map((group) => ({
        label: group.label,
        cards: group.homeworlds.map((mechanics) => ({
            id: mechanics.id,
            label: mechanics.label,
            characteristicModsLabel: formatCharacteristicMods(mechanics.charModsPositive, mechanics.charModsNegative),
            fateLabel: fateLabel(mechanics),
            woundsLabel: formatWounds(mechanics.woundsFlat, mechanics.woundsDice, mechanics.woundsFaces),
            aptitudes: mechanics.aptitudes,
            abilities: mechanics.abilities,
            accent: accentAt(index++),
        })),
    }));
}
