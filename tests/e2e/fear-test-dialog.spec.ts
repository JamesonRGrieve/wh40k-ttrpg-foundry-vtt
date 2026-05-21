import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Fear (X) Test Dialog (GitHub #65).
 *
 * Creates a dh2-character actor + a Fear (3) trait item, opens the
 * dialog programmatically via its deployed module URL, and snapshots
 * the rendered DOM as `fear-test-dialog-fr3`.
 *
 * Assertions:
 *   1. The dialog renders into a real HTMLElement.
 *   2. The fear-rating input is present and reflects the configured rating.
 *   3. The rollTest action button is present.
 *   4. The trait item exposes `system.fearRating === 3`.
 */

interface ActorRef {
    id: string;
}

async function createParentActor(page: Page): Promise<ActorRef | { error: string }> {
    const result = await page.evaluate(async (): Promise<{ id: string | null; error: string | null }> => {
        interface ActorDocLite {
            id?: string;
        }
        interface BrowserCtx {
            Actor?: { create?: (data: object) => Promise<ActorDocLite | null> };
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime global, no browser-side types
        const browserCtx = globalThis as unknown as BrowserCtx;
        if (!browserCtx.Actor?.create) return { id: null, error: 'Actor.create unavailable' };
        try {
            const actor = await browserCtx.Actor.create({
                name: 'probe-fear-test-parent',
                type: 'dh2-character',
                system: { gameSystem: 'dh2' },
            });
            if (!actor) return { id: null, error: 'Actor.create returned null' };
            return { id: actor.id ?? null, error: null };
        } catch (err) {
            return { id: null, error: String((err as Error).message) };
        }
    });
    if (result.id === null) return { error: result.error ?? 'unknown create error' };
    return { id: result.id };
}

async function deleteActor(page: Page, actorId: string): Promise<void> {
    await page.evaluate(async (id: string): Promise<void> => {
        interface ActorDocLite {
            delete?: () => Promise<void>;
        }
        interface BrowserCtx {
            game?: { actors?: { get?: (id: string) => ActorDocLite | undefined } };
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime global, no browser-side types
        const browserCtx = globalThis as unknown as BrowserCtx;
        const actor = browserCtx.game?.actors?.get?.(id);
        await actor?.delete?.();
    }, actorId);
}

interface FearTraitResult {
    traitId: string | null;
    fearRating: number;
    error: string | null;
}

async function addFearTrait(page: Page, actorId: string, fearRating: number): Promise<FearTraitResult> {
    return page.evaluate(
        async ({ targetActorId, rating }): Promise<FearTraitResult> => {
            interface EmbeddedItemDoc {
                id?: string;
                system?: { fearRating?: number };
            }
            interface ActorDocLite {
                createEmbeddedDocuments?: (kind: string, data: object[]) => Promise<EmbeddedItemDoc[]>;
            }
            interface BrowserCtx {
                game?: { actors?: { get?: (id: string) => ActorDocLite | undefined } };
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime global, no browser-side types
            const browserCtx = globalThis as unknown as BrowserCtx;
            const actor = browserCtx.game?.actors?.get?.(targetActorId);
            if (!actor?.createEmbeddedDocuments) return { traitId: null, fearRating: 0, error: 'actor.createEmbeddedDocuments unavailable' };
            try {
                const made = await actor.createEmbeddedDocuments('Item', [
                    {
                        name: 'Fear (Test)',
                        type: 'trait',
                        system: { fearRating: rating, category: 'creature' },
                    },
                ]);
                const first = made[0];
                return { traitId: first.id ?? null, fearRating: Number(first.system?.fearRating ?? 0), error: null };
            } catch (err) {
                return { traitId: null, fearRating: 0, error: String((err as Error).message) };
            }
        },
        { targetActorId: actorId, rating: fearRating },
    );
}

test.describe.serial('FearTestDialog (Tier B)', () => {
    test('renders dialog with a Fear (3) trait actor and snaps fr3', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const pageErrors: string[] = [];
        const listener = (err: Error): void => {
            pageErrors.push(err.message);
        };
        page.on('pageerror', listener);

        const parent = await createParentActor(page);
        expect('id' in parent, `parent actor create failed: ${'error' in parent ? parent.error : 'unknown'}`).toBe(true);
        const actorId = (parent as ActorRef).id;

        try {
            const traitResult = await addFearTrait(page, actorId, 3);
            expect(traitResult.error, `trait create error: ${traitResult.error ?? ''}`).toBeNull();
            expect(traitResult.traitId, 'trait id should be set').not.toBeNull();
            expect(traitResult.fearRating, 'system.fearRating should round-trip as 3').toBe(3);

            interface DialogProbeResult {
                rendered: boolean;
                hasFearInput: boolean;
                fearInputValue: string | null;
                hasRollButton: boolean;
                error: string | null;
            }
            const result = await page.evaluate(async (): Promise<DialogProbeResult> => {
                interface DialogInstance {
                    render: (force?: boolean) => Promise<void>;
                    element: HTMLElement | null;
                    close: () => Promise<void>;
                }
                interface DialogCtor {
                    new (opts?: { fearRating?: number }): DialogInstance;
                }
                interface DialogModule {
                    default: DialogCtor;
                }
                const moduleUrl = '/systems/wh40k-rpg/module/applications/prompts/fear-test-dialog.js';
                let error: string | null = null;
                let rendered = false;
                let hasFearInput = false;
                let fearInputValue: string | null = null;
                let hasRollButton = false;

                try {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: dynamic import of compiled JS module; shape declared via DialogModule
                    const mod = (await import(moduleUrl)) as unknown as DialogModule;
                    const Cls = mod.default;
                    if (typeof Cls !== 'function') {
                        return { rendered, hasFearInput, fearInputValue, hasRollButton, error: 'default export not a constructor' };
                    }
                    const inst = new Cls({ fearRating: 3 });
                    try {
                        await inst.render(true);
                        await new Promise<void>((r) => {
                            setTimeout(r, 60);
                        });
                    } catch (err) {
                        error = String((err as Error).message);
                    }
                    rendered = inst.element instanceof HTMLElement;
                    if (rendered && inst.element !== null) {
                        const fr = inst.element.querySelector<HTMLInputElement>('input[name="fearRating"]');
                        hasFearInput = fr !== null;
                        fearInputValue = fr?.value ?? null;
                        hasRollButton = inst.element.querySelector('[data-action="rollTest"]') !== null;
                    }
                    try {
                        await inst.close();
                    } catch {
                        /* ignore */
                    }
                } catch (err) {
                    error = String((err as Error).message);
                }

                return { rendered, hasFearInput, fearInputValue, hasRollButton, error };
            });

            await snap(page, 'fear-test-dialog-fr3');

            expect(result.error, `dialog probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'dialog did not render').toBe(true);
            expect(result.hasFearInput, 'expected fear rating input').toBe(true);
            expect(result.fearInputValue, 'fear input value should be 3').toBe('3');
            expect(result.hasRollButton, 'expected rollTest action button').toBe(true);
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('dialog.render', 'FearTestDialog');
        } finally {
            await deleteActor(page, actorId).catch(() => undefined);
            page.off('pageerror', listener);
        }
    });
});
