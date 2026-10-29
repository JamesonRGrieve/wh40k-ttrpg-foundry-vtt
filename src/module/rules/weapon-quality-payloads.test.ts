import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type DeclaredPack, readDeclaredPacks } from '../../../scripts/lib/pack-manifest.mjs';
import { HAS_PRIVATE_CONTENT } from '../testing/private-content.ts';
import type { PackMetadataLike } from '../utils/line-packs.ts';
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
    metadata: PackMetadataLike;
    getDocuments: () => Promise<PackDoc[]>;
}

/** Every line that ships a weapon-qualities pack; RT's docs carry the shared values. */
const PACKS: ReadonlyArray<{ systemId: string }> = ['rt', 'bc', 'dh1', 'dh2', 'dw', 'ow', 'im'].map((systemId) => ({ systemId }));
const NON_RT = PACKS.filter((p) => p.systemId !== 'rt');

/** The declared weapon-qualities packs, as their manifest entries name and place them. */
function qualityPacks(): DeclaredPack[] {
    return readDeclaredPacks(resolve(__dirname, '../../..')).packs.filter((pack) => pack.flags?.['wh40k-rpg']?.category === 'weapon-qualities');
}

/** The docs of `line`'s weapon-qualities pack, read from its `_source`. */
function loadDocs(line: string): PackDoc[] {
    const pack = qualityPacks().find((candidate) => candidate.flags?.['wh40k-rpg']?.line === line);
    if (pack === undefined) return [];
    const srcDir = resolve(__dirname, '../../packs-private', pack.path.replace(/^packs\//, ''), '_source');
    if (!existsSync(srcDir)) return [];
    return readdirSync(srcDir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => {
            const doc = JSON.parse(readFileSync(resolve(srcDir, f), 'utf8')) as { _id?: string; system?: PackDoc['system'] };
            const packDoc: PackDoc = { uuid: `Compendium.wh40k-rpg.${pack.name}.Item.${doc._id ?? ''}` };
            if (doc.system !== undefined) packDoc.system = doc.system;
            return packDoc;
        });
}

beforeAll(async () => {
    const packStubs: PackStub[] = qualityPacks().map((pack) => ({
        metadata: pack,
        getDocuments: async () => {
            await Promise.resolve();
            return loadDocs(pack.flags?.['wh40k-rpg']?.line ?? '');
        },
    }));
    vi.stubGlobal('game', { packs: packStubs });
    await buildWeaponQualityPayloadIndex();
});
afterAll(() => {
    vi.unstubAllGlobals();
});

describe.skipIf(!HAS_PRIVATE_CONTENT)('per-system weaponQuality index resolution (#303)', () => {
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

    // #303 — the die-operation descriptor is authored once on the RT docs, so every
    // system must reach the same Tearing / Proven / Primitive ops through its stub's ref.
    for (const { systemId } of PACKS) {
        it(`${systemId}: resolves the Tearing / Proven / Primitive dieOps through the ref`, () => {
            expect(getWeaponQualityMechanics('tearing', systemId)?.dieOps).toEqual([
                { op: 'keepHighest', phase: 'preEvaluate', extraDice: 1, threshold: null, usesLevel: false, modifierKey: 'tearing' },
            ]);
            expect(getWeaponQualityMechanics('proven', systemId)?.dieOps).toEqual([
                { op: 'floor', phase: 'postEvaluate', extraDice: null, threshold: null, usesLevel: true, modifierKey: 'proven' },
            ]);
            expect(getWeaponQualityMechanics('primitive-x', systemId)?.dieOps).toEqual([
                { op: 'cap', phase: 'postEvaluate', extraDice: null, threshold: null, usesLevel: true, modifierKey: 'primitive' },
            ]);
        });
    }

    // #414 — every line prints Balanced +10, Defensive +15 and Unbalanced –10 to a
    // Parry made with the weapon (DH1, DH2, RT, DW, BC, OW cores).
    for (const { systemId } of PACKS) {
        it(`${systemId}: resolves the Balanced / Defensive / Unbalanced parry modifiers through the ref`, () => {
            expect(getWeaponQualityMechanics('balanced', systemId)?.parryBonus).toBe(10);
            expect(getWeaponQualityMechanics('defensive', systemId)?.parryBonus).toBe(15);
            expect(getWeaponQualityMechanics('unbalanced', systemId)?.parryPenalty).toBe(-10);
        });
    }

    it('defaults dieOps to an empty list for qualities that declare none', () => {
        expect(getWeaponQualityMechanics('accurate')?.dieOps).toEqual([]);
        expect(getWeaponQualityMechanics('scatter', 'dh2')?.dieOps).toEqual([]);
    });
});

describe('stub pack content integrity (#303)', () => {
    const rtDocs = loadDocs('rt');
    const rtUuidsByIdentifier = new Map<string, Set<string>>();
    for (const doc of rtDocs) {
        const id = doc.system?.identifier;
        if (id === undefined) continue;
        (rtUuidsByIdentifier.get(id) ?? rtUuidsByIdentifier.set(id, new Set()).get(id))?.add(doc.uuid);
    }
    const rtIdentifiers = new Set(rtUuidsByIdentifier.keys());

    // A line's doc is EITHER a stub onto the matching RT doc (mechanicsRef, no own
    // mechanics) OR a line-specific override carrying its own mechanics and no ref —
    // used where the line's book prints the quality differently (Maximal: Blast +2
    // outside RT, Overheats in DW). Never both, never neither.
    for (const p of NON_RT) {
        it(`${p.systemId}: every doc is a stub onto a matching RT doc or a self-contained override`, () => {
            const docs = loadDocs(p.systemId);
            expect(docs).toHaveLength(rtIdentifiers.size);
            for (const doc of docs) {
                const id = doc.system?.identifier;
                expect(id !== undefined && rtIdentifiers.has(id)).toBe(true);
                const ref = doc.system?.mechanicsRef ?? '';
                const isStub = ref !== '' && doc.system?.mechanics === undefined;
                const isOverride = ref === '' && doc.system?.mechanics !== undefined;
                expect(isStub || isOverride, `${id ?? '?'} is a stub or an override`).toBe(true);
                const stubResolves = !isStub || rtUuidsByIdentifier.get(id ?? '')?.has(ref) === true;
                expect(stubResolves, `${id ?? '?'} stub points at the matching RT doc`).toBe(true);
            }
        });
    }
});
