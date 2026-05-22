import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

interface MutantDialogProbeResult {
    rendered: boolean;
    hasCorruptionCallout: boolean;
    hasTwistedFleshRow: boolean;
    hasApplyButton: boolean;
    hasCancelButton: boolean;
    actorAttached: boolean;
    error: string | null;
}

interface MutantDialogInstance {
    render: (force?: boolean) => Promise<void>;
    element: HTMLElement | null;
    close: () => Promise<void>;
}

interface MutantDialogModule {
    default: new (actor: object | null) => MutantDialogInstance;
}

interface MutantActorGlobal {
    Actor?: { create?: (data: object, options?: object) => Promise<object | null> };
}

/**
 * Tier B coverage of the Mutant Background Dialog (GitHub #91).
 *
 * Constructs the dialog directly via its deployed module URL. The
 * surface itself is data-only — `MUTANT_STARTING_CORRUPTION` from
 * `src/module/rules/chaos-backgrounds.ts` drives the +10 callout —
 * but the spec attempts to attach a fresh dh2 actor when one can be
 * created via Foundry's `Actor.create` so the application path is
 * exercised end-to-end. The probe falls back to a null actor when
 * actor creation isn't available.
 *
 * The spec asserts:
 *   1. The dialog renders into a real HTMLElement.
 *   2. A "+10" starting Corruption callout is present.
 *   3. A Twisted Flesh grant row (`[data-talent="twisted-flesh"]`) is present.
 *   4. An "Apply" action button (`[data-action="apply"]`) is present.
 *   5. A "Cancel" action button (`[data-action="cancel"]`) is present.
 *
 * Also snaps the dialog at default readable size for visual review.
 */

test.describe.serial('MutantBackgroundDialog (Tier B)', () => {
    test('opens and renders +10 Corruption + Twisted Flesh grant plus Apply / Cancel', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const pageErrors: string[] = [];
        const listener = (err: Error): void => {
            pageErrors.push(err.message);
        };
        page.on('pageerror', listener);

        try {
            const result = await page.evaluate(async (): Promise<MutantDialogProbeResult> => {
                const moduleUrl = '/systems/wh40k-rpg/module/applications/prompts/mutant-background-dialog.js';
                let error: string | null = null;
                let rendered = false;
                let hasCorruptionCallout = false;
                let hasTwistedFleshRow = false;
                let hasApplyButton = false;
                let hasCancelButton = false;
                let actorAttached = false;

                try {
                    const mod = (await import(moduleUrl)) as MutantDialogModule;
                    const Cls = mod.default;
                    if (typeof Cls !== 'function') {
                        return {
                            rendered,
                            hasCorruptionCallout,
                            hasTwistedFleshRow,
                            hasApplyButton,
                            hasCancelButton,
                            actorAttached,
                            error: 'default export not a constructor',
                        };
                    }

                    // Best-effort fresh dh2 actor creation. If `Actor.create` is
                    // unavailable in the test world we fall back to null so the
                    // surface still renders for the structural assertions.
                    let actor: object | null = null;
                    try {
                        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-side Actor global is runtime-only, no shipped types
                        const g = globalThis as unknown as MutantActorGlobal;
                        if (typeof g.Actor?.create === 'function') {
                            actor = await g.Actor.create(
                                {
                                    name: 'Mutant Probe',
                                    type: 'dh2-character',
                                },
                                { temporary: true },
                            );
                            actorAttached = actor !== null;
                        }
                    } catch {
                        /* fall through with null actor */
                    }

                    const inst = new Cls(actor);
                    try {
                        await inst.render(true);
                        await new Promise<void>((r) => {
                            setTimeout(r, 40);
                        });
                    } catch (err) {
                        error = err instanceof Error ? err.message : String(err);
                    }
                    rendered = inst.element instanceof HTMLElement;
                    if (rendered && inst.element) {
                        hasCorruptionCallout = inst.element.textContent.includes('+10');
                        hasTwistedFleshRow = inst.element.querySelector('[data-talent="twisted-flesh"]') !== null;
                        hasApplyButton = inst.element.querySelector('[data-action="apply"]') !== null;
                        hasCancelButton = inst.element.querySelector('[data-action="cancel"]') !== null;
                    }
                } catch (err) {
                    error = err instanceof Error ? err.message : String(err);
                }

                return {
                    rendered,
                    hasCorruptionCallout,
                    hasTwistedFleshRow,
                    hasApplyButton,
                    hasCancelButton,
                    actorAttached,
                    error,
                };
            });

            expect(result.error, `dialog probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'dialog did not render').toBe(true);
            expect(result.hasCorruptionCallout, 'expected +10 Corruption callout').toBe(true);
            expect(result.hasTwistedFleshRow, 'expected Twisted Flesh grant row').toBe(true);
            expect(result.hasApplyButton, 'expected Apply action button').toBe(true);
            expect(result.hasCancelButton, 'expected Cancel action button').toBe(true);
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            await snap(page, 'mutant-background-dialog');

            recordCoverage('dialog.render', 'MutantBackgroundDialog');

            // Best-effort cleanup so the dialog doesn't leak into later specs.
            await page.evaluate(() => {
                const root = document.querySelector<HTMLDialogElement>('.mutant-background-dialog');
                if (root?.close) {
                    try {
                        root.close();
                    } catch {
                        /* ignore */
                    }
                }
            });
        } finally {
            page.off('pageerror', listener);
        }
    });
});
