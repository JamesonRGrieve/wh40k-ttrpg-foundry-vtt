import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { compendiumUuid, packHoldingName } from './lib/pack-lookup';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B coverage of arrive-loaded magazines (#574,
 * src/module/utils/magazine-load.ts, WH40KBaseActor#_preCreate,
 * WH40KItem.createDocuments).
 *
 * The compendium join keeps a stored `clip.value` (instance state), and a lean
 * compendium weapon never stored one — so every compendium NPC's ranged weapon
 * used to arrive with an empty magazine. Now a weapon created on an actor stores
 * a full one: a compendium NPC imported into the world (its weapons embedded in
 * the actor's creation data), and a weapon added to an existing actor. A weapon
 * fired empty after creation stays empty (lean-weapon-hydrate.spec.ts).
 *
 * The Adeptus Arbites Arbitrator (DH2 bestiary) carries a lean Shotgun.
 * The imported Shotgun's weapon sheet (its Clip tile) is captured.
 *
 * Each flow records under `npc-magazine.flow`. Keys MUST match
 * NPC_MAGAZINE_FLOWS in scripts/e2e-coverage.mjs.
 */

const NPC_MAGAZINE_FLOWS = ['compendium-npc-arrives-loaded', 'added-weapon-arrives-loaded'] as const;
type FlowName = (typeof NPC_MAGAZINE_FLOWS)[number];

const ARBITRATOR_NAME = 'Adeptus Arbites Arbitrator';
const BESTIARY_PACK = `wh40k-rpg.${packHoldingName({ line: 'dh2', category: 'actors-bestiary' }, ARBITRATOR_NAME)}`;
/** The DH2 Hand Flamer: clip 2. */
const HAND_FLAMER_UUID = compendiumUuid({ line: 'dh2', category: 'weapons' }, 'j7K8l9M0n1O2p3Q4');

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string | null;
}

interface ProbeState {
    results: FlowResult[];
    actorId: string | null;
    shotgunSheetId: string | null;
}

interface WeaponLike {
    id: string;
    name: string;
    type: string;
    _source: { system: { clip: { value: number } } };
    system: { clip: { value: number; max: number } };
    sheet: { id: string; rendered: boolean; render: (o: { force: boolean }) => Promise<object> };
}

interface ActorLike {
    id: string;
    items: { contents: WeaponLike[] };
    createEmbeddedDocuments: (type: 'Item', data: object[]) => Promise<WeaponLike[]>;
}

interface PackLike {
    getIndex: () => Promise<Array<{ _id: string; name: string }>>;
}

async function probeMagazines(page: Page): Promise<ProbeState> {
    return page.evaluate(
        async (args: { packId: string; npcName: string; flamerUuid: string }): Promise<ProbeState> => {
            const out: FlowResult[] = [];
            const record = (name: FlowName, ok: boolean, detail: string | null = null): void => {
                out.push({ name, ok, detail });
            };
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                game: {
                    packs: { get: (id: string) => PackLike | undefined };
                    actors: { importFromCompendium: (pack: PackLike, id: string) => Promise<ActorLike | null> };
                };
            };
            const { pollUntil, waitFor, scaledMs: scale } = globalThis.wh40kE2E;
            const state: ProbeState = { results: out, actorId: null, shotgunSheetId: null };
            try {
                const pack = g.game.packs.get(args.packId);
                const entry = (await pack?.getIndex())?.find((e) => e.name === args.npcName);
                if (pack === undefined || entry === undefined) {
                    record('compendium-npc-arrives-loaded', false, `${args.npcName} not found in ${args.packId}`);
                    return state;
                }
                const actor = await g.game.actors.importFromCompendium(pack, entry._id);
                if (actor === null) {
                    record('compendium-npc-arrives-loaded', false, 'importFromCompendium returned null');
                    return state;
                }
                state.actorId = actor.id;
                const shotgun = actor.items.contents.find((i) => i.name === 'Shotgun');
                if (shotgun === undefined) {
                    record('compendium-npc-arrives-loaded', false, 'the Arbitrator has no Shotgun');
                    return state;
                }
                // The createActor hook joins the compendium body (clip size) in memory.
                await pollUntil(() => shotgun.system.clip.max > 0, scale(10_000));

                // 1. the imported NPC's lean weapon stored a full magazine
                const { value, max } = shotgun.system.clip;
                const stored = shotgun._source.system.clip.value;
                const loaded = max > 0 && value === max && stored === max;
                record('compendium-npc-arrives-loaded', loaded, loaded ? null : `Shotgun clip ${value}/${max}, stored value ${stored}`);

                // 2. a lean weapon added to the existing actor arrives loaded too
                const added = await actor.createEmbeddedDocuments('Item', [
                    { name: 'Hand Flamer', type: 'weapon', _stats: { compendiumSource: args.flamerUuid } },
                ]);
                const flamer = added.at(0);
                if (flamer === undefined) {
                    record('added-weapon-arrives-loaded', false, 'createEmbeddedDocuments returned nothing');
                } else {
                    // Its clip size came from the compendium at creation (the in-memory join
                    // of an item added to an existing actor runs on the next load).
                    const ok = flamer.system.clip.value === 2 && flamer._source.system.clip.value === 2;
                    record(
                        'added-weapon-arrives-loaded',
                        ok,
                        ok ? null : `Hand Flamer clip ${flamer.system.clip.value}, stored ${flamer._source.system.clip.value}`,
                    );
                }

                await shotgun.sheet.render({ force: true });
                await waitFor(() => shotgun.sheet.rendered, 'Shotgun sheet render', scale(10_000));
                state.shotgunSheetId = shotgun.sheet.id;
            } catch (err) {
                record('compendium-npc-arrives-loaded', false, err instanceof Error ? err.message : String(err));
            }
            return state;
        },
        { packId: BESTIARY_PACK, npcName: ARBITRATOR_NAME, flamerUuid: HAND_FLAMER_UUID },
    );
}

async function cleanupProbe(page: Page, actorId: string | null): Promise<void> {
    if (actorId === null) return;
    await page.evaluate(async (id: string) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as { game: { actors: { get: (i: string) => { delete: () => Promise<void> } | undefined } } };
        await g.game.actors
            .get(id)
            ?.delete()
            .catch(() => undefined);
    }, actorId);
}

test.describe.serial('compendium weapons arrive loaded (Tier B, #574)', () => {
    test.setTimeout(scaledMs(180_000));
    test('an imported compendium NPC, and a weapon added to it, store a full magazine', async ({ page }) => {
        await joinOrSkip(page);

        let state: ProbeState = { results: [], actorId: null, shotgunSheetId: null };
        try {
            state = await probeMagazines(page);
            if (state.shotgunSheetId !== null) {
                await snap(page, 'npc-magazine-shotgun-sheet-loaded', {
                    selector: `#${state.shotgunSheetId}`,
                    closeWindows: true,
                    keepWindow: state.shotgunSheetId,
                });
            }
        } finally {
            await cleanupProbe(page, state.actorId);
        }

        const fired = new Map(state.results.map((r) => [r.name, r]));
        const failures: string[] = [];
        for (const flow of NPC_MAGAZINE_FLOWS) {
            const result = fired.get(flow);
            if (result?.ok === true) recordCoverage('npc-magazine.flow', flow);
            else failures.push(`flow ${flow}: ${result?.detail ?? 'flow did not run'}`);
        }
        expect(failures, failures.join('\n')).toEqual([]);
    });
});
