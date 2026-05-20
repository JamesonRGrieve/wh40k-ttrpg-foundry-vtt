import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Starship Manoeuvre Action bar partial
 * (GitHub #185 — Rogue Trader core.md p. 213-215, Table 8-10).
 *
 * Renders `action-bar-manoeuvres.hbs` through Foundry's `renderTemplate`
 * API against a deterministic context that mirrors what
 * `starship-sheet` will pass (six tiles, opposed-Disengage badge, live
 * combined-test target from Pilot+Manoeuvrability+difficulty), posts
 * the HTML into the live chat log via `ChatMessage.create`, snaps the
 * card, then deletes it. The posted message stays in the chat log
 * through `snap()` so the screenshot captures the live DOM — same
 * open-through-snap discipline as `disorder-roll-dialog.spec.ts` and
 * `aerial-manoeuvres.spec.ts`.
 */

test.describe.serial('Starship Manoeuvre Action bar (Tier B)', () => {
    test('renders the RAW catalogue tiles and snaps', async ({ page }) => {
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
                let hasBarRoot = false;
                let hasAdjustBearing = false;
                let hasAdjustSpeed = false;
                let hasAdjustSpeedAndBearing = false;
                let hasComeToNewHeading = false;
                let hasDisengage = false;
                let hasEvasive = false;
                let hasOpposedBadge = false;
                let tileCount = 0;
                let messageId: string | null = null;

                try {
                    const renderTemplate = (globalThis as any).foundry?.applications?.handlebars?.renderTemplate as
                        | ((p: string, c: object) => Promise<string>)
                        | undefined;
                    if (!renderTemplate) {
                        return {
                            rendered,
                            hasBarRoot,
                            hasAdjustBearing,
                            hasAdjustSpeed,
                            hasAdjustSpeedAndBearing,
                            hasComeToNewHeading,
                            hasDisengage,
                            hasEvasive,
                            hasOpposedBadge,
                            tileCount,
                            messageId,
                            error: 'renderTemplate unavailable',
                        };
                    }

                    const template = 'systems/wh40k-rpg/templates/actor/starship/action-bar-manoeuvres.hbs';
                    // Mirror the shape `starship-sheet#_prepareManoeuvreActions`
                    // will hand the partial: one row per RAW entry with the
                    // pre-resolved combined-test target.
                    const pilot = 45;
                    const man = 15;
                    const context = {
                        helmsmanName: 'Helmsmistress Vey',
                        manoeuvres: [
                            {
                                id: 'adjust-bearing',
                                labelKey: 'WH40K.Starship.Manoeuvre.AdjustBearing.Label',
                                benefitKey: 'WH40K.Starship.Manoeuvre.AdjustBearing.Benefit',
                                difficultyLabel: 'Challenging (+0)',
                                target: pilot + man + 0,
                                opposed: false,
                            },
                            {
                                id: 'adjust-speed',
                                labelKey: 'WH40K.Starship.Manoeuvre.AdjustSpeed.Label',
                                benefitKey: 'WH40K.Starship.Manoeuvre.AdjustSpeed.Benefit',
                                difficultyLabel: 'Challenging (+0)',
                                target: pilot + man + 0,
                                opposed: false,
                            },
                            {
                                id: 'adjust-speed-and-bearing',
                                labelKey: 'WH40K.Starship.Manoeuvre.AdjustSpeedAndBearing.Label',
                                benefitKey: 'WH40K.Starship.Manoeuvre.AdjustSpeedAndBearing.Benefit',
                                difficultyLabel: 'Hard (-20)',
                                target: pilot + man - 20,
                                opposed: false,
                            },
                            {
                                id: 'come-to-new-heading',
                                labelKey: 'WH40K.Starship.Manoeuvre.ComeToNewHeading.Label',
                                benefitKey: 'WH40K.Starship.Manoeuvre.ComeToNewHeading.Benefit',
                                difficultyLabel: 'Difficult (-10)',
                                target: pilot + man - 10,
                                opposed: false,
                            },
                            {
                                id: 'disengage',
                                labelKey: 'WH40K.Starship.Manoeuvre.Disengage.Label',
                                benefitKey: 'WH40K.Starship.Manoeuvre.Disengage.Benefit',
                                difficultyLabel: 'Challenging (+0)',
                                target: pilot + man + 0,
                                opposed: true,
                            },
                            {
                                id: 'evasive-manoeuvres',
                                labelKey: 'WH40K.Starship.Manoeuvre.EvasiveManoeuvres.Label',
                                benefitKey: 'WH40K.Starship.Manoeuvre.EvasiveManoeuvres.Benefit',
                                difficultyLabel: 'Difficult (-10)',
                                target: pilot + man - 10,
                                opposed: false,
                            },
                        ],
                    };

                    const html = await renderTemplate(template, context);
                    rendered = typeof html === 'string' && html.length > 0;
                    hasBarRoot = html.includes('wh40k-starship-manoeuvre-bar');
                    hasAdjustBearing = html.includes('data-manoeuvre-id="adjust-bearing"');
                    hasAdjustSpeed = html.includes('data-manoeuvre-id="adjust-speed"');
                    hasAdjustSpeedAndBearing = html.includes('data-manoeuvre-id="adjust-speed-and-bearing"');
                    hasComeToNewHeading = html.includes('data-manoeuvre-id="come-to-new-heading"');
                    hasDisengage = html.includes('data-manoeuvre-id="disengage"');
                    hasEvasive = html.includes('data-manoeuvre-id="evasive-manoeuvres"');
                    hasOpposedBadge = html.includes('wh40k-starship-manoeuvre-tile__opposed');
                    tileCount = (html.match(/wh40k-starship-manoeuvre-tile"/g) ?? []).length;

                    const ChatMessageCls = (globalThis as any).ChatMessage as { create: (data: object) => Promise<{ id: string } | null> } | undefined;
                    const msg = await ChatMessageCls?.create({ user: (globalThis as any).game?.user?.id, content: html });
                    messageId = msg?.id ?? null;
                } catch (err) {
                    error = String((err as Error)?.message ?? err);
                }

                return {
                    rendered,
                    hasBarRoot,
                    hasAdjustBearing,
                    hasAdjustSpeed,
                    hasAdjustSpeedAndBearing,
                    hasComeToNewHeading,
                    hasDisengage,
                    hasEvasive,
                    hasOpposedBadge,
                    tileCount,
                    messageId,
                    error,
                };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            await snap(page, 'ship-manoeuvres-action-bar');

            // Bar captured; remove the chat message so it does not leak
            // into a sibling serial test's chat log.
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

            expect(result.error, `partial probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'action-bar partial did not render').toBe(true);
            expect(result.hasBarRoot, 'action-bar root .wh40k-starship-manoeuvre-bar missing').toBe(true);
            expect(result.hasAdjustBearing, 'Adjust Bearing tile missing').toBe(true);
            expect(result.hasAdjustSpeed, 'Adjust Speed tile missing').toBe(true);
            expect(result.hasAdjustSpeedAndBearing, 'Adjust Speed & Bearing tile missing').toBe(true);
            expect(result.hasComeToNewHeading, 'Come to New Heading tile missing').toBe(true);
            expect(result.hasDisengage, 'Disengage tile missing').toBe(true);
            expect(result.hasEvasive, 'Evasive Manoeuvres tile missing').toBe(true);
            expect(result.hasOpposedBadge, 'opposed badge should render for Disengage').toBe(true);
            expect(result.tileCount, 'expected six Manoeuvre tiles').toBe(6);
            expect(result.messageId, 'ChatMessage.create returned no id').not.toBeNull();
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('partial.render', 'ShipManoeuvreActionBar');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
