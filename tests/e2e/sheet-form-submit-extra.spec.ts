import type { Page } from '@playwright/test';

import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of sheet form-submit round-trips across the actor and
 * item document surfaces. The existing `sheet-interactions.spec.ts` only
 * exercises the dh2-character sheet against a single field
 * (`system.wounds.value`) — that one key is intentionally NOT duplicated
 * here. This spec instead drives a much broader denominator: ten distinct
 * sheets and ~50 schema-field paths get exercised through the same
 * round-trip pattern (set value → call `sheet.submit({ updateData })` →
 * settle → re-read from the live document → assert).
 *
 * Source coverage targets:
 *   - src/module/data/actor/character.ts (bio / experience / insanity /
 *     corruption / requisition / throneGelt / rogueTrader schema writes)
 *   - src/module/data/actor/npc.ts (wounds / armour / faction /
 *     threatLevel schema writes — exercises the NPC variant of the
 *     dh2-character schema branch)
 *   - src/module/data/actor/vehicle.ts (integrity / armour.front /
 *     speed / crew schema writes — exercises the Vehicle base schema)
 *   - src/module/data/actor/starship.ts (hullIntegrity / speed / armour /
 *     voidShields / crew.population schema writes — exercises the RT
 *     Starship base schema)
 *   - src/module/data/item/weapon.ts + shared/damage-template.ts +
 *     shared/attack-template.ts (damage.bonus / damage.penetration /
 *     clip / attack.modifier / attack.range / attack.rateOfFire writes
 *     hit the SchemaField paths that `prepareDerivedData` then consumes)
 *   - src/module/data/item/armour.ts (per-location armourPoints +
 *     primitive boolean schema writes)
 *   - src/module/data/item/talent.ts (tier / cost / rank / isPassive
 *     scalar writes through the BaseItemSheet form-parser pipeline)
 *   - src/module/data/item/gear.ts (quantity / uses.value / uses.max /
 *     consumable writes — exercises the gear DataModel's update path)
 *   - src/module/applications/api/base-item-sheet.ts +
 *     primary-sheet-mixin.ts (the shared submit({ updateData }) plumbing
 *     every sheet inherits from — each successful round-trip exercises
 *     this code regardless of which sheet was driven)
 *
 * Strategy: every flow probe runs in a single `page.evaluate` round-trip.
 * Each (sheet × field) pair becomes one `recordCoverage('sheet-form-
 * submit-extra.flow', '<slug>::<path>')` entry. Failures aggregate and
 * surface at the end of the spec, matching the collect-failures-then-
 * assert pattern in weapon-attack.spec.ts.
 *
 * Keys MUST match the SHEET_FORM_SUBMIT_EXTRA_FLOWS constant in
 * scripts/e2e-coverage.mjs (registered by the orchestrator).
 */

const SHEET_FORM_SUBMIT_EXTRA_FLOWS = [
    // --- dh2 character sheet -----------------------------------------
    'character-dh2-sheet::system.wounds.max',
    'character-dh2-sheet::system.insanity',
    'character-dh2-sheet::system.corruption',
    'character-dh2-sheet::system.requisition',
    'character-dh2-sheet::system.throneGelt',
    'character-dh2-sheet::system.experience.total',
    'character-dh2-sheet::system.bio.age',
    'character-dh2-sheet::system.bio.eyes',
    // --- rt character sheet ------------------------------------------
    'character-rt-sheet::system.wounds.value',
    'character-rt-sheet::system.bio.age',
    'character-rt-sheet::system.rogueTrader.profitFactor.current',
    'character-rt-sheet::system.throneGelt',
    // --- bc character sheet ------------------------------------------
    'character-bc-sheet::system.wounds.value',
    'character-bc-sheet::system.insanity',
    'character-bc-sheet::system.corruption',
    'character-bc-sheet::system.bio.gender',
    // --- dh2 npc sheet -----------------------------------------------
    'npc-dh2-sheet::system.wounds.value',
    'npc-dh2-sheet::system.wounds.max',
    'npc-dh2-sheet::system.armour.total',
    'npc-dh2-sheet::system.armour.locations.body',
    'npc-dh2-sheet::system.faction',
    'npc-dh2-sheet::system.threatLevel',
    // --- dh2 vehicle sheet -------------------------------------------
    'vehicle-dh2-sheet::system.integrity.value',
    'vehicle-dh2-sheet::system.integrity.max',
    'vehicle-dh2-sheet::system.armour.front.value',
    'vehicle-dh2-sheet::system.speed.cruising',
    'vehicle-dh2-sheet::system.crew.required',
    // --- rt starship sheet -------------------------------------------
    'starship-rt-sheet::system.hullIntegrity.value',
    'starship-rt-sheet::system.hullIntegrity.max',
    'starship-rt-sheet::system.speed',
    'starship-rt-sheet::system.armour',
    'starship-rt-sheet::system.voidShields',
    'starship-rt-sheet::system.crew.population',
    // --- weapon item sheet -------------------------------------------
    'weapon-sheet::system.damage.bonus',
    'weapon-sheet::system.damage.penetration',
    'weapon-sheet::system.clip.value',
    'weapon-sheet::system.clip.max',
    'weapon-sheet::system.attack.modifier',
    'weapon-sheet::system.attack.range.value',
    'weapon-sheet::system.attack.rateOfFire.semi',
    // --- armour item sheet -------------------------------------------
    'armour-sheet::system.armourPoints.head',
    'armour-sheet::system.armourPoints.body',
    'armour-sheet::system.armourPoints.leftArm',
    'armour-sheet::system.armourPoints.leftLeg',
    'armour-sheet::system.primitive',
    // --- talent item sheet -------------------------------------------
    'talent-sheet::system.tier',
    'talent-sheet::system.cost',
    'talent-sheet::system.rank',
    'talent-sheet::system.isPassive',
    // --- gear item sheet ---------------------------------------------
    'gear-sheet::system.quantity',
    'gear-sheet::system.uses.value',
    'gear-sheet::system.uses.max',
    'gear-sheet::system.consumable',
] as const;

type FlowName = (typeof SHEET_FORM_SUBMIT_EXTRA_FLOWS)[number];

interface ProbeResult {
    flowsFired: Record<FlowName, boolean>;
    flowNotes: Partial<Record<FlowName, string>>;
    pageErrors: string[];
}

/**
 * Browser-side spec key: which document type to create, what initial
 * system payload to seed it with, and (for items) which actor scope they
 * should be embedded under. The probe walks one of these per sheet slug
 * and runs every matching flow key against it before cleaning up.
 */
interface ActorSpec {
    kind: 'actor';
    type: string;
    gameSystem: string;
    initialSystem: Record<string, unknown>;
}
interface ItemSpec {
    kind: 'item';
    type: string;
    initialSystem: Record<string, unknown>;
    // The actor scope under which to embed the item; one of the actor specs above.
    // We embed items on a dh2-character host so the BaseItemSheet branches
    // through the actor-owned path (the most common production case).
    embedHostGameSystem: string;
}
type SheetSpec = ActorSpec | ItemSpec;

/** Map sheet slug → spec for that sheet. */
const SHEET_SPECS: Record<string, SheetSpec> = {
    'character-dh2-sheet': {
        kind: 'actor',
        type: 'dh2-character',
        gameSystem: 'dh2e',
        initialSystem: {
            gameSystem: 'dh2e',
            wounds: { max: 10, value: 10, critical: 0 },
            insanity: 0,
            corruption: 0,
            requisition: 0,
            throneGelt: 0,
            experience: { total: 1000, used: 0, available: 1000 },
            bio: { age: '30', eyes: 'brown' },
        },
    },
    'character-rt-sheet': {
        kind: 'actor',
        type: 'rt-character',
        gameSystem: 'rt',
        initialSystem: {
            gameSystem: 'rt',
            wounds: { max: 12, value: 12, critical: 0 },
            throneGelt: 0,
            bio: { age: '40' },
            rogueTrader: { profitFactor: { current: 30, starting: 30, modifier: 0 } },
        },
    },
    'character-bc-sheet': {
        kind: 'actor',
        type: 'bc-character',
        gameSystem: 'bc',
        initialSystem: {
            gameSystem: 'bc',
            wounds: { max: 14, value: 14, critical: 0 },
            insanity: 0,
            corruption: 0,
            bio: { gender: 'male' },
        },
    },
    'npc-dh2-sheet': {
        kind: 'actor',
        type: 'dh2-npc',
        gameSystem: 'dh2e',
        initialSystem: {
            gameSystem: 'dh2e',
            wounds: { max: 10, value: 10, critical: 0 },
            armour: { mode: 'simple', total: 0, locations: { body: 0, head: 0, leftArm: 0, rightArm: 0, leftLeg: 0, rightLeg: 0 } },
            faction: 'imperium',
            threatLevel: 1,
        },
    },
    'vehicle-dh2-sheet': {
        kind: 'actor',
        type: 'dh2-vehicle',
        gameSystem: 'dh2e',
        initialSystem: {
            gameSystem: 'dh2e',
            integrity: { max: 20, value: 20, critical: 0 },
            armour: { front: { value: 0, descriptor: '' }, side: { value: 0, descriptor: '' }, rear: { value: 0, descriptor: '' } },
            speed: { cruising: 0, tactical: 0, notes: '' },
            crew: { required: 1, notes: '' },
        },
    },
    'starship-rt-sheet': {
        kind: 'actor',
        type: 'rt-starship',
        gameSystem: 'rt',
        initialSystem: {
            gameSystem: 'rt',
            hullIntegrity: { max: 40, value: 40 },
            speed: 0,
            armour: 0,
            voidShields: 0,
            crew: { population: 100, crewRating: 30, morale: { max: 100, value: 100 } },
        },
    },
    'weapon-sheet': {
        kind: 'item',
        type: 'weapon',
        embedHostGameSystem: 'dh2e',
        initialSystem: {
            class: 'basic',
            melee: false,
            damage: { formula: '1d10', type: 'impact', bonus: 0, penetration: 0 },
            clip: { value: 10, max: 30, type: '' },
            attack: {
                type: 'ranged',
                characteristic: 'ballisticSkill',
                modifier: 0,
                range: { value: 0, units: 'm', special: '' },
                rateOfFire: { single: true, semi: 0, full: 0 },
            },
        },
    },
    'armour-sheet': {
        kind: 'item',
        type: 'armour',
        embedHostGameSystem: 'dh2e',
        initialSystem: {
            type: 'flak',
            armourPoints: { head: 0, body: 0, leftArm: 0, rightArm: 0, leftLeg: 0, rightLeg: 0 },
            primitive: false,
        },
    },
    'talent-sheet': {
        kind: 'item',
        type: 'talent',
        embedHostGameSystem: 'dh2e',
        initialSystem: {
            tier: 1,
            cost: 200,
            rank: 1,
            isPassive: true,
        },
    },
    'gear-sheet': {
        kind: 'item',
        type: 'gear',
        embedHostGameSystem: 'dh2e',
        initialSystem: {
            quantity: 1,
            uses: { value: 0, max: 0 },
            consumable: false,
        },
    },
};

/**
 * Group the flat flow list into a sheet-slug-keyed map of field paths.
 * The browser probe iterates this map so each sheet is constructed once
 * per spec but exercises every field path declared against it.
 */
function groupFlowsBySheet(flows: readonly string[]): Record<string, string[]> {
    const grouped: Record<string, string[]> = {};
    for (const flow of flows) {
        const idx = flow.indexOf('::');
        if (idx < 0) continue;
        const slug = flow.slice(0, idx);
        const path = flow.slice(idx + 2);
        if (!grouped[slug]) grouped[slug] = [];
        grouped[slug].push(path);
    }
    return grouped;
}

async function probeFormSubmitFlows(page: Page): Promise<ProbeResult> {
    const pageErrors: string[] = [];
    const listener = (err: Error) => pageErrors.push(err.message);
    page.on('pageerror', listener);
    try {
        const groupedFlows = groupFlowsBySheet(SHEET_FORM_SUBMIT_EXTRA_FLOWS);
        const result = await page.evaluate(
            async ({ flows, specs, grouped }) => {
                /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
                const g = globalThis as any;
                const Actor = g.Actor;
                const game = g.game;

                const fired: Record<string, boolean> = {};
                const notes: Record<string, string> = {};
                for (const f of flows) fired[f] = false;

                if (!Actor?.create) {
                    for (const f of flows) notes[f] = 'Actor.create unavailable';
                    return { flowsFired: fired, flowNotes: notes };
                }

                // Bounded await with timeout so a single hung render/submit
                // doesn't tar-pit the whole spec.
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

                // Path traversal for both reads + write payload construction.
                const getPath = (obj: unknown, path: string): unknown =>
                    path.split('.').reduce<unknown>((acc, key) => {
                        if (acc === null || acc === undefined || typeof acc !== 'object') return undefined;
                        return (acc as Record<string, unknown>)[key];
                    }, obj);

                // Deterministic "next" value chooser per field type. Booleans
                // toggle; numbers add a small constant; strings get a stable
                // probe suffix. The value MUST round-trip exactly through
                // the schema (integer fields don't accept decimals; min:0
                // fields reject negatives).
                const pickNextValue = (current: unknown): unknown => {
                    if (typeof current === 'boolean') return !current;
                    if (typeof current === 'number') return current + 1;
                    if (typeof current === 'string') return current === 'probe-value' ? 'probe-value-2' : 'probe-value';
                    // Field hasn't been initialised yet (Foundry's default
                    // path-not-found returns undefined). Fall back to a
                    // string — sheets that route through Number() coerce.
                    return 'probe-value';
                };

                // Track every doc we create so we can drop them all in finally.
                const cleanups: Array<() => Promise<void>> = [];

                /**
                 * Drive one sheet through every field path the orchestrator
                 * declared against it. Returns nothing — observed state is
                 * written into `fired` / `notes` by full flow key.
                 */
                async function probeSheet(slug: string, spec: any, paths: string[]): Promise<void> {
                    // Build the document (actor or actor-embedded item).
                    let actor: any = null;
                    let item: any = null;
                    let doc: any = null;
                    let sheet: any = null;

                    try {
                        if (spec.kind === 'actor') {
                            actor = await withTimeout(
                                Actor.create({
                                    name: `${slug}-probe`,
                                    type: spec.type,
                                    system: spec.initialSystem,
                                }),
                                5_000,
                                `${slug} Actor.create`,
                            );
                            if (!actor?.id) {
                                for (const p of paths) notes[`${slug}::${p}`] = 'Actor.create returned null';
                                return;
                            }
                            cleanups.push(async () => {
                                try {
                                    await game?.actors?.get?.(actor.id)?.delete?.();
                                } catch {
                                    /* ignore */
                                }
                            });
                            doc = game?.actors?.get?.(actor.id) ?? actor;
                            sheet = doc.sheet;
                        } else {
                            // Item path: spin up a temporary host actor (dh2-character)
                            // and embed the item on it so the BaseItemSheet
                            // submits through an actor-owned document.
                            actor = await withTimeout(
                                Actor.create({
                                    name: `${slug}-host`,
                                    type: 'dh2-character',
                                    system: { gameSystem: spec.embedHostGameSystem },
                                }),
                                5_000,
                                `${slug} host Actor.create`,
                            );
                            if (!actor?.id) {
                                for (const p of paths) notes[`${slug}::${p}`] = 'host Actor.create returned null';
                                return;
                            }
                            cleanups.push(async () => {
                                try {
                                    await game?.actors?.get?.(actor.id)?.delete?.();
                                } catch {
                                    /* ignore */
                                }
                            });
                            // Yield a tick so V14's backend has committed the
                            // parent create before the embedded child write
                            // (the same race weapon-attack.spec.ts works around).
                            await new Promise((r) => setTimeout(r, 250));

                            const live = game?.actors?.get?.(actor.id) ?? actor;
                            const created = (await withTimeout(
                                live.createEmbeddedDocuments?.('Item', [
                                    {
                                        name: `${slug}-probe`,
                                        type: spec.type,
                                        system: spec.initialSystem,
                                    },
                                ]),
                                5_000,
                                `${slug} createEmbeddedDocuments`,
                            )) as any[];
                            const createdId = created?.[0]?.id;
                            item = createdId ? live.items.get(createdId) : null;
                            if (!item) {
                                for (const p of paths) notes[`${slug}::${p}`] = 'createEmbeddedDocuments returned no item';
                                return;
                            }
                            cleanups.push(async () => {
                                try {
                                    await item.delete?.();
                                } catch {
                                    /* ignore */
                                }
                            });
                            doc = item;
                            sheet = doc.sheet;
                        }

                        if (!sheet) {
                            for (const p of paths) notes[`${slug}::${p}`] = 'doc.sheet undefined';
                            return;
                        }

                        try {
                            await withTimeout(sheet.render?.(true), 5_000, `${slug} sheet.render`);
                        } catch (err) {
                            for (const p of paths) notes[`${slug}::${p}`] = `sheet.render threw: ${String((err as Error)?.message ?? err)}`;
                            return;
                        }
                        // Let PARTS settle into the DOM before we probe.
                        await new Promise((r) => setTimeout(r, 100));

                        // Per field — set the new value, submit, settle, re-read.
                        for (const path of paths) {
                            const key = `${slug}::${path}`;
                            try {
                                const before = getPath(doc, path);
                                const next = pickNextValue(before);
                                const updateData: Record<string, unknown> = {};
                                updateData[path] = next;

                                if (typeof sheet.submit !== 'function') {
                                    notes[key] = 'sheet.submit not a function';
                                    continue;
                                }
                                try {
                                    await withTimeout(
                                        sheet.submit({ updateData, preventClose: true }),
                                        5_000,
                                        `${slug} sheet.submit ${path}`,
                                    );
                                } catch (err) {
                                    notes[key] = `submit threw: ${String((err as Error)?.message ?? err)}`;
                                    continue;
                                }
                                // Foundry's submit chain resolves before
                                // the document update commit lands; give it
                                // a small settle window per weapon-attack.spec.ts.
                                await new Promise((r) => setTimeout(r, 150));

                                const refreshed =
                                    spec.kind === 'actor'
                                        ? game?.actors?.get?.(actor.id) ?? doc
                                        : (game?.actors?.get?.(actor.id)?.items?.get?.(item.id) ?? doc);
                                const after = getPath(refreshed, path);

                                // Boolean: equality. Number: equality after Number() coerce
                                // (so '10' submitted into a number field still passes).
                                // String: equality.
                                let matched = false;
                                if (typeof next === 'boolean') {
                                    matched = after === next;
                                } else if (typeof next === 'number') {
                                    matched = Number(after) === next;
                                } else if (typeof next === 'string') {
                                    matched = String(after) === next;
                                }

                                if (matched) {
                                    fired[key] = true;
                                    notes[key] = `${String(before)} → ${String(next)} (round-trip ok)`;
                                } else {
                                    notes[key] = `expected ${String(next)} got ${String(after)} (was ${String(before)})`;
                                }
                            } catch (err) {
                                notes[key] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                            }
                        }

                        try {
                            await sheet.close?.();
                        } catch {
                            /* ignore */
                        }
                    } catch (err) {
                        const msg = String((err as Error)?.message ?? err);
                        for (const p of paths) {
                            const key = `${slug}::${p}`;
                            if (!notes[key]) notes[key] = `sheet probe threw: ${msg}`;
                        }
                    }
                }

                try {
                    for (const slug of Object.keys(grouped)) {
                        const spec = specs[slug];
                        const paths = grouped[slug];
                        if (!spec) {
                            for (const p of paths) notes[`${slug}::${p}`] = 'no spec registered for sheet slug';
                            continue;
                        }
                        await probeSheet(slug, spec, paths);
                    }
                } finally {
                    // Best-effort: drop every created doc so subsequent
                    // specs don't trip over our residue.
                    for (const fn of cleanups) {
                        try {
                            await fn();
                        } catch {
                            /* ignore */
                        }
                    }
                }

                return { flowsFired: fired, flowNotes: notes };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            },
            { flows: [...SHEET_FORM_SUBMIT_EXTRA_FLOWS], specs: SHEET_SPECS, grouped: groupedFlows },
        );

        return {
            flowsFired: result.flowsFired as Record<FlowName, boolean>,
            flowNotes: result.flowNotes as Partial<Record<FlowName, string>>,
            pageErrors,
        };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('sheet form-submit round-trip depth (Tier B)', () => {
    // Each sheet × field probe is bounded; cap the whole spec at 5 minutes
    // so a stuck render can't hold a CI runner indefinitely.
    test.setTimeout(300_000);
    test('form-submit round-trips across actor + item sheets and schema fields', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeFormSubmitFlows(page);

        const failures: string[] = [];
        for (const flow of SHEET_FORM_SUBMIT_EXTRA_FLOWS) {
            if (probe.flowsFired[flow]) {
                recordCoverage('sheet-form-submit-extra.flow', flow);
            } else {
                const note = probe.flowNotes[flow] ?? 'flow did not fire and no diagnostic note recorded';
                failures.push(`flow ${flow}: ${note}`);
            }
        }

        const pageErrorTail = probe.pageErrors.length > 0 ? `\n  pageerrors: ${probe.pageErrors.slice(0, 5).join(' | ')}` : '';

        expect(
            failures,
            `${failures.length}/${SHEET_FORM_SUBMIT_EXTRA_FLOWS.length} sheet-form-submit-extra probes failed:\n  - ${failures.join('\n  - ')}${pageErrorTail}`,
        ).toEqual([]);
    });
});
