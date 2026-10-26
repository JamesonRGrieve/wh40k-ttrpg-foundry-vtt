/**
 * The shared actor sidebar keeps its header reachable above the tab strip (#701
 * items 1 and 23). The header part scrolls; the strip's 44px buttons left it a
 * short window, the header carried no cue that it scrolled, and the craft sheets
 * drew a copy of the strip that had drifted from the shared one.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SIDEBAR_CONTAINER } from '../src/module/applications/actor/sidebar-container.ts';
import { readRepoFile } from './lib/repo-file.ts';

const SHARED_TABS = 'systems/wh40k-rpg/templates/actor/player/tabs.hbs';

describe('shared actor sidebar (#701)', () => {
    it('the header part scrolls and carries a scroll shadow', () => {
        const header = SIDEBAR_CONTAINER.classes.filter((c) => c.startsWith('[&>[data-application-part=header]]:'));
        expect(header).toContain('[&>[data-application-part=header]]:tw-overflow-y-auto');
        expect(header.some((c) => c.includes('no-repeat_local') && c.includes('no-repeat_scroll'))).toBe(true);
    });

    it('the tab strip buttons are compact', () => {
        expect(readRepoFile('src/templates/actor/player/tabs.hbs')).toContain('!tw-leading-tight');
    });

    it('every sidebar sheet draws the one shared tab strip', () => {
        for (const sheet of ['character-sheet', 'voidcraft-sheet', 'craft-sheet']) {
            expect(readRepoFile(`src/module/applications/actor/${sheet}.ts`)).toContain(SHARED_TABS);
        }
        expect(existsSync(resolve(__dirname, '../src/templates/actor/craft/tabs.hbs'))).toBe(false);
    });

    it('an unset hull class reads "Not set", and is an input only in edit mode', () => {
        const header = readRepoFile('src/templates/actor/voidcraft/header.hbs');
        expect(header).toContain('WH40K.Voidcraft.HullClassUnset');
        expect(header).toMatch(/\{\{#if inEditMode\}\}\s*<input[^>]*name="system\.hullClass"[^>]*placeholder=/u);
    });
});
