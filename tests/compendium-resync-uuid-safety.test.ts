/**
 * Regression guard: compendium resync must not crash on malformed pack ids.
 *
 * History: Foundry's `DocumentUUIDField` rejects any UUID whose terminal
 * id segment is not exactly 16 alphanumeric characters (see `isValidId`
 * in `foundry.mjs` — the regex is `/^[a-zA-Z0-9]{16}$/`). The resync
 * builds backfill UUIDs from pack index entries; when a pack entry's
 * `_id` is malformed (legacy pack, hand-edited fixture, etc.), the
 * resulting `Compendium.{pkg}.{name}.Item.{badId}` UUID is rejected by
 * `_stats.compendiumSource` validation. Before the fix, that rejection
 * fired *inside* `updateEmbeddedDocuments` and aborted the entire ready-hook
 * resync mid-actor, leaving every later actor unsynced
 * ("validation errors: ... compendiumSource: must contain a valid document ID").
 *
 * The fix has three layers: (a) skip bad pack entries in the name index,
 * (b) defensively re-validate the UUID at the backfill write site, and
 * (c) wrap the per-actor `updateEmbeddedDocuments` call in try/catch so
 * one malformed item cannot strand later actors. This test pins those
 * three layers in source — runtime instantiation of the resync would
 * need a live Foundry instance.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RESYNC_PATH = resolve(__dirname, '../src/module/compendium-resync.ts');
const src = readFileSync(RESYNC_PATH, 'utf8');

describe('compendium resync UUID safety layers', () => {
    it('declares a Foundry document-id regex matching Foundry core (16 alphanumeric)', () => {
        // Mirror the source-of-truth regex from foundry.mjs:`isValidId`. A test
        // that uses a permissive regex (e.g. dropping the {16}) would let the
        // very bug slip back in.
        expect(src).toMatch(/\/\^\[a-zA-Z0-9\]\{16\}\$\//);
    });

    it('filters pack index entries with invalid ids in the name index', () => {
        // Skip-with-warn at index construction, not write-time, is the load-bearing
        // line: it guarantees we never even *store* a malformed UUID candidate.
        const indexLoop = src.match(/for\s*\(\s*const\s+\{\s*pack,\s*index\s*\}[\s\S]*?lookup\.set\([\s\S]*?\}\s*\n\s*\}/);
        expect(indexLoop).not.toBeNull();
        expect(indexLoop?.[0]).toMatch(/isValidFoundryId\(entry\._id\)/);
        expect(indexLoop?.[0]).toMatch(/continue/);
    });

    it('re-validates the UUID at the backfill write site', () => {
        // Even with the index filter, a defensive re-check at the write site
        // protects against a future code path that introduces a UUID from a
        // different source.
        const backfillIdx = src.indexOf('if (backfillNeeded)');
        expect(backfillIdx).toBeGreaterThan(-1);
        const writeIdx = src.indexOf("writeProperty(finalPatch, '_stats.compendiumSource'", backfillIdx);
        const guardIdx = src.indexOf('isValidFoundryId', backfillIdx);
        expect(writeIdx).toBeGreaterThan(-1);
        expect(guardIdx).toBeGreaterThan(-1);
        // The guard must precede the write so a failed check skips writing.
        expect(guardIdx).toBeLessThan(writeIdx);
        // The write must remain inside an else branch (not unconditional after a warning log).
        const between = src.slice(guardIdx, writeIdx);
        expect(between).toMatch(/\belse\s*\{/);
    });

    it('wraps updateEmbeddedDocuments in try/catch so one bad actor cannot abort the resync', () => {
        const updateBlock = src.match(/if\s*\(\s*updates\.length\s*>\s*0\s*\)\s*\{[\s\S]*?\n\s*\}\s*\n\s*return\s*\{\s*touched/);
        expect(updateBlock).not.toBeNull();
        expect(updateBlock?.[0]).toMatch(/try\s*\{[\s\S]*await\s+actor\.updateEmbeddedDocuments/);
        expect(updateBlock?.[0]).toMatch(/catch\s*\(\s*err\b/);
        // On failure, return early with touched=0 — do not propagate the throw.
        expect(updateBlock?.[0]).toMatch(/return\s*\{\s*touched:\s*0/);
    });
});

describe('isValidFoundryId behavior (regex semantics)', () => {
    // Re-derive the regex from source so the test fails loudly if the source regex changes.
    const m = src.match(/FOUNDRY_ID_RE\s*=\s*(\/\^\[a-zA-Z0-9\]\{16\}\$\/)/);
    expect(m).not.toBeNull();
    const re = new RegExp((m?.[1] ?? '').replaceAll('/', '').replace(/^\^/, '^').replace(/\$$/, '$'));

    it('accepts a canonical 16-char alphanumeric id', () => {
        expect(re.test('abcdefABCDEF0123')).toBe(true);
        expect(re.test('UKU6K6vL4mmBtcMe')).toBe(true);
    });

    it.each([
        ['', 'empty string'],
        ['short', 'too short'],
        ['this-id-has-dashes', 'contains dashes'],
        ['has spaces in it!', 'has spaces and punctuation'],
        ['seventeenchars123', 'too long'],
        ['fifteenchar1234', 'one char short'],
    ])('rejects %s (%s)', (badId) => {
        expect(re.test(badId)).toBe(false);
    });
});
