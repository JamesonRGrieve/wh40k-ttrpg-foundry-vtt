/**
 * Unit tests for the RollTable `TableResult` schema migration (GH #419).
 *
 * The transform rewrites legacy numeric `TableResult.type` to the Foundry V13+
 * string DocumentType, builds `documentUuid` from the legacy
 * `documentCollection` + `documentId`, and defaults `weight`. These tests pin the
 * pure transform: text results, world/compendium document results, weight
 * defaulting, and idempotency.
 */
import { describe, expect, it } from 'vitest';
import {
    buildDocumentUuid,
    findLegacyNumericResults,
    migrateResult,
    migrateRollTable,
    resultTypeIsLegacyNumeric,
} from '../scripts/migrate-rolltable-result-types.mjs';

describe('migrateResult — legacy numeric text type', () => {
    it('rewrites numeric type 0 to the string "text" and defaults weight when missing', () => {
        const input = {
            _id: 'abc',
            type: 0,
            text: '<p>Small copper disk</p>',
            range: [1, 2],
            drawn: false,
        };
        const { result, changed } = migrateResult(input);

        expect(changed).toBe(true);
        expect(result.type).toBe('text');
        expect(result.weight).toBe(1);
        // text-type results keep their text and gain no documentUuid.
        expect(result.text).toBe('<p>Small copper disk</p>');
        expect(result.documentUuid).toBeUndefined();
    });

    it('does not mutate the input object', () => {
        const input = { _id: 'abc', type: 0, text: 'x', range: [1, 1], drawn: false };
        migrateResult(input);
        expect(input.type).toBe(0);
        expect('weight' in input).toBe(false);
    });

    it('strips legacy null documentId / documentCollection reference keys', () => {
        const input = {
            _id: 'abc',
            type: 0,
            text: 'x',
            weight: 1,
            range: [1, 30],
            drawn: false,
            documentCollection: null,
            documentId: null,
        };
        const { result, changed } = migrateResult(input);

        expect(changed).toBe(true);
        expect('documentCollection' in result).toBe(false);
        expect('documentId' in result).toBe(false);
    });
});

describe('migrateResult — legacy document / compendium type', () => {
    it('maps numeric type 1 to "document" and builds a WORLD documentUuid', () => {
        const input = {
            _id: 'r1',
            type: 1,
            text: 'Some Actor',
            documentCollection: 'Actor',
            documentId: 'act123',
            range: [1, 10],
            drawn: false,
        };
        const { result, changed } = migrateResult(input);

        expect(changed).toBe(true);
        expect(result.type).toBe('document');
        expect(result.documentUuid).toBe('Actor.act123');
        expect('documentCollection' in result).toBe(false);
        expect('documentId' in result).toBe(false);
        // document results move the legacy text into `name` and blank `text`.
        expect(result.name).toBe('Some Actor');
        expect(result.text).toBe('');
        expect(result.weight).toBe(1);
    });

    it('maps numeric type 2 (compendium) to "document" with a Compendium documentUuid', () => {
        const input = {
            _id: 'r2',
            type: 2,
            text: 'A curio',
            documentCollection: 'wh40k-rpg.im-core-items',
            documentId: 'itm456',
            range: [11, 20],
            drawn: false,
            weight: 3,
        };
        const { result } = migrateResult(input);

        expect(result.type).toBe('document');
        expect(result.documentUuid).toBe('Compendium.wh40k-rpg.im-core-items.itm456');
        // existing weight is preserved, not overwritten with the default.
        expect(result.weight).toBe(3);
    });

    it('buildDocumentUuid distinguishes world documents from compendium packs', () => {
        expect(buildDocumentUuid('Item', 'x1')).toBe('Item.x1');
        expect(buildDocumentUuid('wh40k-rpg.dh2-core-items', 'x2')).toBe('Compendium.wh40k-rpg.dh2-core-items.x2');
        expect(buildDocumentUuid('Actor', '')).toBeNull();
        expect(buildDocumentUuid(null, 'x3')).toBeNull();
    });
});

describe('migrateResult — idempotency', () => {
    it('leaves an already-migrated text result unchanged on a second pass', () => {
        const first = migrateResult({
            _id: 'abc',
            type: 0,
            text: 'x',
            range: [1, 2],
            drawn: false,
        }).result;

        const { result: second, changed } = migrateResult(first);
        expect(changed).toBe(false);
        expect(second).toEqual(first);
    });

    it('leaves an already-migrated document result unchanged on a second pass', () => {
        const first = migrateResult({
            _id: 'r1',
            type: 1,
            text: 'Some Actor',
            documentCollection: 'Actor',
            documentId: 'act123',
            range: [1, 10],
            drawn: false,
        }).result;

        const { result: second, changed } = migrateResult(first);
        expect(changed).toBe(false);
        expect(second).toEqual(first);
    });
});

describe('migrateRollTable and detectors', () => {
    it('migrates every result and reports the count', () => {
        const doc = {
            _id: 't1',
            name: 'Curios',
            results: [
                { _id: 'a', type: 0, text: 'one', range: [1, 1], drawn: false },
                { _id: 'b', type: 0, text: 'two', range: [2, 2], drawn: false },
            ],
        };
        const { doc: migrated, changed, resultsMigrated } = migrateRollTable(doc);

        expect(changed).toBe(true);
        expect(resultsMigrated).toBe(2);
        expect((migrated.results as Array<{ type: string }>).every((r) => r.type === 'text')).toBe(true);
        // pure: original doc untouched.
        expect(doc.results[0].type).toBe(0);
    });

    it('returns the same document reference untouched when there is nothing to migrate', () => {
        const doc = { _id: 't2', name: 'No results field' };
        const out = migrateRollTable(doc);
        expect(out.changed).toBe(false);
        expect(out.doc).toBe(doc);
    });

    it('findLegacyNumericResults / resultTypeIsLegacyNumeric flag numeric types only', () => {
        const doc = {
            results: [
                { _id: 'a', type: 0 },
                { _id: 'b', type: 'text' },
                { _id: 'c', type: 2 },
            ],
        };
        const legacy = findLegacyNumericResults(doc);
        expect(legacy.map((r) => r._id)).toEqual(['a', 'c']);
        expect(resultTypeIsLegacyNumeric({ type: 0 })).toBe(true);
        expect(resultTypeIsLegacyNumeric({ type: 'document' })).toBe(false);
        expect(findLegacyNumericResults({ foo: 1 })).toEqual([]);
    });
});
