import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Rogue Trader Boarding Action chat card
 * (GitHub #188 — core.md L9997). Renders `ship-boarding-chat.hbs`,
 * posts via `ChatMessage.create`, and asserts the breach outcome
 * surfaces with damage rows + per-system anchor.
 *
 * Card is left open through `snap()` to capture the live DOM, then
 * removed in a cleanup pass to avoid leaking into other serial tests.
 */
test.describe.serial('Ship Boarding chat card (Tier B)', () => {
    test('posts the boarding breach card and snaps', async ({ page }) => {
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
                let hasDamageBlock = false;
                let messageId: string | null = null;

                try {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `foundry`/`ChatMessage`/`game` globals are injected by the licensed app; no shipped types
                    const g = globalThis as unknown as {
                        foundry?: { applications?: { handlebars?: { renderTemplate?: (p: string, c: object) => Promise<string> } } };
                        ChatMessage?: { create: (data: object) => Promise<{ id: string } | null> };
                        game?: { user?: { id?: string }; i18n?: { localize?: (k: string) => string } };
                    };
                    const renderTemplateFn = g.foundry?.applications?.handlebars?.renderTemplate;
                    if (!renderTemplateFn) {
                        return { rendered, hasCardRoot, hasSystemAnchor, hasDamageBlock, messageId, error: 'renderTemplate unavailable' };
                    }

                    const template = 'systems/wh40k-rpg/templates/chat/ship-boarding-chat.hbs';
                    const context = {
                        attackerName: 'The Errant Vector',
                        defenderName: 'Eldar Corsair',
                        gameSystem: 'rt',
                        opposed: {
                            success: true,
                            attackerDoS: 5,
                            defenderDoS: 0,
                            netDoS: 5,
                            boardersLost: false,
                        },
                        damage: {
                            hullDamage: 5,
                            crewDamage: 3,
                            moraleDamage: 5,
                        },
                    };

                    const html = await renderTemplateFn(template, context);
                    rendered = typeof html === 'string' && html.length > 0;
                    hasCardRoot = html.includes('wh40k-ship-boarding-card');
                    hasSystemAnchor = html.includes('data-wh40k-system="rt"');
                    // Resolve the i18n key so the check holds whether or not the
                    // key is in the langpack (a bare key only shows when unresolved).
                    const hullDamageLabel = g.game?.i18n?.localize?.('WH40K.Voidcraft.Boarding.HullDamage') ?? 'WH40K.Voidcraft.Boarding.HullDamage';
                    hasDamageBlock = html.includes(hullDamageLabel);

                    const msg = await g.ChatMessage?.create({ user: g.game?.user?.id, content: html });
                    messageId = msg?.id ?? null;
                } catch (err) {
                    error = err instanceof Error ? err.message : String(err);
                }

                return { rendered, hasCardRoot, hasSystemAnchor, hasDamageBlock, messageId, error };
            });

            await snap(page, 'ship-boarding-chat');

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
            expect(result.rendered, 'ship-boarding card did not render').toBe(true);
            expect(result.hasCardRoot, 'card root .wh40k-ship-boarding-card missing').toBe(true);
            expect(result.hasSystemAnchor, 'per-system data-wh40k-system anchor missing').toBe(true);
            expect(result.hasDamageBlock, 'damage block should render on a breach').toBe(true);
            expect(result.messageId, 'ChatMessage.create returned no id').not.toBeNull();
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('chat.render', 'ShipBoarding');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
