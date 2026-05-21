import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the OW Mission Assignment Gear engine (#155).
 *
 * Verifies that the engine module deploys to its expected URL and that
 * its public API (`applyTable63Modifiers`, `resolveGearOutcome`,
 * `rollRandomIssueGear`, `ORDINARY_DIFFICULTY_BONUS`,
 * `GEAR_RESULT_LADDER`) is reachable from a live Foundry session. The
 * spec exercises a representative roll end-to-end inside the browser
 * (modifier composition → outcome resolution → bonus item roll) and
 * snaps the page after the probe so reviewers can confirm no
 * console errors leaked.
 */

test.describe.serial('OW Mission Assignment Gear engine (Tier B)', () => {
    test('module exposes engine API and resolves a full roll path', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const pageErrors: string[] = [];
        const listener = (err: Error): void => {
            pageErrors.push(err.message);
        };
        page.on('pageerror', listener);

        try {
            const result = await page.evaluate(async () => {
                const moduleUrl = '/systems/wh40k-rpg/module/rules/ow-mission-gear.js';
                let error: string | null = null;
                let hasApplyTable63Modifiers = false;
                let hasResolveGearOutcome = false;
                let hasRollRandomIssueGear = false;
                let hasOrdinaryBonus = false;
                let hasGearResultLadder = false;
                let composedTarget = 0;
                let ordinaryRowValue = 0;
                let surrenderKitResolved = false;
                let bonusItemsResolved = false;
                let bonusItemCount = 0;
                let randomIssueRoll = 0;

                try {
                    const mod = (await import(moduleUrl)) as {
                        applyTable63Modifiers?: (
                            base: number,
                            mods: ReadonlyArray<{ description: string; value: number }>,
                        ) => { target: number; breakdown: ReadonlyArray<{ description: string; value: number }> };
                        resolveGearOutcome?: (input: { degreesOfSuccess: number; degreesOfFailure: number }) => {
                            outcome: string;
                            bonusItemCount: number;
                        };
                        rollRandomIssueGear?: (rng: () => number) => number;
                        ORDINARY_DIFFICULTY_BONUS?: number;
                        GEAR_RESULT_LADDER?: ReadonlyArray<object>;
                    };

                    hasApplyTable63Modifiers = typeof mod.applyTable63Modifiers === 'function';
                    hasResolveGearOutcome = typeof mod.resolveGearOutcome === 'function';
                    hasRollRandomIssueGear = typeof mod.rollRandomIssueGear === 'function';
                    hasOrdinaryBonus = mod.ORDINARY_DIFFICULTY_BONUS === 10;
                    hasGearResultLadder = Array.isArray(mod.GEAR_RESULT_LADDER) && mod.GEAR_RESULT_LADDER.length >= 4;

                    if (mod.applyTable63Modifiers !== undefined) {
                        const composed = mod.applyTable63Modifiers(50, [{ description: 'remote-warzone', value: -10 }]);
                        composedTarget = composed.target;
                        ordinaryRowValue = composed.breakdown[0]?.value ?? -1;
                    }

                    if (mod.resolveGearOutcome !== undefined) {
                        const surrender = mod.resolveGearOutcome({ degreesOfSuccess: 0, degreesOfFailure: 4 });
                        surrenderKitResolved = surrender.outcome === 'surrender-kit';
                        const bonus = mod.resolveGearOutcome({ degreesOfSuccess: 4, degreesOfFailure: 0 });
                        bonusItemsResolved = bonus.outcome === 'bonus-items';
                        bonusItemCount = bonus.bonusItemCount;
                    }

                    if (mod.rollRandomIssueGear !== undefined) {
                        randomIssueRoll = mod.rollRandomIssueGear(() => 0.5);
                    }
                } catch (err) {
                    error = String(err instanceof Error ? err.message : err);
                }

                return {
                    error,
                    hasApplyTable63Modifiers,
                    hasResolveGearOutcome,
                    hasRollRandomIssueGear,
                    hasOrdinaryBonus,
                    hasGearResultLadder,
                    composedTarget,
                    ordinaryRowValue,
                    surrenderKitResolved,
                    bonusItemsResolved,
                    bonusItemCount,
                    randomIssueRoll,
                };
            });

            await snap(page, 'ow-mission-gear-engine');

            expect(result.error, `engine probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.hasApplyTable63Modifiers, 'applyTable63Modifiers must be exported').toBe(true);
            expect(result.hasResolveGearOutcome, 'resolveGearOutcome must be exported').toBe(true);
            expect(result.hasRollRandomIssueGear, 'rollRandomIssueGear must be exported').toBe(true);
            expect(result.hasOrdinaryBonus, 'ORDINARY_DIFFICULTY_BONUS must equal 10').toBe(true);
            expect(result.hasGearResultLadder, 'GEAR_RESULT_LADDER must hold all four tiers').toBe(true);
            // Base 50 + Ordinary +10 + remote-warzone -10 = 50.
            expect(result.composedTarget, 'applyTable63Modifiers should compose target correctly').toBe(50);
            expect(result.ordinaryRowValue, 'first breakdown row must be the Ordinary +10 bonus').toBe(10);
            expect(result.surrenderKitResolved, '4 DoF must resolve to surrender-kit').toBe(true);
            expect(result.bonusItemsResolved, '4 DoS must resolve to bonus-items').toBe(true);
            expect(result.bonusItemCount, 'bonus-items tier must grant exactly 1 random issue').toBe(1);
            // rng 0.5 → floor(50)+1 = 51.
            expect(result.randomIssueRoll, 'rollRandomIssueGear(0.5) must yield 51').toBe(51);
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('engine.api', 'OwMissionGear');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
