/**
 * @file difficulty-presets - the roll-difficulty ladder for the roll dialogs.
 *
 * The key → modifier ladder is the canonical `WH40K.difficulties` CONFIG map;
 * this module joins it with the per-key presentation (icon, description, display
 * label) that the difficulty pickers render. Both the unified roll dialog and
 * the enhanced skill dialog derive their ladder from here so a CONFIG rebalance
 * (or a new difficulty band) flows through to both — see issue #336.
 */

import { WH40K } from '../config.ts';
import type { I18nKey } from '../types/i18n-keys';

/** A fully-resolved difficulty band as consumed by the picker templates. */
export interface DifficultyPreset {
    key: string;
    modifier: number;
    /** Localized band name (from the CONFIG label key). */
    label: string;
    icon: string;
    /** Localized tooltip prose. */
    description: string;
    /** True for the baseline (Challenging / +0) band the dialogs select first. */
    default?: boolean;
}

/** Per-key picker presentation: icon + tooltip langpack key, keyed by the same keys as `WH40K.difficulties`. */
interface DifficultyPresentation {
    icon: string;
    descriptionKey: I18nKey;
}

const DIFFICULTY_PRESENTATION: Record<string, DifficultyPresentation> = {
    trivial: { icon: 'fa-smile', descriptionKey: 'WH40K.Difficulty.Description.Trivial' },
    elementary: { icon: 'fa-smile-beam', descriptionKey: 'WH40K.Difficulty.Description.Elementary' },
    simple: { icon: 'fa-grin-beam', descriptionKey: 'WH40K.Difficulty.Description.Simple' },
    easy: { icon: 'fa-grin', descriptionKey: 'WH40K.Difficulty.Description.Easy' },
    routine: { icon: 'fa-meh', descriptionKey: 'WH40K.Difficulty.Description.Routine' },
    ordinary: { icon: 'fa-smile-beam', descriptionKey: 'WH40K.Difficulty.Description.Ordinary' },
    challenging: { icon: 'fa-grimace', descriptionKey: 'WH40K.Difficulty.Description.Challenging' },
    difficult: { icon: 'fa-frown', descriptionKey: 'WH40K.Difficulty.Description.Difficult' },
    hard: { icon: 'fa-dizzy', descriptionKey: 'WH40K.Difficulty.Description.Hard' },
    veryHard: { icon: 'fa-tired', descriptionKey: 'WH40K.Difficulty.Description.VeryHard' },
    arduous: { icon: 'fa-sad-tear', descriptionKey: 'WH40K.Difficulty.Description.Arduous' },
    punishing: { icon: 'fa-sad-cry', descriptionKey: 'WH40K.Difficulty.Description.Punishing' },
    hellish: { icon: 'fa-skull', descriptionKey: 'WH40K.Difficulty.Description.Hellish' },
};

/** The CONFIG key whose band is the dialogs' first-selected (baseline) preset. */
const DEFAULT_DIFFICULTY_KEY = 'challenging';

/** Icon for a CONFIG band with no presentation entry above (keeps a new band renderable before it is authored). */
const FALLBACK_ICON = 'fa-question';

/**
 * Build the difficulty ladder by joining the canonical `WH40K.difficulties`
 * key → label/modifier map with the presentation table. CONFIG insertion order
 * (trivial … hellish) is preserved.
 */
export function buildDifficultyPresets(): DifficultyPreset[] {
    return Object.entries(WH40K.difficulties).map(([key, { label, modifier }]) => {
        const presentation = Object.entries(DIFFICULTY_PRESENTATION).find(([presentationKey]) => presentationKey === key)?.[1];
        const preset: DifficultyPreset = {
            key,
            modifier,
            label: game.i18n.localize(label),
            icon: presentation?.icon ?? FALLBACK_ICON,
            description: presentation === undefined ? '' : game.i18n.localize(presentation.descriptionKey),
        };
        if (key === DEFAULT_DIFFICULTY_KEY) preset.default = true;
        return preset;
    });
}
