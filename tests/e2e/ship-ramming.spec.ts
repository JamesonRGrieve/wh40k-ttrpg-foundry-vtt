import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Rogue Trader Ramming chat card (GitHub #188 —
 * core.md L9997 §Ramming and Boarding Actions). Renders
 * `ship-ramming-chat.hbs` through Foundry's `renderTemplate` API, posts
 * it via `ChatMessage.create`, and asserts the card root + per-system
 * `data-wh40k-system` anchor + damage-row text all reach the DOM.
 *
 * The posted message is left in the chat log through `snap()` so the
 * screenshot captures the live card — mirrors the open-through-snap
 * discipline of `disorder-roll-dialog.spec.ts` and
 * `aerial-manoeuvres.spec.ts`.
 */
test.describe.serial('Ship Ramming chat card (Tier B)', () => {
    test('posts the ramming hit card and snaps', async ({ page }) => {
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
                    const renderTemplate = (globalThis as any).foundry?.applications?.handlebars?.renderTemplate as
                        | ((p: string, c: object) => Promise<string>)
                        | undefined;
                    if (!renderTemplate) {
                        return { rendered, hasCardRoot, hasSystemAnchor, hasDamageBlock, messageId, error: 'renderTemplate unavailable' };
                    }

                    const template = 'systems/wh40k-rpg/templates/chat/ship-ramming-chat.hbs';
                    const context = {
                        attackerName: 'The Errant Vector',
                        defenderName: 'Ork Kroozer "Grimskull"',
                        gameSystem: 'rt',
                        toHit: {
                            success: true,
                            attackerDoS: 4,
                            defenderDoS: 0,
                            netDoS: 4,
                        },
                        damage: {
                            defender: { raw: 15, armour: 12, hullDamage: 3 },
                            attacker: { raw: 15, armour: 16, hullDamage: 0 },
                            bonusDamage: 0,
                        },
                    };

                    const html = await renderTemplate(template, context);
                    rendered = typeof html === 'string' && html.length > 0;
                    hasCardRoot = html.includes('wh40k-ship-ramming-card');
                    hasSystemAnchor = html.includes('data-wh40k-system="rt"');
                    hasDamageBlock = html.includes('WH40K.Starship.Ramming.DefenderHull');

                    const ChatMessageCls = (globalThis as any).ChatMessage as
                        | { create: (data: object) => Promise<{ id: string } | null> }
                        | undefined;
                    const msg = await ChatMessageCls?.create({ user: (globalThis as any).game?.user?.id, content: html });
                    messageId = msg?.id ?? null;
                } catch (err) {
                    error = String((err as Error)?.message ?? err);
                }

                return { rendered, hasCardRoot, hasSystemAnchor, hasDamageBlock, messageId, error };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            await snap(page, 'ship-ramming-chat');

            // Card captured; remove it so it does not leak into the
            // next serial test's chat log.
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
            expect(result.rendered, 'ship-ramming card did not render').toBe(true);
            expect(result.hasCardRoot, 'card root .wh40k-ship-ramming-card missing').toBe(true);
            expect(result.hasSystemAnchor, 'per-system data-wh40k-system anchor missing').toBe(true);
            expect(result.hasDamageBlock, 'damage block should render on a hit').toBe(true);
            expect(result.messageId, 'ChatMessage.create returned no id').not.toBeNull();
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('chat.render', 'ShipRamming');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
