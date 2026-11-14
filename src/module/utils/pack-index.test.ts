import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSkillPackIndex, getSpecializationsForSkill } from '../rules/skill-pack-index.ts';
import { packMetadata } from '../testing/pack-metadata.ts';
import {
    CAREER_INDEX_FIELDS,
    CONDITION_INDEX_FIELDS,
    indexFieldsCover,
    mergeIndexFields,
    packIndexFields,
    readPackIndex,
    SKILL_INDEX_FIELDS,
    WEAPON_QUALITY_INDEX_FIELDS,
} from './pack-index.ts';
import { uuidNameCache } from './uuid-name-cache.ts';

/**
 * One index request per compendium pack on `ready` (#706). Foundry's `getIndex`
 * refetches a pack's whole index for any field it has not indexed and shares no
 * request in flight, so every `ready` reader goes through `readPackIndex`, which
 * asks once for every field the pack's readers need.
 */

interface Row {
    _id: string;
    name: string;
    type: string;
    system?: { specializations?: string[] };
}

type GetIndex = ReturnType<typeof vi.fn<(options: { fields: string[] }) => Promise<Row[]>>>;

interface GatedPack {
    pack: { metadata: ReturnType<typeof packMetadata> & { type: string }; getIndex: GetIndex };
    getIndex: GetIndex;
    release: () => void;
}

/** A pack of `line` and `category` whose index read is counted and resolves when `release` is called. */
function gatedPack(name: string, line: string, category: string, rows: Row[]): GatedPack {
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    const getIndex = vi.fn<(options: { fields: string[] }) => Promise<Row[]>>(async () => {
        await gate;
        return rows;
    });
    return { pack: { metadata: { ...packMetadata(name, line, category), type: 'Item' }, getIndex }, getIndex, release: () => release() };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('packIndexFields', () => {
    it("asks every pack for name, type and identifier, plus its category's readers' fields", () => {
        // `system.identifier` for every pack: identifier lookups while origins are reapplied
        // on ready would otherwise refetch each pack's index with one more field.
        expect(packIndexFields(packMetadata('dh2-talents', 'dh2', 'talents'))).toEqual(['name', 'type', 'system.identifier']);
        expect(packIndexFields(packMetadata('dh2-skills', 'dh2', 'skills'))).toEqual(['name', 'type', ...SKILL_INDEX_FIELDS]);
        expect(packIndexFields(packMetadata('rt-wq', 'rt', 'weapon-qualities'))).toEqual(['name', 'type', ...WEAPON_QUALITY_INDEX_FIELDS]);
        expect(packIndexFields(packMetadata('rt-careers', 'rt', 'origins-careers'))).toEqual(['name', 'type', ...CAREER_INDEX_FIELDS]);
        expect(packIndexFields(packMetadata('dh2-conditions', 'dh2', 'conditions'))).toEqual(['name', 'type', ...CONDITION_INDEX_FIELDS]);
    });

    it('asks a pack with no declared category for the base fields only', () => {
        expect(packIndexFields({ name: 'loose' })).toEqual(['name', 'type', 'system.identifier']);
    });
});

/**
 * Foundry's server builds an index projection by writing `1` at each field path in
 * turn, so `system.modifiers` then `system.modifiers.armourPoints` throws ("Cannot
 * create property 'armourPoints' on number '1'") and the whole pack index fails.
 * That broke the compendium browser on every conditions pack (#706).
 */
describe('mergeIndexFields and indexFieldsCover', () => {
    /** A projection map as the server builds it: `1` at each requested path. */
    interface Projection {
        [key: string]: Projection | 1;
    }

    /** Foundry's own projection walk: it throws exactly where the server's `setProperty` does. */
    const projection = (fields: readonly string[]): Projection => {
        const map: Projection = {};
        for (const field of fields) {
            const parts = field.split('.');
            const last = parts.pop() ?? '';
            let target = map;
            for (const part of parts) {
                const next = target[part] ?? {};
                if (next === 1) throw new TypeError(`Cannot create property '${last}' on number '1'`);
                target[part] = next;
                target = next;
            }
            target[last] = 1;
        }
        return map;
    };

    it('drops a field its parent already carries, so the projection never writes into a 1', () => {
        const shared = packIndexFields(packMetadata('dh2-conditions', 'dh2', 'conditions'));
        const merged = mergeIndexFields(shared, ['system.modifiers.armourPoints', 'system.armourPoints', 'system.source']);
        expect(merged).toContain('system.modifiers');
        expect(merged).not.toContain('system.modifiers.armourPoints');
        expect(merged).toContain('system.armourPoints');
        expect(() => projection(merged)).not.toThrow();
    });

    it('keeps the parent when the child is asked for first', () => {
        expect(mergeIndexFields(['system.a.b'], ['system.a', 'name'])).toEqual(['system.a', 'name']);
    });

    it('treats a field as covered when a shared parent carries it', () => {
        expect(indexFieldsCover(['name', 'system.modifiers'], ['system.modifiers.armourPoints', 'name'])).toBe(true);
        expect(indexFieldsCover(['name', 'system.modifiers'], ['system.modifiersExtra'])).toBe(false);
    });
});

describe('readPackIndex', () => {
    it('gives callers that ask while a request is in flight that one request', async () => {
        const { pack, getIndex, release } = gatedPack('dh2-skills', 'dh2', 'skills', [{ _id: 'a', name: 'Awareness', type: 'skill' }]);
        const first = readPackIndex(pack);
        const second = readPackIndex(pack);
        release();
        expect([...(await first)]).toEqual([...(await second)]);
        expect(getIndex).toHaveBeenCalledTimes(1);
        expect(getIndex).toHaveBeenCalledWith({ fields: ['name', 'type', ...SKILL_INDEX_FIELDS] });
    });

    it('asks again once the request has settled, so Foundry decides whether its cached index covers it', async () => {
        const { pack, getIndex, release } = gatedPack('dh2-talents', 'dh2', 'talents', []);
        release();
        await readPackIndex(pack);
        await readPackIndex(pack);
        expect(getIndex).toHaveBeenCalledTimes(2);
    });

    it('lets a failed request be retried', async () => {
        const getIndex = vi.fn<(options: { fields: string[] }) => Promise<Row[]>>().mockRejectedValueOnce(new Error('socket closed')).mockResolvedValueOnce([]);
        const pack = { metadata: packMetadata('dh2-talents', 'dh2', 'talents'), getIndex };
        await expect(readPackIndex(pack)).rejects.toThrow('socket closed');
        await expect(readPackIndex(pack)).resolves.toEqual([]);
    });
});

describe('ready readers share one index request per pack (#706)', () => {
    it('the name cache and the skill build read a skills pack once between them', async () => {
        const { pack, getIndex, release } = gatedPack('dh2-skills', 'dh2', 'skills', [
            { _id: 'lore', name: 'Common Lore', type: 'skill', system: { specializations: ['Imperium'] } },
        ]);
        vi.stubGlobal('game', { packs: Object.assign([pack], { contents: [pack] }), items: [], actors: [], journal: [], tables: [] });

        const both = Promise.all([uuidNameCache.build(), buildSkillPackIndex()]);
        release();
        await both;

        expect(getIndex).toHaveBeenCalledTimes(1);
        expect(uuidNameCache.getName('Compendium.wh40k-rpg.dh2-skills.Item.lore')).toBe('Common Lore');
        expect(getSpecializationsForSkill('commonLore', 'dh2')).toEqual(['Imperium']);
    });
});
