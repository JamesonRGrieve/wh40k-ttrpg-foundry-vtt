/**
 * Unit coverage for the read-only passive-modifier row selection (#484).
 *
 * This is the display half of the passive-modifier pipeline: talents / traits /
 * curses / drugs / conditions fold their flat numbers into the actor's values
 * (via `creature.ts _applyItemModifiers`) AND record provenance in
 * `system.modifierSources`; the Roll Test dialog reads the bucket matching the
 * roll and shows each contribution read-only. A bucket/key mismatch here is the
 * exact "Superior Chirurgeon is applied but shows up nowhere" failure #484 was
 * reopened for — previously only the licensed Tier-B suite exercised it.
 */

import { describe, expect, it } from 'vitest';
import { type ModifierSourcesShape, selectPassiveModifierRows } from './passive-modifiers.ts';

const superiorChirurgeon: ModifierSourcesShape = {
    skills: { medicae: [{ name: 'Superior Chirurgeon', type: 'talent', value: 20 }] },
    characteristics: { intelligence: [{ name: 'Unnatural Intelligence', type: 'trait', value: 10 }] },
    combat: { toHit: [{ name: 'Deadeye Shot', type: 'talent', value: 10 }] },
};

describe('selectPassiveModifierRows (#484 read-only passive display)', () => {
    it('surfaces a skill talent modifier for the matching skill roll (Superior Chirurgeon → Medicae +20)', () => {
        const rows = selectPassiveModifierRows('Skill', 'medicae', superiorChirurgeon);
        expect(rows).toEqual([{ label: 'Superior Chirurgeon', value: 20, valueLabel: '–', type: 'talent' }]);
    });

    it('reads the characteristics bucket for a Characteristic roll', () => {
        const rows = selectPassiveModifierRows('Characteristic', 'intelligence', superiorChirurgeon);
        expect(rows).toEqual([{ label: 'Unnatural Intelligence', value: 10, valueLabel: '–', type: 'trait' }]);
    });

    it('reads the combat bucket for a non-skill / non-characteristic (attack) roll', () => {
        const rows = selectPassiveModifierRows('Attack', 'toHit', superiorChirurgeon);
        expect(rows).toEqual([{ label: 'Deadeye Shot', value: 10, valueLabel: '–', type: 'talent' }]);
    });

    it('returns nothing for a skill with no recorded provenance', () => {
        expect(selectPassiveModifierRows('Skill', 'awareness', superiorChirurgeon)).toEqual([]);
    });

    it('returns nothing for an empty rollKey or absent modifierSources', () => {
        expect(selectPassiveModifierRows('Skill', '', superiorChirurgeon)).toEqual([]);
        expect(selectPassiveModifierRows('Skill', 'medicae', undefined)).toEqual([]);
    });

    it('does not cross buckets: a skill key is not found in the combat bucket', () => {
        // A skill roll must read `skills`, never `combat` — the reopened bug shape.
        expect(selectPassiveModifierRows('Attack', 'medicae', superiorChirurgeon)).toEqual([]);
    });

    it('drops zero-valued entries but keeps every non-zero contribution (a curse and a talent together)', () => {
        const sources: ModifierSourcesShape = {
            skills: {
                medicae: [
                    { name: 'Superior Chirurgeon', type: 'talent', value: 20 },
                    { name: 'Unsteady Hands', type: 'malignancy', value: -10 },
                    { name: 'Placebo', type: 'drug', value: 0 },
                ],
            },
        };
        const rows = selectPassiveModifierRows('Skill', 'medicae', sources);
        expect(rows.map((r) => r.value)).toEqual([20, -10]);
        expect(rows.map((r) => r.label)).toEqual(['Superior Chirurgeon', 'Unsteady Hands']);
    });

    it('defaults a missing name / type to empty strings rather than dropping the row', () => {
        const sources: ModifierSourcesShape = { skills: { medicae: [{ value: 5 }] } };
        expect(selectPassiveModifierRows('Skill', 'medicae', sources)).toEqual([{ label: '', value: 5, valueLabel: '–', type: '' }]);
    });
});
