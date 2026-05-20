import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Deathwatch Mission framework panel (#169).
 *
 * Renders the Handlebars partial into the deployed Foundry world via
 * the `templates/actor/panel/dw-mission-panel.hbs` URL, asserts the
 * mission name + rating render, the objective checklist surfaces a
 * toggleable button per objective with the correct `data-action` /
 * `data-objective-id`, the complications list surfaces a toggleable
 * button per complication, and the "Complete Mission" payout button
 * renders with `data-action="dwCompleteMission"`. Mirrors the shape
 * of `dw-renown.spec.ts`.
 */
test.describe.serial('DwMissionPanel (Tier B)', () => {
    test('renders mission name + rating + objective checklist + complications + complete button', async ({ page }) => {
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
                const templateUrl = '/systems/wh40k-rpg/templates/actor/panel/dw-mission-panel.hbs';
                let error: string | null = null;
                let rendered = false;
                let missionActiveAttr = '';
                let missionNameText = '';
                let ratingAttr = '';
                let objectiveButtonCount = 0;
                let firstObjectiveAction = '';
                let firstObjectiveId = '';
                let complicationButtonCount = 0;
                let firstComplicationAction = '';
                let firstComplicationId = '';
                let hasCompleteBtn = false;
                let completeBtnAction = '';

                try {
                    const fetchAny = (globalThis as any).fetch as (u: string) => Promise<Response>;
                    const src = await (await fetchAny(templateUrl)).text();
                    const Handlebars = (globalThis as any).Handlebars as { compile: (s: string) => (ctx: unknown) => string };
                    if (typeof Handlebars?.compile !== 'function') {
                        return {
                            rendered,
                            missionActiveAttr,
                            missionNameText,
                            ratingAttr,
                            objectiveButtonCount,
                            firstObjectiveAction,
                            firstObjectiveId,
                            complicationButtonCount,
                            firstComplicationAction,
                            firstComplicationId,
                            hasCompleteBtn,
                            completeBtnAction,
                            error: 'Handlebars not available on globalThis',
                        };
                    }
                    const tpl = Handlebars.compile(src);
                    const html = tpl({
                        missionPanel: {
                            hasMission: true,
                            mission: {
                                id: 'mission-blackthorn-vii',
                                name: 'Strike on Blackthorn VII',
                                rating: 'priority',
                                ratingLabel: 'Priority',
                                objectives: [
                                    {
                                        id: 'obj-1',
                                        description: 'Secure the manufactorum vault',
                                        renownReward: 5,
                                        xpReward: 200,
                                        status: 'complete',
                                        statusLabel: 'Complete',
                                    },
                                    {
                                        id: 'obj-2',
                                        description: 'Capture the cult magus alive',
                                        renownReward: 10,
                                        xpReward: 400,
                                        status: 'pending',
                                        statusLabel: 'Pending',
                                    },
                                ],
                                complications: [
                                    {
                                        id: 'comp-1',
                                        description: 'Civilian casualties exceed acceptable losses',
                                        renownPenalty: 3,
                                        triggered: false,
                                    },
                                ],
                            },
                        },
                    });
                    const host = document.createElement('div');
                    host.className = 'wh40k-rpg';
                    host.dataset['wh40kSystem'] = 'dw';
                    host.style.position = 'fixed';
                    host.style.top = '40px';
                    host.style.right = '40px';
                    host.style.width = '420px';
                    host.style.zIndex = '99999';
                    host.innerHTML = html;
                    document.body.appendChild(host);
                    rendered = host.firstElementChild instanceof HTMLElement;

                    if (rendered) {
                        const section = host.querySelector('section.wh40k-dw-mission-panel');
                        missionActiveAttr = section?.getAttribute('data-dw-mission-active') ?? '';
                        missionNameText = host.querySelector('.wh40k-dw-mission-name')?.textContent?.trim() ?? '';
                        ratingAttr = host.querySelector('.wh40k-dw-mission-rating')?.getAttribute('data-rating') ?? '';

                        const objectiveButtons = Array.from(host.querySelectorAll('button.wh40k-dw-mission-objective-toggle'));
                        objectiveButtonCount = objectiveButtons.length;
                        firstObjectiveAction = objectiveButtons[0]?.getAttribute('data-action') ?? '';
                        firstObjectiveId = objectiveButtons[0]?.getAttribute('data-objective-id') ?? '';

                        const complicationButtons = Array.from(host.querySelectorAll('button.wh40k-dw-mission-complication-toggle'));
                        complicationButtonCount = complicationButtons.length;
                        firstComplicationAction = complicationButtons[0]?.getAttribute('data-action') ?? '';
                        firstComplicationId = complicationButtons[0]?.getAttribute('data-complication-id') ?? '';

                        const completeBtn = host.querySelector('button.wh40k-dw-mission-complete-btn');
                        hasCompleteBtn = completeBtn !== null;
                        completeBtnAction = completeBtn?.getAttribute('data-action') ?? '';
                    }

                    (globalThis as any).__dwMissionPanelHost = host;
                } catch (err) {
                    error = String((err as Error)?.message ?? err);
                }

                return {
                    rendered,
                    missionActiveAttr,
                    missionNameText,
                    ratingAttr,
                    objectiveButtonCount,
                    firstObjectiveAction,
                    firstObjectiveId,
                    complicationButtonCount,
                    firstComplicationAction,
                    firstComplicationId,
                    hasCompleteBtn,
                    completeBtnAction,
                    error,
                };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            await snap(page, 'dw-mission-panel');

            // Tear down so the host doesn't leak into the next serial test.
            await page.evaluate(() => {
                /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side cleanup */
                const host = (globalThis as any).__dwMissionPanelHost as HTMLElement | undefined;
                try {
                    host?.remove();
                } catch {
                    /* ignore */
                }
                (globalThis as any).__dwMissionPanelHost = undefined;
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            expect(result.error, `panel probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'panel did not render').toBe(true);
            expect(result.missionActiveAttr, 'mission-active flag should be true').toBe('true');
            expect(result.missionNameText, 'mission name should render').toContain('Strike on Blackthorn VII');
            expect(result.ratingAttr, 'rating attribute should round-trip').toBe('priority');
            expect(result.objectiveButtonCount, 'one toggle button per objective should render').toBe(2);
            expect(result.firstObjectiveAction, 'objective toggle should carry data-action="dwToggleObjective"').toBe('dwToggleObjective');
            expect(result.firstObjectiveId, 'objective toggle should carry data-objective-id').toBe('obj-1');
            expect(result.complicationButtonCount, 'one toggle button per complication should render').toBe(1);
            expect(result.firstComplicationAction, 'complication toggle should carry data-action="dwToggleComplication"').toBe('dwToggleComplication');
            expect(result.firstComplicationId, 'complication toggle should carry data-complication-id').toBe('comp-1');
            expect(result.hasCompleteBtn, 'complete-mission button should render').toBe(true);
            expect(result.completeBtnAction, 'complete-mission button should carry data-action="dwCompleteMission"').toBe('dwCompleteMission');
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('panel.render', 'DwMissionPanel');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
