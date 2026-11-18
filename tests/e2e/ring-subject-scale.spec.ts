import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B: every ringed token draws its ring on the bust's edge (rules/ring-subject-scale.ts).
 *
 * The circular bust is baked for a ring subject scale of 0.8. Only the Kanka import
 * and the portrait-pool spawn used to set it, so an actor made in Foundry kept
 * Foundry's default of 1 and its ring drew inside its portrait (Session 25). The
 * system now sets 0.8 on a ringed actor and token when it is created and when its
 * ring is switched on, and keeps a scale someone chose.
 *
 * A DH2 NPC is created with a ringed prototype token at the default scale and
 * placed on a fresh scene; a second token is placed ringless and has its ring
 * switched on; a third is placed with a chosen scale of 0.9.
 *
 * Each flow records under `ring-subject-scale.flow`. Keys MUST match
 * RING_SUBJECT_SCALE_FLOWS in scripts/e2e-coverage.mjs.
 */

const RING_SUBJECT_SCALE_FLOWS = ['actor-created-at-bust-scale', 'token-created-at-bust-scale', 'ring-switched-on-at-bust-scale', 'chosen-scale-kept'] as const;
type FlowName = (typeof RING_SUBJECT_SCALE_FLOWS)[number];

const NAME = 'e2e-ring-subject-scale';
/** A core Foundry portrait (not placeholder `.svg` art). */
const PORTRAIT = 'icons/environment/people/archer.webp';

interface Probe {
    actorId: string | null;
    sceneId: string | null;
    ringedTokenId: string | null;
    protoScale: number | null;
    placedScale: number | null;
    switchedScale: number | null;
    switchedDetail: string;
    chosenScale: number | null;
    error: string | null;
}

async function probe(page: Page): Promise<Probe> {
    return page.evaluate(
        async ({ name, img }): Promise<Probe> => {
            interface TokenDoc {
                id: string;
                x: number;
                ring: { subject: { scale: number } };
                update: (d: object) => Promise<object>;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                game: { paused: boolean; togglePause: (p: boolean) => void };
                Actor: {
                    create: (d: object) => Promise<{
                        id: string;
                        prototypeToken: { ring: { subject: { scale: number } } };
                        getTokenDocument: (d: object) => Promise<{ toObject: () => object }>;
                    } | null>;
                };
                Scene: {
                    create: (d: object) => Promise<{
                        id: string;
                        view: () => Promise<void>;
                        tokens: { get: (id: string) => TokenDoc | undefined };
                        createEmbeddedDocuments: (type: string, data: object[]) => Promise<TokenDoc[]>;
                    }>;
                };
                canvas: { ready: boolean; scene: { id: string } | null; tokens?: { placeables: Array<{ id: string; mesh: object | null }> } };
            };
            const { pollUntil, scaledMs: scale } = globalThis.wh40kE2E;
            const out: Probe = {
                actorId: null,
                sceneId: null,
                ringedTokenId: null,
                protoScale: null,
                placedScale: null,
                switchedScale: null,
                switchedDetail: '',
                chosenScale: null,
                error: null,
            };
            try {
                const actor = await g.Actor.create({
                    name,
                    type: 'dh2-npc',
                    img,
                    prototypeToken: { texture: { src: img }, ring: { enabled: true, subject: { scale: 1 } } },
                });
                if (actor === null) throw new Error('Actor.create returned null');
                out.actorId = actor.id;
                out.protoScale = actor.prototypeToken.ring.subject.scale;

                const scene = await g.Scene.create({ name, width: 1000, height: 600 });
                out.sceneId = scene.id;
                const base = (await actor.getTokenDocument({ x: 200, y: 200 })).toObject();
                const placed = await scene.createEmbeddedDocuments('Token', [
                    { ...base, x: 200, ring: { enabled: true, subject: { scale: 1 } } },
                    { ...base, x: 400, ring: { enabled: false, subject: { scale: 1 } } },
                    { ...base, x: 600, ring: { enabled: true, subject: { scale: 0.9 } } },
                ]);
                // Matched by position: the created documents need not come back in input order.
                const ringed = placed.find((t) => t.x === 200);
                const ringless = placed.find((t) => t.x === 400);
                const chosen = placed.find((t) => t.x === 600);
                if (ringed === undefined || ringless === undefined || chosen === undefined) throw new Error('token placement failed');
                out.ringedTokenId = ringed.id;
                out.placedScale = scene.tokens.get(ringed.id)?.ring.subject.scale ?? null;
                let viewing: Promise<void> | null = null;
                await pollUntil(() => {
                    if (g.canvas.ready && g.canvas.tokens?.placeables.find((t) => t.id === ringed.id)?.mesh != null) return true;
                    if (viewing === null && g.canvas.scene?.id !== scene.id) {
                        viewing = scene.view().finally(() => {
                            viewing = null;
                        });
                    }
                    return false;
                }, scale(60_000));
                if (g.game.paused) g.game.togglePause(false);
                // Switch the ring on only once the scene is drawn: a token update on an
                // undrawn canvas refreshes placeables that do not exist yet.
                const ringBefore = JSON.stringify(scene.tokens.get(ringless.id)?.ring);
                await ringless.update({ ring: { enabled: true } });
                // On a drawn canvas the prepared ring reads the old scale for a moment
                // after the write returns; the stored value is already the new one.
                await pollUntil(() => scene.tokens.get(ringless.id)?.ring.subject.scale === 0.8, scale(5000));
                out.switchedScale = scene.tokens.get(ringless.id)?.ring.subject.scale ?? null;
                out.switchedDetail = `ring before ${ringBefore}, after ${JSON.stringify(scene.tokens.get(ringless.id)?.ring)}`;
                out.chosenScale = scene.tokens.get(chosen.id)?.ring.subject.scale ?? null;
                await globalThis.wh40kE2E.settle(800);
            } catch (err) {
                out.error = err instanceof Error ? err.message : String(err);
            }
            return out;
        },
        { name: NAME, img: PORTRAIT },
    );
}

/** A screen rectangle around the placed token, padded so the ring band shows whole. */
async function tokenClip(page: Page, tokenId: string): Promise<{ x: number; y: number; width: number; height: number } | null> {
    return page.evaluate(async (id) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as {
            canvas: {
                stage: { scale: { x: number } };
                animatePan: (o: { x: number; y: number; scale: number; duration: number }) => Promise<void>;
                clientCoordinatesFromCanvas: (p: { x: number; y: number }) => { x: number; y: number };
                tokens?: { get: (i: string) => { x: number; y: number; w: number; h: number } | undefined };
            };
        };
        const token = g.canvas.tokens?.get(id);
        if (token === undefined) return null;
        await g.canvas.animatePan({ x: token.x + token.w / 2, y: token.y + token.h / 2, scale: 2, duration: 0 });
        const topLeft = g.canvas.clientCoordinatesFromCanvas({ x: token.x, y: token.y });
        const scale = g.canvas.stage.scale.x;
        const pad = 30;
        return { x: Math.max(0, topLeft.x - pad), y: Math.max(0, topLeft.y - pad), width: token.w * scale + pad * 2, height: token.h * scale + pad * 2 };
    }, tokenId);
}

test.describe.serial('every ringed token draws its ring on the bust (Tier B)', () => {
    test.setTimeout(scaledMs(180_000));
    test('ringed actors and tokens get the bust scale; a chosen scale is kept', async ({ page }) => {
        await joinOrSkip(page);
        const state = await probe(page);
        try {
            if (state.ringedTokenId !== null) {
                const clip = await tokenClip(page, state.ringedTokenId);
                if (clip !== null) await snap(page, 'ring-subject-scale-token', { clip, closeWindows: true });
            }
        } finally {
            await page.evaluate(
                async ({ actorId, sceneId }) => {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
                    const g = globalThis as unknown as {
                        game: {
                            scenes: { get: (id: string) => { delete: () => Promise<object> } | undefined };
                            actors: { get: (id: string) => { delete: () => Promise<object> } | undefined };
                        };
                    };
                    if (sceneId !== null) await g.game.scenes.get(sceneId)?.delete();
                    if (actorId !== null) await g.game.actors.get(actorId)?.delete();
                },
                { actorId: state.actorId, sceneId: state.sceneId },
            );
        }

        const results: Record<FlowName, { ok: boolean; detail: string }> = {
            'actor-created-at-bust-scale': { ok: state.protoScale === 0.8, detail: `prototype scale ${String(state.protoScale)}` },
            'token-created-at-bust-scale': { ok: state.placedScale === 0.8, detail: `placed token scale ${String(state.placedScale)}` },
            'ring-switched-on-at-bust-scale': {
                ok: state.switchedScale === 0.8,
                detail: `switched-on token scale ${String(state.switchedScale)} (${state.switchedDetail})`,
            },
            'chosen-scale-kept': { ok: state.chosenScale === 0.9, detail: `chosen token scale ${String(state.chosenScale)}` },
        };
        const failures: string[] = state.error === null ? [] : [`probe: ${state.error}`];
        for (const flow of RING_SUBJECT_SCALE_FLOWS) {
            if (results[flow].ok) recordCoverage('ring-subject-scale.flow', flow);
            else failures.push(`flow ${flow}: ${results[flow].detail}`);
        }
        expect(failures, failures.join('\n')).toEqual([]);
    });
});
