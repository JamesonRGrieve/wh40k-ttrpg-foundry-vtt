import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Medals and Honours on an Only War character (content#32): which items are
 * medals, resolving the conferred UUIDs to the Battlefield panel's descriptors,
 * conferring one, and the compendium picker's filter. Foundry's `Item` and
 * `fromUuid` are stubbed.
 */

vi.mock('./compendium-pick.ts', () => ({ pickCompendiumItemUuid: vi.fn() }));

const { addRegimentalAward, isMedal, isMedalIndexEntry, resolveAwardDescriptors } = await import('./ow-awards.ts');

class StubItem {
    readonly type: string;
    readonly name: string;
    readonly uuid: string;
    readonly system: object;
    constructor(uuid: string, type: string, name: string, system: object) {
        this.type = type;
        this.name = name;
        this.uuid = uuid;
        this.system = system;
    }
}

const WINGED_SKULL = 'Compendium.wh40k-rpg.ow-medals.Item.OWcMedalWingSk01';
const TRIPLE_SKULL = 'Compendium.wh40k-rpg.ow-medals.Item.OWcMedalTripSk01';
const TALENT = 'Compendium.wh40k-rpg.ow-talents.Item.someTalent000001';

const documents = new Map<string, StubItem>([
    [WINGED_SKULL, new StubItem(WINGED_SKULL, 'medal', 'Winged Skull', { honourType: 'imperial', squadBonus: '<p>+10 to all Command Tests.</p>' })],
    [TRIPLE_SKULL, new StubItem(TRIPLE_SKULL, 'medal', 'Triple Skull', { honourType: 'imperial', squadBonus: '<p>+5 to all Dodge and Parry Tests.</p>' })],
    [TALENT, new StubItem(TALENT, 'talent', 'Some Talent', { benefit: '' })],
]);

beforeEach(() => {
    vi.stubGlobal('Item', StubItem);
    vi.stubGlobal('fromUuid', async (uuid: string) => Promise.resolve(documents.get(uuid) ?? null));
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('isMedal / isMedalIndexEntry', () => {
    it('is a medal item with a Squad Bonus', () => {
        expect(isMedal(new StubItem(WINGED_SKULL, 'medal', 'Winged Skull', { squadBonus: '' }))).toBe(true);
        expect(isMedal(new StubItem(TALENT, 'talent', 'Some Talent', { squadBonus: '' }))).toBe(false);
        expect(isMedal(new StubItem(WINGED_SKULL, 'medal', 'Broken', {}))).toBe(false);
        expect(isMedal(null)).toBe(false);
    });

    it('filters the compendium index to medals', () => {
        expect(isMedalIndexEntry({ _id: 'a', name: 'Winged Skull', type: 'medal' })).toBe(true);
        expect(isMedalIndexEntry({ _id: 'b', name: 'Frenzy', type: 'talent' })).toBe(false);
    });
});

describe('resolveAwardDescriptors', () => {
    it('resolves each conferred medal to its name and Squad Bonus, and leaves out the rest', async () => {
        const descriptors = await resolveAwardDescriptors([WINGED_SKULL, TALENT, 'Compendium.gone', TRIPLE_SKULL]);
        expect([...descriptors.keys()]).toEqual([WINGED_SKULL, TRIPLE_SKULL]);
        expect(descriptors.get(WINGED_SKULL)).toEqual({ id: WINGED_SKULL, name: 'Winged Skull', description: '+10 to all Command Tests.', bonus: {} });
    });
});

describe('addRegimentalAward', () => {
    it('records a medal once', async () => {
        const update = vi.fn(async () => Promise.resolve({}));
        expect(await addRegimentalAward({ system: { regimentalAwards: [WINGED_SKULL] }, update }, TRIPLE_SKULL)).toBe(true);
        expect(update).toHaveBeenCalledWith({ 'system.regimentalAwards': [WINGED_SKULL, TRIPLE_SKULL] });
        update.mockClear();
        expect(await addRegimentalAward({ system: { regimentalAwards: [WINGED_SKULL] }, update }, WINGED_SKULL)).toBe(false);
        expect(update).not.toHaveBeenCalled();
    });
});
