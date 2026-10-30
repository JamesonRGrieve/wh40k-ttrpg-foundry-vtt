import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFoundryDataStub } from './testing/foundry-data-stub.ts';
import { packMetadata } from './testing/pack-metadata.ts';

/**
 * #484 end to end, on the two stale owned-item shapes found on the live world:
 *   1. a Superior Chirurgeon owned with NO `_stats.compendiumSource` (added before
 *      links were recorded), which the join could never enrich;
 *   2. a LINKED Superior Chirurgeon whose stored overlay predates the canonical's
 *      `modifiers.skills.medicae = 20` and carries the schema's empty block.
 * Each is hydrated through the real join, then prepared through the real Path A
 * aggregation (`CreatureTemplate`), and must end with Medicae +20 and the
 * read-only passive row the Roll Test dialog renders.
 *
 * `creature.ts` needs `foundry.abstract` + `foundry.data.fields` at module
 * evaluation, so the shared Foundry data stub is installed BEFORE the dynamic
 * imports.
 */
afterAll(installFoundryDataStub());

const { default: CreatureTemplate } = await import('./data/actor/templates/creature.ts');
const { hydrateActorInMemory } = await import('./compendium-hydrate.ts');
const { selectPassiveModifierRows } = await import('./rolls/passive-modifiers.ts');

type Creature = InstanceType<typeof CreatureTemplate>;

/** The talent schema's empty modifiers block, as a stored source carries it. */
const EMPTY_MODIFIERS = {
    characteristics: {},
    skills: {},
    combat: { attack: 0, damage: 0, penetration: 0, defense: 0, initiative: 0, speed: 0 },
    resources: { wounds: 0, fate: 0, insanity: 0, corruption: 0 },
    other: [],
    situational: { characteristics: [], skills: [], combat: [] },
};

const SC_UUID = 'Compendium.wh40k-rpg.dh2-talents.Item.DH2aTlnt00000071';

/** A talent's stored system slice: its identifier and its modifiers block. */
type TalentSystem = { identifier: string; modifiers: typeof EMPTY_MODIFIERS | (Omit<typeof EMPTY_MODIFIERS, 'skills'> & { skills: Record<string, number> }) };

/** The canonical Superior Chirurgeon as the dh2 pack authors it. */
function canonicalSuperiorChirurgeon(): { img: null; type: string; system: TalentSystem } {
    return {
        img: null,
        type: 'talent',
        system: { identifier: 'superiorChirurgeon', modifiers: { ...structuredClone(EMPTY_MODIFIERS), skills: { medicae: 20 } } },
    };
}

/** An owned talent whose `updateSource` mirrors Foundry's in-memory commit. */
interface OwnedTalent {
    id: string;
    name: string;
    img: null;
    type: 'talent';
    system: TalentSystem;
    _stats: { compendiumSource: string | null };
    updateSource: (changes: { system?: TalentSystem; _stats?: { compendiumSource: string } }) => void;
}

/** The slice of a `WH40KItem` the Path A aggregator reads. */
interface PreparedItem {
    name: string;
    type: string;
    id: string;
    uuid: string;
    isOriginPath: boolean;
    isTalent: boolean;
    isTrait: boolean;
    isCondition: boolean;
    isSpecialAbility: boolean;
    system: TalentSystem;
}

/** A characteristic as the schema stores it before preparation. */
interface StoredCharacteristic {
    label: string;
    short: string;
    base: number;
    advance: number;
    modifier: number;
    unnatural: number;
    damage: number;
    total: number;
    bonus: number;
}

/** One Item pack as `queryItemIndex` reads `game.packs`. */
interface IndexPackStub {
    metadata: ReturnType<typeof packMetadata> & { system: string };
    documentName: string;
    getIndex: () => Promise<Array<{ _id: string; name: string; type: string; uuid: string; system: { identifier: string } }>>;
}

function ownedTalent(system: TalentSystem, compendiumSource: string | null): OwnedTalent {
    const talent: OwnedTalent = {
        id: 'sc1',
        name: 'Superior Chirurgeon',
        img: null,
        type: 'talent',
        system,
        _stats: { compendiumSource },
        updateSource(changes) {
            if (changes.system !== undefined) talent.system = changes.system;
            if (changes._stats !== undefined) talent._stats = { ...talent._stats, ...changes._stats };
        },
    };
    return talent;
}

/** The aggregator's view of the (hydrated) talent. */
function asPreparedItem(talent: OwnedTalent): PreparedItem {
    return {
        name: talent.name,
        type: talent.type,
        id: talent.id,
        uuid: `Actor.a.Item.${talent.id}`,
        isOriginPath: false,
        isTalent: true,
        isTrait: false,
        isCondition: false,
        isSpecialAbility: false,
        system: talent.system,
    };
}

/** A dh2 creature (Int 40, trained Medicae) owning `items`, run through the item-modifier half of prep. */
function prepare(items: PreparedItem[]): Creature {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's TypeDataModel constructor demands (data, options), which the stubbed base ignores; the instance is populated by hand below
    const creature = new (CreatureTemplate as unknown as new () => Creature)();
    const characteristic = (base: number, short: string): StoredCharacteristic => ({
        label: short,
        short,
        base,
        advance: 0,
        modifier: 0,
        unnatural: 0,
        damage: 0,
        total: base,
        bonus: Math.floor(base / 10),
    });
    Object.assign(creature, {
        gameSystem: 'dh2',
        characteristics: {
            weaponSkill: characteristic(30, 'WS'),
            ballisticSkill: characteristic(30, 'BS'),
            strength: characteristic(30, 'S'),
            toughness: characteristic(30, 'T'),
            agility: characteristic(30, 'Ag'),
            intelligence: characteristic(40, 'Int'),
            perception: characteristic(30, 'Per'),
            willpower: characteristic(30, 'WP'),
            fellowship: characteristic(30, 'Fel'),
        },
        skills: { medicae: { label: 'Int', characteristic: 'Int', advanced: false, basic: true, advance: 1, bonus: 0, current: 0 } },
        initiative: { characteristic: 'agility', base: 0, bonus: 0 },
        fatigue: { value: 0, max: 0 },
    });
    Object.defineProperty(creature, 'parent', {
        value: { items: { filter: (fn: (i: PreparedItem) => boolean) => items.filter(fn) } },
    });
    creature._initializeModifierTracking();
    creature._computeItemModifiers();
    creature._applyModifiersToCharacteristics();
    creature._applyModifiersToSkills();
    return creature;
}

/** What prep yields once the talent is hydrated on a dh2 actor, next to the no-talent baseline. */
interface MedicaeOutcome {
    baseline: number;
    current: number;
    rows: ReturnType<typeof selectPassiveModifierRows>;
}

/** Hydrate the talent on a dh2 actor, then prep: Medicae with and without it, and the dialog's passive rows. */
async function hydrateAndPrepare(talent: OwnedTalent): Promise<MedicaeOutcome> {
    const baseline = prepare([]).skills.medicae.current;
    await hydrateActorInMemory({ type: 'dh2-character', name: 'Ibnad', items: { contents: [talent] }, reset: vi.fn() });
    const creature = prepare([asPreparedItem(talent)]);
    return { baseline, current: creature.skills.medicae.current, rows: selectPassiveModifierRows('Skill', 'medicae', creature.modifierSources) };
}

const SC_PACK: IndexPackStub = {
    metadata: { ...packMetadata('dh2-talents', 'dh2', 'talents'), system: 'wh40k-rpg' },
    documentName: 'Item',
    getIndex: async () =>
        Promise.resolve([
            { _id: 'DH2aTlnt00000071', name: 'Superior Chirurgeon', type: 'talent', uuid: SC_UUID, system: { identifier: 'superiorChirurgeon' } },
        ]),
};

beforeEach(() => {
    // WH40KSettings.getFatigueMode reads a world setting; 'auto' keeps the line's RAW model.
    vi.stubGlobal('game', {
        settings: { get: () => 'auto' },
        packs: { filter: (predicate: (pack: IndexPackStub) => boolean) => [SC_PACK].filter(predicate) },
        wh40k: { log: vi.fn() },
    });
    vi.stubGlobal('CONFIG', { Item: { dataModels: { talent: { cleanData: () => ({ identifier: '', modifiers: structuredClone(EMPTY_MODIFIERS) }) } } } });
    vi.stubGlobal(
        'fromUuid',
        vi.fn().mockImplementation(async (uuid: string) => Promise.resolve(uuid === SC_UUID ? canonicalSuperiorChirurgeon() : null)),
    );
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('Superior Chirurgeon on a stale owned item reaches Medicae (#484)', () => {
    it('an owned copy with NO compendium link recovers it, gains +20 Medicae and shows the passive row', async () => {
        const talent = ownedTalent({ identifier: 'superiorChirurgeon', modifiers: structuredClone(EMPTY_MODIFIERS) }, null);
        const { baseline, current, rows } = await hydrateAndPrepare(talent);
        expect(current).toBe(baseline + 20);
        expect(rows).toEqual([expect.objectContaining({ label: 'Superior Chirurgeon', value: 20, type: 'talent' })]);
        expect(talent._stats.compendiumSource).toBe(SC_UUID);
    });

    it('a linked copy whose stored modifiers block is stale and empty still gains +20 Medicae and shows the passive row', async () => {
        const talent = ownedTalent({ identifier: 'superiorChirurgeon', modifiers: structuredClone(EMPTY_MODIFIERS) }, SC_UUID);
        const { baseline, current, rows } = await hydrateAndPrepare(talent);
        expect(current).toBe(baseline + 20);
        expect(rows).toEqual([expect.objectContaining({ label: 'Superior Chirurgeon', value: 20, type: 'talent' })]);
    });
});
