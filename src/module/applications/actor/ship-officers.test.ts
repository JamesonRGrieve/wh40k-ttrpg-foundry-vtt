/**
 * Ship Officers rows (#701): the table rendered only its header, because it bound
 * a `system.officer` field ship roles never had.
 */
import { describe, expect, it } from 'vitest';
import { isShipRole, officerCandidates, shipOfficerRows } from './ship-officers.ts';

interface RoleFixture {
    id: string;
    name: string;
    img: string;
    type: string;
    system: { effect: string; state: { officer: string } };
}

const role = (name: string, officer: string): RoleFixture => ({
    id: name.toLowerCase(),
    name,
    img: 'r.png',
    type: 'shipRole',
    system: { effect: `<p>${name}</p>`, state: { officer } },
});

describe('shipOfficerRows', () => {
    const names: Record<string, string> = { 'Actor.gus': 'Gus' };
    const rows = shipOfficerRows(
        [role('Master of Ordnance', 'Actor.gus'), role('Purser', ''), role('Chirurgeon', 'Actor.gone')],
        (uuid) => names[uuid] ?? null,
    );

    it('names the officer serving in each role', () => {
        expect(rows[0]).toMatchObject({ name: 'Master of Ordnance', officerUuid: 'Actor.gus', officerName: 'Gus', effect: '<p>Master of Ordnance</p>' });
    });

    it('leaves an unassigned role without an officer name', () => {
        expect(rows[1]).toMatchObject({ officerUuid: '', officerName: null });
    });

    it('never prints the id of an officer who no longer resolves', () => {
        expect(rows[2]?.officerName).toBeNull();
    });
});

describe('officerCandidates', () => {
    it('offers every line’s player characters by name, and no NPCs or ships', () => {
        const actors = [
            { uuid: 'Actor.b', name: 'Ibnad', type: 'dh2-character' },
            { uuid: 'Actor.n', name: 'Cultist', type: 'dh2-npc' },
            { uuid: 'Actor.a', name: 'Gus', type: 'rt-character' },
            { uuid: 'Actor.s', name: 'Frigate', type: 'rt-voidcraft' },
        ];
        expect(officerCandidates(actors).map((c) => c.name)).toEqual(['Gus', 'Ibnad']);
    });
});

describe('isShipRole', () => {
    it('accepts an owned ship role carrying its officer state, and nothing else', () => {
        expect(isShipRole(role('Purser', ''))).toBe(true);
        expect(isShipRole({ type: 'shipRole', system: { effect: '' } })).toBe(false);
        expect(isShipRole({ type: 'shipComponent', system: { state: { officer: '' } } })).toBe(false);
    });
});
