import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { compendiumUuid, packHoldingName } from './lib/pack-lookup';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B coverage of worn armour on NPCs (#611,
 * src/module/data/actor/npc-armour-derive.ts, NPCSheet#_armourAtLocation).
 *
 * Worn (equipped) armour sets an NPC's per-location AP through the PC
 * computation; an authored stat block applies only while nothing is equipped;
 * an NPC with no stat-block AP wears the armour it lists. The Combat tab's
 * armour silhouette used to read the PC shape off every NPC and show 0 on every
 * location — the live symptom (Wulf Tavik, built on the PDF Breacher).
 *
 * Real cases: the PDF Breacher (stat block AP 5), and the DH2 Arbitrator
 * (stat block AP 9, carrying an Enforcer Light Carapace, AP 5) before and after
 * equipping the carapace. Each NPC's sheet is captured on its Combat tab.
 *
 * Each flow records under `npc-armour.flow`. Keys MUST match NPC_ARMOUR_FLOWS
 * in scripts/e2e-coverage.mjs.
 */

const NPC_ARMOUR_FLOWS = [
    'breacher-stat-block-shows',
    'arbitrator-before-equipping',
    'arbitrator-carapace-equipped',
    'listed-armour-without-stat-block',
    'all-lines-worn-armour',
] as const;
type FlowName = (typeof NPC_ARMOUR_FLOWS)[number];

const DH2_BESTIARY = `wh40k-rpg.${packHoldingName({ line: 'dh2', category: 'actors-bestiary' }, 'Adeptus Arbites Arbitrator')}`;
const HB_BESTIARY = 'wh40k-rpg.hb-dh2-actors-bestiary';
/** The DH2 Enforcer Light Carapace: AP 5 on every location. */
const CARAPACE_UUID = compendiumUuid({ line: 'dh2', category: 'armour' }, 'Hm7xRcF2jNq4Wd9K');
const CARAPACE_NAME = 'Enforcer Light Carapace';
const CARAPACE_AP = 5;
const LINES = ['bc', 'dh1', 'dh2', 'dw', 'ow', 'rt'] as const;

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string | null;
}

interface NpcState {
    id: string;
    body: number;
    tb: number;
}

interface ArmourItem {
    name: string;
    update: (data: object) => Promise<object | undefined>;
}

interface NpcLike {
    id: string;
    system: { armour: { locations: { body: number } }; characteristics: { toughness: { bonus: number } } };
    items: { contents: ArmourItem[] };
    sheet: { id: string; rendered: boolean; render: (o: { force: boolean }) => Promise<object>; changeTab: (tab: string, group: string) => void };
    delete: () => Promise<void>;
}

interface PackLike {
    getIndex: () => Promise<Array<{ _id: string; name: string }>>;
}

interface E2EGlobals {
    Actor: { create: (d: object) => Promise<NpcLike | null> };
    game: {
        packs: { get: (id: string) => PackLike | undefined };
        actors: { get: (id: string) => NpcLike | undefined; importFromCompendium: (pack: PackLike, id: string) => Promise<NpcLike | null> };
    };
}

/** Import a compendium NPC into the world and let the compendium join settle. */
async function importNpc(page: Page, packId: string, name: string): Promise<NpcState | null> {
    return page.evaluate(
        async (args: { packId: string; name: string }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as E2EGlobals;
            const pack = g.game.packs.get(args.packId);
            const entry = (await pack?.getIndex())?.find((e) => e.name === args.name);
            if (pack === undefined || entry === undefined) return null;
            const actor = await g.game.actors.importFromCompendium(pack, entry._id);
            if (actor === null) return null;
            await globalThis.wh40kE2E.settle(500);
            return { id: actor.id, body: actor.system.armour.locations.body, tb: actor.system.characteristics.toughness.bonus };
        },
        { packId, name },
    );
}

/** Equip one of an NPC's items by name and return its prepared body AP once it reaches `expected`. */
async function equip(page: Page, actorId: string, itemName: string, expected: number): Promise<number> {
    return page.evaluate(
        async (args: { actorId: string; itemName: string; expected: number }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as E2EGlobals;
            const actor = g.game.actors.get(args.actorId);
            const item = actor?.items.contents.find((i) => i.name === args.itemName);
            if (actor === undefined || item === undefined) return -1;
            await item.update({ 'system.state.equipped': true });
            await globalThis.wh40kE2E.pollUntil(() => actor.system.armour.locations.body === args.expected, globalThis.wh40kE2E.scaledMs(10_000));
            return actor.system.armour.locations.body;
        },
        { actorId, itemName, expected },
    );
}

/** Open an NPC's sheet on its Combat tab, capture it, and return the body badge's shown total. */
async function captureSheet(page: Page, actorId: string, label: string): Promise<string> {
    const opened = await page.evaluate(async (id: string) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as E2EGlobals;
        const actor = g.game.actors.get(id);
        if (actor === undefined) return null;
        const { waitFor, settle, scaledMs: scale } = globalThis.wh40kE2E;
        await actor.sheet.render({ force: true });
        await waitFor(() => actor.sheet.rendered, 'NPC sheet render', scale(10_000));
        actor.sheet.changeTab('combat', 'primary');
        const badge = (): Element | null => document.querySelector(`#${actor.sheet.id} [data-location="body"] > span:nth-of-type(2)`);
        await waitFor(() => badge() !== null, 'armour silhouette', scale(10_000));
        badge()?.closest('.wh40k-panel')?.scrollIntoView({ block: 'center' });
        await settle(300);
        return {
            sheetId: actor.sheet.id,
            body: badge()?.textContent.trim() ?? '',
            fate: document.querySelector(`#${actor.sheet.id} [data-field="npc-fate-value"]`)?.textContent.trim() ?? null,
        };
    }, actorId);
    if (opened === null) return '';
    // #699: the Fate row shows its count (or "—"), never only a label and an empty star row.
    if (opened.fate !== null) expect(opened.fate, `${label}: Fate row count`).toMatch(/^(?:\d+ \/ \d+|—)$/u);
    await clearScreenOverlays(page, opened.sheetId);
    await snap(page, label, { selector: `#${opened.sheetId}` });
    return opened.body;
}

test.describe.serial('worn armour sets an NPC’s AP (Tier B, #611)', () => {
    test.setTimeout(scaledMs(240_000));
    test('stat blocks show; equipping armour sets a stat block aside; listed armour is worn; every line', async ({ page }) => {
        await joinOrSkip(page);
        const results: FlowResult[] = [];
        const record = (name: FlowName, ok: boolean, detail: string | null = null): void => {
            results.push({ name, ok, detail });
        };
        const created: string[] = [];

        try {
            // 1. The PDF Breacher (Wulf Tavik's base): stat block AP 5, which the sheet showed as 0.
            const breacher = await importNpc(page, HB_BESTIARY, 'PDF Breacher');
            if (breacher === null) record('breacher-stat-block-shows', false, `PDF Breacher could not be imported from ${HB_BESTIARY}`);
            else {
                created.push(breacher.id);
                const shown = await captureSheet(page, breacher.id, 'npc-armour-breacher-stat-block');
                const ok = breacher.body === 5 && shown === String(5 + breacher.tb);
                record('breacher-stat-block-shows', ok, ok ? null : `body AP ${breacher.body}, silhouette shows "${shown}" (TB ${breacher.tb})`);
            }

            // 2–3. The Arbitrator: stat block AP 9 while the carapace is carried; AP 5 once it is worn.
            const arbitrator = await importNpc(page, DH2_BESTIARY, 'Adeptus Arbites Arbitrator');
            if (arbitrator === null) record('arbitrator-before-equipping', false, `the Arbitrator could not be imported from ${DH2_BESTIARY}`);
            else {
                created.push(arbitrator.id);
                const before = await captureSheet(page, arbitrator.id, 'npc-armour-arbitrator-before-equip');
                const beforeOk = arbitrator.body === 9 && before === String(9 + arbitrator.tb);
                record(
                    'arbitrator-before-equipping',
                    beforeOk,
                    beforeOk ? null : `body AP ${arbitrator.body}, silhouette shows "${before}" (TB ${arbitrator.tb})`,
                );

                const afterBody = await equip(page, arbitrator.id, CARAPACE_NAME, CARAPACE_AP);
                const after = await captureSheet(page, arbitrator.id, 'npc-armour-arbitrator-carapace-equipped');
                const afterOk = afterBody === CARAPACE_AP && after === String(CARAPACE_AP + arbitrator.tb);
                record('arbitrator-carapace-equipped', afterOk, afterOk ? null : `body AP ${afterBody} after equipping, silhouette shows "${after}"`);
            }

            // 4. No stat-block AP: the NPC wears the carapace it lists, though it is not equipped.
            const listed = await page.evaluate(async (carapace: string) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
                const g = globalThis as unknown as E2EGlobals;
                const actor = await g.Actor.create({
                    name: 'Listed-armour Enforcer',
                    type: 'dh2-npc',
                    items: [{ name: 'Enforcer Light Carapace', type: 'armour', _stats: { compendiumSource: carapace } }],
                });
                if (actor === null) return null;
                await globalThis.wh40kE2E.pollUntil(() => actor.system.armour.locations.body > 0, globalThis.wh40kE2E.scaledMs(10_000));
                return { id: actor.id, body: actor.system.armour.locations.body };
            }, CARAPACE_UUID);
            if (listed !== null) created.push(listed.id);
            const listedOk = listed?.body === CARAPACE_AP;
            record('listed-armour-without-stat-block', listedOk, listedOk ? null : `body AP ${String(listed?.body)}`);

            // 5. Every line's NPC type: equipped armour sets an authored stat block aside.
            const perLine = await page.evaluate(async (lines: readonly string[]) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
                const g = globalThis as unknown as E2EGlobals;
                const flat = (n: number): Record<string, number> => ({ head: n, body: n, leftArm: n, rightArm: n, leftLeg: n, rightLeg: n });
                const out: Array<{ line: string; id: string | null; body: number }> = [];
                for (const line of lines) {
                    // eslint-disable-next-line no-await-in-loop -- sequential: one actor per line
                    const actor = await g.Actor.create({
                        name: `${line} worn-armour probe`,
                        type: `${line}-npc`,
                        system: { armour: { mode: 'locations', total: 2, authored: true, locations: flat(2) } },
                        items: [
                            {
                                name: 'Probe Plate',
                                type: 'armour',
                                system: {
                                    armourPoints: flat(4),
                                    coverage: ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'],
                                    state: { equipped: true },
                                },
                            },
                        ],
                    });
                    out.push(actor === null ? { line, id: null, body: -1 } : { line, id: actor.id, body: actor.system.armour.locations.body });
                }
                return out;
            }, LINES);
            for (const row of perLine) if (row.id !== null) created.push(row.id);
            const wrong = perLine.filter((row) => row.body !== 4);
            record('all-lines-worn-armour', wrong.length === 0, wrong.length === 0 ? null : wrong.map((r) => `${r.line}: body ${r.body}`).join(', '));
        } finally {
            await page.evaluate(async (ids: string[]) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
                const g = globalThis as unknown as E2EGlobals;
                for (const id of ids) {
                    // eslint-disable-next-line no-await-in-loop -- sequential cleanup
                    await g.game.actors
                        .get(id)
                        ?.delete()
                        .catch(() => undefined);
                }
            }, created);
        }

        const fired = new Map(results.map((r) => [r.name, r]));
        const failures: string[] = [];
        for (const flow of NPC_ARMOUR_FLOWS) {
            const result = fired.get(flow);
            if (result?.ok === true) recordCoverage('npc-armour.flow', flow);
            else failures.push(`flow ${flow}: ${result?.detail ?? 'flow did not run'}`);
        }
        expect(failures, failures.join('\n')).toEqual([]);
    });
});
