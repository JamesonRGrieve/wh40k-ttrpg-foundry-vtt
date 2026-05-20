import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the DW Horde Magnitude path (#166 — core.md p. 359).
 *
 * Creates a DW horde NPC, opens its sheet, drives `applyMagnitudeDamage`
 * through the RAW resolver, and asserts the chat-card / actor state
 * reflects the canonical TABLE 13-1 derived values. Snaps the open
 * sheet for visual review (kept OPEN through snap() so the screenshot
 * captures the live DOM).
 */

test.describe.serial('DW Horde Magnitude (Tier B)', () => {
    test('renders horde-mode NPC sheet, applies RAW magnitude loss, snaps', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const pageErrors: string[] = [];
        const listener = (err: Error): void => {
            pageErrors.push(err.message);
        };
        page.on('pageerror', listener);

        try {
            const result = await page.evaluate(async () => {
                /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
                let error: string | null = null;
                let rendered = false;
                let toHitBonus: number | null = null;
                let bonusDamageDice: number | null = null;
                let sizeKeyword: string | null = null;
                let magnitudeBefore: number | null = null;
                let magnitudeAfter: number | null = null;
                let actorId: string | null = null;

                try {
                    const Actor = (globalThis as any).Actor;
                    if (typeof Actor?.create !== 'function') {
                        return {
                            rendered,
                            toHitBonus,
                            bonusDamageDice,
                            sizeKeyword,
                            magnitudeBefore,
                            magnitudeAfter,
                            actorId,
                            error: 'Actor.create unavailable',
                        };
                    }
                    // dw-npc is the DW NPC datamodel registered by the system manifest.
                    const actor = await Actor.create({
                        name: 'rawHordeProbe-#166',
                        type: 'dw-npc',
                        system: {
                            gameSystem: 'dw',
                            type: 'horde',
                            horde: {
                                enabled: true,
                                magnitude: { current: 90, max: 90 },
                                traits: ['fearless'],
                            },
                        },
                    });
                    if (!actor) {
                        return {
                            rendered,
                            toHitBonus,
                            bonusDamageDice,
                            sizeKeyword,
                            magnitudeBefore,
                            magnitudeAfter,
                            actorId,
                            error: 'Actor.create returned null',
                        };
                    }
                    actorId = actor.id ?? null;

                    // Probe the prepared horde fields (populated by the mixin).
                    const horde = actor.system?.horde;
                    toHitBonus = typeof horde?.toHitBonus === 'number' ? horde.toHitBonus : null;
                    bonusDamageDice = typeof horde?.bonusDamageDice === 'number' ? horde.bonusDamageDice : null;
                    sizeKeyword = typeof horde?.sizeKeyword === 'string' ? horde.sizeKeyword : null;
                    magnitudeBefore = typeof horde?.magnitude?.current === 'number' ? horde.magnitude.current : null;

                    // Drive one RAW magnitude loss (single damaging hit).
                    if (typeof actor.system?.applyMagnitudeDamage === 'function') {
                        await actor.system.applyMagnitudeDamage(1, 'e2e-test-hit');
                        magnitudeAfter = actor.system.horde?.magnitude?.current ?? null;
                    }

                    if (typeof actor.sheet?.render === 'function') {
                        await actor.sheet.render(true);
                        await new Promise((r) => setTimeout(r, 120));
                        rendered = actor.sheet.element instanceof HTMLElement;
                    }

                    // Keep the sheet open for the snap() call below.
                    (globalThis as any).__c9horde = actor;
                } catch (err) {
                    error = String((err as Error)?.message ?? err);
                }

                return {
                    rendered,
                    toHitBonus,
                    bonusDamageDice,
                    sizeKeyword,
                    magnitudeBefore,
                    magnitudeAfter,
                    actorId,
                    error,
                };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            await snap(page, 'dw-horde-magnitude-sheet');

            // Tear down so the actor doesn't leak into a sibling spec.
            await page.evaluate(async () => {
                /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side cleanup */
                const a = (globalThis as any).__c9horde;
                try {
                    await a?.sheet?.close?.();
                    await a?.delete?.();
                } catch {
                    /* ignore */
                }
                (globalThis as any).__c9horde = undefined;
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            // Skip the spec gracefully if the DW NPC datamodel isn't registered
            // in this test build (e.g., the manifest didn't include the dw-npc
            // type for some lane); we still want page errors to fail loudly.
            if (result.error !== null && /Actor\.create returned null|datamodel|invalid type/i.test(result.error)) {
                test.skip(true, `DW NPC datamodel not registered: ${result.error}`);
            }

            expect(result.error, `horde probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.actorId, 'actor must have been created').not.toBeNull();
            // RAW TABLE 13-1: Magnitude 90 → Monumental / +50 to hit.
            expect(result.toHitBonus, 'Magnitude 90 to-hit bonus').toBe(50);
            // RAW: bonus damage dice = floor(M/10), capped +2 → 2.
            expect(result.bonusDamageDice, 'Magnitude 90 bonus damage dice (capped +2d10)').toBe(2);
            expect(result.sizeKeyword, 'size keyword at Magnitude 90').toBe('Monumental');
            // One RAW magnitude loss applied.
            expect(result.magnitudeBefore, 'starting magnitude').toBe(90);
            expect(result.magnitudeAfter, 'magnitude after one hit').toBe(89);
            expect(result.rendered, 'sheet must have rendered').toBe(true);
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('actor.sheet.render', 'DwHordeNpcSheet');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
