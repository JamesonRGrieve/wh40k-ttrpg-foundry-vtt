/**
 * Regression guard (#266): the Movement panel lives on the Combat tab exclusively.
 * Movement speed (half / full / charge / run) is only meaningful during
 * combat/initiative, so the inline "Movement" dashboard-zone was removed from the
 * Overview tab. The Combat tab keeps its movement panel (movement-panel-compact).
 *
 * Source-scan rather than runtime: rendering the tabs requires Foundry's sheet
 * context the unit env does not provide; the contract is a literal one on the
 * templates.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const OVERVIEW = readFileSync(resolve(__dirname, '../src/templates/actor/player/tab-overview.hbs'), 'utf8');
const COMBAT = readFileSync(resolve(__dirname, '../src/templates/actor/panel/combat-station-panel.hbs'), 'utf8');

describe('Movement panel placement (#266)', () => {
    it('removes the Movement dashboard-zone from the Overview tab', () => {
        expect(OVERVIEW).not.toContain('title="Movement"');
        // The movement-rate bindings only existed inside that zone.
        expect(OVERVIEW).not.toContain('actor.movement.half');
        expect(OVERVIEW).not.toContain('actor.movement.charge');
    });

    it('keeps the Armour zone on the Overview tab', () => {
        // The Armour zone is now the shared armour-zone.hbs partial (#234).
        expect(OVERVIEW).toContain('armour-zone.hbs');
    });

    it('keeps the movement panel on the Combat tab (compact variant)', () => {
        expect(COMBAT).toContain('movement-panel-compact.hbs');
    });
});
