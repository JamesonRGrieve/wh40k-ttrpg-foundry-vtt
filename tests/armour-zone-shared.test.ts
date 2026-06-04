/**
 * Regression guard (#234): the Overview Armour layout is reused on the Combat
 * tab. Both tabs now render the shared `armour-zone.hbs` (a dashboard-zone
 * wrapping the armour silhouette); the old combat-only `armour-display-panel.hbs`
 * (panel.hbs wrapper) is gone, so the two tabs can't drift apart again.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readRepoFile } from './lib/repo-file.ts';

const OVERVIEW = readRepoFile('src/templates/actor/player/tab-overview.hbs');
const COMBAT = readRepoFile('src/templates/actor/panel/combat-station-panel.hbs');
const PRELOAD = readRepoFile('src/module/handlebars/handlebars-manager.ts');

describe('shared armour-zone (#234)', () => {
    it('ships the shared armour-zone partial and preloads it', () => {
        expect(existsSync(resolve(__dirname, '../src/templates/actor/partial/armour-zone.hbs'))).toBe(true);
        expect(PRELOAD).toContain('armour-zone.hbs');
    });

    it('renders armour-zone on both the Overview and Combat tabs', () => {
        expect(OVERVIEW).toContain('armour-zone.hbs');
        expect(COMBAT).toContain('armour-zone.hbs');
    });

    it('removes the old combat-only armour-display-panel', () => {
        expect(existsSync(resolve(__dirname, '../src/templates/actor/panel/armour-display-panel.hbs'))).toBe(false);
        expect(COMBAT).not.toContain('armour-display-panel');
        expect(PRELOAD).not.toContain('armour-display-panel');
    });
});
