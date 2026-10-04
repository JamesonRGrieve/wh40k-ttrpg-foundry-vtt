/**
 * Regression guard (#15): the player Overview is a TWO-column dashboard, not
 * three. The old three-column grid stretched Favourites/Progression with an
 * empty centre while cramming the Resources panel into the wide third column.
 *
 * The columns now pack like masonry (a CSS multi-column flow) instead of grid
 * rows: a row grid left a hole under the shorter column whenever a line added
 * its own panels below (OW Regiment / Craftsmanship sat a full row down). The
 * reading order is unchanged: Vitals → Active Effects → Resources, then
 * Favourite Skills → Favourite Talents → Progression, then the line's panels.
 * Subtlety lives in its own full-width Party Overview section below (#317).
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
    it('packs panels as a two-column masonry flow, not row-aligned grid tracks', () => {
        // At most two columns of ≥22rem; each panel is its own unbreakable item.
        // Tailwind's `columns` utility (`columns: 22rem 2`); the arbitrary-property
        // spelling `tw-[columns:…]` is not emitted under the `tw-` prefix.
        expect(src).toContain('tw-columns-[22rem_2]');
        expect(src).toContain('[&>[data-overview-column]>*]:tw-break-inside-avoid');
        // A row grid left a hole under the shorter column whenever a line added
        // panels below it (the OW Regiment panel sat a full row down).
        expect(src).not.toContain('tw-grid-rows-[auto_auto]');
        expect(src).not.toContain('COLUMN 3');
    });

    it('lets every column panel join the flow individually (display: contents wrappers)', () => {
        const wrappers = src.match(/<div class="tw-contents" data-overview-column>/g) ?? [];
        expect(wrappers).toHaveLength(2);
    });

    it('places the Resources panel in column 1, under Active Effects', () => {
        const col1 = src.indexOf('COLUMN 1');
        const col2 = src.indexOf('COLUMN 2');
        // The Vitals and Active Effects blocks moved into shared partials so the
        // Combat tab can render the same panels without duplicating ~160 lines
        // (#494). The ordering contract is unchanged — only the marker is now the
        // include rather than the inline `title="Active Effects"` literal.
        const activeEffects = src.indexOf('overview-active-effects-panel.hbs');
        const resources = src.indexOf('{{!-- Resources —');
        expect(col1, 'column 1 marker present').toBeGreaterThan(-1);
        expect(activeEffects, 'active effects panel present').toBeGreaterThan(col1);
        // Resources sits after Active Effects but still within column 1 (before column 2).
        expect(resources, 'resources panel present').toBeGreaterThan(activeEffects);
        expect(resources, 'resources is in column 1, before column 2').toBeLessThan(col2);
    });
});
