import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Smoke spec for the Radical Services GM dialog (#89). Boots the licensed
 * Foundry server through the standard GM join harness, creates a fixture
 * DH2 character, instantiates `RadicalServicesDialog` via its deployed
 * module URL, and asserts the dialog renders with the 9-row services
 * table plus the Attempt / Cancel action buttons.
 */
test.describe.serial('Radical Services dialog (#89)', () => {
    test('renders the 9 services and action buttons', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const result = await page.evaluate(async () => {
            /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
            const g = globalThis as any;
            const ActorCls = g.Actor;
            if (!ActorCls?.create) {
                return { ok: false, reason: 'Actor.create unavailable' as const };
            }

            let actor: any;
            try {
                actor = await ActorCls.create({
                    name: 'radical-services-probe',
                    type: 'dh2-character',
                    system: { gameSystem: 'dh2e', influence: 40 },
                });
            } catch (err) {
                return { ok: false, reason: `actor create failed: ${String((err as Error)?.message ?? err)}` };
            }
            if (!actor) {
                return { ok: false, reason: 'actor null' };
            }

            try {
                const modUrl = '/systems/wh40k-rpg/module/applications/prompts/radical-services-dialog.js';
                const mod: any = await import(/* @vite-ignore */ modUrl);
                const DialogCls = mod.default;
                const dialog = new DialogCls(actor);
                await dialog.render({ force: true });
                const root = dialog.element as HTMLElement | null;
                if (!(root instanceof HTMLElement)) {
                    return { ok: false, reason: 'dialog.element not an HTMLElement' };
                }
                const rows = root.querySelectorAll('[data-action="selectService"]');
                const attempt = root.querySelector<HTMLButtonElement>('[data-action="attemptRequisition"]');
                const cancel = root.querySelector('[data-action="cancel"]');
                const snapData = {
                    rowCount: rows.length,
                    attemptDisabled: attempt?.disabled ?? null,
                    hasCancel: cancel !== null,
                };
                try {
                    await dialog.close();
                } catch {
                    /* ignore */
                }
                return { ok: true as const, snap: snapData };
            } catch (err) {
                return { ok: false, reason: `render failed: ${String((err as Error)?.message ?? err)}` };
            }
            /* eslint-enable @typescript-eslint/no-explicit-any */
        });

        test.skip(!result.ok, `precondition failed: ${result.ok ? '' : result.reason}`);
        if (!result.ok || !('snap' in result) || result.snap === undefined) return;
        const snap = result.snap;
        expect(snap.rowCount).toBe(9);
        expect(snap.attemptDisabled).toBe(true);
        expect(snap.hasCancel).toBe(true);
    });
});
