/**
 * Regression guard (#15): the player Overview is a TWO-column dashboard, not
 * three. The old three-column grid stretched Favourites/Progression with an
 * empty centre while cramming the Resources panel into the wide third column.
 *
 * The fix drops the third `1fr` track (both columns capped at 360px so the grid
 * does not sprawl) and relocates the Resources panel into column 2, under
 * Progression. Column 3 was emptied by #318 (Equipped Weapons & Armour removed)
 * and #317 (Subtlety relocated under Insanity in column 1).
 *
 * Source-scan rather than runtime: rendering the tab requires Foundry's sheet
 * context, and the contract here is a literal one on the grid track + panel order.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const TEMPLATE = resolve(__dirname, '../src/templates/actor/player/tab-overview.hbs');
const src = readFileSync(TEMPLATE, 'utf8');

describe('overview two-column layout (#15)', () => {
    it('uses a two-column grid (both capped), not a three-column grid with a stretching 1fr track', () => {
        expect(src).toContain('tw-grid-cols-[minmax(280px,360px)_minmax(280px,360px)] tw-grid-rows-[auto_auto]');
        // The third stretching column is gone.
        expect(src).not.toContain('minmax(280px,360px)_1fr');
        expect(src).not.toContain('COLUMN 3');
    });

    it('relocates the Resources panel into column 2, after Progression', () => {
        const col2 = src.indexOf('COLUMN 2');
        const progression = src.indexOf('Progression — Rank');
        const resources = src.indexOf('Resources (Influence');
        expect(col2, 'column 2 marker present').toBeGreaterThan(-1);
        expect(progression, 'progression panel present').toBeGreaterThan(col2);
        // Resources now sits below Progression within column 2 (no separate column 3).
        expect(resources, 'resources panel present').toBeGreaterThan(progression);
    });
});
