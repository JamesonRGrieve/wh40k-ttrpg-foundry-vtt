import type { Page } from '@playwright/test';
import { leanWeapon } from './lib/attack-harness';
import { assertFlowResults } from './lib/flow-assert';
import { joinOrSkip } from './lib/join';
import { compendiumUuid } from './lib/pack-lookup';
import { snap } from './lib/screenshot';
import { createProbeActor, deleteProbeActors, openProbeSheet } from './lib/sheet-probe';
import { test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B coverage of the compendium join for an item added to an EXISTING actor
 * (#621, src/module/compendium-hydrate.ts `hydrateCreatedItemInMemory` on the
 * `createItem` hook).
 *
 * The in-memory join ran at boot, on actor import and on sheet render, but not when
 * a lean compendium item (its `compendiumSource` plus the actor's own state) was
 * added to an actor that already existed, so the new item read its schema defaults
 * until the next load: a Hand Flamer showed clip 2/0 with no profile. A DH2 acolyte
 * with its sheet open gains a lean Hand Flamer; the item must read its full profile
 * straight away with no database write (no `updateItem` fires), and its sheet and the acolyte's Combat tab
 * are captured.
 *
 * Each flow records under `created-item-hydrate.flow`. Keys MUST match
 * CREATED_ITEM_HYDRATE_FLOWS in scripts/e2e-coverage.mjs.
 */

const CREATED_ITEM_HYDRATE_FLOWS = ['created-item-joined-at-once', 'joined-without-db-write', 'item-sheet-shows-profile'] as const;
type FlowName = (typeof CREATED_ITEM_HYDRATE_FLOWS)[number];

/** The DH2 Hand Flamer: pistol, 1d10+4 E, Pen 2, 10 m, Flame + Spray, clip 2. */
const HAND_FLAMER = compendiumUuid({ line: 'dh2', category: 'weapons' }, 'j7K8l9M0n1O2p3Q4');
/** How long the join may take after creation (one compendium fetch). */
const JOIN_WAIT_MS = 3_000;

interface AddRead {
    joined: boolean;
    elapsedMs: number;
    view: string;
    /** `updateItem` hooks fired for the new item while it joined: a database write would fire one. */
    writes: number;
}

/** Add a lean Hand Flamer to the actor and watch it join; report what it reads and whether anything was written. */
async function addLeanFlamer(page: Page, actorId: string): Promise<AddRead> {
    return page.evaluate(
        async (args: { actorId: string; stub: object; waitMs: number }) => {
            interface Weapon {
                id: string;
                name: string;
                system: {
                    class: string;
                    clip: { value: number; max: number };
                    damage: { formula: string; bonus: number; penetration: number };
                    special: Set<string>;
                };
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                game: { actors: { get: (id: string) => { createEmbeddedDocuments: (t: string, d: object[]) => Promise<Weapon[]> } | undefined } };
                Hooks: { on: (hook: string, fn: (item: { name: string }) => void) => number; off: (hook: string, id: number) => void };
            };
            const actor = g.game.actors.get(args.actorId);
            if (actor === undefined) return { joined: false, elapsedMs: 0, view: 'no actor', writes: 0 };
            let writes = 0;
            const hookId = g.Hooks.on('updateItem', (item) => {
                if (item.name === 'Hand Flamer') writes += 1;
            });
            const started = Date.now();
            const flamer = (await actor.createEmbeddedDocuments('Item', [args.stub])).at(0);
            if (flamer === undefined) {
                g.Hooks.off('updateItem', hookId);
                return { joined: false, elapsedMs: 0, view: 'not created', writes };
            }
            const s = (): Weapon['system'] => flamer.system;
            const joined = await globalThis.wh40kE2E.pollUntil(
                () => s().class === 'pistol' && s().clip.max === 2 && s().damage.formula === '1d10' && s().special.has('flame'),
                globalThis.wh40kE2E.scaledMs(args.waitMs),
            );
            const elapsedMs = Date.now() - started;
            // Let any write the join might have made arrive before the count is read.
            await globalThis.wh40kE2E.settle(500);
            g.Hooks.off('updateItem', hookId);
            const view = `class ${s().class}, clip ${s().clip.value}/${s().clip.max}, ${s().damage.formula}+${s().damage.bonus} pen ${
                s().damage.penetration
            }, special [${[...s().special].join(',')}]`;
            return { joined, elapsedMs, view, writes };
        },
        { actorId, stub: leanWeapon('Hand Flamer', HAND_FLAMER, 2), waitMs: JOIN_WAIT_MS },
    );
}

test.describe.serial('a lean item added to an existing actor joins at once (Tier B, #621)', () => {
    test.setTimeout(scaledMs(240_000));
    test('the Hand Flamer reads its full profile the moment it is added, and is stored lean', async ({ page }) => {
        await joinOrSkip(page);
        const results: Array<{ name: FlowName; ok: boolean; detail: string | null }> = [];
        const record = (name: FlowName, ok: boolean, detail: string): void => {
            results.push({ name, ok, detail: ok ? null : detail });
        };
        const actors: string[] = [];
        try {
            const actorId = await createProbeActor(page, {
                name: 'Join probe',
                type: 'dh2-character',
                flags: { 'wh40k-rpg': { sheetSource: 'authored-build' } },
            });
            if (actorId === null) throw new Error('probe actor was not created');
            actors.push(actorId);
            // The acolyte already exists, its sheet open, when the item arrives.
            const actorSheet = await openProbeSheet(page, actorId, { tab: 'combat' });
            const added = await addLeanFlamer(page, actorId);
            record('created-item-joined-at-once', added.joined, `after ${added.elapsedMs} ms the item reads ${added.view}`);
            record('joined-without-db-write', added.writes === 0, `${added.writes} item update(s) written while joining`);
            if (actorSheet !== null)
                await snap(page, 'created-item-hydrate-actor-combat-tab', {
                    selector: `#${actorSheet.appId}`,
                    closeWindows: true,
                    keepWindow: actorSheet.appId,
                });

            const itemSheet = await openProbeSheet(page, actorId, { itemName: 'Hand Flamer' });
            const shown = await page.evaluate((appId: string | null) => {
                if (appId === null) return '';
                return document.querySelector(`#${appId} [data-weapon-penetration]`)?.textContent.trim() ?? '';
            }, itemSheet?.appId ?? null);
            record('item-sheet-shows-profile', itemSheet !== null && shown === '2', `item sheet penetration "${shown}"`);
            if (itemSheet !== null)
                await snap(page, 'created-item-hydrate-weapon-sheet', { selector: `#${itemSheet.appId}`, closeWindows: true, keepWindow: itemSheet.appId });
        } finally {
            await deleteProbeActors(page, actors);
        }
        assertFlowResults({ results }, CREATED_ITEM_HYDRATE_FLOWS, { dimension: 'created-item-hydrate.flow', label: 'created item hydrate' });
    });
});
