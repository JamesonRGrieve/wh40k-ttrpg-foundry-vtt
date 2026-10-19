import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_ID } from '../constants.ts';
import { DARK_PACT_FLAG, type DarkPactEntry, type PactEntryRef, type PactRecord } from '../rules/dark-pact.ts';

/**
 * The Document-side Dark Pact flows (#84): striking a pact, taking and dropping a
 * Boon or Bane, ending a pact, and reading the struck pacts' definitions. Foundry's
 * globals (Item, fromUuid, Roll, ChatMessage, game) are stubbed with the surface
 * these flows touch; the actor is a recording stand-in.
 */

vi.mock('../rolls/skill-use-picker.ts', () => ({ promptItemChoice: vi.fn() }));
vi.mock('../utils/compendium-query.ts', () => ({ queryItemIndex: vi.fn() }));

const { darkPactDefinitions, removeDarkPact, strikeDarkPact, toggleDarkPactEntry } = await import('./dark-pacts.ts');

/** Stand-in for Foundry's Item class: `instanceof Item` is how the flows recognise a document. */
class StubItem {
    readonly type: string;
    readonly name: string;
    readonly uuid: string;
    readonly img: string;
    readonly system: object;
    readonly _stats: { compendiumSource: string | null };
    constructor(data: { type: string; name: string; uuid: string; system: object; compendiumSource: string | null }) {
        this.type = data.type;
        this.name = data.name;
        this.uuid = data.uuid;
        this.img = 'icons/pact.webp';
        this.system = data.system;
        this._stats = { compendiumSource: data.compendiumSource };
    }
    toObject(): { _id: string; name: string; type: string; system: object } {
        return { _id: 'source-id', name: this.name, type: this.type, system: { ...this.system } };
    }
}

const FRENZY_UUID = 'Compendium.wh40k-rpg.talents.Item.frenzy';

const STRENGTH_BOON: DarkPactEntry = {
    identifier: 'unholy-might',
    name: 'Unholy Might',
    description: '',
    modifiers: { characteristics: { strength: 10 } },
    grants: [{ uuid: FRENZY_UUID, specialization: '', level: null }],
};
const PLAIN_BANE: DarkPactEntry = { identifier: 'marked', name: 'Marked', description: '', modifiers: {}, grants: [] };

const PACT_UUID = 'Compendium.wh40k-rpg.dark-pacts.Item.bargain';

function pactItem(compendiumSource: string | null = PACT_UUID): StubItem {
    return new StubItem({
        type: 'darkPact',
        name: 'The Bargain',
        uuid: 'Item.world-pact',
        compendiumSource,
        system: {
            negotiation: { dispositionBase: 20, addsCorruption: true, testModifier: 0 },
            corruptionFormula: '1d5',
            boons: [STRENGTH_BOON],
            banes: [PLAIN_BANE],
        },
    });
}

interface Flagged {
    id: string;
    flags: object;
}

/** A recording actor: its pacts, corruption, embedded effects and items, and every write. */
interface RecordingActor {
    name: string;
    system: { pacts: PactRecord[]; corruption: number };
    effects: Flagged[];
    items: Flagged[];
    updates: Array<Record<string, PactRecord[] | number>>;
    created: Array<{ type: string; data: object[] }>;
    deleted: Array<{ type: string; ids: string[] }>;
    update: (data: Record<string, PactRecord[] | number>) => Promise<void>;
    createEmbeddedDocuments: (type: string, data: object[]) => Promise<void>;
    deleteEmbeddedDocuments: (type: string, ids: string[]) => Promise<void>;
}

function recordingActor(pacts: PactRecord[] = [], corruption = 12): RecordingActor {
    const actor: RecordingActor = {
        name: 'Heretek',
        system: { pacts, corruption },
        effects: [],
        items: [],
        updates: [],
        created: [],
        deleted: [],
        update: async (data) => {
            actor.updates.push(data);
            const next = data['system.pacts'];
            if (Array.isArray(next)) actor.system.pacts = next;
            const nextCorruption = data['system.corruption'];
            if (typeof nextCorruption === 'number') actor.system.corruption = nextCorruption;
            return Promise.resolve();
        },
        createEmbeddedDocuments: async (type, data) => {
            actor.created.push({ type, data });
            return Promise.resolve();
        },
        deleteEmbeddedDocuments: async (type, ids) => {
            actor.deleted.push({ type, ids });
            return Promise.resolve();
        },
    };
    return actor;
}

/** The flags an entry's effect or granted item carries. */
function entryFlags(ref: PactEntryRef): object {
    return { [SYSTEM_ID]: { [DARK_PACT_FLAG]: ref } };
}

const documents = new Map<string, StubItem>();
const posted: Array<{ flavor: string }> = [];

beforeEach(() => {
    documents.clear();
    posted.length = 0;
    vi.stubGlobal('Item', StubItem);
    vi.stubGlobal('fromUuid', async (uuid: string) => Promise.resolve(documents.get(uuid) ?? null));
    vi.stubGlobal(
        'Roll',
        class {
            total = 3;
            async evaluate(): Promise<this> {
                return Promise.resolve(this);
            }
            async toMessage(data: { flavor: string }): Promise<void> {
                posted.push(data);
                return Promise.resolve();
            }
        },
    );
    vi.stubGlobal('ChatMessage', { getSpeaker: () => ({}) });
    vi.stubGlobal('game', { i18n: { format: (key: string) => key, localize: (key: string) => key } });
    vi.stubGlobal('foundry', { utils: { mergeObject: (base: object, other: object) => ({ ...base, ...other }) } });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('strikeDarkPact', () => {
    it('records the pact under its compendium UUID, rolls its Corruption, and adds it', async () => {
        const actor = recordingActor();
        const struck = await strikeDarkPact(actor as never, pactItem() as never);
        expect(struck).toBe(true);
        expect(posted).toEqual([expect.objectContaining({ flavor: 'WH40K.DarkPact.CorruptionFlavor' })]);
        expect(actor.system.pacts).toEqual([expect.objectContaining({ pactUuid: PACT_UUID, boons: [], banes: [] })]);
        expect(actor.system.corruption).toBe(15);
    });

    it('uses the item’s own UUID for a pact made in the world', async () => {
        const actor = recordingActor();
        await strikeDarkPact(actor as never, pactItem(null) as never);
        expect(actor.system.pacts[0]?.pactUuid).toBe('Item.world-pact');
    });

    it('refuses a pact the character already holds, writing nothing', async () => {
        const held: PactRecord = { pactUuid: PACT_UUID, discovered: false, disposition: 30, paymentCurrent: true, boons: [], banes: [] };
        const actor = recordingActor([held]);
        expect(await strikeDarkPact(actor as never, pactItem() as never)).toBe(false);
        expect(actor.updates).toEqual([]);
        expect(posted).toEqual([]);
    });
});

describe('toggleDarkPactEntry', () => {
    const record = (): PactRecord => ({ pactUuid: PACT_UUID, discovered: false, disposition: 30, paymentCurrent: true, boons: [], banes: [] });

    it('takes a Boon: records it and gives its effect and granted item, flagged with the entry', async () => {
        documents.set(PACT_UUID, pactItem());
        documents.set(FRENZY_UUID, new StubItem({ type: 'talent', name: 'Frenzy', uuid: 'frenzy', system: {}, compendiumSource: null }));
        const actor = recordingActor([record()]);
        await toggleDarkPactEntry(actor as never, 0, 'boons', 'unholy-might');
        const ref: PactEntryRef = { pactUuid: PACT_UUID, kind: 'boons', entry: 'unholy-might' };
        expect(actor.system.pacts[0]?.boons).toEqual(['unholy-might']);
        expect(actor.created.map((c) => c.type)).toEqual(['ActiveEffect', 'Item']);
        expect(actor.created[0]?.data[0]).toMatchObject({ name: 'Unholy Might', origin: PACT_UUID, flags: entryFlags(ref) });
        expect(actor.created[1]?.data[0]).toMatchObject({ name: 'Frenzy', flags: entryFlags(ref) });
        expect(actor.created[1]?.data[0]).not.toHaveProperty('_id');
    });

    it('takes a Bane with no mechanics without creating anything', async () => {
        documents.set(PACT_UUID, pactItem());
        const actor = recordingActor([record()]);
        await toggleDarkPactEntry(actor as never, 0, 'banes', 'marked');
        expect(actor.system.pacts[0]?.banes).toEqual(['marked']);
        expect(actor.created).toEqual([]);
    });

    it('drops a taken Boon: removes exactly what it gave', async () => {
        documents.set(PACT_UUID, pactItem());
        const actor = recordingActor([{ ...record(), boons: ['unholy-might'] }]);
        const mine: PactEntryRef = { pactUuid: PACT_UUID, kind: 'boons', entry: 'unholy-might' };
        actor.effects = [
            { id: 'e1', flags: entryFlags(mine) },
            { id: 'e2', flags: {} },
        ];
        actor.items = [
            { id: 'i1', flags: entryFlags(mine) },
            { id: 'i2', flags: entryFlags({ ...mine, entry: 'other' }) },
        ];
        await toggleDarkPactEntry(actor as never, 0, 'boons', 'unholy-might');
        expect(actor.system.pacts[0]?.boons).toEqual([]);
        expect(actor.deleted).toEqual([
            { type: 'ActiveEffect', ids: ['e1'] },
            { type: 'Item', ids: ['i1'] },
        ]);
    });

    it('does nothing for an index or entry that does not exist', async () => {
        documents.set(PACT_UUID, pactItem());
        const actor = recordingActor([record()]);
        await toggleDarkPactEntry(actor as never, 3, 'boons', 'unholy-might');
        await toggleDarkPactEntry(actor as never, 0, 'boons', 'no-such-boon');
        expect(actor.updates).toEqual([]);
    });
});

describe('removeDarkPact', () => {
    it('drops the record and everything any of its entries gave', async () => {
        const other = 'Compendium.wh40k-rpg.dark-pacts.Item.other';
        const actor = recordingActor([
            { pactUuid: PACT_UUID, discovered: false, disposition: 30, paymentCurrent: true, boons: ['unholy-might'], banes: [] },
            { pactUuid: other, discovered: false, disposition: 30, paymentCurrent: true, boons: [], banes: [] },
        ]);
        actor.effects = [{ id: 'e1', flags: entryFlags({ pactUuid: PACT_UUID, kind: 'boons', entry: 'unholy-might' }) }];
        actor.items = [{ id: 'i1', flags: entryFlags({ pactUuid: other, kind: 'boons', entry: 'x' }) }];
        await removeDarkPact(actor as never, 0);
        expect(actor.system.pacts.map((p) => p.pactUuid)).toEqual([other]);
        expect(actor.deleted).toEqual([{ type: 'ActiveEffect', ids: ['e1'] }]);
    });
});

describe('darkPactDefinitions', () => {
    it('gives each struck pact’s Boons and Banes, and null for one that no longer resolves', async () => {
        documents.set(PACT_UUID, pactItem());
        const gone = 'Compendium.wh40k-rpg.dark-pacts.Item.gone';
        const records: PactRecord[] = [
            { pactUuid: PACT_UUID, discovered: false, disposition: 30, paymentCurrent: true, boons: [], banes: [] },
            { pactUuid: gone, discovered: false, disposition: 30, paymentCurrent: true, boons: [], banes: [] },
        ];
        const definitions = await darkPactDefinitions(records);
        expect(definitions.get(PACT_UUID)).toEqual({ boons: [STRENGTH_BOON], banes: [PLAIN_BANE] });
        expect(definitions.get(gone)).toBeNull();
    });
});
