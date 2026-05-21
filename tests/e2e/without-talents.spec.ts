import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Without novel-mechanic talents chat card
 * (GitHub #101 — without.md p. 62). Renders the Push the Limit
 * outcome card through Foundry's `renderTemplate` API, posts it to
 * the live chat log via `ChatMessage.create`, and asserts the card
 * root, the per-system `data-wh40k-system` anchor, and the
 * catastrophic-failure crit banner all render.
 *
 * The posted message is left in the chat log through `snap()` (it is
 * only deleted afterward) so the screenshot captures the live card —
 * mirroring the open-through-snap discipline of
 * `disorder-roll-dialog.spec.ts` and `aerial-manoeuvres.spec.ts`.
 */

test.describe.serial('Without talents — Push the Limit chat card (Tier B)', () => {
    test('posts the Motive Systems critical card and snaps', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const pageErrors: string[] = [];
        const listener = (err: Error): void => {
            pageErrors.push(err.message);
        };
        page.on('pageerror', listener);

        try {
            const result = await page.evaluate(async () => {
                interface FoundryGlobal {
                    foundry?: {
                        applications?: {
                            handlebars?: {
                                renderTemplate?: (p: string, c: object) => Promise<string>;
                            };
                        };
                    };
                    ChatMessage?: { create: (data: object) => Promise<{ id: string } | null> };
                    game?: { user?: { id?: string } };
                }
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser globals untyped at the realm boundary
                const fg = globalThis as unknown as FoundryGlobal;

                let error: string | null = null;
                let rendered = false;
                let hasCardRoot = false;
                let hasSystemAnchor = false;
                let hasCriticalBanner = false;
                let messageId: string | null = null;

                try {
                    const renderTemplateFn = fg.foundry?.applications?.handlebars?.renderTemplate;
                    if (!renderTemplateFn) {
                        return { rendered, hasCardRoot, hasSystemAnchor, hasCriticalBanner, messageId, error: 'renderTemplate unavailable' };
                    }

                    const template = 'systems/wh40k-rpg/templates/chat/push-the-limit-chat.hbs';
                    const context = {
                        gameSystem: 'dh2e',
                        actorName: 'Acolyte Drake',
                        invoked: true,
                        modifier: 20,
                        success: false,
                        degrees: 4,
                        triggersCritical: true,
                        criticalTableKey: 'WH40K.WithoutTalents.PushTheLimit.MotiveSystemsTable',
                    };

                    const html = await renderTemplateFn(template, context);
                    rendered = typeof html === 'string' && html.length > 0;
                    hasCardRoot = html.includes('wh40k-push-the-limit-card');
                    hasSystemAnchor = html.includes('data-wh40k-system="dh2e"');
                    hasCriticalBanner = html.includes('WH40K.WithoutTalents.PushTheLimit.CriticalLabel') || html.includes('fa-skull-crossbones');

                    const ChatMessageCls = fg.ChatMessage;
                    const msg = await ChatMessageCls?.create({ user: fg.game?.user?.id, content: html });
                    messageId = msg?.id ?? null;
                } catch (err) {
                    error = err instanceof Error ? err.message : String(err);
                }

                return { rendered, hasCardRoot, hasSystemAnchor, hasCriticalBanner, messageId, error };
            });

            await snap(page, 'without-talents-push-the-limit-chat');

            // Card captured; remove it so it doesn't leak into the next
            // serial test's chat log.
            await page.evaluate(async (id: string | null) => {
                interface CleanupGlobal {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ChatMessage.delete returns Promise<this> with no shipped types
                    game?: { messages?: { get?: (id: string) => { delete?: () => Promise<unknown> } | undefined } };
                }
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser globals untyped at the realm boundary
                const fg = globalThis as unknown as CleanupGlobal;
                if (id === null) return;
                try {
                    await fg.game?.messages?.get?.(id)?.delete?.();
                } catch {
                    /* ignore */
                }
            }, result.messageId);

            expect(result.error, `chat-card probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'push-the-limit card did not render').toBe(true);
            expect(result.hasCardRoot, 'card root .wh40k-push-the-limit-card missing').toBe(true);
            expect(result.hasSystemAnchor, 'per-system data-wh40k-system anchor missing').toBe(true);
            expect(result.hasCriticalBanner, 'critical banner should render at 4+ DoF').toBe(true);
            expect(result.messageId, 'ChatMessage.create returned no id').not.toBeNull();
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('chat.render', 'PushTheLimit');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
