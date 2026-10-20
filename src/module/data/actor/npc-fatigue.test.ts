import { afterAll, describe, expect, it } from 'vitest';
import { installFoundryDataStub, schemaHasPath } from '../../testing/foundry-data-stub.ts';

/**
 * NPCs track Fatigue (#420). Every line's Fatigue sources — an unarmed hit, a
 * Critical Effect, a grapple's Damage Opponent — strike NPCs as they do PCs, and
 * the NPC sheet already shows a fatigue panel, but the NPC schema had no `fatigue`:
 * the panel edited nothing, and auto-applied damage threw reading it. The NPC model
 * now carries the same track as a PC and derives its threshold the same way.
 *
 * `npc.ts` needs only `foundry.abstract` + `foundry.data.fields` at module
 * evaluation, so the shared Foundry data stub is installed before its import.
 */
afterAll(installFoundryDataStub());

const { default: NPCData } = await import('./npc.ts');

type Npc = InstanceType<typeof NPCData>;

/** An NPC of `line` with the given Toughness and Willpower bonuses and fatigue. */
function npc(line: string, toughnessBonus: number, willpowerBonus: number, fatigue: { max: number; value: number }): Npc {
    // The line is a static on each per-system NPC model (`dh2-npc` → DH2), as `standardSkills` reads it.
    const LineNpc = class extends NPCData {
        static gameSystem = line;
    };
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's TypeDataModel constructor demands (data, options), which the stubbed base ignores; the instance is populated by hand below
    const instance = new (LineNpc as unknown as new () => Npc)();
    Object.assign(instance, {
        characteristics: { toughness: { effectiveBonus: toughnessBonus }, willpower: { effectiveBonus: willpowerBonus } },
        fatigue: { ...fatigue, testModifier: 0 },
    });
    return instance;
}

describe('NPC fatigue (#420)', () => {
    it('declares the fatigue track in the schema, as the NPC sheet panel edits it', () => {
        const fields = NPCData.defineSchema();
        const paths = ['fatigue.value', 'fatigue.max', 'fatigue.testModifier'];
        expect(paths.filter((path) => !schemaHasPath(fields, path, []))).toEqual([]);
    });

    it("derives a DH2 NPC's threshold as Toughness + Willpower bonus (halving model)", () => {
        const cultist = npc('dh2', 3, 4, { max: 0, value: 2 });
        cultist._prepareFatigue();
        expect(cultist.fatigue.max).toBe(7);
        expect(cultist.fatigue.testModifier).toBe(0);
    });

    it("derives an RT NPC's threshold as Toughness bonus, with the flat −10 while fatigued", () => {
        const pirate = npc('rt', 3, 4, { max: 0, value: 1 });
        pirate._prepareFatigue();
        expect(pirate.fatigue.max).toBe(3);
        expect(pirate.fatigue.testModifier).toBe(-10);
    });

    it('keeps an authored threshold', () => {
        const brute = npc('dh2', 3, 4, { max: 9, value: 0 });
        brute._prepareFatigue();
        expect(brute.fatigue.max).toBe(9);
    });
});
