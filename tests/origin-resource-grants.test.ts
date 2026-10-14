/**
 * Origin resources on the REAL origin pack data (#42 follow-up, #91).
 *
 * The ledger used to read `modifiers.wounds` / `modifiers.fate`, but every
 * origin document stores its resources under `modifiers.resources.*`, so no
 * origin's Wounds, Fate, Corruption or Insanity modifier was ever applied. These
 * tests drive the ledger with the documents the packs actually ship.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolvePackSourceDocument } from '../scripts/lib/pack-reference.cjs';
import {
    ORIGIN_RESOURCE_PATHS,
    ORIGIN_RESOURCES,
    type OriginModifierBag,
    deltaFromModifiers,
    originContribution,
    reconcileResourceDeltas,
} from '../src/module/origin-grant-ledger.ts';
import { startingCorruptionHoldsMalignancy, startingMutationFormula } from '../src/module/rules/chaos-backgrounds.ts';

const REPO_ROOT = resolve(__dirname, '..');
const PACKS_ROOT = resolve(REPO_ROOT, 'src/packs-private');

interface OriginDoc {
    name: string;
    type: string;
    system: { modifiers: OriginModifierBag; grants?: { woundsFormula?: string; startingMutationFormula?: string } };
}

/** An origin as authored: `modifiers` may be absent, and then loads as the schema's empty bag. */
interface AuthoredOriginDoc extends Omit<OriginDoc, 'system'> {
    system: Omit<OriginDoc['system'], 'modifiers'> & { modifiers?: OriginModifierBag };
}

/** Whether a compiled pack document is an origin with a `system` block. */
function isAuthoredOrigin(doc: object): doc is AuthoredOriginDoc {
    return 'type' in doc && doc.type === 'originPath' && 'system' in doc && typeof doc.system === 'object' && doc.system !== null;
}

/** Every originPath `_source` document under an `*-origins-*` pack, stubs resolved as the build compiles them. */
function originDocs(): Array<{ file: string; doc: OriginDoc }> {
    if (!existsSync(PACKS_ROOT)) return [];
    const out: Array<{ file: string; doc: OriginDoc }> = [];
    for (const line of readdirSync(PACKS_ROOT, { withFileTypes: true })) {
        if (!line.isDirectory()) continue;
        for (const pack of readdirSync(join(PACKS_ROOT, line.name), { withFileTypes: true })) {
            if (!pack.isDirectory() || !pack.name.includes('-origins-')) continue;
            const dir = join(PACKS_ROOT, line.name, pack.name, '_source');
            if (!existsSync(dir)) continue;
            for (const name of readdirSync(dir)) {
                if (!name.endsWith('.json')) continue;
                const file = join(dir, name);
                // A reference stub carries no `type` or `system` of its own: read it as the
                // build compiles it, its target with its overrides applied.
                const raw: object = resolvePackSourceDocument(file, { packRoot: PACKS_ROOT, repoRoot: REPO_ROOT });
                if (!isAuthoredOrigin(raw)) continue;
                // An origin with no modifiers loads the schema's empty bag (the IM origins author none).
                const { modifiers = {}, ...system } = raw.system;
                out.push({ file, doc: { ...raw, system: { ...system, modifiers } } });
            }
        }
    }
    return out;
}

const ORIGINS = originDocs();
const byName = (name: string): OriginDoc => {
    const hit = ORIGINS.find(({ doc }) => doc.name === name);
    if (hit === undefined) throw new Error(`origin "${name}" not in the packs`);
    return hit.doc;
};

/** A fresh character's system snapshot. */
const freshCharacter = (): {
    wounds: { max: number };
    fate: { max: number; value: number };
    corruption: number;
    insanity: number;
    characteristics: object;
} => ({
    wounds: { max: 10 },
    fate: { max: 2, value: 2 },
    corruption: 0,
    insanity: 0,
    characteristics: {},
});

describe.skipIf(ORIGINS.length === 0)('origin resources from the shipped origin packs', () => {
    it('stores every origin resource under modifiers.resources, never at the top level', () => {
        const topLevel = ORIGINS.filter(({ doc }) => 'wounds' in doc.system.modifiers || 'fate' in doc.system.modifiers).map(({ file }) => file);
        expect(topLevel).toEqual([]);
    });

    it('turns every non-zero modifiers.resources entry into a contribution the ledger applies', () => {
        let withResources = 0;
        const mismatches: string[] = [];
        for (const { file, doc } of ORIGINS) {
            const contribution = originContribution(deltaFromModifiers(doc.system.modifiers));
            for (const resource of ORIGIN_RESOURCES) {
                const authored = Number(doc.system.modifiers.resources?.[resource] ?? 0);
                if (contribution.resources[resource] !== authored) mismatches.push(`${file} ${resource}`);
                if (authored !== 0) withResources += 1;
            }
        }
        expect(mismatches).toEqual([]);
        // Sixty-odd origins across the lines carry a resource modifier (BC Corruption,
        // OW home-world Wounds, RT Fortune Fate, the DH2 Mutant's Corruption …).
        expect(withResources).toBeGreaterThan(50);
    });

    it('applies the Only War Agri-World +2 Wounds to the maximum', () => {
        const agri = ORIGINS.find(({ file, doc }) => doc.name === 'Agri-World' && file.includes('ow-hammer-origins-homeworlds'));
        expect(agri).toBeDefined();
        const contribution = originContribution(deltaFromModifiers(agri?.doc.system.modifiers));
        const { updates } = reconcileResourceDeltas(freshCharacter(), contribution, {}, ORIGIN_RESOURCE_PATHS);
        expect(updates).toEqual({ 'system.wounds.max': 12 });
    });

    it("applies the Rogue Trader Fortune motivation's +1 Fate to the Fate total and points", () => {
        const fortune = ORIGINS.find(({ file, doc }) => doc.name === 'Fortune' && file.includes('rt-core-origins-motivations'));
        expect(fortune).toBeDefined();
        const { updates } = reconcileResourceDeltas(
            freshCharacter(),
            originContribution(deltaFromModifiers(fortune?.doc.system.modifiers)),
            {},
            ORIGIN_RESOURCE_PATHS,
        );
        expect(updates).toEqual({ 'system.fate.max': 3, 'system.fate.value': 3 });
    });

    it("applies the DH2 Mutant's 10 starting Corruption and owes no Malignancy Test for it (Within p. 32)", () => {
        const mutant = byName('Mutant');
        expect(startingMutationFormula(mutant.system)).toBe('5d10');
        const system = { ...freshCharacter(), malignancyTestsPending: 0 };
        const { updates } = reconcileResourceDeltas(system, originContribution(deltaFromModifiers(mutant.system.modifiers)), {}, ORIGIN_RESOURCE_PATHS);
        expect(updates).toEqual({ 'system.corruption': 10 });
        expect(startingCorruptionHoldsMalignancy(mutant.system, updates, system)).toEqual({ 'system.malignancyTestsPending': 0 });
    });

    it('does not count a Wounds modifier twice where the wounds formula already prints it (DH1 Ryboth: 6+1d5)', () => {
        const ryboth = byName('Forge World: Ryboth');
        expect(ryboth.system.grants?.woundsFormula).toBe('6+1d5');
        expect(deltaFromModifiers(ryboth.system.modifiers).wounds).toBe(0);
        expect(deltaFromModifiers(ryboth.system.modifiers).fate).toBe(1);
    });

    it('both appliers feed the whole resource block to the ledger (source guard: their documents do not load under happy-dom)', () => {
        const item = readFileSync(resolve(__dirname, '../src/module/documents/item.ts'), 'utf8');
        const builder = readFileSync(resolve(__dirname, '../src/module/applications/character-creation/origin-path-builder.ts'), 'utf8');
        expect(item).toContain('reconcileResourceDeltas(actor.system, originContribution(md), priorDelta, ORIGIN_RESOURCE_PATHS)');
        expect(item).toContain('startingCorruptionHoldsMalignancy(this.system, resourceUpdates, actor.system)');
        expect(builder).toContain('originContribution(delta), prior, BUILDER_ORIGIN_RESOURCE_PATHS)');
        expect(builder).toContain('startingCorruptionHoldsMalignancy(origin.system, updates, this.actor.system)');
        // After committing a Mutant, the builder opens the starting-mutation roll.
        expect(builder).toContain('openMutantBackgroundDialog(this.actor)');
    });

    it('only the Mutant background carries a starting mutation', () => {
        const carriers = ORIGINS.filter(({ doc }) => startingMutationFormula(doc.system) !== null).map(({ doc }) => doc.name);
        expect(carriers).toEqual(['Mutant']);
    });
});
