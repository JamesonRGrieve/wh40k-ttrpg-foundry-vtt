/**
 * Regression guard (#15): the player Overview is a TWO-column dashboard, not
 * three. The old three-column grid stretched Favourites/Progression with an
 * empty centre while cramming the Resources panel into the wide third column.
 *
 * The current fix uses two `minmax(0,1fr)` tracks so BOTH columns grow equally
 * to fill the available sheet width (no fixed cap leaving a dead gutter, and no
 * stretching third column), and relocates the Resources panel into COLUMN 1
 * directly under Active Effects. Column 1 stack: Vitals → Active Effects →
 * Resources; column 2: Favourite Skills → Favourite Talents → Progression.
 * Subtlety lives in its own full-width Party Overview section below the grid (#317).
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
    it('uses two grow-to-fill columns (minmax(0,1fr) tracks), not capped columns or a stretching third', () => {
        expect(src).toContain('tw-grid-cols-[minmax(0,1fr)_minmax(0,1fr)] tw-grid-rows-[auto_auto]');
        // No fixed 280-360px caps (would leave a dead gutter at wide widths).
        expect(src).not.toContain('minmax(280px,360px)');
        // No stretching third column / column-3 block.
        expect(src).not.toContain('_1fr]');
        expect(src).not.toContain('COLUMN 3');
    });

    it('places the Resources panel in column 1, under Active Effects', () => {
        const col1 = src.indexOf('COLUMN 1');
        const col2 = src.indexOf('COLUMN 2');
        const activeEffects = src.indexOf('title="Active Effects"');
        const resources = src.indexOf('Resources (Influence');
        expect(col1, 'column 1 marker present').toBeGreaterThan(-1);
        expect(activeEffects, 'active effects panel present').toBeGreaterThan(col1);
        // Resources sits after Active Effects but still within column 1 (before column 2).
        expect(resources, 'resources panel present').toBeGreaterThan(activeEffects);
        expect(resources, 'resources is in column 1, before column 2').toBeLessThan(col2);
    });
});
