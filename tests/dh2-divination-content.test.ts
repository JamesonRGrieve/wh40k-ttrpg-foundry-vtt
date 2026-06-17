/**
 * Content + wiring-contract guard for the DH2 Divination origin pack (#316).
 *
 * The apply path (`OriginPathBuilder._resolveDivinationSelection` →
 * `_collectOriginCharacteristicBonuses` + `GrantsManager.applyBatchGrants`) reads
 * a chosen divination's bonus from `system.modifiers.characteristics` (flat
 * characteristic deltas) and `system.grants` (talent / skill / fate-threshold
 * grants). This reads the pack's `_source` JSON straight from disk (no live
 * Foundry) and asserts every Table-2-9 divination is present, shaped as a
 * `dh2` divination origin-path doc, and that the mechanical effects are encoded
 * where the applier looks — so a content regression fails loudly here.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readRepoFile } from './lib/repo-file.ts';

const PACK_DIR = resolve(__dirname, '../src/packs/dark-heresy-2/dh2-core-origins-divinations/_source');

interface DivinationDoc {
    name: string;
    type: string;
    system: {
        identifier: string;
        step: string;
        gameSystem: string;
        description?: { dh2?: { value?: string } };
        modifiers?: { characteristics?: Record<string, number> };
        grants?: { talents?: Array<{ name: string }>; skills?: Array<{ name: string }>; fateThreshold?: number };
    };
}

function readDivinations(): DivinationDoc[] {
    return (
        readdirSync(PACK_DIR)
            .filter((f) => f.endsWith('.json'))
            // eslint-disable-next-line no-restricted-syntax -- boundary: JSON.parse returns unknown (ts-reset); narrowed to the DivinationDoc shape the assertions below validate
            .map((f) => JSON.parse(readFileSync(resolve(PACK_DIR, f), 'utf8')) as DivinationDoc)
    );
}

describe('DH2 Divination origin pack content (#316)', () => {
    const docs = readDivinations();
    const byName = new Map(docs.map((d) => [d.name, d]));

    it('ships all 25 Table-2-9 divinations as dh2 origin-path docs', () => {
        expect(docs).toHaveLength(25);
        for (const d of docs) {
            expect(d.type).toBe('originPath');
            expect(d.system.step).toBe('divination');
            expect(d.system.gameSystem).toBe('dh2');
            expect(d.system.identifier).toMatch(/^div-/);
            expect(d.system.description?.dh2?.value ?? '').not.toBe('');
        }
    });

    it('encodes characteristic-bonus divinations as modifiers the applier sums into base', () => {
        expect(byName.get('Trust in your fear.')?.system.modifiers?.characteristics?.['perception']).toBe(5);
        expect(byName.get('Suffering is an unrelenting instructor.')?.system.modifiers?.characteristics?.['toughness']).toBe(-3);
        expect(byName.get('Thought begets Heresy.')?.system.modifiers?.characteristics?.['intelligence']).toBe(-3);
        expect(byName.get('Only the insane have strength enough to prosper.')?.system.modifiers?.characteristics?.['willpower']).toBe(3);
    });

    it('encodes talent / skill / fate-threshold grants where GrantsManager reads them', () => {
        expect(byName.get('Humans must die so that humanity can endure.')?.system.grants?.talents?.map((t) => t.name)).toContain('Jaded');
        expect(byName.get('Kill the alien before it can speak its lies.')?.system.grants?.talents?.map((t) => t.name)).toContain('Quick Draw');
        expect(byName.get('To war is human.')?.system.grants?.skills?.map((s) => s.name)).toContain('Dodge');
        expect(byName.get('Do not ask why you serve. Only ask how.')?.system.grants?.fateThreshold).toBe(1);
    });

    it('is registered in system.json (pack entry + folder grouping)', () => {
        const manifest = readRepoFile('src/system.json');
        expect((manifest.match(/dh2-core-origins-divinations/g) ?? []).length).toBeGreaterThanOrEqual(2);
    });
});
