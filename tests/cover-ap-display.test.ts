/**
 * Regression guard (#232): cover is shown on the attack screen as Armour (AP),
 * not as a misleading "+0 BS" modifier.
 *
 *  - The cover situational tiers carry `coverAP` (the Armour added at the hit
 *    location), already consumed by assign-damage-data.
 *  - The attack dialog maps that `coverAP` onto each combat-situational tile and
 *    the weapon panel renders it as an AP badge instead of the "+0" modifier.
 *
 * The data-shape assertion is a real unit test; the dialog/template wiring is a
 * source-scan (the dialog needs the Foundry runtime to instantiate).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RANGED_SITUATIONAL_MODIFIERS } from '../src/module/rules/attack-options';

describe('cover situational tiers carry AP, not a to-hit penalty (#232)', () => {
    const cover = RANGED_SITUATIONAL_MODIFIERS.filter((m) => m.key.startsWith('cover'));

    it('every cover tier has coverAP > 0 and a +0 to-hit modifier', () => {
        expect(cover.length).toBeGreaterThan(0);
        for (const c of cover) {
            expect(c.modifier).toBe(0);
            expect(c.damageEffect?.coverAP ?? 0).toBeGreaterThan(0);
        }
    });
});

describe('attack screen renders cover as AP (#232)', () => {
    const dialog = readFileSync(resolve(__dirname, '../src/module/applications/prompts/unified-roll-dialog.ts'), 'utf8');
    const panel = readFileSync(resolve(__dirname, '../src/templates/prompt/unified/panels/weapon-panel.hbs'), 'utf8');

    it('the dialog passes coverAP onto each combat-situational tile', () => {
        expect(dialog).toContain('coverAP: s.damageEffect?.coverAP');
    });

    it('the weapon panel shows an AP badge for cover instead of the +0 modifier label', () => {
        expect(panel).toContain('{{#if coverAP}}');
        expect(panel).toContain("{{localize 'WH40K.Armour.AP'}} {{coverAP}}");
    });
});
