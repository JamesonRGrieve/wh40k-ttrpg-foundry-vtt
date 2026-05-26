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
/**
 * Recursive JSON-object shape for a document's seed `system` payload. The
 * specs below seed ten different DataModels with deeply-nested literals; a
 * shared structural type models that without an opaque `Record` per field.
 */
// Bounded (non-recursive) JSON-ish seed value. A self-referential SeedValue
// makes Playwright's page.evaluate Arg-mapping recurse and trip TS2589;
// `unknown` nesting trips the no-restricted-syntax boundary rule. So the
// nesting is spelled out to a fixed depth that covers every seed below.
type SeedScalar = string | number | boolean | null;
type SeedObject3 = { [key: string]: SeedScalar | SeedScalar[] };
type SeedObject2 = { [key: string]: SeedScalar | SeedScalar[] | SeedObject3 };
type SeedObject1 = { [key: string]: SeedScalar | SeedScalar[] | SeedObject2 };
type SeedValue = SeedScalar | SeedScalar[] | SeedObject1;
type SeedSystem = { [key: string]: SeedValue };

interface ActorSpec {
    kind: 'actor';
    type: string;
    gameSystem: string;
    initialSystem: SeedSystem;
}
interface ItemSpec {
    kind: 'item';
    type: string;
    initialSystem: SeedSystem;
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
        gameSystem: 'dh2',
        initialSystem: {
            gameSystem: 'dh2',
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
        gameSystem: 'dh2',
        initialSystem: {
            gameSystem: 'dh2',
            wounds: { max: 10, value: 10, critical: 0 },
            armour: { mode: 'simple', total: 0, locations: { body: 0, head: 0, leftArm: 0, rightArm: 0, leftLeg: 0, rightLeg: 0 } },
            faction: 'imperium',
            threatLevel: 1,
        },
    },
    'vehicle-dh2-sheet': {
        kind: 'actor',
        type: 'dh2-vehicle',
        gameSystem: 'dh2',
        initialSystem: {
            gameSystem: 'dh2',
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
        embedHostGameSystem: 'dh2',
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
        embedHostGameSystem: 'dh2',
        initialSystem: {
            type: 'flak',
            armourPoints: { head: 0, body: 0, leftArm: 0, rightArm: 0, leftLeg: 0, rightLeg: 0 },
            primitive: false,
        },
    },
    'talent-sheet': {
        kind: 'item',
        type: 'talent',
        embedHostGameSystem: 'dh2',
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
        embedHostGameSystem: 'dh2',
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
        if (!Object.hasOwn(grouped, slug)) grouped[slug] = [];
        grouped[slug].push(path);
    }
    return grouped;
}

async function probeFormSubmitFlows(page: Page): Promise<ProbeResult> {
    const pageErrors: string[] = [];
    const listener = (pageErr: Error): void => {
        pageErrors.push(pageErr.message);
    };
    page.on('pageerror', listener);
    try {
        const groupedFlows = groupFlowsBySheet(SHEET_FORM_SUBMIT_EXTRA_FLOWS);
        // Explicit generics: without them, Playwright's evaluate infers the arg
        // type and recurses through the SeedValue-recursive SheetSpec, tripping
        // TS2589 (excessively deep instantiation).
        const result = await page.evaluate<
            { flowsFired: Record<string, boolean>; flowNotes: Record<string, string> },
            { flows: string[]; specs: Record<string, SheetSpec>; grouped: Record<string, string[]> }
        >(
            async ({ flows, specs, grouped }) => {
                // Browser-side probe: Foundry globals are runtime-only, so the
                // doc / sheet / game shapes used here are declared locally.
                interface FoundrySheet {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 sheet.submit updateData is a flattened path→value payload, untyped at the framework boundary
                    submit: (options: { updateData: Record<string, unknown>; preventClose: boolean }) => Promise<void>;
                    render: (force: boolean) => Promise<void>;
                    close: () => Promise<void>;
                }
                interface FoundryItem {
                    id: string;
                    // sheet may be absent before first render; the guard below relies on it.
                    sheet?: FoundrySheet;
                    delete: () => Promise<void>;
                }
                interface FoundryItemCollection {
                    get: (id: string) => FoundryItem | undefined;
                }
                interface FoundryDoc {
                    id: string;
                    sheet?: FoundrySheet;
                    items: FoundryItemCollection;
                    createEmbeddedDocuments: (type: string, data: Array<{ name: string; type: string; system: SeedSystem }>) => Promise<FoundryItem[]>;
                    delete: () => Promise<void>;
                }
                interface FoundryActorCollection {
                    get: (id: string) => FoundryDoc | undefined;
                }
                interface FoundryActorClass {
                    // Runtime can reject/return null on a failed create; keep the union
                    // so the defensive null checks below stay type-meaningful.
                    create: (data: { name: string; type: string; system: SeedSystem }) => Promise<FoundryDoc | null>;
                }
                interface FoundryGlobal {
                    // Both may be absent if the world hasn't booted; the guards below rely on it.
                    Actor?: FoundryActorClass;
                    game?: { actors: FoundryActorCollection };
                }
                // eslint-disable-next-line no-restricted-syntax -- boundary: browser-side `globalThis` exposes Foundry's runtime Actor + game, no shipped types in this realm
                const g = globalThis as unknown as FoundryGlobal;
                const FoundryActor = g.Actor;
                const foundryGame = g.game;

                const fired: Record<string, boolean> = {};
                const notes: Record<string, string> = {};
                for (const f of flows) fired[f] = false;

                if (FoundryActor?.create == null || foundryGame == null) {
                    for (const f of flows) notes[f] = 'Actor.create unavailable';
                    return { flowsFired: fired, flowNotes: notes };
                }
                const ActorCls = FoundryActor;
                const gameRef = foundryGame;

                // Bounded await with timeout so a single hung render/submit
                // doesn't tar-pit the whole spec.
                const withTimeout = async <T>(p: Promise<T>, ms: number, label: string): Promise<T> => {
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

                // A traversable document field: an indexable object node or a
                // scalar leaf. Models the live document tree the probe walks
                // without falling back to `unknown` / a `Record` cast.
                interface FieldNode {
                    [key: string]: FieldValue;
                }
                type FieldValue = string | number | boolean | null | undefined | FieldNode;

                const isFieldNode = (value: object | FieldValue): value is FieldNode => typeof value === 'object' && value !== null;

                // Render a traversed field value for a diagnostic note. Object
                // leaves (which the probe never targets) get a JSON form rather
                // than the default '[object Object]'.
                const fmt = (value: FieldValue): string => (isFieldNode(value) ? JSON.stringify(value) : String(value));

                // Path traversal for both reads + write payload construction.
                // Accepts a live document (a non-indexable structural type) as
                // the root and narrows each step through the FieldNode guard.
                const getPath = (obj: object | null | undefined, path: string): FieldValue =>
                    path.split('.').reduce<object | FieldValue>((acc, key) => (isFieldNode(acc) ? acc[key] : undefined), obj ?? undefined) as FieldValue;

                // Deterministic "next" value chooser per field type. Booleans
                // toggle; numbers add a small constant; strings get a stable
                // probe suffix. The value MUST round-trip exactly through
                // the schema (integer fields don't accept decimals; min:0
                // fields reject negatives).
                const pickNextValue = (current: FieldValue): string | number | boolean => {
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

                // The built document handle for one sheet probe. `actor` is the
                // owning actor (host actor for items, the actor itself for
                // actor specs). `item` is null for actor specs. A null result
                // from the builders means the build failed (notes already set).
                interface BuiltDoc {
                    actor: FoundryDoc;
                    item: FoundryItem | null;
                    doc: FoundryDoc | FoundryItem;
                    sheet: FoundrySheet;
                }

                // Build the actor document + sheet for an actor spec. Records
                // per-path notes and returns null when the create fails. Inner
                // helper to keep `probeSheet`'s cyclomatic complexity low; closes
                // over `ActorCls`, `gameRef`, `withTimeout`, `cleanups`, `notes`.
                const buildActorDoc = async (slug: string, spec: ActorSpec, paths: string[]): Promise<BuiltDoc | null> => {
                    const actor = await withTimeout(
                        ActorCls.create({
                            name: `${slug}-probe`,
                            type: spec.type,
                            system: spec.initialSystem,
                        }),
                        5_000,
                        `${slug} Actor.create`,
                    );
                    if (actor?.id == null) {
                        for (const p of paths) notes[`${slug}::${p}`] = 'Actor.create returned null';
                        return null;
                    }
                    const actorId = actor.id;
                    cleanups.push(async () => {
                        try {
                            await gameRef.actors.get(actorId)?.delete();
                        } catch {
                            /* ignore */
                        }
                    });
                    const doc = gameRef.actors.get(actorId) ?? actor;
                    const sheet = doc.sheet;
                    if (sheet == null) {
                        for (const p of paths) notes[`${slug}::${p}`] = 'doc.sheet undefined';
                        return null;
                    }
                    return { actor, item: null, doc, sheet };
                };

                // Build a host actor, embed the item, and return the item
                // document + sheet for an item spec. Records per-path notes and
                // returns null on any build failure. Inner helper to keep
                // `probeSheet`'s cyclomatic complexity low; closes over the same
                // callback-scope vars as `buildActorDoc`.
                const buildItemDoc = async (slug: string, spec: ItemSpec, paths: string[]): Promise<BuiltDoc | null> => {
                    // Item path: spin up a temporary host actor (dh2-character)
                    // and embed the item on it so the BaseItemSheet submits
                    // through an actor-owned document.
                    const actor = await withTimeout(
                        ActorCls.create({
                            name: `${slug}-host`,
                            type: 'dh2-character',
                            system: { gameSystem: spec.embedHostGameSystem },
                        }),
                        5_000,
                        `${slug} host Actor.create`,
                    );
                    if (actor?.id == null) {
                        for (const p of paths) notes[`${slug}::${p}`] = 'host Actor.create returned null';
                        return null;
                    }
                    const hostId = actor.id;
                    cleanups.push(async () => {
                        try {
                            await gameRef.actors.get(hostId)?.delete();
                        } catch {
                            /* ignore */
                        }
                    });
                    // Yield a tick so V14's backend has committed the parent
                    // create before the embedded child write (the same race
                    // weapon-attack.spec.ts works around).
                    await new Promise<void>((r) => {
                        setTimeout(r, 250);
                    });

                    const live = gameRef.actors.get(hostId) ?? actor;
                    const created = await withTimeout(
                        live.createEmbeddedDocuments('Item', [
                            {
                                name: `${slug}-probe`,
                                type: spec.type,
                                system: spec.initialSystem,
                            },
                        ]),
                        5_000,
                        `${slug} createEmbeddedDocuments`,
                    );
                    const createdId = created[0]?.id;
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: tsconfig.json types created[0]?.id as string|undefined; tsconfig.test (the ESLint program) has the flag off and reports the != null guard as unnecessary
                    const item = createdId != null ? live.items.get(createdId) ?? null : null;
                    if (item == null) {
                        for (const p of paths) notes[`${slug}::${p}`] = 'createEmbeddedDocuments returned no item';
                        return null;
                    }
                    const createdItem = item;
                    cleanups.push(async () => {
                        try {
                            await createdItem.delete();
                        } catch {
                            /* ignore */
                        }
                    });
                    const sheet = item.sheet;
                    if (sheet == null) {
                        for (const p of paths) notes[`${slug}::${p}`] = 'doc.sheet undefined';
                        return null;
                    }
                    return { actor, item, doc: item, sheet };
                };

                // Run the per-field set→submit→settle→re-read round-trip for one
                // built sheet. Inner helper to keep `probeSheet`'s complexity low;
                // closes over `gameRef`, `withTimeout`, `getPath`, `pickNextValue`,
                // `fmt`, `fired`, `notes`.
                const runFieldProbes = async (slug: string, spec: SheetSpec, built: BuiltDoc, paths: string[]): Promise<void> => {
                    const { actor, item, doc, sheet: liveSheet } = built;
                    // Per field — set the new value, submit, settle, re-read.
                    for (const path of paths) {
                        const key = `${slug}::${path}`;
                        try {
                            const before = getPath(doc, path);
                            const next = pickNextValue(before);
                            const updateData: Record<string, string | number | boolean> = {};
                            updateData[path] = next;

                            if (typeof liveSheet.submit !== 'function') {
                                notes[key] = 'sheet.submit not a function';
                                continue;
                            }
                            try {
                                await withTimeout(liveSheet.submit({ updateData, preventClose: true }), 5_000, `${slug} sheet.submit ${path}`);
                            } catch (submitErr) {
                                notes[key] = `submit threw: ${submitErr instanceof Error ? submitErr.message : String(submitErr)}`;
                                continue;
                            }
                            // Foundry's submit chain resolves before the document
                            // update commit lands; give it a small settle window
                            // per weapon-attack.spec.ts.
                            await new Promise<void>((r) => {
                                setTimeout(r, 150);
                            });

                            // `actor` is guaranteed non-null here (the create
                            // blocks return early otherwise).
                            let refreshed: FoundryDoc | FoundryItem | null = doc;
                            const liveActor = gameRef.actors.get(actor.id);
                            if (spec.kind === 'actor') {
                                refreshed = liveActor ?? doc;
                            } else if (item !== null) {
                                refreshed = liveActor?.items.get(item.id) ?? doc;
                            }
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
                                matched = fmt(after) === next;
                            }

                            if (matched) {
                                fired[key] = true;
                                notes[key] = `${fmt(before)} → ${String(next)} (round-trip ok)`;
                            } else {
                                notes[key] = `expected ${String(next)} got ${fmt(after)} (was ${fmt(before)})`;
                            }
                        } catch (flowErr) {
                            notes[key] = `flow threw: ${flowErr instanceof Error ? flowErr.message : String(flowErr)}`;
                        }
                    }
                };

                /**
                 * Drive one sheet through every field path the orchestrator
                 * declared against it. Returns nothing — observed state is
                 * written into `fired` / `notes` by full flow key.
                 */
                async function probeSheet(slug: string, spec: (typeof specs)[string], paths: string[]): Promise<void> {
                    try {
                        // Build the document (actor or actor-embedded item).
                        const built = spec.kind === 'actor' ? await buildActorDoc(slug, spec, paths) : await buildItemDoc(slug, spec, paths);
                        if (built === null) return;

                        const liveSheet = built.sheet;
                        try {
                            await withTimeout(liveSheet.render(true), 5_000, `${slug} sheet.render`);
                        } catch (renderErr) {
                            const renderMsg = renderErr instanceof Error ? renderErr.message : String(renderErr);
                            for (const p of paths) notes[`${slug}::${p}`] = `sheet.render threw: ${renderMsg}`;
                            return;
                        }
                        // Let PARTS settle into the DOM before we probe.
                        await new Promise<void>((r) => {
                            setTimeout(r, 100);
                        });

                        await runFieldProbes(slug, spec, built, paths);

                        try {
                            await liveSheet.close();
                        } catch {
                            /* ignore */
                        }
                    } catch (outerErr) {
                        const msg = outerErr instanceof Error ? outerErr.message : String(outerErr);
                        for (const p of paths) {
                            const key = `${slug}::${p}`;
                            if (!notes[key]) notes[key] = `sheet probe threw: ${msg}`;
                        }
                    }
                }

                try {
                    for (const slug of Object.keys(grouped)) {
                        const paths = grouped[slug];
                        if (!Object.hasOwn(specs, slug)) {
                            for (const p of paths) notes[`${slug}::${p}`] = 'no spec registered for sheet slug';
                            continue;
                        }
                        const spec = specs[slug];
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
            },
            { flows: [...SHEET_FORM_SUBMIT_EXTRA_FLOWS] as string[], specs: SHEET_SPECS, grouped: groupedFlows },
        );

        return {
            flowsFired: result.flowsFired,
            flowNotes: result.flowNotes,
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
