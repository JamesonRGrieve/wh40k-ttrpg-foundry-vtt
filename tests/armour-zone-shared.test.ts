/**
 * Regression guard (#234 / #318 / #486): the armour silhouette renders through the
 * shared `armour-zone.hbs`; the old combat-only `armour-display-panel.hbs` is gone.
 * As of #318 the Armour panel was removed from the Overview tab entirely, so
 * armour-zone now renders on the Combat tab only. As of #486 it wraps in the
 * standard `.wh40k-panel` chrome (matching its Force Field / Weapons siblings)
 * rather than the lighter `dashboard-zone` treatment it briefly carried.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readRepoFile } from './lib/repo-file.ts';

const OVERVIEW = readRepoFile('src/templates/actor/player/tab-overview.hbs');
const COMBAT = readRepoFile('src/templates/actor/panel/combat-station-panel.hbs');
const PRELOAD = readRepoFile('src/module/handlebars/handlebars-manager.ts');
const ARMOUR_ZONE = readRepoFile('src/templates/actor/partial/armour-zone.hbs');

describe('shared armour-zone (#234)', () => {
    it('ships the shared armour-zone partial and preloads it', () => {
        expect(existsSync(resolve(__dirname, '../src/templates/actor/partial/armour-zone.hbs'))).toBe(true);
        expect(PRELOAD).toContain('armour-zone.hbs');
    });

    it('renders armour-zone on the Combat tab; removed from the Overview (#318)', () => {
        expect(COMBAT).toContain('armour-zone.hbs');
        // #318 removed the Armour panel from the Overview tab.
        expect(OVERVIEW).not.toContain('armour-zone.hbs');
    });

    it('removes the old combat-only armour-display-panel', () => {
        expect(existsSync(resolve(__dirname, '../src/templates/actor/panel/armour-display-panel.hbs'))).toBe(false);
        expect(COMBAT).not.toContain('armour-display-panel');
        expect(PRELOAD).not.toContain('armour-display-panel');
    });

    it('wraps the armour zone in the standard .wh40k-panel chrome, not dashboard-zone (#486)', () => {
        // Armour must read as one family with its Force Field / Weapons siblings on
        // the Combat tab. Pin the panel chrome so it cannot silently revert to the
        // lighter dashboard-zone treatment.
        expect(ARMOUR_ZONE).toContain('wh40k-panel-header');
        expect(ARMOUR_ZONE).toContain('wh40k-panel-body');
        // Must not INCLUDE the dashboard-zone partial (a passing mention in a
        // comment is fine — assert on the partial-include path, not the word).
        expect(ARMOUR_ZONE).not.toContain('partial/dashboard-zone');
    });
});
