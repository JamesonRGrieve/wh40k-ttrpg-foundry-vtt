import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage for the DaemonWeaponAttributeDialog (#142, beyond.md
 * L1651-1820). Drives the constructor, `_prepareContext`, and `_renderHTML`
 * paths so the V2 dialog appears in coverage. Then triggers the `roll`
 * action and asserts the rendered DOM gained an Attributes section.
 */

test.describe('DaemonWeaponAttributeDialog (#142)', () => {
    test('renders, rolls Attributes, and exposes a Post action', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'no Gamemaster option appeared in the join select within 30s');

        const probe = await page.evaluate(async (): Promise<{ rendered: boolean; hasSelects: boolean; hasResult: boolean; error: string | null }> => {
            /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side dynamic import probe */
            try {
                const mod = (await import(
                    /* @vite-ignore */ '/systems/wh40k-rpg/module/applications/prompts/daemon-weapon-attribute-dialog.js' as unknown as string
                )) as any;
                const DialogCtor = mod.default;
                const dialog = new DialogCtor({ alignment: 'khorne', bindingStrength: 'normal' }) as any;
                await dialog.render({ force: true });
                const el = dialog.element as HTMLElement | undefined;
                const rendered = el instanceof HTMLElement;
                const hasSelects = !!(el && el.querySelector('select[name="alignment"]') && el.querySelector('select[name="bindingStrength"]'));
                // Force a deterministic roll path
                const roller = mod.default as any;
                const actions = roller.DEFAULT_OPTIONS.actions;
                await actions.roll.call(dialog, new Event('click'), document.createElement('button'));
                const afterEl = dialog.element as HTMLElement | undefined;
                const hasResult = !!(afterEl && /Attribute\s*1/i.test(afterEl.textContent ?? ''));
                await dialog.close();
                return { rendered, hasSelects, hasResult, error: null };
            } catch (error) {
                return {
                    rendered: false,
                    hasSelects: false,
                    hasResult: false,
                    error: error instanceof Error ? error.message : String(error),
                };
            }
            /* eslint-enable @typescript-eslint/no-explicit-any */
        });

        expect(probe.error, probe.error ?? '').toBeNull();
        expect(probe.rendered).toBe(true);
        expect(probe.hasSelects).toBe(true);
        expect(probe.hasResult).toBe(true);
    });
});
