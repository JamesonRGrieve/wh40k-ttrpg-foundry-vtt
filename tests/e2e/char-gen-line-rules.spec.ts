import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { createProbeActor, deleteProbeActors } from './lib/sheet-probe';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B: character generation follows each line's rulebook (#760).
 *
 * A real OriginPathBuilder on a dh2-character with the DH2 Forge World home world
 * selected (Intelligence and Toughness +, Fellowship −):
 * - roll mode rolls 3d10 keeping the highest two for Intelligence and Toughness,
 *   the lowest two for Fellowship, and 2d10 for the rest, on a base of 20, and the
 *   grid labels those characteristics instead of adding ±5;
 * - point buy starts Toughness at 30 and Fellowship at 20, and stops Toughness at
 *   40 however many points remain.
 * An rt-character's builder rolls 2d10 on a base of 25.
 *
 * Each flow records under `char-gen.line-rule`. Keys MUST match CHAR_GEN_LINE_RULES
 * in scripts/e2e-coverage.mjs.
 */
const CHAR_GEN_LINE_RULES = ['dh2-home-world-keeps-dice', 'dh2-roll-adds-no-home-world-bonus', 'dh2-point-buy-start-and-cap', 'rt-rolls-on-25'] as const;
type FlowName = (typeof CHAR_GEN_LINE_RULES)[number];

/** The DH2 home world with + Intelligence and Toughness and − Fellowship. */
const FORGE_WORLD = 'Forge World';
const BUILDER_URL = '/systems/wh40k-rpg/module/applications/character-creation/origin-path-builder.js';

/** What a builder reported about its characteristic generation. */
interface BuilderRead {
    builderId: string;
    /** The dice formula each characteristic rolled, in generation order. */
    rolled: string[];
    /** Per characteristic in roll mode: base, roll, total and keep-dice label. */
    roll: Array<{ key: string; base: number; rollValue: number | null; total: number | null; keepDiceLabel: string | null }>;
    /** Per characteristic in point-buy mode: starting score (base + origin) and total. */
    pointBuy: Array<{ key: string; base: number; originBonus: number; total: number }>;
    /** The points Toughness ends with after asking for 30. */
    toughnessPoints: number;
    /** What the builder saw of the home world, for a failure message. */
    origin: string;
}

/** Open a builder for `actorId`, select `homeWorld` (when given), roll, and read its generation state. */
async function readBuilder(page: Page, actorId: string, homeWorld: string | null): Promise<BuilderRead> {
    return page.evaluate(
        async ({ id, wanted, url }) => {
            interface CharRow {
                key: string;
                base: number;
                rollValue: number | null;
                total: number | null;
                keepDiceLabel?: string | null;
            }
            interface PointRow {
                key: string;
                base: number;
                originBonus: number;
                total: number;
            }
            interface Origin {
                name: string;
                step?: string;
                system: object;
            }
            interface Builder {
                id: string;
                _charGenMode: string;
                allOrigins?: Origin[];
                _loadOrigins: () => Promise<void>;
                _itemToSelectionData: (origin: Origin) => Origin;
                selections: Map<string, Origin>;
                render: (options?: object) => Promise<void>;
                _generateRollModeValues: () => Promise<number[]>;
                _setPointBuy: (key: string, value: number) => number;
                _prepareCharGenContext: () => { characteristics: CharRow[]; pointBuyCharacteristics: PointRow[] };
                _getOriginCharacteristicBonuses: () => { totals: Record<string, number> };
                _getSelectionsForDerivedCalculations: () => object[];
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                Roll: new (formula: string, ...rest: object[]) => object;
                game: { actors: { get: (i: string) => object | undefined } };
            };
            const actor = g.game.actors.get(id);
            if (actor === undefined) throw new Error('probe actor missing');
            const mod = (await import(/* @vite-ignore */ url)) as { default: new (a: object, o: object) => Builder };
            const builder = new mod.default(actor, {});
            let originNote = 'no home world';
            if (wanted !== null) {
                // Select the home world as the builder's own preview + confirm does (_itemToSelectionData).
                if ((builder.allOrigins?.length ?? 0) === 0) await builder._loadOrigins();
                const origin = builder.allOrigins?.find((o) => o.name === wanted);
                if (origin === undefined) throw new Error(`${wanted} not among the builder's ${builder.allOrigins?.length ?? 0} origins`);
                builder.selections.set('homeWorld', builder._itemToSelectionData(origin));
                // eslint-disable-next-line no-restricted-syntax -- boundary: the origin's raw system as the builder holds it, read only for the failure message
                const modifiers = (origin.system as { modifiers?: object }).modifiers ?? null;
                originNote = JSON.stringify({
                    modifiers,
                    bonuses: builder._getOriginCharacteristicBonuses().totals,
                    selections: builder._getSelectionsForDerivedCalculations().length,
                });
            }
            // Record the formula of every Roll the builder makes for the characteristics.
            const rolled: string[] = [];
            const Original = g.Roll;
            g.Roll = class extends Original {
                constructor(formula: string, ...rest: object[]) {
                    rolled.push(formula);
                    super(formula, ...rest);
                }
            };
            try {
                builder._charGenMode = 'roll';
                await builder._generateRollModeValues();
            } finally {
                g.Roll = Original;
            }
            const roll = builder._prepareCharGenContext().characteristics.map((c) => ({
                key: c.key,
                base: c.base,
                rollValue: c.rollValue,
                total: c.total,
                keepDiceLabel: c.keepDiceLabel ?? null,
            }));
            builder._charGenMode = 'point-buy';
            const toughnessPoints = builder._setPointBuy('toughness', 30);
            const pointBuy = builder
                ._prepareCharGenContext()
                .pointBuyCharacteristics.map((c) => ({ key: c.key, base: c.base, originBonus: c.originBonus, total: c.total }));
            builder._charGenMode = 'roll';
            await builder.render({ force: true });
            return { builderId: builder.id, rolled, roll, pointBuy, toughnessPoints, origin: originNote };
        },
        { id: actorId, wanted: homeWorld, url: BUILDER_URL },
    );
}

/** Close a builder window by its element id. */
async function closeBuilder(page: Page, builderId: string): Promise<void> {
    await page.evaluate(async (id: string) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `foundry.applications.instances` has no shipped types
        const g = globalThis as unknown as { foundry: { applications: { instances: Map<string, { close: () => Promise<void> }> } } };
        await g.foundry.applications.instances.get(id)?.close();
    }, builderId);
}

const GENERATION_ORDER = ['weaponSkill', 'ballisticSkill', 'strength', 'toughness', 'agility', 'intelligence', 'perception', 'willpower', 'fellowship'];

test.describe.serial('character generation per line (Tier B, #760)', () => {
    test.setTimeout(scaledMs(180_000));
    test("DH2 rolls the home world's + and − as 3d10 keep two and caps point buy at 40; RT rolls on 25", async ({ page }) => {
        await joinOrSkip(page);
        const passed = new Map<FlowName, string | null>();
        const pass = (flow: FlowName, ok: boolean, detail: string): void => {
            passed.set(flow, ok ? null : detail);
        };
        const actors: string[] = [];
        try {
            const dh2Id = await createProbeActor(page, { name: 'e2e-760-dh2', type: 'dh2-character', system: { gameSystem: 'dh2' } });
            if (dh2Id === null) throw new Error('dh2 probe actor was not created');
            actors.push(dh2Id);
            const dh2 = await readBuilder(page, dh2Id, FORGE_WORLD);

            const expectedDice = GENERATION_ORDER.map((key) => {
                if (key === 'intelligence' || key === 'toughness') return '3d10kh2';
                if (key === 'fellowship') return '3d10kl2';
                return '2d10';
            });
            pass(
                'dh2-home-world-keeps-dice',
                JSON.stringify(dh2.rolled) === JSON.stringify(expectedDice),
                `rolled ${JSON.stringify(dh2.rolled)}; home world ${dh2.origin}`,
            );

            const byKey = new Map(dh2.roll.map((c) => [c.key, c]));
            const keepOk = ['intelligence', 'toughness', 'fellowship'].every((key) => {
                const c = byKey.get(key);
                return c !== undefined && c.keepDiceLabel !== null && c.base === 20 && c.rollValue !== null && c.total === 20 + c.rollValue;
            });
            const plainOk = ['weaponSkill', 'agility'].every((key) => {
                const c = byKey.get(key);
                return c?.keepDiceLabel === null && c.base === 20;
            });
            pass('dh2-roll-adds-no-home-world-bonus', keepOk && plainOk, `roll rows ${JSON.stringify(dh2.roll)}`);

            const pb = new Map(dh2.pointBuy.map((c) => [c.key, c]));
            const tough = pb.get('toughness');
            const fel = pb.get('fellowship');
            const ws = pb.get('weaponSkill');
            pass(
                'dh2-point-buy-start-and-cap',
                tough?.base === 25 &&
                    tough.originBonus === 5 &&
                    fel?.base === 25 &&
                    fel.originBonus === -5 &&
                    fel.total === 20 &&
                    ws?.total === 25 &&
                    dh2.toughnessPoints === 10 &&
                    tough.total === 40,
                `toughness ${JSON.stringify(tough ?? null)} after asking 30 points kept ${dh2.toughnessPoints}; fellowship ${JSON.stringify(
                    fel ?? null,
                )}; ws ${JSON.stringify(ws ?? null)}`,
            );
            await snap(page, 'char-gen-dh2-forge-world-roll-mode', { selector: `#${dh2.builderId}`, closeWindows: true, keepWindow: dh2.builderId });
            await clearScreenOverlays(page);
            await closeBuilder(page, dh2.builderId);

            const rtId = await createProbeActor(page, { name: 'e2e-760-rt', type: 'rt-character', system: { gameSystem: 'rt' } });
            if (rtId === null) throw new Error('rt probe actor was not created');
            actors.push(rtId);
            const rt = await readBuilder(page, rtId, null);
            pass(
                'rt-rolls-on-25',
                rt.rolled.every((f) => f === '2d10') && rt.rolled.length === 9 && rt.roll.every((c) => c.base === 25 && c.keepDiceLabel === null),
                `rolled ${JSON.stringify(rt.rolled)}, bases ${JSON.stringify(rt.roll.map((c) => c.base))}`,
            );
            await snap(page, 'char-gen-rt-roll-mode', { selector: `#${rt.builderId}`, closeWindows: true, keepWindow: rt.builderId });
            await clearScreenOverlays(page);
            await closeBuilder(page, rt.builderId);
        } finally {
            await deleteProbeActors(page, actors);
        }

        const failures: string[] = [];
        for (const flow of CHAR_GEN_LINE_RULES) {
            const detail = passed.get(flow);
            if (detail === null) recordCoverage('char-gen.line-rule', flow);
            else failures.push(`flow ${flow}: ${detail ?? 'flow did not run'}`);
        }
        expect(failures, failures.join('\n')).toEqual([]);
    });
});
