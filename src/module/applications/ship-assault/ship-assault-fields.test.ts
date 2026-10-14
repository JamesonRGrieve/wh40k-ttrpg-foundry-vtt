import { describe, expect, it } from 'vitest';
import { assaultContext, recordingShip } from '../../testing/ship-assault.ts';
import { dieResults, helmsmanGroup, readAssaultForm, readSituational } from './ship-assault-fields.ts';

/** Dialog form plumbing shared by the ship assault flows (#188). */

function form(html: string): HTMLElement {
    const root = document.createElement('form');
    root.innerHTML = html;
    return root;
}

const SHIP = {
    name: 'A',
    hullType: 'frigate',
    manoeuvrability: 10,
    crippledManoeuvrability: 0,
    armour: 18,
    turretRating: 1,
    crewPopulation: 50,
    hullIntegrity: 35,
    morale: 60,
};

describe('readAssaultForm', () => {
    it('reads numbers, text, checkboxes, selects and the checked radio', () => {
        const values = readAssaultForm(
            form(`
                <input type="number" name="skill" value="45" />
                <input type="text" name="label" value="  Reinforcements " />
                <input type="checkbox" name="flag" checked />
                <select name="target"><option value="1" selected>B</option></select>
                <input type="radio" name="pick" value="a" />
                <input type="radio" name="pick" value="b" checked />
            `),
        );
        expect(values.number('skill', 0)).toBe(45);
        expect(values.text('label', '')).toBe('Reinforcements');
        expect(values.checked('flag')).toBe(true);
        expect(values.checked('missing')).toBe(false);
        expect(values.number('target', 0)).toBe(1);
        expect(values.text('pick', '')).toBe('b');
    });

    it('falls back on missing, blank or non-numeric input', () => {
        const values = readAssaultForm(form('<input name="blank" value="" /><input name="word" value="x" />'));
        expect(values.number('blank', 7)).toBe(7);
        expect(values.number('word', 7)).toBe(7);
        expect(values.number('absent', 7)).toBe(7);
        expect(values.text('absent', 'd')).toBe('d');
    });
});

describe('field groups', () => {
    it('defaults the helmsman skill to the ship crew rating', () => {
        const group = helmsmanGroup(assaultContext(recordingShip(SHIP, { crewRating: 50 }), recordingShip(SHIP)));
        expect(group.fields[0]).toMatchObject({ name: 'pilotSkill', value: 50 });
        expect(group.fields.map((field) => field.name)).toEqual(['pilotSkill', 'situationalValue', 'situationalLabel']);
    });

    it('reads a situational modifier pair', () => {
        const values = readAssaultForm(form('<input name="sValue" value="-10" /><input name="sLabel" value="Ghost Field" />'));
        expect(readSituational(values, 's')).toEqual({ value: -10, label: 'Ghost Field' });
    });
});

describe('dieResults', () => {
    it('flattens every die of every term in order', () => {
        const roll = { dice: [{ results: [{ result: 2 }, { result: 5 }] }, { results: [{ result: 1 }] }] };
        expect(dieResults(roll)).toEqual([2, 5, 1]);
    });
});
