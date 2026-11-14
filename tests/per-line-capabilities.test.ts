/**
 * Guard (#715): per-line rules are declared by the game-system configs, not
 * decided by comparing the line's id in the builder and the character sheet.
 *
 * - `rulesetVariants`: the line has a RAW / homebrew switch. One helper
 *   (`rules/ruleset-variant.ts`) answers "is the homebrew variant active". It
 *   replaces six copies of `gameSystem === 'dh2' && isHomebrew()`.
 * - `creation.directionToggle`: the builder can walk the path backward (RT).
 * - `characterSheet`: the per-line sheet parts the templates gate on.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SystemConfigRegistry } from '../src/module/config/game-systems/index.ts';
import type { CharacterSheetCapabilities } from '../src/module/config/game-systems/types.ts';
import { activeRulesetVariant, isHomebrewVariant } from '../src/module/rules/ruleset-variant.ts';
import { WH40KSettings } from '../src/module/wh40k-rpg-settings.ts';
import { readRepoFile } from './lib/repo-file.ts';

/** The capability flags each line turns on; every other flag is off. */
const SHEET_FLAGS: Record<string, ReadonlyArray<keyof CharacterSheetCapabilities>> = {
    dh1: [],
    dh2: ['influenceResources', 'subtletyPool', 'shockAndPinning', 'daemonologyRituals'],
    rt: [],
    bc: ['blackCrusadePanels'],
    dw: ['deathwatchPanels'],
    ow: ['onlyWarPanels'],
    im: ['imperiumStatBlock'],
};

afterEach(() => {
    vi.restoreAllMocks();
});

describe('per-line capabilities live in the game-system configs (#715)', () => {
    it.each(Object.entries(SHEET_FLAGS))('%s turns on exactly its own sheet parts', (id, on) => {
        const sheet = SystemConfigRegistry.getOrNull(id)?.characterSheet;
        expect(sheet).toBeDefined();
        const enabled = Object.entries(sheet ?? {})
            .filter(([, value]) => value === true)
            .map(([key]) => key)
            .sort();
        expect(enabled).toEqual([...on].sort());
    });

    it('only DH2 has a ruleset variant, and only RT a direction toggle', () => {
        const all = SystemConfigRegistry.getAll();
        expect(all.filter((c) => c.rulesetVariants).map((c) => c.id)).toEqual(['dh2']);
        expect(all.filter((c) => c.creation.directionToggle).map((c) => c.id)).toEqual(['rt']);
    });
});

describe('the homebrew decision has one definition (#715)', () => {
    it('follows the ruleset setting for a line with variants, and is off for a line without', () => {
        vi.spyOn(WH40KSettings, 'getRuleset').mockReturnValue('homebrew');
        expect(isHomebrewVariant('dh2')).toBe(true);
        expect(isHomebrewVariant('rt')).toBe(false);
        expect(activeRulesetVariant('ow')).toBeNull();
        vi.spyOn(WH40KSettings, 'getRuleset').mockReturnValue('raw');
        expect(activeRulesetVariant('dh2')).toBe('raw');
        expect(isHomebrewVariant(null)).toBe(false);
    });

    it.each(['src/module/applications/character-creation/origin-path-builder.ts', 'src/module/applications/actor/character-sheet.ts'])(
        '%s compares no line id and asks the helper, not the setting',
        (path) => {
            const source = readRepoFile(path);
            expect(source).not.toMatch(/(?:gameSystem|GameSystem)\s*[!=]==\s*'(?:dh1|dh2|rt|bc|dw|ow|im)'/);
            expect(source).not.toContain('WH40KSettings.isHomebrew()');
        },
    );

    it('templates gate on capability flags, not on line flags', () => {
        const gated = [
            'src/templates/actor/player/tab-overview.hbs',
            'src/templates/actor/panel/overview-vitals-panel.hbs',
            'src/templates/actor/npc/tab-npc.hbs',
        ].filter((path) => /\{\{#if is(?:DH2|BC|OW|DW|IM)\}\}/.test(readRepoFile(path)));
        expect(gated).toEqual([]);
    });
});
