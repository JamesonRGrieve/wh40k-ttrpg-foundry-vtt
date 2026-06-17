import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildWeaponQualityPayloadIndex, getWeaponQualityHasLevel, getWeaponQualityMechanics } from './weapon-quality-payloads.ts';

/**
 * #303 — per-system weaponQuality packs that stub-and-reference Rogue Trader.
 *
 * Drives the real boot index (`buildWeaponQualityPayloadIndex`) against the actual
 * pack `_source` through a typed `game.packs` stub, so the `mechanicsRef` resolution
 * and per-system scoping are exercised end-to-end — not just the seam the other
 * suites use. The shared FFG RAW values are authored once on the RT docs; the other
 * six systems' stubs must resolve to them via the ref.
 */

interface PackDoc {
    uuid: string;
    system?: { identifier?: string; hasLevel?: boolean; mechanics?: object; mechanicsRef?: string };
}
interface PackStub {
    metadata: { name: string };
    getDocuments: () => Promise<PackDoc[]>;
}

const PACKS: ReadonlyArray<{ systemId: string; dir: string; pack: string }> = [
    { systemId: 'rt', dir: 'rogue-trader', pack: 'rt-core-items-weapon-qualities' },
    { systemId: 'bc', dir: 'black-crusade', pack: 'bc-core-items-weapon-qualities' },
    { systemId: 'dh1', dir: 'dark-heresy-1', pack: 'dh1-core-items-weapon-qualities' },
    { systemId: 'dh2', dir: 'dark-heresy-2', pack: 'dh2-core-items-weapon-qualities' },
    { systemId: 'dw', dir: 'deathwatch', pack: 'dw-core-items-weapon-qualities' },
    { systemId: 'ow', dir: 'only-war', pack: 'ow-core-items-weapon-qualities' },
    { systemId: 'im', dir: 'imperium-maledictum', pack: 'im-core-items-weapon-qualities' },
];
const NON_RT = PACKS.filter((p) => p.systemId !== 'rt');

function loadDocs(dir: string, pack: string): PackDoc[] {
    const srcDir = resolve(__dirname, `../../packs/${dir}/${pack}/_source`);
    if (!existsSync(srcDir)) return [];
    return readdirSync(srcDir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => {
            const doc = JSON.parse(readFileSync(resolve(srcDir, f), 'utf8')) as { _id?: string; system?: PackDoc['system'] };
            const packDoc: PackDoc = { uuid: `Compendium.wh40k-rpg.${pack}.Item.${doc._id ?? ''}` };
            if (doc.system !== undefined) packDoc.system = doc.system;
            return packDoc;
        });
}

const packStubs: PackStub[] = PACKS.map((p) => ({
    metadata: { name: p.pack },
    getDocuments: async () => {
        await Promise.resolve();
        return loadDocs(p.dir, p.pack);
    },
}));

beforeAll(async () => {
    vi.stubGlobal('game', { packs: { filter: (fn: (pack: PackStub) => boolean) => packStubs.filter(fn) } });
    await buildWeaponQualityPayloadIndex();
});
afterAll(() => {
    vi.unstubAllGlobals();
});

describe('per-system weaponQuality index resolution (#303)', () => {
    for (const { systemId } of PACKS) {
        it(`${systemId}: resolves Accurate aimBonus + Scatter bands through the ref to the RT payload`, () => {
            expect(getWeaponQualityMechanics('accurate', systemId)?.aimBonus).toBe(10);
            expect(getWeaponQualityMechanics('scatter', systemId)?.rangeBands.pointBlank).toBe(3);
            expect(getWeaponQualityMechanics('scatter', systemId)?.rangeBands.longRange).toBe(-3);
        });
    }

    for (const { systemId } of NON_RT) {
        it(`${systemId}: derives hasLevel from the sibling -x doc`, () => {
            expect(getWeaponQualityHasLevel('blast', systemId)).toBe(true);
            expect(getWeaponQualityHasLevel('accurate', systemId)).toBe(false);
        });
    }

    it('falls back across systems when no systemId is supplied', () => {
        expect(getWeaponQualityMechanics('accurate')?.aimBonus).toBe(10);
        expect(getWeaponQualityHasLevel('blast')).toBe(true);
    });
});

describe('stub pack content integrity (#303)', () => {
    const rtDocs = loadDocs('rogue-trader', 'rt-core-items-weapon-qualities');
    const rtUuidsByIdentifier = new Map<string, Set<string>>();
    for (const doc of rtDocs) {
        const id = doc.system?.identifier;
        if (id === undefined) continue;
        (rtUuidsByIdentifier.get(id) ?? rtUuidsByIdentifier.set(id, new Set()).get(id))?.add(doc.uuid);
    }
    const rtIdentifiers = new Set(rtUuidsByIdentifier.keys());

    for (const p of NON_RT) {
        it(`${p.systemId}: every stub references a matching RT doc and carries no own mechanics`, () => {
            const docs = loadDocs(p.dir, p.pack);
            expect(docs).toHaveLength(rtIdentifiers.size);
            for (const doc of docs) {
                const id = doc.system?.identifier;
                expect(id !== undefined && rtIdentifiers.has(id)).toBe(true);
                expect(rtUuidsByIdentifier.get(id ?? '')?.has(doc.system?.mechanicsRef ?? '')).toBe(true);
                expect(doc.system?.mechanics).toBeUndefined();
            }
        });
    }
});
