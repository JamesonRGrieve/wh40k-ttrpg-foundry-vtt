/**
 * Runtime hydration of LEAN compendium-actor inventories (compendium-hydrate.ts).
 *
 * History: pack actors store inventory DRY — items carry only the
 * `_stats.compendiumSource` / `system.variantOf` join key plus the per-actor
 * fields (specialization, level, equipped state). A full-copy approach was
 * rejected (WET: ~2,000 duplicated item bodies that drift the moment a
 * compendium item is edited). The runtime joins instead: world import
 * (createActor hook), world boot (resync), and compendium browsing (sheet
 * `_prepareContext` hydrates the pack doc in memory).
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

    it('world import hydrates via the createActor hook, gated on the triggering user', () => {
        const block = hooks.match(/hooksOn\('createActor',[\s\S]*?hydrateWorldActor[\s\S]*?\}\);/);
        expect(block).not.toBeNull();
        expect(block?.[0]).toMatch(/game\.user\.id !== userId/);
    });

    it('compendium browsing hydrates the pack doc in _prepareContext', () => {
        const ctx = sheet.match(/_prepareContext\([\s\S]*?hydratePackActor\(/);
        expect(ctx).not.toBeNull();
        expect(ctx?.[0]).toMatch(/this\.actor\.pack/);
    });

    it('pack hydration never writes to the database (updateSource + reset only)', () => {
        const fn = hydrate.match(/export async function hydratePackActor[\s\S]*?\n\}/);
        expect(fn).not.toBeNull();
        expect(fn?.[0]).toMatch(/updateSource/);
        expect(fn?.[0]).not.toMatch(/updateEmbeddedDocuments/);
    });

    it('world hydration persists via updateEmbeddedDocuments and never runs on pack docs', () => {
        const fn = hydrate.match(/export async function hydrateWorldActor[\s\S]*?\n\}/);
        expect(fn).not.toBeNull();
        expect(fn?.[0]).toMatch(/if \(actor\.pack != null && actor\.pack !== ''\) return 0;/);
        expect(fn?.[0]).toMatch(/updateEmbeddedDocuments/);
    });
});
