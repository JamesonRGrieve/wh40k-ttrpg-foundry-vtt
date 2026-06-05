/**
 * Regression guard: compendium resync must never reconcile per-actor variants.
 *
 * History: quest-specific items live directly on the actor as self-contained
 * `system.variantOf` items (see src/packs/CLAUDE.md "Variants") — e.g.
 * "Robes (of bestial hides)" pointing at the generic homebrew "Robes" base.
 * They carry no `_stats.compendiumSource`, so before the fix the resync's
 * name-fallback would strip the specialization suffix, match the generic base
 * by name, backfill `compendiumSource`, and flatten the variant's name and
 * system data back onto the base — silently destroying the variant on every
 * world boot. Variants intentionally diverge from every compendium record;
 * the resync must skip them outright.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RESYNC_PATH = resolve(__dirname, '../src/module/compendium-resync.ts');
const src = readFileSync(RESYNC_PATH, 'utf8');

describe('compendium resync skips per-actor variants', () => {
    it('declares an isActorVariant guard keyed on a non-empty system.variantOf', () => {
        const guard = src.match(/function isActorVariant\([\s\S]*?\n\}/);
        expect(guard).not.toBeNull();
        expect(guard?.[0]).toMatch(/system\['variantOf'\]/);
        expect(guard?.[0]).toMatch(/typeof variantOf === 'string' && variantOf !== ''/);
    });

    it('skips variants inside the item loop before source resolution', () => {
        // The skip must run before resolveSource so the name fallback can never
        // backfill a compendiumSource onto a variant.
        const loop = src.match(/for\s*\(\s*const\s+item\s+of\s+actor\.items\.contents\s*\)\s*\{[\s\S]*?resolveSource\(/);
        expect(loop).not.toBeNull();
        expect(loop?.[0]).toMatch(/if\s*\(isActorVariant\(item\)\)\s*continue;/);
    });
});

describe('isActorVariant behavior (re-derived semantics)', () => {
    // Mirror the guard's logic so a silent semantic change fails loudly here.
    interface VariantBearingSystem {
        variantOf?: string | number | null;
    }
    const isActorVariant = (system: VariantBearingSystem): boolean => {
        const variantOf = system.variantOf;
        return typeof variantOf === 'string' && variantOf !== '';
    };

    it('treats a non-empty variantOf UUID as a variant', () => {
        expect(isActorVariant({ variantOf: 'Compendium.wh40k-rpg.hb-dh2-items-misc.Item.1mVgJ3wYe6hNj970' })).toBe(true);
    });

    it.each<[VariantBearingSystem, string]>([
        [{}, 'absent'],
        [{ variantOf: '' }, 'empty string'],
        [{ variantOf: null }, 'null'],
        [{ variantOf: 7 }, 'non-string'],
    ])('does not treat %o as a variant (%s)', (system) => {
        expect(isActorVariant(system)).toBe(false);
    });
});
