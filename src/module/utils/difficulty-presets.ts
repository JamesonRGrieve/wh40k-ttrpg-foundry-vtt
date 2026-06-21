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

/** Presentation metadata for one difficulty band — icon + tooltip + the
 * display label. The label is kept here (rather than localized from the CONFIG
 * label key) because not every band has a langpack entry yet, and these strings
 * match the historical hardcoded picker labels exactly. */
interface DifficultyPresentation {
    label: string;
    icon: string;
    description: string;
}

/** A fully-resolved difficulty band as consumed by the picker templates. */
export interface DifficultyPreset extends DifficultyPresentation {
    key: string;
    modifier: number;
    /** True for the baseline (Challenging / +0) band the dialogs select first. */
    default?: boolean;
}

/** Per-key presentation, keyed by the same keys as `WH40K.difficulties`. */
const DIFFICULTY_PRESENTATION: Record<string, DifficultyPresentation> = {
    trivial: { label: 'Trivial', icon: 'fa-smile', description: 'Automatic success unless complications' },
    elementary: { label: 'Elementary', icon: 'fa-smile-beam', description: 'Almost trivial with minor effort' },
    simple: { label: 'Simple', icon: 'fa-grin-beam', description: 'Easy tasks under no pressure' },
    easy: { label: 'Easy', icon: 'fa-grin', description: 'Simple tasks with no pressure' },
    routine: { label: 'Routine', icon: 'fa-meh', description: 'Standard tasks with time' },
    ordinary: { label: 'Ordinary', icon: 'fa-smile-beam', description: 'Typical difficulty' },
    challenging: { label: 'Challenging', icon: 'fa-grimace', description: 'No modifier (baseline)' },
    difficult: { label: 'Difficult', icon: 'fa-frown', description: 'Complex or contested tasks' },
    hard: { label: 'Hard', icon: 'fa-dizzy', description: 'Very challenging circumstances' },
    veryHard: { label: 'Very Hard', icon: 'fa-tired', description: 'Exceptional difficulty' },
    arduous: { label: 'Arduous', icon: 'fa-sad-tear', description: 'Punishing odds against success' },
    punishing: { label: 'Punishing', icon: 'fa-sad-cry', description: 'Verging on impossible' },
    hellish: { label: 'Hellish', icon: 'fa-skull', description: 'Near-impossible feats' },
};

/** The CONFIG key whose band is the dialogs' first-selected (baseline) preset. */
const DEFAULT_DIFFICULTY_KEY = 'challenging';

/** Fallback presentation for a CONFIG band with no entry above (keeps a new
 * difficulty band renderable even before its presentation is authored). */
const FALLBACK_PRESENTATION: DifficultyPresentation = { label: '', icon: 'fa-question', description: '' };

/**
 * Build the difficulty ladder by joining the canonical `WH40K.difficulties`
 * key → modifier map with the presentation table. CONFIG insertion order
 * (trivial … hellish) is preserved.
 */
export function buildDifficultyPresets(): DifficultyPreset[] {
    return Object.entries(WH40K.difficulties).map(([key, { modifier }]) => {
        const presentation = DIFFICULTY_PRESENTATION[key] ?? { ...FALLBACK_PRESENTATION, label: key };
        const preset: DifficultyPreset = { key, modifier, ...presentation };
        if (key === DEFAULT_DIFFICULTY_KEY) preset.default = true;
        return preset;
    });
}
