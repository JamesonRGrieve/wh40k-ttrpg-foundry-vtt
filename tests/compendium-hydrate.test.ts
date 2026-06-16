/**
 * Runtime hydration of LEAN inventories (compendium-hydrate.ts).
 *
 * History: actors store inventory DRY — items carry only the
 * `_stats.compendiumSource` / `system.variantOf` join key plus the per-actor
 * fields (specialization, level, equipped state, XP cost). A full-copy approach
 * was rejected (WET: ~2,000 duplicated item bodies that drift the moment a
 * compendium item is edited). The runtime joins instead, ALWAYS IN MEMORY and
 * never to the database, via the single `hydrateActorInMemory` entry point:
 * world boot (hooks-manager ready loop), world import (createActor hook), and
 * rendering / compendium browsing (sheet `_prepareContext`). The old DB-write
 * resync (`compendium-resync.ts`) was deleted — an in-memory join cannot clobber
 * persisted per-actor state because it never persists.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildHydratedSystem } from '../src/module/compendium-hydrate.ts';

describe('buildHydratedSystem (persisted wins, canonical fills)', () => {
    const canonical = {
        damage: { dh2: { formula: '2d10', type: 'energy', bonus: 10, penetration: 12 } },
        weight: 3.5,
        availability: 'very-rare',
        specialization: '',
        state: { equipped: false, stowed: false },
        gameSystems: ['dh2'],
    };

    it('fills a lean stub with the full canonical definition', () => {
        const merged = buildHydratedSystem(canonical, {});
        expect(merged).toEqual(canonical);
    });

    it('keeps the per-actor specialization/level overlay on top of the canonical body', () => {
        const merged = buildHydratedSystem(canonical, { specialization: 'Las', level: 3 });
        expect(merged['specialization']).toBe('Las');
        expect(merged['level']).toBe(3);
        expect(merged['damage']).toEqual(canonical.damage);
    });

    it('deep-merges nested per-actor state without losing canonical siblings', () => {
        const merged = buildHydratedSystem(canonical, { state: { equipped: true } });
        expect(merged['state']).toEqual({ equipped: true, stowed: false });
    });

    it('keeps the variantOf pointer through the join', () => {
        const merged = buildHydratedSystem(canonical, { variantOf: 'Compendium.wh40k-rpg.hb-dh2-items-misc.Item.1mVgJ3wYe6hNj970' });
        expect(merged['variantOf']).toBe('Compendium.wh40k-rpg.hb-dh2-items-misc.Item.1mVgJ3wYe6hNj970');
    });

    it('is idempotent: re-joining a fully hydrated item is a no-op', () => {
        const once = buildHydratedSystem(canonical, { specialization: 'Las' });
        const twice = buildHydratedSystem(canonical, once);
        expect(twice).toEqual(once);
    });

    it('does not mutate its inputs', () => {
        const persisted = { state: { equipped: true } };
        buildHydratedSystem(canonical, persisted);
        expect(canonical.state.equipped).toBe(false);
        expect(persisted).toEqual({ state: { equipped: true } });
    });
});

describe('hydration wiring (source pins)', () => {
    const hydrate = readFileSync(resolve(__dirname, '../src/module/compendium-hydrate.ts'), 'utf8');
    const hooks = readFileSync(resolve(__dirname, '../src/module/hooks-manager.ts'), 'utf8');
    const sheet = readFileSync(resolve(__dirname, '../src/module/applications/actor/base-actor-sheet.ts'), 'utf8');

    it('world boot hydrates every actor in memory in the ready chain', () => {
        // ready() calls the boot-hydration helper as a plain awaited function.
        const ready = hooks.match(/static async ready\(\):[\s\S]*?await uuidNameCache\.build\(\);/);
        expect(ready).not.toBeNull();
        expect(ready?.[0], 'ready() invokes the boot hydration').toMatch(/await HooksManager\.hydrateWorldActorsOnReady\(\)/);

        // The helper gates on the toggle and joins every world actor in memory.
        const helper = hooks.match(/static async hydrateWorldActorsOnReady\(\):[\s\S]*?\n {4}\}/);
        expect(helper).not.toBeNull();
        expect(helper?.[0], 'gated by the resync-on-ready toggle').toMatch(/SETTINGS\.resyncOnReady/);
        expect(helper?.[0], 'iterates world actors').toMatch(/game\.actors\.contents\.map\(async \(actor\) =>/);
        expect(helper?.[0], 'joins each via hydrateActorInMemory').toMatch(/await hydrateActorInMemory\(actor\)/);
    });

    it('world import hydrates via the createActor hook, ungated (every client joins its own copy)', () => {
        // Anchor on the hydrate-specific signature so we match THIS createActor hook,
        // not the sibling grantDefaultItemsToActor one (which is correctly userId-gated).
        const block = hooks.match(/hooksOn\('createActor',\s*\(actor: Parameters<typeof hydrateActorInMemory>\[0\]\) => \{[\s\S]*?\}\);/);
        expect(block).not.toBeNull();
        expect(block?.[0]).toMatch(/void hydrateActorInMemory\(actor\)/);
        // In-memory join must run on every client, so it must NOT gate on the triggering userId.
        expect(block?.[0]).not.toMatch(/game\.user\.id !== userId/);
    });

    it('rendering hydrates the actor in _prepareContext for all actors (no pack-only guard)', () => {
        const ctx = sheet.match(/_prepareContext\([\s\S]*?hydrateActorInMemory\(this\.actor\)/);
        expect(ctx).not.toBeNull();
    });

    it('the only hydration path never writes the database (updateSource + reset, no updateEmbeddedDocuments)', () => {
        const fn = hydrate.match(/export async function hydrateActorInMemory[\s\S]*?\n\}/);
        expect(fn).not.toBeNull();
        expect(fn?.[0]).toMatch(/updateSource/);
        expect(fn?.[0]).toMatch(/actor\.reset\?\.\(\)/);
        // The join is in-memory only — no DB-write CALL in the function body.
        expect(fn?.[0]).not.toMatch(/updateEmbeddedDocuments\(/);
    });

    it('no DB-write hydration variant survives anywhere in the module', () => {
        // No CALL to the DB-write API (the module doc comment may mention it as history).
        expect(hydrate).not.toMatch(/\.updateEmbeddedDocuments\(/);
        // The old per-target function names are gone (replaced by the single in-memory path).
        expect(hydrate).not.toMatch(/function hydrateWorldActor|function hydratePackActor/);
    });
});
