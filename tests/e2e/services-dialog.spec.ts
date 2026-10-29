import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the service-hire requisition dialog.
 *
 * Creates a DH2 character, opens the dialog through its deployed module, and
 * asserts it lists every document in DH2's services packs (selected by their
 * flags), that the services carrying hire data show their threat, that the
 * Attempt button stays disabled until a service is chosen and enables once one
 * is, and that Cancel is present. Snapshots `services-dialog-selected`.
 */

interface ProbeResult {
    expectedRows: number;
    rowCount: number;
    threatBadges: number;
    attemptDisabledBefore: boolean | null;
    attemptDisabledAfter: boolean | null;
    hasCancel: boolean;
    appId: string | null;
    actorId: string | null;
    error: string | null;
}

test.describe.serial('ServicesDialog', () => {
    test("lists DH2's services, shows their threat, and arms Attempt once one is chosen", async ({ page }) => {
        await joinOrSkip(page);

        const result = await page.evaluate(async (): Promise<ProbeResult> => {
            interface ActorInstance {
                id?: string;
            }
            interface PackLite {
                metadata?: { flags?: { 'wh40k-rpg'?: { line?: string; category?: string; homebrew?: boolean } } };
                getIndex?: () => Promise<{ size: number }>;
            }
            interface FoundryGlobal {
                Actor?: { create?: (data: object) => Promise<ActorInstance | null> };
                game?: { packs?: Iterable<PackLite> };
            }
            interface DialogModule {
                openServicesDialog: (actor: ActorInstance) => void;
            }
            const out: ProbeResult = {
                expectedRows: 0,
                rowCount: 0,
                threatBadges: 0,
                attemptDisabledBefore: null,
                attemptDisabledAfter: null,
                hasCancel: false,
                appId: null,
                actorId: null,
                error: null,
            };
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser globals untyped at the realm boundary
            const g = globalThis as unknown as FoundryGlobal;
            try {
                for (const pack of g.game?.packs ?? []) {
                    const flags = pack.metadata?.flags?.['wh40k-rpg'];
                    if (flags?.line !== 'dh2' || flags.category !== 'services' || flags.homebrew === true) continue;
                    // eslint-disable-next-line no-await-in-loop -- a handful of packs, read in turn
                    out.expectedRows += (await pack.getIndex?.())?.size ?? 0;
                }
                const actor = await g.Actor?.create?.({ name: 'services-probe', type: 'dh2-character', system: { gameSystem: 'dh2', influence: 40 } });
                out.actorId = actor?.id ?? null;
                if (actor == null) throw new Error('actor create failed');

                const modUrl = '/systems/wh40k-rpg/module/applications/prompts/services-dialog.js';
                // eslint-disable-next-line no-restricted-syntax -- boundary: dynamic import of compiled JS module; shape declared via DialogModule
                const mod = (await import(/* @vite-ignore */ modUrl)) as unknown as DialogModule;
                const dialog = await wh40kOpenDialog('services-dialog', () => {
                    mod.openServicesDialog(actor);
                });
                await globalThis.wh40kE2E.pollUntil(
                    () => dialog.element?.querySelector('[data-action="selectService"], [data-testid="services-empty"]') != null,
                );
                const root = dialog.element;
                if (root === null) throw new Error('dialog did not render');
                out.rowCount = root.querySelectorAll('[data-action="selectService"]').length;
                out.threatBadges = root.querySelectorAll('[data-action="selectService"] span.tw-rounded').length;
                out.attemptDisabledBefore = root.querySelector<HTMLButtonElement>('[data-action="attemptRequisition"]')?.disabled ?? null;
                out.hasCancel = root.querySelector('[data-action="cancel"]') !== null;

                root.querySelector<HTMLElement>('[data-action="selectService"]')?.click();
                await globalThis.wh40kE2E.pollUntil(
                    () => dialog.element?.querySelector<HTMLButtonElement>('[data-action="attemptRequisition"]')?.disabled === false,
                );
                out.attemptDisabledAfter = dialog.element?.querySelector<HTMLButtonElement>('[data-action="attemptRequisition"]')?.disabled ?? null;
                out.appId = dialog.element?.id ?? null;
            } catch (err) {
                out.error = err instanceof Error ? err.message : String(err);
            }
            return out;
        });

        try {
            expect(result.appId, `dialog did not open: ${result.error ?? ''}`).not.toBeNull();
            await snap(page, 'services-dialog-selected', { selector: `#${result.appId ?? ''}`, closeWindows: true, keepWindow: result.appId ?? undefined });
            await clearScreenOverlays(page);

            expect(result.error, `probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.expectedRows, "expected DH2's services packs to be installed").toBeGreaterThan(0);
            expect(result.rowCount, 'one row per service document').toBe(result.expectedRows);
            expect(result.threatBadges, 'services carrying hire data show their threat').toBeGreaterThan(0);
            expect(result.attemptDisabledBefore, 'Attempt is disabled until a service is chosen').toBe(true);
            expect(result.attemptDisabledAfter, 'Attempt is enabled once a service is chosen').toBe(false);
            expect(result.hasCancel).toBe(true);
            recordCoverage('dialog.render', 'ServicesDialog');
        } finally {
            await page.evaluate(async (id: string | null) => {
                interface ActorDocLite {
                    delete?: () => Promise<void>;
                }
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime global, no browser-side types
                const g = globalThis as unknown as { game?: { actors?: { get?: (actorId: string) => ActorDocLite | undefined } } };
                if (id !== null) await g.game?.actors?.get?.(id)?.delete?.();
            }, result.actorId);
        }
    });
});
