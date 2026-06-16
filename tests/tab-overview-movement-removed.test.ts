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

import { describe, expect, it } from 'vitest';
import { readRepoFile } from './lib/repo-file.ts';

const OVERVIEW = readRepoFile('src/templates/actor/player/tab-overview.hbs');
const COMBAT = readRepoFile('src/templates/actor/panel/combat-station-panel.hbs');

describe('Movement panel placement (#266)', () => {
    it('removes the Movement dashboard-zone from the Overview tab', () => {
        expect(OVERVIEW).not.toContain('title="Movement"');
        // The movement-rate bindings only existed inside that zone.
        expect(OVERVIEW).not.toContain('actor.movement.half');
        expect(OVERVIEW).not.toContain('actor.movement.charge');
    });

    it('removes the Armour zone from the Overview tab (#318)', () => {
        // #318 removed the Armour panel from the Overview; the shared armour-zone.hbs
        // partial now renders on the Combat tab only.
        expect(OVERVIEW).not.toContain('armour-zone.hbs');
    });

    it('keeps the movement panel on the Combat tab (compact variant)', () => {
        expect(COMBAT).toContain('movement-panel-compact.hbs');
    });
});
