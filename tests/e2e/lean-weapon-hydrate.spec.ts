import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B coverage of the compendium join for LEAN owned weapons (#574, #598,
 * src/module/compendium-hydrate.ts + data/abstract/system-data-model.ts).
 *
 * A lean stub stores only `_stats.compendiumSource` and its per-actor state, so its
 * cleaned `_source.system` holds a schema initial in every field it never stored.
 * Before #574 those initials beat the compendium body and every lean weapon read
 * as a primitive melee weapon (class `melee`, 1d10, no range, no qualities). The
 * join now defers a default-valued field to the canonical body, EXCEPT instance
 * state (an emptied clip stays empty), and an optional field with no initial
 * (`requiredTraining`) stays writable through Foundry's source seal (#598).
 *
 * The weapon sheet of the joined stub is captured so the hydrated stats can be
 * judged by eye.
 *
 * Each flow records under `lean-weapon-hydrate.flow`. Keys MUST match
 * LEAN_WEAPON_HYDRATE_FLOWS in scripts/e2e-coverage.mjs.
 */

const LEAN_WEAPON_HYDRATE_FLOWS = ['lean-weapon-joins-canonical', 'instance-state-kept', 'optional-field-writable'] as const;

type FlowName = (typeof LEAN_WEAPON_HYDRATE_FLOWS)[number];

/** The DH2 core Hand Flamer: pistol, 1d10+4 E, Pen 2, 10 m, Flame + Spray, clip 2. */
const HAND_FLAMER_UUID = 'Compendium.wh40k-rpg.dh2-core-items-weapons.Item.j7K8l9M0n1O2p3Q4';

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string | null;
}

interface ProbeState {
    results: FlowResult[];
    actorId: string | null;
    sheetAppId: string | null;
}

interface WeaponSystemView {
    class: string;
    damage: { formula: string; bonus: number; penetration: number; type: string };
    attack: { range: { value: number } };
    special: Set<string>;
    clip: { value: number; max: number };
    requiredTraining?: string;
}

interface ItemLike {
    id: string;
    name: string;
    system: WeaponSystemView;
    update: (data: object) => Promise<object | undefined>;
    sheet: { id: string; rendered: boolean; render: (o: { force: boolean }) => Promise<object> };
}

interface ActorLike {
    id: string;
    items: { contents: ItemLike[] };
    reset: () => void;
}

async function probeLeanWeapon(page: Page, uuid: string): Promise<ProbeState> {
    return page.evaluate(async (sourceUuid: string): Promise<ProbeState> => {
        const out: FlowResult[] = [];
        const record = (name: FlowName, ok: boolean, detail: string | null = null): void => {
            out.push({ name, ok, detail });
        };
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as { Actor: { create: (d: object) => Promise<ActorLike | null> } };
        const { pollUntil, waitFor, scaledMs: scale } = globalThis.wh40kE2E;
        const state: ProbeState = { results: out, actorId: null, sheetAppId: null };
        try {
            // Two lean stubs of the same compendium weapon (canonical clip 2): one with a
            // round left, and one the actor fires empty AFTER creation (a weapon arrives
            // loaded, #574; clip.value 0 IS the schema initial, which the join must still
            // keep as the actor's own state once it is stored).
            const actor = await g.Actor.create({
                name: 'lean-weapon probe',
                type: 'dh2-character',
                items: [
                    { name: 'Hand Flamer', type: 'weapon', _stats: { compendiumSource: sourceUuid }, system: { clip: { value: 1 } } },
                    { name: 'Hand Flamer (spent)', type: 'weapon', _stats: { compendiumSource: sourceUuid } },
                ],
            });
            if (actor === null) {
                record('lean-weapon-joins-canonical', false, 'Actor.create returned null');
                return state;
            }
            state.actorId = actor.id;
            const fresh = actor.items.contents.find((i) => i.name === 'Hand Flamer');
            const spent = actor.items.contents.find((i) => i.name === 'Hand Flamer (spent)');
            if (fresh === undefined || spent === undefined) {
                record('lean-weapon-joins-canonical', false, 'the lean stubs were not embedded');
                return state;
            }
            // The createActor hook runs the in-memory join.
            await pollUntil(() => fresh.system.class === 'pistol' && spent.system.class === 'pistol', scale(10_000));

            // 1. the canonical body wins over the stub's schema initials
            const s = fresh.system;
            const joined =
                s.class === 'pistol' &&
                s.damage.formula === '1d10' &&
                s.damage.bonus === 4 &&
                s.damage.penetration === 2 &&
                s.damage.type === 'energy' &&
                s.attack.range.value === 10 &&
                s.special.has('spray') &&
                s.special.has('flame') &&
                s.clip.max === 2;
            record(
                'lean-weapon-joins-canonical',
                joined,
                joined
                    ? null
                    : `joined stub reads class=${s.class} damage=${s.damage.formula}+${s.damage.bonus} ${s.damage.type} pen ${s.damage.penetration} range=${
                          s.attack.range.value
                      } special=[${[...s.special].join(',')}] clip.max=${s.clip.max}`,
            );

            // 2. instance state keeps the actor's value even when it equals the default:
            // the spent stub arrived loaded, is fired empty, and stays empty through a
            // re-prepare from its stored source.
            const arrivedLoaded = spent.system.clip.value === 2;
            await spent.update({ 'system.clip.value': 0 });
            actor.reset();
            const kept = arrivedLoaded && spent.system.clip.value === 0 && spent.system.clip.max === 2 && fresh.system.clip.value === 1;
            record(
                'instance-state-kept',
                kept,
                kept
                    ? null
                    : `spent arrived loaded=${String(arrivedLoaded)}, spent clip ${spent.system.clip.value}/${spent.system.clip.max}, fresh clip ${
                          fresh.system.clip.value
                      }/${fresh.system.clip.max}`,
            );

            // 3. an optional field the stub never stored is writable through the seal
            try {
                await fresh.update({ 'system.requiredTraining': 'Flame' });
                const written = fresh.system.requiredTraining === 'Flame';
                record('optional-field-writable', written, written ? null : `requiredTraining reads ${String(fresh.system.requiredTraining)}`);
            } catch (err) {
                record('optional-field-writable', false, `update threw: ${err instanceof Error ? err.message : String(err)}`);
            }

            // Open the joined weapon's sheet for the capture.
            await fresh.sheet.render({ force: true });
            await waitFor(() => fresh.sheet.rendered, 'lean weapon sheet render', scale(10_000));
            state.sheetAppId = fresh.sheet.id;
        } catch (err) {
            record('lean-weapon-joins-canonical', false, err instanceof Error ? err.message : String(err));
        }
        return state;
    }, uuid);
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

test.describe.serial('lean weapon compendium join (Tier B, #574, #598)', () => {
    test.setTimeout(scaledMs(180_000));
    test('a lean weapon stub reads its compendium stats, keeps its own state, and stays writable', async ({ page }) => {
        await joinOrSkip(page);

        let state: ProbeState = { results: [], actorId: null, sheetAppId: null };
        try {
            state = await probeLeanWeapon(page, HAND_FLAMER_UUID);
            if (state.sheetAppId !== null) {
                await clearScreenOverlays(page, state.sheetAppId);
                await snap(page, 'lean-weapon-hydrate-sheet', { selector: `#${state.sheetAppId}` });
            }
        } finally {
            await cleanupProbe(page, state.actorId);
        }

        const fired = new Map(state.results.map((r) => [r.name, r]));
        const failures: string[] = [];
        for (const flow of LEAN_WEAPON_HYDRATE_FLOWS) {
            const result = fired.get(flow);
            if (result?.ok === true) recordCoverage('lean-weapon-hydrate.flow', flow);
            else failures.push(`flow ${flow}: ${result?.detail ?? 'flow did not run'}`);
        }
        expect(failures, failures.join('\n')).toEqual([]);
    });
});
