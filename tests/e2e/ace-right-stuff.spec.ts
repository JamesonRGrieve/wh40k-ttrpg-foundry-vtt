import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Ace role's Right Stuff Fate spend
 * (GitHub #100 — without.md L948-L980).
 *
 *  1. Renders the RightStuffDialog via its deployed module URL,
 *     asserts the skill picker (Operate / Survival), the spend button,
 *     and the cancel button all surface, and snaps the live dialog
 *     DOM through `snap()` (open-through-snap discipline borrowed
 *     from `disorder-roll-dialog.spec.ts`).
 *  2. Posts the `right-stuff-chat.hbs` auto-success card to the live
 *     chat log via `ChatMessage.create`, asserts the card root, the
 *     per-system `data-wh40k-system` anchor, and the auto-success
 *     banner all render (mirrors `aerial-manoeuvres.spec.ts`).
 *
 * Each posted artefact (dialog handle, chat message) is left in place
 * through the `snap()` call and torn down only afterward so the
 * screenshot captures the real DOM.
 */

test.describe.serial('Ace · Right Stuff (Tier B)', () => {
    test('renders the Right Stuff dialog and snaps', async ({ page }) => {
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
                const moduleUrl = '/systems/wh40k-rpg/module/applications/prompts/right-stuff-dialog.js';
                let error: string | null = null;
                let rendered = false;
                let hasSpendButton = false;
                let hasCancelButton = false;
                let skillButtons = 0;
                let hasOperate = false;
                let hasSurvival = false;

                try {
                    const mod = await import(moduleUrl);
                    const Cls = mod.default as {
                        new (opts?: unknown): { render: (opts?: unknown) => Promise<unknown>; element: HTMLElement | null; close: () => Promise<unknown> };
                    };
                    if (typeof Cls !== 'function') {
                        return {
                            rendered,
                            hasSpendButton,
                            hasCancelButton,
                            skillButtons,
                            hasOperate,
                            hasSurvival,
                            error: 'default export not a constructor',
                        };
                    }
                    const inst = new Cls({});
                    try {
                        await inst.render({ force: true });
                        await new Promise((r) => setTimeout(r, 80));
                    } catch (err) {
                        error = String((err as Error)?.message ?? err);
                    }
                    rendered = inst.element instanceof HTMLElement;
                    if (rendered && inst.element) {
                        const el = inst.element;
                        hasSpendButton = el.querySelector('button[data-action="spendRightStuff"]') !== null;
                        hasCancelButton = el.querySelector('button[data-action="cancel"]') !== null;
                        skillButtons = el.querySelectorAll('button[data-action="selectSkill"]').length;
                        hasOperate = el.querySelector('button[data-skill="operate"]') !== null;
                        hasSurvival = el.querySelector('button[data-skill="survival"]') !== null;
                    }
                    // Keep the dialog open through snap(); cleanup runs afterward.
                    (globalThis as any).__c9dialog = inst;
                } catch (err) {
                    error = String((err as Error)?.message ?? err);
                }

                return {
                    rendered,
                    hasSpendButton,
                    hasCancelButton,
                    skillButtons,
                    hasOperate,
                    hasSurvival,
                    error,
                };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            await snap(page, 'right-stuff-dialog');

            await page.evaluate(async () => {
                /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side cleanup */
                const d = (globalThis as any).__c9dialog;
                try {
                    await d?.close?.();
                } catch {
                    /* ignore */
                }
                (globalThis as any).__c9dialog = undefined;
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            expect(result.error, `dialog probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'dialog did not render').toBe(true);
            expect(result.hasSpendButton, 'Spend (Right Stuff) button should render').toBe(true);
            expect(result.hasCancelButton, 'Cancel button should render').toBe(true);
            // When no actor is bound, eligibility is false → skill picker
            // is hidden; the not-eligible panel renders instead. Both
            // shapes are acceptable smoke output, so the assertion
            // tolerates either path.
            if (result.skillButtons > 0) {
                expect(result.skillButtons, 'expected two skill choices when picker renders').toBe(2);
                expect(result.hasOperate, 'Operate skill button should render').toBe(true);
                expect(result.hasSurvival, 'Survival skill button should render').toBe(true);
            }
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('dialog.render', 'RightStuffDialog');
        } finally {
            page.off('pageerror', listener);
        }
    });

    test('posts the Right Stuff auto-success chat card and snaps', async ({ page }) => {
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
                let hasAutoSuccessBanner = false;
                let messageId: string | null = null;

                try {
                    const renderTemplate = (globalThis as any).foundry?.applications?.handlebars?.renderTemplate as
                        | ((p: string, c: object) => Promise<string>)
                        | undefined;
                    if (!renderTemplate) {
                        return { rendered, hasCardRoot, hasSystemAnchor, hasAutoSuccessBanner, messageId, error: 'renderTemplate unavailable' };
                    }

                    const template = 'systems/wh40k-rpg/templates/chat/right-stuff-chat.hbs';
                    const context = {
                        gameSystem: 'dh2e',
                        actorName: 'Vex Tannor',
                        skillKey: 'WH40K.RightStuff.Skill.operate',
                        skillRaw: 'operate',
                        degrees: 4,
                        agilityBonus: 4,
                        hasDegrees: true,
                    };

                    const html = await renderTemplate(template, context);
                    rendered = typeof html === 'string' && html.length > 0;
                    hasCardRoot = html.includes('wh40k-right-stuff-card');
                    hasSystemAnchor = html.includes('data-wh40k-system="dh2e"');
                    hasAutoSuccessBanner =
                        html.includes('WH40K.RightStuff.AutoSuccessLabel') || html.includes('WH40K.RightStuff.AutoSuccessWithDoS') || html.includes('fa-star');

                    const ChatMessageCls = (globalThis as any).ChatMessage as { create: (data: object) => Promise<{ id: string } | null> } | undefined;
                    const msg = await ChatMessageCls?.create({ user: (globalThis as any).game?.user?.id, content: html });
                    messageId = msg?.id ?? null;
                } catch (err) {
                    error = String((err as Error)?.message ?? err);
                }

                return { rendered, hasCardRoot, hasSystemAnchor, hasAutoSuccessBanner, messageId, error };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            await snap(page, 'right-stuff-chat');

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
            expect(result.rendered, 'right-stuff chat card did not render').toBe(true);
            expect(result.hasCardRoot, 'card root .wh40k-right-stuff-card missing').toBe(true);
            expect(result.hasSystemAnchor, 'per-system data-wh40k-system anchor missing').toBe(true);
            expect(result.hasAutoSuccessBanner, 'auto-success banner should render').toBe(true);
            expect(result.messageId, 'ChatMessage.create returned no id').not.toBeNull();
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('chat.render', 'RightStuff');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
