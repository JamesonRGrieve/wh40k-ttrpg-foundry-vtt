import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Aerial Manoeuvre chat card (GitHub #133 —
 * without.md p. 54). Renders `aerial-manoeuvre-chat.hbs` through
 * Foundry's `renderTemplate` API, posts it to the live chat log via
 * `ChatMessage.create`, and asserts the card root, the per-system
 * `data-wh40k-system` anchor, and the Free-Action banner all render.
 *
 * The posted message is left in the chat log through `snap()` (it is
 * only deleted afterward) so the screenshot captures the live card —
 * mirroring the open-through-snap discipline of
 * `disorder-roll-dialog.spec.ts`.
 */

test.describe.serial('AerialManoeuvre chat card (Tier B)', () => {
    test('posts the Lock On result card and snaps', async ({ page }) => {
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
                let hasFreeAttackBanner = false;
                let messageId: string | null = null;

                try {
                    const renderTemplateFn = (globalThis as any).foundry?.applications?.handlebars?.renderTemplate as
                        | ((p: string, c: object) => Promise<string>)
                        | undefined;
                    if (!renderTemplateFn) {
                        return { rendered, hasCardRoot, hasSystemAnchor, hasFreeAttackBanner, messageId, error: 'renderTemplate unavailable' };
                    }

                    const template = 'systems/wh40k-rpg/templates/chat/aerial-manoeuvre-chat.hbs';
                    const context = {
                        gameSystem: 'dh2e',
                        manoeuvreNameKey: 'WH40K.AerialManoeuvre.LockOn.Name',
                        success: true,
                        pilotBsBonus: 20,
                        enemyBsBonus: 10,
                        freeAttack: true,
                        resultingAltitudeKey: 'WH40K.AerialManoeuvre.Altitude.Low',
                        outcomeKey: 'WH40K.AerialManoeuvre.LockOn.OutcomeSuccess',
                    };

                    const html = await renderTemplateFn(template, context);
                    rendered = typeof html === 'string' && html.length > 0;
                    hasCardRoot = html.includes('wh40k-aerial-card');
                    hasSystemAnchor = html.includes('data-wh40k-system="dh2e"');
                    hasFreeAttackBanner = html.includes('WH40K.AerialManoeuvre.FreeAttack') || html.includes('fa-crosshairs');

                    const ChatMessageCls = (globalThis as any).ChatMessage as { create: (data: object) => Promise<{ id: string } | null> } | undefined;
                    const msg = await ChatMessageCls?.create({ user: (globalThis as any).game?.user?.id, content: html });
                    messageId = msg?.id ?? null;
                } catch (err) {
                    error = err instanceof Error ? err.message : String(err);
                }

                return { rendered, hasCardRoot, hasSystemAnchor, hasFreeAttackBanner, messageId, error };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            await snap(page, 'aerial-manoeuvre-chat');

            // Card captured; remove it so it doesn't leak into the next
            // serial test's chat log.
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
            expect(result.rendered, 'aerial-manoeuvre card did not render').toBe(true);
            expect(result.hasCardRoot, 'card root .wh40k-aerial-card missing').toBe(true);
            expect(result.hasSystemAnchor, 'per-system data-wh40k-system anchor missing').toBe(true);
            expect(result.hasFreeAttackBanner, 'Free Action banner should render at 3+ DoS').toBe(true);
            expect(result.messageId, 'ChatMessage.create returned no id').not.toBeNull();
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('chat.render', 'AerialManoeuvre');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
