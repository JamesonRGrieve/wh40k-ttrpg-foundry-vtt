import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    canonicalSystemForLine,
    inferActiveGameLine,
    isLineVariantContainer,
    isXpLineMap,
    lineVariantPaths,
    lineVariantSourceOf,
    materializeItemVariants,
    materializeOwnedItemSources,
    normalizeGameLineKey,
    ownerGameLine,
    rawProvenanceLines,
    rebaseLineVariantContent,
    rememberLineVariantSource,
    resolveLineVariant,
    resolveOwnedLineContent,
    sameSourceValue,
    systemForLine,
} from './item-variant-utils.ts';

describe('resolveLineVariant', () => {
    it('returns plain values unchanged', () => {
        expect(resolveLineVariant('1d10', 'dh2')).toBe('1d10');
    });

    it('resolves the active line branch', () => {
        expect(resolveLineVariant({ dh1: 'a', dh2: 'b' }, 'dh2')).toBe('b');
    });

    it('falls back to the first defined line when the active line is absent', () => {
        expect(resolveLineVariant({ dh1: 'a', rt: 'c' }, 'dh2')).toBe('a');
    });

    it('resolves a book-variant container to its canonical book', () => {
        const value = { __canonical: 'core', __books: { 'core': '1d10+3', 'enemies-within': '1d10+4' } };
        expect(resolveLineVariant(value, 'dh2')).toBe('1d10+3');
    });

    it('falls back to the first book when canonical is missing', () => {
        const value = { __books: { 'enemies-within': '1d10+4', 'core': '1d10+3' } };
        expect(resolveLineVariant(value, 'dh2')).toBe('1d10+4');
    });

    it('resolves a book-variant nested inside the active line branch', () => {
        const value = { dh2: { __canonical: 'ew', __books: { core: 'x', ew: 'y' } }, dh1: 'z' };
        expect(resolveLineVariant(value, 'dh2')).toBe('y');
    });

    it('falls back to the raw-provenance line, not id order, when the active line is absent', () => {
        // ow is the raw line; dh2 is a homebrew conversion branch. An unauthored
        // line (rt) must inherit the RAW (ow) stats, never the dh2 homebrew branch.
        const grants = { ow: 'official', dh2: 'homebrew-conversion' };
        expect(resolveLineVariant(grants, 'rt', ['ow'])).toBe('official');
        // The active line that owns a branch still gets its own.
        expect(resolveLineVariant(grants, 'dh2', ['ow'])).toBe('homebrew-conversion');
        // Without a raw-line hint, behaviour reverts to first-defined (id order).
        expect(resolveLineVariant(grants, 'rt')).toBe('homebrew-conversion');
    });
});

describe('rawProvenanceLines', () => {
    it('lists only lines whose source provenance is raw, in id order', () => {
        const system = {
            source: {
                ow: { provenance: 'raw' },
                rt: { provenance: 'raw' },
                dh2: { provenance: 'homebrew' },
            },
        };
        expect(rawProvenanceLines(system)).toEqual(['rt', 'ow']);
    });

    it('returns an empty list when there is no source map', () => {
        expect(rawProvenanceLines({})).toEqual([]);
    });
});

describe('materializeItemVariants — raw-provenance fallback', () => {
    it('collapses a homebrew dh2 conversion without leaking it onto sibling lines', () => {
        const make = (): { source: Record<string, { provenance: string }>; grants: Record<string, string> } => ({
            source: { ow: { provenance: 'raw' }, dh2: { provenance: 'homebrew' } },
            grants: { ow: 'OW-STATS', dh2: 'DH2-HOMEBREW' },
        });
        // dh2 actor → its own homebrew branch.
        expect(materializeItemVariants(make(), 'dh2')['grants']).toBe('DH2-HOMEBREW');
        // ow actor → the raw branch.
        expect(materializeItemVariants(make(), 'ow')['grants']).toBe('OW-STATS');
        // rt actor (references the doc, no branch) → inherits the RAW (ow) stats.
        expect(materializeItemVariants(make(), 'rt')['grants']).toBe('OW-STATS');
    });
});

describe('materializeItemVariants', () => {
    it('flattens line and book variants in place to the active line + canonical book', () => {
        const source = {
            damage: { dh2: { __canonical: 'core', __books: { core: '1d10+3', ew: '1d10+5' } }, dh1: '1d10+2' },
            pen: { __canonical: 'core', __books: { core: 2, ew: 3 } },
            name: 'Lasgun',
        };
        materializeItemVariants(source, 'dh2');
        expect(source.damage).toBe('1d10+3');
        expect(source.pen).toBe(2);
        expect(source.name).toBe('Lasgun');
    });

    it("reads a rider's explicit null branch as 'this line prints none', not a fallback (#622)", () => {
        // The shared Rad Grenade: DH2 and RT print a Toughness rider, Black Crusade none (its Irradiated quality).
        const make = (): {
            source: Record<string, { provenance: string }>;
            rider: Record<string, { effect: string } | null>;
            damage: Record<string, string | null>;
        } => ({
            source: { dh2: { provenance: 'raw' }, bc: { provenance: 'raw' }, rt: { provenance: 'raw' } },
            rider: { dh2: { effect: 'DH2 rider' }, rt: { effect: 'RT rider' }, bc: null },
            damage: { dh2: '1d10', bc: null },
        });
        expect(materializeItemVariants(make(), 'bc')['rider']).toBeNull();
        expect(materializeItemVariants(make(), 'rt')['rider']).toEqual({ effect: 'RT rider' });
        // A line with no branch at all still inherits the RAW printing.
        expect(materializeItemVariants(make(), 'dh1')['rider']).toEqual({ effect: 'DH2 rider' });
        // Any other field keeps falling back past an explicit null.
        expect(materializeItemVariants(make(), 'bc')['damage']).toBe('1d10');
    });
});

describe('materializeItemVariants — XP cost (content#30)', () => {
    const SOURCE = { dh2: { provenance: 'raw' }, ow: { provenance: 'raw' }, rt: { provenance: 'raw' } };
    /** An authored cost: XP per line, or a currency record per line. */
    type AuthoredCost = Partial<Record<string, number | null | Record<string, number | null | Record<string, null>>>>;
    const power = (cost: AuthoredCost): SystemSource => ({ source: structuredClone(SOURCE), cost });

    it("collapses a per-line XP map to the active line's printed value", () => {
        expect(materializeItemVariants(power({ dh2: 200, ow: 300 }), 'ow')['cost']).toBe(300);
        expect(materializeItemVariants(power({ dh2: 200, ow: 300 }), 'dh2')['cost']).toBe(200);
        // A talent's 0 is a printed value, not an absence.
        expect(materializeItemVariants(power({ ow: 300, dh2: 0 }), 'dh2')['cost']).toBe(0);
    });

    it("reads an explicit null as 'this line prints none', never another line's price", () => {
        expect(materializeItemVariants(power({ dh2: 200, rt: null }), 'rt')['cost']).toBeNull();
    });

    it('lets a line with no branch at all inherit the raw printing', () => {
        expect(materializeItemVariants(power({ dh2: 200, rt: null }), 'bc')['cost']).toBe(200);
    });

    it('walks an acquisition-currency record without collapsing it', () => {
        const currency = { dh2: { influence: 5, homebrew: { throneGelt: null } }, rt: { profitFactor: 2 } };
        expect(materializeItemVariants(power(structuredClone(currency)), 'rt')['cost']).toEqual(currency);
    });

    it('leaves a non-cost numeric per-line field on the ordinary fallback', () => {
        const source = { source: structuredClone(SOURCE), testModifier: { dh2: 20, rt: null } };
        expect(materializeItemVariants(source, 'rt')['testModifier']).toBe(20);
    });
});

describe('isXpLineMap', () => {
    it('accepts a line container of XP numbers and nulls with at least one number', () => {
        expect(isXpLineMap({ dh2: 200, ow: null })).toBe(true);
    });

    it('rejects currency records, all-null maps and non-line objects', () => {
        expect(isXpLineMap({ dh2: { influence: null } })).toBe(false);
        expect(isXpLineMap({ dh2: null, rt: null })).toBe(false);
        expect(isXpLineMap({ throneGelt: 50 })).toBe(false);
        expect(isXpLineMap(300)).toBe(false);
    });
});

describe('systemForLine (content#30, #673)', () => {
    const source = { dh2: { provenance: 'raw' }, ow: { provenance: 'raw' } };

    it('resolves a raw index entry to the requested line without touching the input', () => {
        const system = { source, cost: { dh2: 200, ow: 300 }, prerequisites: { dh2: 'Willpower 40', ow: 'Willpower 35' } };
        const resolved = systemForLine(system, 'ow');
        expect(resolved.cost).toBe(300);
        expect(resolved.prerequisites).toBe('Willpower 35');
        expect(system.cost).toEqual({ dh2: 200, ow: 300 });
    });

    it('passes a plain number and a currency record through', () => {
        expect(systemForLine({ source, cost: 300 }, 'dh2').cost).toBe(300);
        expect(systemForLine({ source, cost: { dh2: { influence: null } } }, 'dh2').cost).toEqual({ dh2: { influence: null } });
    });
});

describe('inferActiveGameLine', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('prefers the owning actor line', () => {
        expect(inferActiveGameLine({ actor: { system: { gameSystem: 'rt' } } })).toBe('rt');
    });

    it('falls back to the world primary game system when there is no actor', () => {
        vi.stubGlobal('game', { settings: { get: (): string => 'bc' } });
        expect(inferActiveGameLine()).toBe('bc');
    });

    it('resolves im from the world primary now that it is a recognised variant line', () => {
        vi.stubGlobal('game', { settings: { get: (): string => 'im' } });
        expect(inferActiveGameLine()).toBe('im');
    });

    it("resolves an NPC-owned item to the NPC's type line, not the world line (NPC systems carry no gameSystem)", () => {
        vi.stubGlobal('game', { settings: { get: (): string => 'dh1' } });
        expect(inferActiveGameLine({ actor: { type: 'bc-npc', system: {} } })).toBe('bc');
    });
});

describe('ownerGameLine', () => {
    it('reads the line from a per-line actor type first', () => {
        expect(ownerGameLine({ type: 'bc-character', system: { gameSystem: 'dh2' } })).toBe('bc');
        expect(ownerGameLine({ type: 'dh1-npc' })).toBe('dh1');
    });

    it('falls back to system.gameSystem for a legacy unprefixed type', () => {
        expect(ownerGameLine({ type: 'character', system: { gameSystem: 'ow' } })).toBe('ow');
    });

    it('returns null when nothing names a line', () => {
        expect(ownerGameLine({ type: 'loot', system: {} })).toBeNull();
        expect(ownerGameLine(null)).toBeNull();
        expect(ownerGameLine(undefined)).toBeNull();
    });
});

/** A raw item system payload, as the variant helpers take it. */
type SystemSource = Parameters<typeof materializeItemVariants>[0];

/** Fire Bolt as authored: per-line range and focus test (BC and DH1 differ). */
const fireBoltPristine = (): SystemSource => ({
    range: { bc: '15 metres x Psy Rating', dh1: '100m' },
    focusPower: {
        bc: { characteristic: 'willpower', modifier: 10 },
        dh1: { characteristic: 'willpower', modifier: 0, threshold: 11 },
    },
    cost: { bc: 200, dh1: 300 },
    sustained: false,
});

describe('materializeOwnedItemSources', () => {
    it("resolves every embedded item to the OWNING actor's line, whatever the world line", () => {
        vi.stubGlobal('game', { settings: { get: (): string => 'dh1' } });
        const actorSource = { type: 'bc-character', system: {}, items: [{ name: 'Fire Bolt', system: fireBoltPristine() }] };
        materializeOwnedItemSources(actorSource);
        expect(actorSource.items[0]?.system).toEqual({
            range: '15 metres x Psy Rating',
            focusPower: { characteristic: 'willpower', modifier: 10 },
            // The BC owner pays BC's printed XP (content#30).
            cost: 200,
            sustained: false,
        });
        vi.unstubAllGlobals();
    });

    it('leaves the containers for the item migration when the actor names no line', () => {
        const actorSource = { type: 'loot', system: {}, items: [{ system: fireBoltPristine() }] };
        materializeOwnedItemSources(actorSource);
        expect(actorSource.items[0]?.system).toEqual(fireBoltPristine());
    });
});

describe('lineVariantPaths', () => {
    it('lists each line container once and descends into shared-line objects', () => {
        expect(lineVariantPaths({ ...fireBoltPristine(), nested: { inner: { rt: 1, dw: 2 } }, cost: { dh2: { rt: 5 } } })).toEqual([
            ['range'],
            ['focusPower'],
            ['cost', 'dh2'],
            ['nested', 'inner'],
        ]);
    });

    it('lists a per-line XP cost as one container (content#30)', () => {
        expect(lineVariantPaths(fireBoltPristine())).toEqual([['range'], ['focusPower'], ['cost']]);
    });
});

describe('rebaseLineVariantContent', () => {
    const worldFlat = materializeItemVariants(fireBoltPristine(), 'dh1');
    const ownerFlat = materializeItemVariants(fireBoltPristine(), 'bc');

    it("re-points an unedited world-line copy to the owner's line", () => {
        const persisted: SystemSource = { ...structuredClone(worldFlat), equipped: true };
        const rebased = rebaseLineVariantContent(fireBoltPristine(), worldFlat, ownerFlat, persisted);
        expect(rebased['range']).toBe('15 metres x Psy Rating');
        expect(rebased['focusPower']).toEqual({ characteristic: 'willpower', modifier: 10 });
        expect(rebased['equipped']).toBe(true);
        // Pure: the input is untouched.
        expect(persisted['range']).toBe('100m');
    });

    it('keeps a value the actor customised (persisted wins)', () => {
        const persisted = { ...structuredClone(worldFlat), range: '30m' };
        expect(rebaseLineVariantContent(fireBoltPristine(), worldFlat, ownerFlat, persisted)['range']).toBe('30m');
    });

    it('is idempotent once the owner line is already stored', () => {
        const rebased = rebaseLineVariantContent(fireBoltPristine(), worldFlat, ownerFlat, structuredClone(ownerFlat));
        expect(rebased).toEqual(ownerFlat);
    });
});

describe('resolveOwnedLineContent / canonicalSystemForLine', () => {
    const identityClean = (_type: string, system: SystemSource): SystemSource => system;
    /** A canonical compendium document as it sits loaded: flattened to the world (dh1) line. */
    const loadedCanonical = (): { type: string; _source: { system: SystemSource } } => {
        const empty: SystemSource = {};
        const doc = { type: 'psychicPower', _source: { system: empty } };
        rememberLineVariantSource(doc, fireBoltPristine());
        doc._source.system = materializeItemVariants(fireBoltPristine(), 'dh1');
        return doc;
    };

    it('resolves a BC-owned copy of a multi-line canonical to bc', () => {
        const canonical = loadedCanonical();
        const dropped = structuredClone(canonical._source.system);
        const resolved = resolveOwnedLineContent(canonical, dropped, 'bc', identityClean);
        expect(resolved?.base['range']).toBe('15 metres x Psy Rating');
        expect(resolved?.overlay['range']).toBe('15 metres x Psy Rating');
        expect(resolved?.overlay['focusPower']).toEqual({ characteristic: 'willpower', modifier: 10 });
    });

    it('leaves the unowned canonical itself on the world line', () => {
        const canonical = loadedCanonical();
        expect(canonical._source.system['range']).toBe('100m');
        expect(canonicalSystemForLine(canonical, 'dh1', identityClean)?.['range']).toBe('100m');
    });

    // Regression: cleanData passes `_state.model` straight through, and some clean
    // paths (a what-if preview, an actor's embedded-item clean) pass a non-object.
    // A WeakMap rejects that key, which threw and aborted the whole Actor.create.
    it.each([true, 'model', 7, null, undefined])('ignores a non-object model (%s) instead of throwing', (model) => {
        expect(() => {
            rememberLineVariantSource(model, fireBoltPristine());
        }).not.toThrow();
    });

    it('returns null for a canonical that carried no line containers', () => {
        const flatDoc = { type: 'psychicPower', _source: { system: { range: '10m' } } };
        rememberLineVariantSource(flatDoc, { range: '10m' });
        expect(lineVariantSourceOf(flatDoc)).toBeUndefined();
        expect(resolveOwnedLineContent(flatDoc, { range: '10m' }, 'bc', identityClean)).toBeNull();
    });

    it('caches the cleaned resolution per document and line', () => {
        const canonical = loadedCanonical();
        const clean = vi.fn(identityClean);
        canonicalSystemForLine(canonical, 'bc', clean);
        canonicalSystemForLine(canonical, 'bc', clean);
        canonicalSystemForLine(canonical, 'dh1', clean);
        expect(clean).toHaveBeenCalledTimes(2);
    });
});

describe('sameSourceValue', () => {
    it('ignores key order and compares arrays element-wise', () => {
        expect(sameSourceValue({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
        expect(sameSourceValue({ a: 1 }, { a: 2 })).toBe(false);
        expect(sameSourceValue([1, 2], [2, 1])).toBe(false);
    });
});

describe('isLineVariantContainer / normalizeGameLineKey', () => {
    it('detects line-keyed containers only', () => {
        expect(isLineVariantContainer({ dh2: 1 })).toBe(true);
        expect(isLineVariantContainer({ value: 1 })).toBe(false);
        expect(isLineVariantContainer({ __books: {} })).toBe(false);
    });

    it('normalizes supported line keys (including im) and rejects others', () => {
        expect(normalizeGameLineKey('dh2')).toBe('dh2');
        expect(normalizeGameLineKey('im')).toBe('im');
        expect(normalizeGameLineKey('nope')).toBeNull();
    });
});
