import { joinOrSkip } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B render verification of the freeform "direct edit" bypass (#571).
 *
 * The characteristic HUD's direct base-value input (`.wh40k-char-direct-input`)
 * used to appear whenever the sheet was in edit mode. After #571 it also requires
 * the `freeform-characters` world setting — which defaults OFF. So on a rendered
 * DH2 character sheet, entering edit mode with the default (freeform off) must
 * leave the direct-edit input hidden (the character stays read-only, edited
 * through the sanctioned origin-path / advancement flow). This asserts the gate
 * actually closes on a real render — the state that regressed before #571.
 */

interface SheetLike {
    render: (opts?: { force?: boolean }) => Promise<void>;
    element: HTMLElement | null;
    close: () => Promise<void>;
}
interface ActorLike {
    id?: string | null;
    sheet?: SheetLike;
    delete?: () => Promise<void>;
}
interface FoundryWindow {
    Actor: { create?: (data: object) => Promise<ActorLike | null> };
}

test('freeform-off keeps the characteristic direct-edit input hidden in edit mode (#571)', async ({ page }) => {
    await joinOrSkip(page);

    const result = await page.evaluate(async (): Promise<{ rendered: boolean; hudPresent: boolean; inputInEditMode: boolean | null; error: string | null }> => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry Actor global, no repo types
        const win = globalThis as unknown as FoundryWindow;
        if (win.Actor.create === undefined) return { rendered: false, hudPresent: false, inputInEditMode: null, error: 'Actor.create unavailable' };
        let actor: ActorLike | null = null;
        try {
            actor = await win.Actor.create({
                name: 'probe-freeform-gate',
                type: 'dh2-character',
                system: { gameSystem: 'dh2', characteristics: { weaponSkill: { base: 35, advance: 0, modifier: 0 } } },
            });
            const sheet = actor?.sheet;
            if (sheet === undefined) return { rendered: false, hudPresent: false, inputInEditMode: null, error: 'sheet unavailable' };

            await sheet.render({ force: true });
            await new Promise<void>((r) => {
                setTimeout(r, 250);
            });
            const rendered = sheet.element instanceof HTMLElement;
            // The characteristic HUD renders (the panel my edit lives in) without throwing.
            const hudPresent = sheet.element?.querySelector('[data-characteristic]') != null;

            // Enter edit mode. freeform-characters defaults OFF, so the gate stays closed.
            sheet.element?.querySelector<HTMLElement>('[data-action="toggleEditMode"]')?.click();
            await sheet.render({ force: true });
            await new Promise<void>((r) => {
                setTimeout(r, 250);
            });
            const inputInEditMode = sheet.element?.querySelector('.wh40k-char-direct-input') != null;

            return { rendered, hudPresent, inputInEditMode, error: null };
        } catch (err) {
            return { rendered: false, hudPresent: false, inputInEditMode: null, error: err instanceof Error ? err.message : String(err) };
        } finally {
            try {
                await actor?.sheet?.close();
                await actor?.delete?.();
            } catch {
                /* ignore cleanup */
            }
        }
    });

    expect(result.error, `probe error: ${result.error ?? ''}`).toBeNull();
    expect(result.rendered, 'sheet did not render').toBe(true);
    expect(result.hudPresent, 'characteristic HUD did not render (template break?)').toBe(true);
    // The #571 gate: edit mode alone is no longer enough — freeform is off, so hidden.
    expect(result.inputInEditMode, 'direct-edit input must stay hidden with freeform OFF, even in edit mode').toBe(false);
});
