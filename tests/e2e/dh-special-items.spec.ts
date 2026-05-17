import type { Page } from '@playwright/test';

import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Dark-Heresy-flavoured item type coverage. Each flow embeds one item type
 * with unique mechanics on a dh2-character parent actor and asserts the
 * resulting derived state. Targets source-code coverage on the
 * per-type DataModels under src/module/data/item/*.ts that the basic
 * item-types.spec.ts create+render sweep doesn't drive deeply:
 *   - mutation.ts        (category, visible, categoryLabel, chatProperties)
 *   - mental-disorder.ts (severity, severityLabel, chatProperties)
 *   - critical-injury.ts (effects map indexed by severity, currentEffect,
 *                         isPermanent, severityClass, headerLabels)
 *   - malignancy.ts      (round-trip, body-content effects)
 *   - gear.ts            ('drug' type → GearData; duration, grants.activeEffects)
 *   - peer-enemy.ts      ('peer' type → PeerEnemyData; modifier sign branches)
 *   - cybernetic.ts      (locations Set, prepareBaseData line-variant resolve,
 *                         ModifiersTemplate-driven characteristic bump when
 *                         equipped via _computeItemModifiers cybernetic branch
 *                         at creature.ts:1089)
 */

const FLOW_MUTATION = 'mutation-applies-to-actor';
const FLOW_MENTAL = 'mental-disorder-tracks-severity';
const FLOW_CRITICAL = 'critical-injury-applies-impairment';
const FLOW_MALIGNANCY = 'malignancy-corruption-link';
const FLOW_DRUG = 'drug-temporary-effect';
const FLOW_PEER = 'peer-grants-influence-test-bonus';
const FLOW_CYBERNETIC = 'cybernetic-grants-stat-modifier';

interface ActorRef {
    id: string;
}

interface FlowResult {
    ok: boolean;
    error: string | null;
}

async function createDH2Parent(page: Page): Promise<ActorRef | { error: string }> {
    const result = await page.evaluate(async () => {
        const Actor = (globalThis as unknown as { Actor?: { create?: (data: object) => Promise<{ id?: string } | null> } }).Actor;
        if (!Actor?.create) return { id: null, error: 'Actor.create unavailable' };
        try {
            const actor = await Actor.create({
                name: 'probe-dh-special-items-parent',
                type: 'dh2-character',
                system: {
                    gameSystem: 'dh2e',
                    characteristics: {
                        weaponSkill: { base: 30, advance: 0, modifier: 0 },
                        toughness: { base: 30, advance: 0, modifier: 0 },
                        strength: { base: 30, advance: 0, modifier: 0 },
                        intelligence: { base: 30, advance: 0, modifier: 0 },
                    },
                    wounds: { max: 10, value: 10, critical: 2 },
                    corruption: 0,
                },
            });
            if (!actor) return { id: null, error: 'Actor.create returned null' };
            return { id: actor.id ?? null, error: null };
        } catch (err) {
            return { id: null, error: String((err as Error)?.message ?? err) };
        }
    });
    if (!result.id) return { error: result.error ?? 'unknown create error' };
    return { id: result.id };
}

async function deleteActor(page: Page, actorId: string): Promise<void> {
    await page.evaluate(async (id: string) => {
        const game = (
            globalThis as unknown as {
                game?: { actors?: { get?: (id: string) => { delete?: () => Promise<unknown> } | undefined } };
            }
        ).game;
        await game?.actors?.get?.(id)?.delete?.();
    }, actorId);
}

async function createItems(page: Page, actorId: string, items: object[]): Promise<string[]> {
    return page.evaluate(
        async ({ actorId, items }) => {
            const game = (
                globalThis as unknown as {
                    game?: {
                        actors?: {
                            get?: (id: string) =>
                                | { createEmbeddedDocuments?: (type: string, data: object[]) => Promise<Array<{ id?: string }>> }
                                | undefined;
                        };
                    };
                }
            ).game;
            const actor = game?.actors?.get?.(actorId);
            if (!actor?.createEmbeddedDocuments) return [];
            try {
                const created = await actor.createEmbeddedDocuments('Item', items);
                return created.map((c) => c.id).filter((id): id is string => typeof id === 'string');
            } catch {
                return [];
            }
        },
        { actorId, items },
    );
}

async function deleteItems(page: Page, actorId: string, itemIds: string[]): Promise<void> {
    if (itemIds.length === 0) return;
    await page.evaluate(
        async ({ actorId, itemIds }) => {
            const game = (
                globalThis as unknown as {
                    game?: {
                        actors?: {
                            get?: (id: string) =>
                                | { deleteEmbeddedDocuments?: (type: string, ids: string[]) => Promise<unknown> }
                                | undefined;
                        };
                    };
                }
            ).game;
            try {
                await game?.actors?.get?.(actorId)?.deleteEmbeddedDocuments?.('Item', itemIds);
            } catch {
                /* best-effort */
            }
        },
        { actorId, itemIds },
    );
}

/**
 * Read a dotted path off an item embedded on the actor.
 */
async function readItemPath(page: Page, actorId: string, itemId: string, path: string): Promise<unknown> {
    return page.evaluate(
        ({ actorId, itemId, path }) => {
            const game = (
                globalThis as unknown as {
                    game?: { actors?: { get?: (id: string) => { items?: { get?: (id: string) => unknown } } | undefined } };
                    foundry?: { utils?: { getProperty?: (obj: unknown, path: string) => unknown } };
                }
            ).game;
            const foundry = (globalThis as unknown as { foundry?: { utils?: { getProperty?: (obj: unknown, path: string) => unknown } } }).foundry;
            const item = game?.actors?.get?.(actorId)?.items?.get?.(itemId);
            const getProperty = foundry?.utils?.getProperty;
            if (!item || !getProperty) return null;
            return getProperty(item, path);
        },
        { actorId, itemId, path },
    );
}

async function readActorPath(page: Page, actorId: string, path: string): Promise<number | null> {
    return page.evaluate(
        ({ actorId, path }) => {
            const game = (globalThis as unknown as { game?: { actors?: { get?: (id: string) => unknown } } }).game;
            const foundry = (globalThis as unknown as { foundry?: { utils?: { getProperty?: (obj: unknown, path: string) => unknown } } }).foundry;
            const actor = game?.actors?.get?.(actorId);
            const getProperty = foundry?.utils?.getProperty;
            if (!actor || !getProperty) return null;
            const v = getProperty(actor, path);
            const num = Number(v);
            return Number.isFinite(num) ? num : null;
        },
        { actorId, path },
    );
}

/**
 * Mutation — round-trip category + visible, verify derived chatProperties
 * runs (categoryLabel branch via `category.capitalize()`).
 */
async function probeMutation(page: Page, actorId: string): Promise<FlowResult> {
    const ids = await createItems(page, actorId, [
        {
            name: 'probe-mutation-major',
            type: 'mutation',
            system: {
                identifier: 'probe-mut',
                category: 'major',
                visible: true,
                effect: '<p>Visible spinal ridges.</p>',
                drawback: '<p>-10 to Fellowship in civilised company.</p>',
                notes: 'noted',
            },
        },
    ]);
    if (ids.length === 0) return { ok: false, error: 'mutation create failed' };
    const itemId = ids[0];
    if (itemId === undefined) return { ok: false, error: 'mutation id missing' };
    try {
        const category = await readItemPath(page, actorId, itemId, 'system.category');
        const visible = await readItemPath(page, actorId, itemId, 'system.visible');
        // Drive chatProperties getter (categoryLabel + visible branches).
        const chatProps = await readItemPath(page, actorId, itemId, 'system.chatProperties');
        if (category !== 'major') return { ok: false, error: `category round-trip: expected 'major', got ${JSON.stringify(category)}` };
        if (visible !== true) return { ok: false, error: `visible round-trip: expected true, got ${JSON.stringify(visible)}` };
        if (!Array.isArray(chatProps) || chatProps.length < 1) return { ok: false, error: `chatProperties: expected array with ≥1 entry, got ${JSON.stringify(chatProps)}` };
        return { ok: true, error: null };
    } finally {
        await deleteItems(page, actorId, ids);
    }
}

/**
 * Mental disorder — round-trip severity, drive severityLabel + chatProperties.
 */
async function probeMentalDisorder(page: Page, actorId: string): Promise<FlowResult> {
    const ids = await createItems(page, actorId, [
        {
            name: 'probe-disorder-acute',
            type: 'mentalDisorder',
            system: {
                identifier: 'probe-md',
                severity: 'acute',
                trigger: '<p>Loud noises.</p>',
                effect: '<p>Flee or freeze for 1d10 rounds.</p>',
                treatment: '<p>Medicae +20, 1 week.</p>',
            },
        },
    ]);
    if (ids.length === 0) return { ok: false, error: 'mentalDisorder create failed' };
    const itemId = ids[0];
    if (itemId === undefined) return { ok: false, error: 'mentalDisorder id missing' };
    try {
        const severity = await readItemPath(page, actorId, itemId, 'system.severity');
        const chatProps = await readItemPath(page, actorId, itemId, 'system.chatProperties');
        if (severity !== 'acute') return { ok: false, error: `severity round-trip: expected 'acute', got ${JSON.stringify(severity)}` };
        if (!Array.isArray(chatProps) || chatProps.length === 0) return { ok: false, error: `chatProperties: expected non-empty array, got ${JSON.stringify(chatProps)}` };
        return { ok: true, error: null };
    } finally {
        await deleteItems(page, actorId, ids);
    }
}

/**
 * Critical injury — populate effects map indexed by severity number, verify
 * currentEffect lookup, severityClass branch (severity 8 → 'severity-severe'),
 * isPermanent flag, and headerLabels derivation.
 */
async function probeCriticalInjury(page: Page, actorId: string): Promise<FlowResult> {
    const ids = await createItems(page, actorId, [
        {
            name: 'probe-crit-energy-arm',
            type: 'criticalInjury',
            system: {
                identifier: 'probe-crit',
                damageType: 'energy',
                bodyPart: 'arm',
                severity: 8,
                effects: {
                    '1': { text: 'Singed.', permanent: false },
                    '8': { text: 'Charred to the bone. -20 to use this arm.', permanent: true },
                },
                notes: 'logged',
            },
        },
    ]);
    if (ids.length === 0) return { ok: false, error: 'criticalInjury create failed' };
    const itemId = ids[0];
    if (itemId === undefined) return { ok: false, error: 'criticalInjury id missing' };
    try {
        const currentEffect = await readItemPath(page, actorId, itemId, 'system.currentEffect');
        const isPermanent = await readItemPath(page, actorId, itemId, 'system.isPermanent');
        const severityClass = await readItemPath(page, actorId, itemId, 'system.severityClass');
        const headerLabels = await readItemPath(page, actorId, itemId, 'system.headerLabels');
        if (typeof currentEffect !== 'string' || !currentEffect.includes('Charred')) {
            return { ok: false, error: `currentEffect: expected severity-8 text, got ${JSON.stringify(currentEffect)}` };
        }
        if (isPermanent !== true) return { ok: false, error: `isPermanent: expected true, got ${JSON.stringify(isPermanent)}` };
        if (severityClass !== 'severity-severe') return { ok: false, error: `severityClass: expected 'severity-severe' (sev 8), got ${JSON.stringify(severityClass)}` };
        if (typeof headerLabels !== 'object' || headerLabels === null) return { ok: false, error: `headerLabels: expected object, got ${JSON.stringify(headerLabels)}` };
        // Confirm the actor was created with non-zero critical wounds so the
        // critical-injury sits in context where the system would track it.
        const critWounds = await readActorPath(page, actorId, 'system.wounds.critical');
        if (critWounds === null || critWounds <= 0) return { ok: false, error: `actor.wounds.critical baseline missing, got ${String(critWounds)}` };
        return { ok: true, error: null };
    } finally {
        await deleteItems(page, actorId, ids);
    }
}

/**
 * Malignancy — round-trip identifier/effect/notes. MalignancyData has no
 * derived getters beyond the empty chatProperties / headerLabels; this flow
 * exercises the defineSchema path + DescriptionTemplate+ModifiersTemplate
 * mixin assembly. The "corruption link" is narrative (no schema field
 * touches corruption directly) so we verify the baseline that malignancy
 * embeds cleanly while the actor carries a corruption track.
 */
async function probeMalignancy(page: Page, actorId: string): Promise<FlowResult> {
    const ids = await createItems(page, actorId, [
        {
            name: 'probe-malignancy-mark',
            type: 'malignancy',
            system: {
                identifier: 'probe-malig',
                effect: '<p>Whispers in dreams.</p>',
                notes: 'manifested at 30 corruption',
            },
        },
    ]);
    if (ids.length === 0) return { ok: false, error: 'malignancy create failed' };
    const itemId = ids[0];
    if (itemId === undefined) return { ok: false, error: 'malignancy id missing' };
    try {
        const identifier = await readItemPath(page, actorId, itemId, 'system.identifier');
        const chatProps = await readItemPath(page, actorId, itemId, 'system.chatProperties');
        const headerLabels = await readItemPath(page, actorId, itemId, 'system.headerLabels');
        const corruption = await readActorPath(page, actorId, 'system.corruption');
        if (identifier !== 'probe-malig') return { ok: false, error: `identifier round-trip: expected 'probe-malig', got ${JSON.stringify(identifier)}` };
        if (!Array.isArray(chatProps)) return { ok: false, error: `chatProperties: expected array, got ${JSON.stringify(chatProps)}` };
        if (typeof headerLabels !== 'object' || headerLabels === null) return { ok: false, error: `headerLabels: expected object, got ${JSON.stringify(headerLabels)}` };
        if (corruption === null) return { ok: false, error: 'actor.corruption track missing — malignancy context not viable' };
        return { ok: true, error: null };
    } finally {
        await deleteItems(page, actorId, ids);
    }
}

/**
 * Drug — there is no standalone DrugData; the system maps `drug` → GearData
 * (hooks-manager.ts:406). Populate duration + grants.activeEffects so the
 * temporary-effect schema is exercised, then verify chatProperties surfaces
 * the duration string via the `WH40K.Gear.Duration` format branch.
 */
async function probeDrug(page: Page, actorId: string): Promise<FlowResult> {
    const ids = await createItems(page, actorId, [
        {
            name: 'probe-drug-stimm',
            type: 'drug',
            system: {
                identifier: 'probe-drug',
                category: 'drugs',
                consumable: true,
                uses: { value: 1, max: 1 },
                duration: '1 hour',
                effect: '<p>+10 Strength, -10 Intelligence.</p>',
                grants: {
                    activeEffects: [
                        { key: 'system.characteristics.strength.modifier', mode: 2, value: 10, durationRounds: 60 },
                    ],
                },
            },
        },
    ]);
    if (ids.length === 0) return { ok: false, error: 'drug create failed' };
    const itemId = ids[0];
    if (itemId === undefined) return { ok: false, error: 'drug id missing' };
    try {
        const duration = await readItemPath(page, actorId, itemId, 'system.duration');
        const grants = await readItemPath(page, actorId, itemId, 'system.grants.activeEffects');
        const chatProps = await readItemPath(page, actorId, itemId, 'system.chatProperties');
        if (duration !== '1 hour') return { ok: false, error: `duration round-trip: expected '1 hour', got ${JSON.stringify(duration)}` };
        if (!Array.isArray(grants) || grants.length !== 1) return { ok: false, error: `grants.activeEffects: expected 1 entry, got ${JSON.stringify(grants)}` };
        if (!Array.isArray(chatProps) || !chatProps.some((p) => typeof p === 'string' && p.includes('1 hour'))) {
            return { ok: false, error: `chatProperties: expected duration string presence, got ${JSON.stringify(chatProps)}` };
        }
        return { ok: true, error: null };
    } finally {
        await deleteItems(page, actorId, ids);
    }
}

/**
 * Peer — modifier+group round-trip exercises PeerEnemyData.defineSchema +
 * chatProperties (modifier !== 0 branch with positive-sign prefix) + the
 * `isPeer` getter branch. Test bonus is narrative — the modifier value lives
 * in `system.modifier` and is what callers consult for Influence checks.
 */
async function probePeer(page: Page, actorId: string): Promise<FlowResult> {
    const ids = await createItems(page, actorId, [
        {
            name: 'probe-peer-mechanicus',
            type: 'peer',
            system: {
                group: 'Mechanicus',
                modifier: 10,
            },
        },
    ]);
    if (ids.length === 0) return { ok: false, error: 'peer create failed' };
    const itemId = ids[0];
    if (itemId === undefined) return { ok: false, error: 'peer id missing' };
    try {
        const group = await readItemPath(page, actorId, itemId, 'system.group');
        const modifier = await readItemPath(page, actorId, itemId, 'system.modifier');
        const isPeer = await readItemPath(page, actorId, itemId, 'system.isPeer');
        const isEnemy = await readItemPath(page, actorId, itemId, 'system.isEnemy');
        const chatProps = await readItemPath(page, actorId, itemId, 'system.chatProperties');
        const headerLabels = await readItemPath(page, actorId, itemId, 'system.headerLabels');
        if (group !== 'Mechanicus') return { ok: false, error: `group round-trip: expected 'Mechanicus', got ${JSON.stringify(group)}` };
        if (modifier !== 10) return { ok: false, error: `modifier round-trip: expected 10, got ${JSON.stringify(modifier)}` };
        if (isPeer !== true) return { ok: false, error: `isPeer: expected true (mod >= 0), got ${JSON.stringify(isPeer)}` };
        if (isEnemy !== false) return { ok: false, error: `isEnemy: expected false (mod >= 0), got ${JSON.stringify(isEnemy)}` };
        if (!Array.isArray(chatProps) || !chatProps.includes('Mechanicus') || !chatProps.some((p) => typeof p === 'string' && p.startsWith('+'))) {
            return { ok: false, error: `chatProperties: expected ['Mechanicus', '+10'], got ${JSON.stringify(chatProps)}` };
        }
        if (!Array.isArray(headerLabels) || headerLabels.length === 0) return { ok: false, error: `headerLabels: expected non-empty array, got ${JSON.stringify(headerLabels)}` };
        return { ok: true, error: null };
    } finally {
        await deleteItems(page, actorId, ids);
    }
}

/**
 * Cybernetic equipped with a +5 strength modifier via ModifiersTemplate.
 * Drives CyberneticData.prepareBaseData (line-variant resolve of type,
 * locations Set, hasArmourPoints, installation, etc.) AND
 * CreatureTemplate._computeItemModifiers' cybernetic branch
 * (creature.ts:1089 — `item.type === 'cybernetic' && item.system.equipped`).
 * Verifies the stat-modifier lands on actor.characteristics.strength.total.
 */
async function probeCybernetic(page: Page, actorId: string): Promise<FlowResult> {
    const baseline = (await readActorPath(page, actorId, 'system.characteristics.strength.total')) ?? 0;
    const ids = await createItems(page, actorId, [
        {
            name: 'probe-cyber-strength-augmetic',
            type: 'cybernetic',
            system: {
                identifier: 'probe-cyber',
                type: 'augmetic',
                locations: ['rightArm'],
                hasArmourPoints: false,
                equipped: true,
                effect: '<p>Augmetic right arm.</p>',
                installation: { surgery: 'Good', difficulty: 'Challenging (+0)', recoveryTime: '1 week' },
                modifiers: { characteristics: { strength: 5 } },
            },
        },
    ]);
    if (ids.length === 0) return { ok: false, error: 'cybernetic create failed' };
    const itemId = ids[0];
    if (itemId === undefined) return { ok: false, error: 'cybernetic id missing' };
    try {
        const type = await readItemPath(page, actorId, itemId, 'system.type');
        const installationDifficulty = await readItemPath(page, actorId, itemId, 'system.installation.difficulty');
        if (type !== 'augmetic') return { ok: false, error: `cybernetic.type round-trip: expected 'augmetic', got ${JSON.stringify(type)}` };
        if (installationDifficulty !== 'Challenging (+0)') {
            return { ok: false, error: `installation.difficulty round-trip: expected 'Challenging (+0)', got ${JSON.stringify(installationDifficulty)}` };
        }
        const after = (await readActorPath(page, actorId, 'system.characteristics.strength.total')) ?? 0;
        if (after !== baseline + 5) return { ok: false, error: `expected strength.total = ${baseline + 5} after equipped cybernetic, got ${after}` };
        return { ok: true, error: null };
    } finally {
        await deleteItems(page, actorId, ids);
    }
}

test.describe.serial('dh special items (Tier B)', () => {
    test('dh special item types drive unique data-model logic', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const parent = await createDH2Parent(page);
        expect('id' in parent, `parent actor create failed: ${'error' in parent ? parent.error : 'unknown'}`).toBe(true);
        const actorId = (parent as ActorRef).id;

        const failures: string[] = [];
        try {
            const probes: Array<{ flow: string; run: () => Promise<FlowResult> }> = [
                { flow: FLOW_MUTATION, run: () => probeMutation(page, actorId) },
                { flow: FLOW_MENTAL, run: () => probeMentalDisorder(page, actorId) },
                { flow: FLOW_CRITICAL, run: () => probeCriticalInjury(page, actorId) },
                { flow: FLOW_MALIGNANCY, run: () => probeMalignancy(page, actorId) },
                { flow: FLOW_DRUG, run: () => probeDrug(page, actorId) },
                { flow: FLOW_PEER, run: () => probePeer(page, actorId) },
                { flow: FLOW_CYBERNETIC, run: () => probeCybernetic(page, actorId) },
            ];
            for (const probe of probes) {
                const result = await probe.run().catch((err: unknown) => ({ ok: false, error: String((err as Error)?.message ?? err) }));
                if (result.ok) {
                    recordCoverage('dh-special-item.flow', probe.flow);
                } else {
                    failures.push(`${probe.flow}: ${result.error ?? 'unknown error'}`);
                }
            }
        } finally {
            await deleteActor(page, actorId).catch(() => undefined);
        }

        expect(failures, `${failures.length} dh-special-item flow(s) failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
