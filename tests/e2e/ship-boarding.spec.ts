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
                /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
                let error: string | null = null;
                let rendered = false;
                let hasCardRoot = false;
                let hasSystemAnchor = false;
                let hasDamageBlock = false;
                let messageId: string | null = null;

                try {
                    const renderTemplateFn = (globalThis as any).foundry?.applications?.handlebars?.renderTemplate as
                        | ((p: string, c: object) => Promise<string>)
                        | undefined;
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
                    hasDamageBlock = html.includes('WH40K.Starship.Boarding.HullDamage');

                    const ChatMessageCls = (globalThis as any).ChatMessage as { create: (data: object) => Promise<{ id: string } | null> } | undefined;
                    const msg = await ChatMessageCls?.create({ user: (globalThis as any).game?.user?.id, content: html });
                    messageId = msg?.id ?? null;
                } catch (err) {
                    error = err instanceof Error ? err.message : String(err);
                }

                return { rendered, hasCardRoot, hasSystemAnchor, hasDamageBlock, messageId, error };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            await snap(page, 'ship-boarding-chat');

            await page.evaluate(async (id: string | null) => {
                /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side cleanup */
                if (id === null) return;
                try {
                    await (globalThis as any).game?.messages?.get?.(id)?.delete?.();
                } catch {
                    /* ignore */
                }
                /* eslint-enable @typescript-eslint/no-explicit-any */
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
