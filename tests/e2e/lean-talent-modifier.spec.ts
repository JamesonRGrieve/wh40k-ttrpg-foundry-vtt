import { joinOrSkip } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B — a LEAN owned talent (compendiumSource only, no authored modifiers)
 * still applies its canonical skill modifier via the in-memory join (#484).
 *
 * The live world stores Superior Chirurgeon as a lean stub — `system: {cost}` +
 * `_stats.compendiumSource` — relying on `compendium-hydrate.ts` to fill
 * `modifiers.skills.medicae = 20` from the compendium on load, which
 * `_applyItemModifiers` then folds into the skill. `first-aid-flow.spec.ts`
 * proves the FULL-talent path; this proves the LEAN-stub path the world actually
 * uses, so a live actor's +20 is guaranteed once the current system is deployed.
 */

const SUPERIOR_CHIRURGEON_UUID = 'Compendium.wh40k-rpg.dh2-core-items-talents.Item.DH2aTlnt00000071';

interface LeanProbe {
    baseline: number | null;
    withTalent: number | null;
    error: string | null;
}

test('a LEAN Superior Chirurgeon (compendiumSource only) applies +20 to Medicae via the join (#484)', async ({ page }) => {
    await joinOrSkip(page);

    const result = await page.evaluate(async (uuid): Promise<LeanProbe> => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals, no repo types in page.evaluate
        const win = globalThis as unknown as {
            Actor: { create: (d: object) => Promise<ActorProbe | null> };
            foundry: { utils: { getProperty: (o: object, p: string) => number | string | null | undefined } };
        };
        interface ActorProbe {
            createEmbeddedDocuments: (t: string, d: object[]) => Promise<void>;
            sheet?: { render: (force: boolean) => Promise<void> };
        }
        const fail = (error: string): LeanProbe => ({ baseline: null, withTalent: null, error });
        try {
            const actor = await win.Actor.create({
                name: 'lean-medic probe',
                type: 'dh2-character',
                system: { gameSystem: 'dh2', characteristics: { intelligence: { base: 40, advance: 0, modifier: 0 } } },
            });
            if (actor === null) return fail('Actor.create returned null');
            const readMedicae = (): number => {
                const v = win.foundry.utils.getProperty(actor, 'system.skills.medicae.current');
                const n = Number(v);
                return Number.isFinite(n) ? n : Number.NaN;
            };
            const baseline = readMedicae();
            // LEAN stub — compendiumSource + a per-actor cost only, NO system.modifiers.
            await actor.createEmbeddedDocuments('Item', [
                { name: 'Superior Chirurgeon', type: 'talent', _stats: { compendiumSource: uuid }, system: { cost: 200 } },
            ]);
            // Render the sheet: `_prepareContext` runs the in-memory hydration join.
            await actor.sheet?.render(true);
            // Wait for the hydrated modifier to fold onto the skill (the assertion checks its size).
            await globalThis.wh40kE2E.pollUntil(() => readMedicae() !== baseline);
            return { baseline, withTalent: readMedicae(), error: null };
        } catch (err) {
            return fail(err instanceof Error ? err.message : String(err));
        }
    }, SUPERIOR_CHIRURGEON_UUID);

    expect(result.error, `probe error: ${result.error ?? ''}`).toBeNull();
    expect(result.baseline, 'baseline medicae unreadable').not.toBeNull();
    expect(result.withTalent, 'with-talent medicae unreadable').not.toBeNull();
    // The lean talent's canonical modifier joins in and folds onto the skill: +20.
    expect((result.withTalent ?? 0) - (result.baseline ?? 0)).toBe(20);
});
