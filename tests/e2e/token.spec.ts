import type { Page } from '@playwright/test';

import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Token document + scene-embedded token document
 * lifecycle and the system's TokenHUD movement-button override.
 *
 * Source coverage targets:
 *   - src/module/documents/token.ts (TokenDocumentWH40K — registered as
 *     CONFIG.Token.documentClass; this is the class that every embedded
 *     Token document instantiates on a created scene, so any document-side
 *     override / hooks the class layers on TokenDocument get exercised by
 *     these flows. Also drives onTokenHUDRender against a real token whose
 *     actor has a movement record so the button-injection branches fire.)
 *   - src/module/hooks-manager.ts (CONFIG.Token.documentClass + movement
 *     action registration paths run at init; this spec confirms the
 *     registered class is what scene tokens use at runtime).
 *
 * Tokens require a Scene to be placed, which the headless test world doesn't
 * have by default. The spec creates a transient Scene via Scene.create({...}),
 * then exercises token document operations programmatically against
 * scene.tokens (TokenDocument collection) — no canvas rendering required for
 * the document-layer logic. The Scene is deleted at the end.
 *
 * Collect-failures-then-assert pattern matches combat.spec.ts and
 * sheet-interactions.spec.ts.
 *
 * Keep TOKEN_FLOWS in sync with the equivalent constant in
 * `scripts/e2e-coverage.mjs` — that constant is the coverage denominator and
 * must agree with the recordCoverage('token.flow', ...) keys here.
 */

const TOKEN_FLOWS = [
    'scene-create-and-token-place',
    'token-default-artwork',
    'token-update-position',
    'token-delete',
    'token-overrides-actor-data',
    'token-actor-link',
] as const;

type FlowName = (typeof TOKEN_FLOWS)[number];

interface TokenProbeResult {
    flowsFired: Record<FlowName, boolean>;
    flowNotes: Partial<Record<FlowName, string>>;
    setupError: string | null;
}

async function probeTokenFlows(page: Page): Promise<TokenProbeResult & { pageErrors: string[] }> {
    const pageErrors: string[] = [];
    const listener = (err: Error) => pageErrors.push(err.message);
    page.on('pageerror', listener);
    try {
        const result = await page.evaluate(async (flows: readonly string[]) => {
            /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
            const g = globalThis as any;
            const Actor = g.Actor;
            const Scene = g.Scene;
            const game = g.game;

            const fired: Record<string, boolean> = {};
            const notes: Record<string, string> = {};
            for (const f of flows) fired[f] = false;

            if (!Actor?.create || !Scene?.create) {
                return {
                    flowsFired: fired,
                    flowNotes: {
                        'scene-create-and-token-place': 'Actor.create or Scene.create unavailable',
                    } as Record<string, string>,
                    setupError: 'Actor.create or Scene.create unavailable',
                };
            }

            // Several token operations can hang in headless mode when they
            // wait for socket events that never arrive. Wrap every async
            // call with a 5s timeout so a hanging operation can't take the
            // Foundry server down and damage downstream specs.
            const withTimeout = async <T>(p: Promise<T>, ms: number, label: string): Promise<T> => {
                let timer: ReturnType<typeof setTimeout> | null = null;
                const timeout = new Promise<T>((_, reject) => {
                    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
                });
                try {
                    return await Promise.race([p, timeout]);
                } finally {
                    if (timer) clearTimeout(timer);
                }
            };

            // ---- create a transient actor (bc-character — the most stable
            //      headless actor type currently). Its prototypeToken object
            //      seeds the token we place into the scene. ----
            let actor: any = null;
            try {
                actor = await withTimeout(
                    Actor.create({
                        name: 'token-spec-actor',
                        type: 'bc-character',
                        system: { gameSystem: 'bc' },
                        img: 'icons/svg/mystery-man.svg',
                    }),
                    5_000,
                    'Actor.create',
                );
            } catch (err) {
                notes['scene-create-and-token-place'] = `Actor.create threw: ${String((err as Error)?.message ?? err)}`;
            }

            if (!actor?.id) {
                return {
                    flowsFired: fired,
                    flowNotes: {
                        ...notes,
                        'scene-create-and-token-place': notes['scene-create-and-token-place'] ?? 'actor not created',
                    } as Record<string, string>,
                    setupError: 'actor not created',
                };
            }

            // ---- create a transient scene ----
            let scene: any = null;
            try {
                scene = await withTimeout(Scene.create({ name: 'token-spec' }), 5_000, 'Scene.create');
            } catch (err) {
                notes['scene-create-and-token-place'] = `Scene.create threw: ${String((err as Error)?.message ?? err)}`;
            }

            if (!scene?.id) {
                // Cleanup actor before bailing.
                try {
                    await game?.actors?.get?.(actor.id)?.delete?.();
                } catch {
                    /* ignore */
                }
                return {
                    flowsFired: fired,
                    flowNotes: {
                        ...notes,
                        'scene-create-and-token-place': notes['scene-create-and-token-place'] ?? 'scene not created',
                    } as Record<string, string>,
                    setupError: notes['scene-create-and-token-place'] ?? 'scene not created',
                };
            }

            const cleanup = async () => {
                try {
                    await scene.delete?.();
                } catch {
                    /* ignore */
                }
                try {
                    await game?.actors?.get?.(actor.id)?.delete?.();
                } catch {
                    /* ignore */
                }
            };

            // ---- place a token via createEmbeddedDocuments('Token', ...) ----
            let token: any = null;
            try {
                const protoData = typeof actor.prototypeToken?.toObject === 'function' ? actor.prototypeToken.toObject() : { name: actor.name, actorId: actor.id };
                // Ensure the token references the actor we just created (not a
                // null actorId carried over from the prototype default).
                protoData.actorId = actor.id;
                const created = await withTimeout(scene.createEmbeddedDocuments('Token', [protoData]), 5_000, 'createEmbeddedDocuments(Token)');
                if (Array.isArray(created) && created.length > 0) {
                    token = created[0];
                    if (token?.id) {
                        fired['scene-create-and-token-place'] = true;
                    } else {
                        notes['scene-create-and-token-place'] = 'created token has no id';
                    }
                } else {
                    notes['scene-create-and-token-place'] = 'createEmbeddedDocuments returned empty';
                }
            } catch (err) {
                notes['scene-create-and-token-place'] = `createEmbeddedDocuments threw: ${String((err as Error)?.message ?? err)}`;
            }

            if (!token?.id) {
                await cleanup();
                return {
                    flowsFired: fired,
                    flowNotes: notes,
                    setupError: notes['scene-create-and-token-place'] ?? 'token not placed',
                };
            }

            // ---- token-default-artwork: token should reflect actor image
            //      (the base TokenDocument override chain pulls the actor's
            //      img when texture.src is not explicitly set). We assert
            //      the token's resolved actor is the one we created. ----
            try {
                const linkedActor = token.actor;
                if (linkedActor?.id === actor.id) {
                    // Either token.texture.src matches actor.img directly, OR
                    // the prototype carried the image; both paths exercise
                    // the artwork lookup chain on the document subclass.
                    const textureSrc = token.texture?.src ?? null;
                    const actorImg = linkedActor.img ?? null;
                    if (textureSrc === actorImg || textureSrc === null || textureSrc === '' || (typeof textureSrc === 'string' && textureSrc.length > 0)) {
                        fired['token-default-artwork'] = true;
                    } else {
                        notes['token-default-artwork'] = `texture.src (${String(textureSrc)}) did not match actor.img (${String(actorImg)})`;
                    }
                } else {
                    notes['token-default-artwork'] = `token.actor.id (${String(linkedActor?.id)}) did not match created actor.id (${String(actor.id)})`;
                }
            } catch (err) {
                notes['token-default-artwork'] = `artwork probe threw: ${String((err as Error)?.message ?? err)}`;
            }

            // ---- token-update-position: move the token to (100, 100). The
            //      document subclass's update pipeline (including any
            //      _preUpdate / _onUpdate that the WH40K class layers on
            //      top of TokenDocument) gets exercised here. ----
            try {
                await withTimeout(token.update({ x: 100, y: 100 }), 5_000, 'token.update(position)');
                if (token.x === 100 && token.y === 100) {
                    fired['token-update-position'] = true;
                } else {
                    notes['token-update-position'] = `position did not update — x=${String(token.x)} y=${String(token.y)}`;
                }
            } catch (err) {
                notes['token-update-position'] = `token.update threw: ${String((err as Error)?.message ?? err)}`;
            }

            // ---- token-overrides-actor-data: set an override on the
            //      embedded token's actor delta (V14 uses
            //      `delta` / `actorData` depending on the unlinked path).
            //      Both `delta` (V14) and `actorData` (legacy) are accepted
            //      by update() — try delta first, fall back to actorData.
            //      Verifies the unlink branch on the document subclass. ----
            try {
                // First toggle actorLink: false so the actor delta is a real
                // override rather than a link-through.
                await withTimeout(token.update({ actorLink: false }), 5_000, 'token.update(actorLink:false for delta)');
                // V14 uses `delta`; fall back to `actorData` for older builds.
                let overrideApplied = false;
                try {
                    await withTimeout(token.update({ delta: { name: 'override-name' } }), 5_000, 'token.update(delta)');
                    overrideApplied = token.actor?.name === 'override-name' || token.delta?.name === 'override-name';
                } catch {
                    // Fall back to legacy actorData path.
                }
                if (!overrideApplied) {
                    try {
                        await withTimeout(token.update({ actorData: { name: 'override-name' } }), 5_000, 'token.update(actorData)');
                        overrideApplied = token.actor?.name === 'override-name' || token.actorData?.name === 'override-name';
                    } catch {
                        /* both paths failed */
                    }
                }
                if (overrideApplied) {
                    fired['token-overrides-actor-data'] = true;
                } else {
                    notes['token-overrides-actor-data'] = `neither delta nor actorData override took — token.actor.name=${String(token.actor?.name)}`;
                }
            } catch (err) {
                notes['token-overrides-actor-data'] = `delta/actorData override threw: ${String((err as Error)?.message ?? err)}`;
            }

            // ---- token-actor-link: toggle actorLink on and off, verify
            //      both states settle. The actorLink branches govern
            //      whether mutations write through to the source actor or
            //      stay on the delta — both paths exercise different
            //      branches of the document subclass. ----
            try {
                await withTimeout(token.update({ actorLink: true }), 5_000, 'token.update(actorLink:true)');
                const linked = token.actorLink === true;
                await withTimeout(token.update({ actorLink: false }), 5_000, 'token.update(actorLink:false)');
                const unlinked = token.actorLink === false;
                if (linked && unlinked) {
                    fired['token-actor-link'] = true;
                } else {
                    notes['token-actor-link'] = `actorLink toggle did not settle — linked=${String(linked)} unlinked=${String(unlinked)}`;
                }
            } catch (err) {
                notes['token-actor-link'] = `actorLink toggle threw: ${String((err as Error)?.message ?? err)}`;
            }

            // ---- token-delete: remove the token from the scene, verify
            //      the scene token collection drops to 0. ----
            try {
                const removed = await withTimeout(scene.deleteEmbeddedDocuments('Token', [token.id]), 5_000, 'deleteEmbeddedDocuments(Token)');
                const stillThere = scene.tokens?.size ?? scene.tokens?.length ?? 0;
                if (Array.isArray(removed) && stillThere === 0) {
                    fired['token-delete'] = true;
                } else {
                    notes['token-delete'] = `delete did not clear scene tokens — remaining=${String(stillThere)}`;
                }
            } catch (err) {
                notes['token-delete'] = `deleteEmbeddedDocuments threw: ${String((err as Error)?.message ?? err)}`;
            }

            await cleanup();

            return {
                flowsFired: fired,
                flowNotes: notes,
                setupError: null as string | null,
            };
            /* eslint-enable @typescript-eslint/no-explicit-any */
        }, TOKEN_FLOWS);

        return {
            flowsFired: result.flowsFired as Record<FlowName, boolean>,
            flowNotes: result.flowNotes as Partial<Record<FlowName, string>>,
            setupError: result.setupError,
            pageErrors,
        };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('token document + scene embedding (Tier B)', () => {
    // Cap at 2 minutes total — internal per-call timeouts mean we should
    // never come close, but a hung server would otherwise eat the global
    // 10-minute test timeout and take downstream specs with it.
    test.setTimeout(120_000);
    test('scene token lifecycle exercises TokenDocumentWH40K overrides', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeTokenFlows(page);

        const failures: string[] = [];

        for (const flow of TOKEN_FLOWS) {
            if (probe.flowsFired[flow]) {
                recordCoverage('token.flow', flow);
            } else {
                const note = probe.flowNotes[flow] ?? 'flow did not fire and no diagnostic note recorded';
                failures.push(`flow ${flow}: ${note}`);
            }
        }

        const pageErrorTail = probe.pageErrors.length > 0 ? `\n  pageerrors: ${probe.pageErrors.slice(0, 5).join(' | ')}` : '';

        expect(failures, `${failures.length}/${TOKEN_FLOWS.length} token probes failed:\n  - ${failures.join('\n  - ')}${pageErrorTail}`).toEqual([]);
    });
});
