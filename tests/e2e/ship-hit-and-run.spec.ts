import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Rogue Trader Hit-and-Run chat card (GitHub
 * #188 — core.md L10093-10097). Renders `ship-hit-and-run-chat.hbs`,
 * posts via `ChatMessage.create`, and asserts the critical-success
 * outcome (approach hit + Command win + pick-worse crit + hull damage)
 * reaches the DOM with per-system anchor.
 *
 * Card left open through `snap()` to capture the live DOM.
 */
test.describe.serial('Ship Hit-and-Run chat card (Tier B)', () => {
    test('posts the hit-and-run critical-success card and snaps', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const pageErrors: string[] = [];
        const listener = (err: Error): void => {
            pageErrors.push(err.message);
        };
        page.on('pageerror', listener);

        try {
            const result = await page.evaluate(async () => {
                let error: string | null = null;
                let rendered = false;
                let hasCardRoot = false;
                let hasSystemAnchor = false;
                let hasCritPick = false;
                let hasHullDamage = false;
                let messageId: string | null = null;

                try {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `foundry`/`ChatMessage`/`game` globals are injected by the licensed app; no shipped types
                    const g = globalThis as unknown as {
                        foundry?: { applications?: { handlebars?: { renderTemplate?: (p: string, c: object) => Promise<string> } } };
                        ChatMessage?: { create: (data: object) => Promise<{ id: string } | null> };
                        game?: { user?: { id?: string }; i18n?: { localize?: (k: string) => string } };
                    };
                    const renderHbsTemplate = g.foundry?.applications?.handlebars?.renderTemplate;
                    if (!renderHbsTemplate) {
                        return {
                            rendered,
                            hasCardRoot,
                            hasSystemAnchor,
                            hasCritPick,
                            hasHullDamage,
                            messageId,
                            error: 'renderTemplate unavailable',
                        };
                    }

                    const template = 'systems/wh40k-rpg/templates/chat/ship-hit-and-run-chat.hbs';
                    const context = {
                        attackerName: 'The Errant Vector',
                        defenderName: 'Chaos Raider "Bone Tithe"',
                        gameSystem: 'rt',
                        approach: {
                            target: 49,
                            hit: true,
                            shotDown: false,
                            dos: 4,
                            dof: 0,
                        },
                        command: {
                            success: true,
                            attackerDoS: 6,
                            defenderDoS: 0,
                            netDoS: 6,
                        },
                        appliedCrit: 5,
                        hullDamage: 6,
                        rolledCritA: 2,
                        rolledCritB: 5,
                    };

                    const html = await renderHbsTemplate(template, context);
                    rendered = typeof html === 'string' && html.length > 0;
                    hasCardRoot = html.includes('wh40k-ship-har-card');
                    hasSystemAnchor = html.includes('data-wh40k-system="rt"');
                    // Resolve i18n keys so checks hold whether or not the keys are
                    // in the langpack (a bare key only shows when unresolved).
                    const critLabel = g.game?.i18n?.localize?.('WH40K.Voidcraft.HitAndRun.AppliedCrit') ?? 'WH40K.Voidcraft.HitAndRun.AppliedCrit';
                    const hullLabel = g.game?.i18n?.localize?.('WH40K.Voidcraft.HitAndRun.HullDamage') ?? 'WH40K.Voidcraft.HitAndRun.HullDamage';
                    hasCritPick = html.includes(critLabel);
                    hasHullDamage = html.includes(hullLabel);

                    const msg = await g.ChatMessage?.create({ user: g.game?.user?.id, content: html });
                    messageId = msg?.id ?? null;
                } catch (err) {
                    error = String((err as Error).message);
                }

                return { rendered, hasCardRoot, hasSystemAnchor, hasCritPick, hasHullDamage, messageId, error };
            });

            await snap(page, 'ship-hit-and-run-chat');

            await page.evaluate(async (id: string | null) => {
                if (id === null) return;
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game.messages` registry is injected by the licensed app; no shipped types
                const g = globalThis as unknown as { game?: { messages?: { get?: (id: string) => { delete?: () => Promise<void> } | undefined } } };
                try {
                    await g.game?.messages?.get?.(id)?.delete?.();
                } catch {
                    /* ignore */
                }
            }, result.messageId);

            expect(result.error, `chat-card probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'ship-hit-and-run card did not render').toBe(true);
            expect(result.hasCardRoot, 'card root .wh40k-ship-har-card missing').toBe(true);
            expect(result.hasSystemAnchor, 'per-system data-wh40k-system anchor missing').toBe(true);
            expect(result.hasCritPick, 'AppliedCrit block should render on a critical success').toBe(true);
            expect(result.hasHullDamage, 'HullDamage row should render on a critical success').toBe(true);
            expect(result.messageId, 'ChatMessage.create returned no id').not.toBeNull();
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('chat.render', 'ShipHitAndRun');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
