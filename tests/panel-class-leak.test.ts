/**
 * Regression guard: a panel's root class stays on the panel root.
 *
 * Handlebars runs a block partial's body against the enclosing partial's
 * context, hash included. The panel scaffolds (panel / collapsible-panel /
 * system-card) take `rootClass`, and the leaf partials rendered inside their
 * bodies (drop zone, empty state, caption span, stat chip, item table) read a
 * param of the same name — so a body call that passed none picked up the
 * PANEL's root class. The Navigator Powers drop zone and empty state carried
 * `wh40k-panel-navigator-powers`, and every caption span in a BC card carried
 * its card's `wh40k-bc-*-panel` class, making those selectors ambiguous.
 *
 * The leaves now take role-named params and carry their own
 * `wh40k-panel__<role>` class.
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import bcDaemonPrinceSrc from '../src/templates/actor/panel/bc-daemon-prince-panel.hbs?raw';
import navigatorSrc from '../src/templates/actor/panel/navigator-powers-panel.hbs?raw';
import { initializeStoryHandlebars } from '../stories/template-support';
import { renderSheet } from '../stories/test-helpers';

initializeStoryHandlebars();

const ROOT = resolve(__dirname, '..');

/** Leaf partials rendered inside panel bodies; none may read the panel scaffolds' `rootClass`. */
const LEAF_PARTIALS = ['dropzone', 'effect-dropzone', 'empty-state', 'card-section-label', 'labeled-stat-chip', 'item-table'];

describe('panel root classes do not leak into the body', () => {
    it('no leaf partial reads `rootClass`', () => {
        const readers = LEAF_PARTIALS.filter((name) =>
            /\{\{[#/]?(if )?rootClass\}\}|\{\{#if rootClass\}\}/.test(readFileSync(join(ROOT, `src/templates/actor/partial/${name}.hbs`), 'utf8')),
        );
        expect(readers).toEqual([]);
    });

    it('Navigator Powers: the drop zone and empty state carry their own role class, not the panel class', () => {
        const root = renderSheet(navigatorSrc, { navigatorPowers: [], navigatorPowersCount: 0 });
        expect(root.querySelectorAll('.wh40k-panel-navigator-powers')).toHaveLength(1);
        const zone = root.querySelector('.wh40k-panel__dropzone');
        expect(zone).not.toBeNull();
        expect(zone?.classList.contains('wh40k-panel-navigator-powers')).toBe(false);
        expect(root.querySelector('.wh40k-panel__empty')?.classList.contains('wh40k-panel-powers')).toBe(false);
    });

    it('a BC system card: its caption spans carry their own role class, not the card class', () => {
        const root = renderSheet(bcDaemonPrinceSrc, {
            daemonPrincePanel: {
                ascended: false,
                canAscend: false,
                corruption: 40,
                corruptionThreshold: 100,
                infamy: 30,
                infamyThreshold: 50,
                isDaemonPrince: false,
                alignmentAtAscension: 'unaligned',
            },
        });
        expect(root.querySelectorAll('.wh40k-bc-daemon-prince-panel')).toHaveLength(1);
        const captions = [...root.querySelectorAll('.wh40k-panel__section-label')];
        expect(captions.length).toBeGreaterThan(0);
        expect(captions.filter((span) => span.classList.contains('wh40k-bc-daemon-prince-panel'))).toEqual([]);
    });
});
