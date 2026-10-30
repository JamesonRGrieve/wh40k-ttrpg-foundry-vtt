/**
 * Story globals for code that resolves characteristic labels through
 * `src/module/helpers/characteristic-labels.ts`. In Foundry that helper reads
 * `CONFIG.wh40k.characteristics` and `game.i18n`; a story has neither, so this
 * installs both, built from the canonical characteristic table and the en
 * langpack. Each story loads in its own page, so the globals never leak into
 * another story.
 */
import { CHARACTERISTICS } from '../../src/module/data/shared/characteristics.ts';
import { localizeKey } from './lang-localize';

/** The slice of Foundry's globals the label helper reads. */
interface CharacteristicLabelGlobals {
    CONFIG: { wh40k: { characteristics: Record<string, { label: string; abbreviation: string }> } };
    game: { i18n: { localize: (key: string) => string } };
}

/** Install `CONFIG.wh40k.characteristics` and `game.i18n.localize` for a story. */
export function installStoryCharacteristicLabels(): void {
    const globals: CharacteristicLabelGlobals = {
        CONFIG: { wh40k: { characteristics: Object.fromEntries(CHARACTERISTICS.map((c) => [c.key, { label: c.label, abbreviation: c.short }])) } },
        game: { i18n: { localize: localizeKey } },
    };
    Object.assign(globalThis, globals);
}
