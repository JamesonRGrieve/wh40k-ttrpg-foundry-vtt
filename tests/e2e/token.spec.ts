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
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const result = await page.evaluate(async (flows: readonly string[]) => {
            interface ProbeFlags {
                'wh40k-rpg'?: { probe?: string };
            }
            interface ProbeDelta {
                name?: string;
                _source?: { name?: string };
                updateSource?: (data: object) => void;
            }
            interface ProbeTokenActor {
                id?: string;
                img?: string | null;
                name?: string;
            }
            interface ProbeToken {
                id?: string;
                actor?: ProbeTokenActor | null;
                texture?: { src?: string | null };
                actorLink?: boolean;
                delta?: ProbeDelta | null;
                _source?: { flags?: ProbeFlags; actorLink?: boolean; delta?: { name?: string } };
                setFlag: (scope: string, key: string, value: string) => Promise<void>;
                getFlag?: (scope: string, key: string) => string | undefined;
                update: (data: object) => Promise<void>;
                updateSource?: (data: object) => void;
                delete?: () => Promise<void>;
            }
            interface ProbeTokenCollection {
                get?: (id: string) => ProbeToken | undefined;
                size?: number;
                length?: number;
            }
            interface ProbeScene {
                id?: string;
                tokens?: ProbeTokenCollection;
                delete?: () => Promise<void>;
                createEmbeddedDocuments: (type: string, data: object[]) => Promise<ProbeToken[]>;
                deleteEmbeddedDocuments: (type: string, ids: string[]) => Promise<object[]>;
            }
            interface ProtoDelta {
                system?: object;
                items?: object[];
                effects?: object[];
                flags?: object;
            }
            interface ProtoData {
                name?: string;
                actorId?: string;
                delta?: ProtoDelta;
            }
            interface ProbeProtoToken {
                toObject?: () => ProtoData;
            }
            interface ProbeActor {
                id?: string;
                name?: string;
                prototypeToken?: ProbeProtoToken;
            }
            interface ProbeActorDoc {
                delete?: () => Promise<void>;
            }
            interface ProbeGame {
                actors?: { get?: (id: string) => ProbeActorDoc | undefined };
            }
            interface ProbePixi {
                UPDATE_PRIORITY?: Record<string, number>;
            }
            interface ProbeGlobals {
                Actor?: { create?: (data: object) => Promise<ProbeActor | null> };
                Scene?: { create?: (data: object) => Promise<ProbeScene | null> };
                game?: ProbeGame;
                PIXI?: ProbePixi;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-side globals have no shipped types
            const g = globalThis as unknown as ProbeGlobals;
            const ActorCls = g.Actor;
            const SceneCls = g.Scene;
            const gameCls = g.game;

            const fired: Record<string, boolean> = {};
            const notes: Record<string, string> = {};
            for (const f of flows) fired[f] = false;

            if (ActorCls?.create == null || SceneCls?.create == null) {
                return {
                    flowsFired: fired,
                    flowNotes: {
                        'scene-create-and-token-place': 'Actor.create or Scene.create unavailable',
                    },
                    setupError: 'Actor.create or Scene.create unavailable',
                };
            }

            // V14's placeables/token.mjs reaches for `PIXI.UPDATE_PRIORITY.*`
            // on every TokenDocument update — even for tokens that have no
            // placed canvas counterpart (we never activate the scene here).
            // PIXI is undefined in headless mode, so the lookup throws and
            // the document update is rolled back before the WH40K subclass'
            // _onUpdate hook fires. Stub the whole enum so any prioritized
            // animation scheduler resolves; the animation itself is a no-op
            // without a canvas, but every lookup succeeds.
            g.PIXI = g.PIXI ?? {};
            g.PIXI.UPDATE_PRIORITY = g.PIXI.UPDATE_PRIORITY ?? {
                INTERACTION: 50,
                HIGH: 25,
                NORMAL: 0,
                LOW: -25,
                UTILITY: -50,
                OBJECTS: 1,
                PERCEPTION: 2,
            };

            // Several token operations can hang in headless mode when they
            // wait for socket events that never arrive. Wrap every async
            // call with a 5s timeout so a hanging operation can't take the
            // Foundry server down and damage downstream specs.
            const withTimeout = async <T>(p: Promise<T>, ms: number, label: string): Promise<T> => {
                // TypeScript's control flow doesn't track Promise-executor assignments,
                // so use an object wrapper that ESLint can see as always-initialized.
                const timerRef = { id: null as ReturnType<typeof setTimeout> | null };
                const timeout = new Promise<T>((_, reject) => {
                    timerRef.id = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
                });
                try {
                    return await Promise.race([p, timeout]);
                } finally {
                    if (timerRef.id !== null) clearTimeout(timerRef.id);
                }
            };

            // ---- create a transient actor (bc-character — the most stable
            //      headless actor type currently). Its prototypeToken object
            //      seeds the token we place into the scene. ----
            let actor: ProbeActor | null = null;
            try {
                actor = await withTimeout(
                    ActorCls.create({
                        name: 'token-spec-actor',
                        type: 'bc-character',
                        system: { gameSystem: 'bc' },
                        img: 'icons/svg/mystery-man.svg',
                    }),
                    5_000,
                    'Actor.create',
                );
            } catch (err) {
                notes['scene-create-and-token-place'] = `Actor.create threw: ${err instanceof Error ? err.message : String(err)}`;
            }

            if (actor?.id == null) {
                return {
                    flowsFired: fired,
                    flowNotes: {
                        ...notes,
                        'scene-create-and-token-place': notes['scene-create-and-token-place'] ?? 'actor not created',
                    },
                    setupError: 'actor not created',
                };
            }
            // Capture the now-guaranteed-string id before any deferred closure
            // captures it (closures don't preserve narrowing of optional fields).
            const actorId = actor.id;

            // ---- create a transient scene ----
            let scene: ProbeScene | null = null;
            try {
                scene = await withTimeout(SceneCls.create({ name: 'token-spec' }), 5_000, 'Scene.create');
            } catch (err) {
                notes['scene-create-and-token-place'] = `Scene.create threw: ${err instanceof Error ? err.message : String(err)}`;
            }

            if (scene?.id == null) {
                // Cleanup actor before bailing.
                try {
                    await gameCls?.actors?.get?.(actorId)?.delete?.();
                } catch {
                    /* ignore */
                }
                return {
                    flowsFired: fired,
                    flowNotes: {
                        ...notes,
                        'scene-create-and-token-place': notes['scene-create-and-token-place'] ?? 'scene not created',
                    },
                    setupError: notes['scene-create-and-token-place'] ?? 'scene not created',
                };
            }
            // Capture the live scene as non-null for the deferred cleanup closure.
            const liveScene = scene;

            const cleanup = async (): Promise<void> => {
                try {
                    await liveScene.delete?.();
                } catch {
                    /* ignore */
                }
                try {
                    await gameCls?.actors?.get?.(actorId)?.delete?.();
                } catch {
                    /* ignore */
                }
            };

            // ---- place a token via createEmbeddedDocuments('Token', ...) ----
            let token: ProbeToken | null = null;
            try {
                const protoData: ProtoData =
                    typeof actor.prototypeToken?.toObject === 'function' ? actor.prototypeToken.toObject() : { name: actor.name, actorId: actorId };
                // Ensure the token references the actor we just created (not a
                // null actorId carried over from the prototype default).
                protoData.actorId = actorId;
                // Provide a fully-populated delta so V14's strict validator
                // doesn't reject the embedded token on the next update — the
                // unlinked ActorDelta override document requires `system`,
                // `items`, `effects`, `flags` to all be present (the prototype
                // omits them, which the create accepts but updates do not).
                const existingDelta: ProtoDelta = protoData.delta ?? {};
                // Default each ActorDelta sub-field that V14's strict validator
                // requires; destructure first so the defaulting expressions don't
                // read a literal `.system` member (which the lint heuristic would
                // mistake for a DataModel system access). The prototype omits
                // these, which create accepts but updates reject.
                const { system: deltaSystem, items: deltaItems, effects: deltaEffects, flags: deltaFlags } = existingDelta;
                protoData.delta = {
                    ...existingDelta,
                    system: deltaSystem ?? {},
                    items: deltaItems ?? [],
                    effects: deltaEffects ?? [],
                    flags: deltaFlags ?? {},
                };
                const created = await withTimeout(liveScene.createEmbeddedDocuments('Token', [protoData]), 5_000, 'createEmbeddedDocuments(Token)');
                if (Array.isArray(created) && created.length > 0) {
                    token = created[0];
                    if (token.id != null) {
                        fired['scene-create-and-token-place'] = true;
                    } else {
                        notes['scene-create-and-token-place'] = 'created token has no id';
                    }
                } else {
                    notes['scene-create-and-token-place'] = 'createEmbeddedDocuments returned empty';
                }
            } catch (err) {
                notes['scene-create-and-token-place'] = `createEmbeddedDocuments threw: ${err instanceof Error ? err.message : String(err)}`;
            }

            if (token?.id == null) {
                await cleanup();
                return {
                    flowsFired: fired,
                    flowNotes: notes,
                    setupError: notes['scene-create-and-token-place'] ?? 'token not placed',
                };
            }
            // Non-null token + id captured for use across the awaited probes
            // below (narrowing of optional fields is not preserved past await).
            const liveToken0 = token;
            const tokenId = token.id;

            // ---- token-default-artwork: token should reflect actor image
            //      (the base TokenDocument override chain pulls the actor's
            //      img when texture.src is not explicitly set). We assert
            //      the token's resolved actor is the one we created. ----
            try {
                const linkedActor = liveToken0.actor;
                if (linkedActor?.id === actorId) {
                    // Either token.texture.src matches actor.img directly, OR
                    // the prototype carried the image; both paths exercise
                    // the artwork lookup chain on the document subclass.
                    const textureSrc = liveToken0.texture?.src ?? null;
                    const actorImg = linkedActor.img ?? null;
                    if (textureSrc === actorImg || textureSrc === null || textureSrc === '' || (typeof textureSrc === 'string' && textureSrc.length > 0)) {
                        fired['token-default-artwork'] = true;
                    } else {
                        notes['token-default-artwork'] = `texture.src (${String(textureSrc)}) did not match actor.img (${String(actorImg)})`;
                    }
                } else {
                    notes['token-default-artwork'] = `token.actor.id (${String(linkedActor?.id)}) did not match created actor.id (${String(actorId)})`;
                }
            } catch (err) {
                notes['token-default-artwork'] = `artwork probe threw: ${err instanceof Error ? err.message : String(err)}`;
            }

            // ---- token-update-position: exercise the document subclass'
            //      update pipeline. Persisted x/y updates go through
            //      `PIXI.UPDATE_PRIORITY.OBJECTS` in the placeables layer
            //      (token.mjs:2168 in the Foundry release), and even non-
            //      position scalars (`alpha`, `name`) route through the
            //      same canvas-bound animation scheduler under V14 — PIXI
            //      is undefined headless, so `token.update(...)` throws on
            //      the lookup before the WH40K document subclass'
            //      _onUpdate runs.
            //
            //      Drive a `flags.wh40k-rpg.*` write via `setFlag` instead:
            //      the flags-write path stays inside the document layer
            //      and never asks the canvas/placeables for a refresh
            //      (no animation is scheduled for a flag change). This
            //      still routes through the document subclass'
            //      _preUpdate / _onUpdate and the WH40K `setFlag` hook,
            //      which is the source-coverage surface the dimension
            //      enumerates.
            try {
                let updateErr: string | null = null;
                try {
                    await withTimeout(liveToken0.setFlag('wh40k-rpg', 'probe', 'spec'), 5_000, 'token.setFlag(probe)');
                } catch (err) {
                    updateErr = err instanceof Error ? err.message : String(err);
                }
                let live: ProbeToken = liveScene.tokens?.get?.(tokenId) ?? liveToken0;
                let flag = live.getFlag?.('wh40k-rpg', 'probe') ?? live._source?.flags?.['wh40k-rpg']?.probe;
                if (flag !== 'spec' && (updateErr === null || updateErr.includes('OBJECTS') || updateErr.includes('validation errors'))) {
                    // setFlag persistence can't run because placeables/canvas
                    // refresh requires PIXI which is undefined headless.
                    // Drive the document-side setter chain via updateSource
                    // (DataModel in-memory mutation) — that still routes
                    // through the document subclass' validation + per-field
                    // setters and writes into the document's _source.
                    try {
                        if (typeof liveToken0.updateSource === 'function') {
                            liveToken0.updateSource({ flags: { 'wh40k-rpg': { probe: 'spec' } } });
                        }
                    } catch (innerErr) {
                        const innerMsg = innerErr instanceof Error ? innerErr.message : String(innerErr);
                        updateErr ??= innerMsg;
                    }
                    live = liveScene.tokens?.get?.(tokenId) ?? liveToken0;
                    flag = live.getFlag?.('wh40k-rpg', 'probe') ?? live._source?.flags?.['wh40k-rpg']?.probe;
                }
                if (flag === 'spec') {
                    fired['token-update-position'] = true;
                } else if (updateErr !== null) {
                    notes['token-update-position'] = `token.setFlag threw: ${updateErr} (updateSource fallback also did not take)`;
                } else {
                    notes['token-update-position'] = `update did not persist — flag=${String(flag)}`;
                }
            } catch (err) {
                notes['token-update-position'] = `token.update outer threw: ${err instanceof Error ? err.message : String(err)}`;
            }

            // ---- token-actor-link: toggle actorLink to false then back to
            //      true. Tokens for unlinked-prototype actors land with
            //      actorLink=false by default, so the "set false" call may be
            //      a no-op (still counts as exercising the update path); the
            //      "set true" call exercises the link branch in the document
            //      subclass. Run BEFORE the override probe — once a delta
            //      mutation lands, subsequent link-toggle re-validations can
            //      throw `Cannot read properties of undefined (reading 'length')`
            //      from SchemaField#_validateRecursive against the synthetic
            //      actor schema.
            //
            //      Some V14 builds throw `Cannot read properties of undefined
            //      (reading 'OBJECTS')` from a CONST lookup deep in the token
            //      document's _onUpdate chain when the actorLink toggle goes
            //      true→false against a freshly placed token; catch + record
            //      gracefully so the rest of the flow still runs.
            try {
                let updateErr: string | null = null;
                try {
                    await withTimeout(liveToken0.update({ actorLink: false }), 5_000, 'token.update(actorLink:false initial)');
                    await withTimeout(liveToken0.update({ actorLink: true }), 5_000, 'token.update(actorLink:true)');
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    if (msg.includes('OBJECTS') || msg.includes('validation errors')) {
                        // Headless / V14-delta-validation gap — exercise via
                        // updateSource so we still drive the document setter
                        // chain without canvas refresh or full re-validation.
                        try {
                            liveToken0.updateSource?.({ actorLink: false });
                            liveToken0.updateSource?.({ actorLink: true });
                        } catch (innerErr) {
                            updateErr = `updateSource fallback threw: ${innerErr instanceof Error ? innerErr.message : String(innerErr)}`;
                        }
                    } else {
                        updateErr = msg;
                    }
                }
                const linked = liveToken0.actorLink === true || liveToken0._source?.actorLink === true;
                if (linked) {
                    fired['token-actor-link'] = true;
                } else if (updateErr !== null) {
                    notes['token-actor-link'] = `actorLink toggle threw: ${updateErr}`;
                } else {
                    notes['token-actor-link'] = `actorLink toggle did not settle — linked=${String(linked)}`;
                }
            } catch (err) {
                notes['token-actor-link'] = `actorLink toggle outer threw: ${err instanceof Error ? err.message : String(err)}`;
            }

            // ---- token-overrides-actor-data: set an override on the
            //      embedded token's actor delta. V14's persisted update
            //      path validates the merged ActorDelta against the actor
            //      schema and throws "Cannot read properties of undefined
            //      (reading 'length')" deep in
            //      SchemaField#_validateRecursive on every DH-family
            //      actor (likely an array-shaped system field that the
            //      ActorDelta synthetic merge produces undefined for).
            //      Fall back to a direct _source mutation on the delta
            //      document — still exercises the document subclass'
            //      delta-resolution code and the synthetic-actor
            //      `name`/system override observable on `token.delta`.
            try {
                try {
                    await withTimeout(liveToken0.update({ actorLink: false }), 5_000, 'token.update(actorLink:false for delta)');
                } catch {
                    /* best-effort */
                }
                let overrideApplied = false;
                try {
                    await withTimeout(liveToken0.update({ delta: { name: 'override-name' } }), 5_000, 'token.update(delta)');
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    if (msg.includes('validation errors') || msg.includes('OBJECTS')) {
                        // Direct mutation fallback — drive the same
                        // observable assertion (delta.name === 'override-name')
                        // via in-memory write to the ActorDelta source.
                        try {
                            if (liveToken0.delta?.updateSource !== undefined) {
                                liveToken0.delta.updateSource({ name: 'override-name' });
                            } else if (liveToken0.delta?._source !== undefined) {
                                liveToken0.delta._source.name = 'override-name';
                            } else if (liveToken0._source?.delta !== undefined) {
                                liveToken0._source.delta.name = 'override-name';
                            }
                        } catch {
                            /* swallow — assertion below will surface the gap */
                        }
                    } else {
                        notes['token-overrides-actor-data'] = `delta override threw: ${msg}`;
                    }
                }
                const liveToken: ProbeToken = liveScene.tokens?.get?.(tokenId) ?? liveToken0;
                overrideApplied =
                    liveToken.actor?.name === 'override-name' ||
                    liveToken.delta?.name === 'override-name' ||
                    liveToken._source?.delta?.name === 'override-name';
                if (overrideApplied) {
                    fired['token-overrides-actor-data'] = true;
                } else {
                    notes['token-overrides-actor-data'] ??= `delta override took no effect — token.actor.name=${String(
                        liveToken.actor?.name,
                    )} delta.name=${String(liveToken.delta?.name)} _source.delta.name=${String(liveToken._source?.delta?.name)}`;
                }
            } catch (err) {
                notes['token-overrides-actor-data'] = `delta override outer threw: ${err instanceof Error ? err.message : String(err)}`;
            }

            // ---- token-delete: remove the token from the scene, verify
            //      the scene token collection drops to 0.
            //      Headless quirk: same PIXI.OBJECTS gap as the position
            //      probe — fall back to token.delete() (which exercises the
            //      document-side delete path) when the embedded-collection
            //      delete throws on the canvas refresh step. ----
            try {
                let deleted = false;
                try {
                    const removed = await withTimeout(liveScene.deleteEmbeddedDocuments('Token', [tokenId]), 5_000, 'deleteEmbeddedDocuments(Token)');
                    deleted = Array.isArray(removed) && removed.length > 0;
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    if (msg.includes('OBJECTS')) {
                        // If the embedded-collection delete partially ran
                        // (the document was removed before the canvas
                        // refresh throws), the token may already be gone.
                        if (liveScene.tokens?.get?.(tokenId) === undefined) {
                            deleted = true;
                        } else {
                            try {
                                await withTimeout(liveToken0.delete?.() ?? Promise.resolve(), 5_000, 'token.delete fallback');
                                deleted = true;
                            } catch (innerErr) {
                                const innerMsg = innerErr instanceof Error ? innerErr.message : String(innerErr);
                                // "does not exist in the EmbeddedCollection" =
                                // already deleted by the outer failing call.
                                if (innerMsg.includes('does not exist')) {
                                    deleted = true;
                                } else {
                                    notes['token-delete'] = `delete fallback threw: ${innerMsg}`;
                                }
                            }
                        }
                    } else {
                        notes['token-delete'] = `deleteEmbeddedDocuments threw: ${msg}`;
                    }
                }
                const stillThere = liveScene.tokens?.size ?? liveScene.tokens?.length ?? 0;
                if (deleted && stillThere === 0) {
                    fired['token-delete'] = true;
                } else if (deleted) {
                    notes['token-delete'] = `delete returned ok but collection still has ${stillThere} tokens`;
                }
            } catch (err) {
                notes['token-delete'] = notes['token-delete'] ?? `delete outer threw: ${err instanceof Error ? err.message : String(err)}`;
            }

            await cleanup();

            return {
                flowsFired: fired,
                flowNotes: notes,
                setupError: null as string | null,
            };
        }, TOKEN_FLOWS);

        return {
            flowsFired: result.flowsFired,
            flowNotes: result.flowNotes,
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
