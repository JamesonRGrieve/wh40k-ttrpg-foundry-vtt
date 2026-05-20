import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Deathwatch Distinctions panel (#171).
 *
 * Renders the Handlebars partial into the deployed Foundry world via
 * `templates/actor/panel/dw-distinction-panel.hbs`, asserts the
 * Distinction list, Mark list, and merged-effects readout render with
 * a mixed catalogue (one Mark borne, one rank-locked, one ceremonial),
 * then exercises the Distinction toggle (DOM-level — the
 * orchestrator-wired action handler updates the actor, which is out of
 * scope for this Tier B render snap), and snaps the result.
 *
 * Follows the dw-astartes / bc-alignment shape: the rendered DOM stays
 * anchored to a globalThis handle so snap() captures live pixels, and
 * is torn down after capture so the next test starts clean.
 */
test.describe.serial('DwDistinctionPanel (Tier B)', () => {
    test('renders distinctions + marks + merged effects and toggles a Distinction', async ({ page }) => {
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
                const templateUrl = '/systems/wh40k-rpg/templates/actor/panel/dw-distinction-panel.hbs';
                let error: string | null = null;
                let rendered = false;
                let distinctionEntryCount = 0;
                let markCount = 0;
                let hasMergedReadout = false;
                let mergedCharBadgeCount = 0;
                let mergedTraitBadgeCount = 0;
                let lockedEntries = 0;
                let toggleInitialPressed = '';
                let toggleAfterPressed = '';

                interface CatalogueEntry {
                    id: string;
                    name: string;
                    renownReward: number;
                    renownRequiredLabel: string;
                    canEarnAtCurrentRank: boolean;
                    mark?: {
                        description: string;
                        characteristicDelta?: Record<string, number>;
                        trait?: string;
                    };
                }

                const CATALOGUE: CatalogueEntry[] = [
                    {
                        id: 'honoured-of-the-chapter',
                        name: 'Honoured of the Chapter',
                        renownReward: 5,
                        renownRequiredLabel: 'Respected',
                        canEarnAtCurrentRank: true,
                        mark: { description: '+5 WP', characteristicDelta: { WP: 5 } },
                    },
                    {
                        id: 'iron-resolve',
                        name: 'Iron Resolve',
                        renownReward: 5,
                        renownRequiredLabel: 'Respected',
                        canEarnAtCurrentRank: true,
                        mark: {
                            description: '+5 T, Resistance (Fear)',
                            characteristicDelta: { T: 5 },
                            trait: 'Resistance (Fear)',
                        },
                    },
                    {
                        id: 'duty-unto-death',
                        name: 'Duty Unto Death',
                        renownReward: 10,
                        renownRequiredLabel: 'Distinguished',
                        canEarnAtCurrentRank: true,
                    },
                    {
                        id: 'crux-terminatus',
                        name: 'Bearer of the Crux Terminatus',
                        renownReward: 15,
                        renownRequiredLabel: 'Hero',
                        canEarnAtCurrentRank: false,
                        mark: {
                            description: '+5 WS, True Grit',
                            characteristicDelta: { WS: 5 },
                            trait: 'True Grit',
                        },
                    },
                ];

                function buildCtx(earnedIds: string[], borneMarkIds: string[]): unknown {
                    const earned = new Set(earnedIds);
                    const borne = new Set(borneMarkIds);
                    const distinctions = CATALOGUE.map((entry) => ({
                        id: entry.id,
                        name: entry.name,
                        renownReward: entry.renownReward,
                        renownRequired: entry.renownRequiredLabel,
                        earned: earned.has(entry.id),
                        rankTooLow: !entry.canEarnAtCurrentRank,
                    }));
                    const marks = CATALOGUE.filter((e) => e.mark !== undefined).map((e) => ({
                        id: e.id,
                        name: e.name,
                        description: e.mark?.description ?? '',
                        borne: borne.has(e.id),
                    }));

                    const charSums: Record<string, number> = {};
                    const traitsSet = new Set<string>();
                    for (const entry of CATALOGUE) {
                        if (entry.mark === undefined) continue;
                        if (!borne.has(entry.id)) continue;
                        const deltas = entry.mark.characteristicDelta ?? {};
                        for (const k of Object.keys(deltas)) {
                            charSums[k] = (charSums[k] ?? 0) + (deltas[k] ?? 0);
                        }
                        if (entry.mark.trait !== undefined && entry.mark.trait.length > 0) {
                            traitsSet.add(entry.mark.trait);
                        }
                    }
                    const characteristicDelta = Object.keys(charSums)
                        .sort()
                        .map((key) => {
                            const value = charSums[key] ?? 0;
                            return {
                                key,
                                value,
                                displayValue: value >= 0 ? `+${value}` : `${value}`,
                            };
                        });

                    return {
                        distinctionPanel: {
                            distinctions,
                            marks,
                            merged: {
                                characteristicDelta,
                                traits: Array.from(traitsSet),
                            },
                        },
                    };
                }

                try {
                    const fetchAny = (globalThis as any).fetch as (u: string) => Promise<Response>;
                    const src = await (await fetchAny(templateUrl)).text();
                    const Handlebars = (globalThis as any).Handlebars as {
                        compile: (s: string) => (ctx: unknown) => string;
                    };
                    if (typeof Handlebars?.compile !== 'function') {
                        return {
                            rendered,
                            distinctionEntryCount,
                            markCount,
                            hasMergedReadout,
                            mergedCharBadgeCount,
                            mergedTraitBadgeCount,
                            lockedEntries,
                            toggleInitialPressed,
                            toggleAfterPressed,
                            error: 'Handlebars not available on globalThis',
                        };
                    }

                    const tpl = Handlebars.compile(src);

                    const initialEarned = ['honoured-of-the-chapter', 'iron-resolve', 'duty-unto-death'];
                    const initialMarks = ['iron-resolve'];
                    const html = tpl(buildCtx(initialEarned, initialMarks));

                    const host = document.createElement('div');
                    // Tailwind utilities are scoped to .wh40k-rpg via tailwind.config.js
                    // `important: '.wh40k-rpg'`; without an ancestor with that class
                    // every tw-* class is dropped. See CLAUDE.md
                    // "Check the .wh40k-rpg ancestor for ALL tw-* utilities".
                    host.className = 'wh40k-rpg';
                    host.dataset['wh40kSystem'] = 'dw';
                    host.style.position = 'fixed';
                    host.style.top = '40px';
                    host.style.right = '40px';
                    host.style.width = '560px';
                    host.style.zIndex = '99999';
                    host.innerHTML = html;
                    document.body.appendChild(host);
                    rendered = host.firstElementChild instanceof HTMLElement;

                    if (rendered) {
                        distinctionEntryCount = host.querySelectorAll('button.wh40k-dw-distinction-entry').length;
                        markCount = host.querySelectorAll('button.wh40k-dw-distinction-mark').length;
                        hasMergedReadout = host.querySelector('.wh40k-dw-distinction-merged') !== null;
                        mergedCharBadgeCount = host.querySelectorAll('.wh40k-dw-distinction-merged-char').length;
                        mergedTraitBadgeCount = host.querySelectorAll('.wh40k-dw-distinction-merged-trait').length;
                        lockedEntries = host.querySelectorAll('.wh40k-dw-distinction-locked').length;

                        const dutyBtn = host.querySelector<HTMLButtonElement>('button[data-distinction-id="duty-unto-death"]');
                        toggleInitialPressed = dutyBtn?.getAttribute('aria-pressed') ?? '';

                        // Toggle "duty-unto-death" off by re-rendering with it removed
                        // from the earned set. The action handler itself is integration-
                        // tested via actor.update round-trip in unit tests; this Tier B
                        // probe only verifies the partial reflects state changes.
                        const withoutDuty = initialEarned.filter((id) => id !== 'duty-unto-death');
                        host.innerHTML = tpl(buildCtx(withoutDuty, initialMarks));
                        const dutyBtnAfter = host.querySelector<HTMLButtonElement>('button[data-distinction-id="duty-unto-death"]');
                        toggleAfterPressed = dutyBtnAfter?.getAttribute('aria-pressed') ?? '';
                    }

                    (globalThis as any).__dwDistinctionPanelHost = host;
                } catch (err) {
                    error = String((err as Error)?.message ?? err);
                }

                return {
                    rendered,
                    distinctionEntryCount,
                    markCount,
                    hasMergedReadout,
                    mergedCharBadgeCount,
                    mergedTraitBadgeCount,
                    lockedEntries,
                    toggleInitialPressed,
                    toggleAfterPressed,
                    error,
                };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            await snap(page, 'dw-distinction-panel');

            await page.evaluate(() => {
                /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side cleanup */
                const host = (globalThis as any).__dwDistinctionPanelHost as HTMLElement | undefined;
                try {
                    host?.remove();
                } catch {
                    /* ignore */
                }
                (globalThis as any).__dwDistinctionPanelHost = undefined;
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            expect(result.error, `panel probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'panel did not render').toBe(true);
            expect(result.distinctionEntryCount, 'expected 4 Distinction entries').toBe(4);
            expect(result.markCount, 'expected 3 Mark entries (catalogue Marks)').toBe(3);
            expect(result.hasMergedReadout, 'merged-effects readout should render').toBe(true);
            // Single borne Mark (iron-resolve) → 1 char badge (T+5), 1 trait badge.
            expect(result.mergedCharBadgeCount, 'merged characteristic badge count').toBe(1);
            expect(result.mergedTraitBadgeCount, 'merged trait badge count').toBe(1);
            // crux-terminatus is rank-locked in this mock catalogue.
            expect(result.lockedEntries, 'expected one locked entry').toBe(1);
            expect(result.toggleInitialPressed, 'duty-unto-death starts pressed=true').toBe('true');
            expect(result.toggleAfterPressed, 'duty-unto-death flips to pressed=false after toggle').toBe('false');
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('panel.render', 'DwDistinctionPanel');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
