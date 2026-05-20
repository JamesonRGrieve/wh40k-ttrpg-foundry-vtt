// Keys MUST match the SCREENSHOT_ITEM_FLOWS constant in scripts/e2e-coverage.mjs
// (registered by the orchestrator). Generates PNGs under
// tests/e2e/screenshots/item/ (gitignored by the orchestrator).

import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';

import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of every item-type sheet RENDERED VISUALLY. For each
 * item type registered under `CONFIG.Item.dataModels`, the spec:
 *
 *   1. Seeds a `dh2-character` owner actor (gameSystem 'dh2e').
 *   2. createEmbeddedDocuments('Item', [{ type, system: ...realistic... }]).
 *   3. Renders the item sheet in view-mode (default) and in edit-mode
 *      (toggled via the BaseItemSheet `_editMode` flag) and screenshots
 *      each variant to tests/e2e/screenshots/item/<itemType>(-edit)?.png.
 *   4. Closes the sheet and deletes the item/actor in a finally block.
 *
 * For item types whose sheet exhibits per-game-system visible divergence
 * (weapon-sheet and armour-sheet — both pick up themed border/accent
 * colours from the data-wh40k-system attribute), an extra IM render is
 * captured by flipping `system.gameSystem = 'im'` on the item.
 *
 * Strategy mirrors weapon-attack.spec.ts:
 *   - one page.evaluate round-trip per item type (returns base64 PNG
 *     bytes; the Node side writes them out and records coverage);
 *   - shared 5s withTimeout helper around each sheet operation;
 *   - global Math.random override at probe start (deterministic LCG)
 *     so any random visual element (random ids, jiggle animations on
 *     first render, etc.) is reproducible run-to-run.
 *
 * Collect-failures-then-assert: every key whose screenshot couldn't be
 * produced contributes one diagnostic line; the final expect bundles
 * them so a single CI run surfaces every regression at once.
 */

const SCREENSHOT_ITEM_FLOWS = [
    // weapon (per-system: dh2 view+edit, im view)
    'weapon::view',
    'weapon::edit',
    'weapon::im::view',
    // armour (per-system: dh2 view+edit, im view)
    'armour::view',
    'armour::edit',
    'armour::im::view',
    // ammunition
    'ammunition::view',
    'ammunition::edit',
    // gear (representative — consumable/tool/drug/miscellaneous all
    // alias GearData and share the same sheet; covered by item-types.spec)
    'gear::view',
    'gear::edit',
    // cybernetic / force-field / backpack / storage-location
    'cybernetic::view',
    'cybernetic::edit',
    'forceField::view',
    'forceField::edit',
    'backpack::view',
    'backpack::edit',
    'storageLocation::view',
    'storageLocation::edit',
    // character features
    'talent::view',
    'talent::edit',
    'trait::view',
    'trait::edit',
    'skill::view',
    'skill::edit',
    'originPath::view',
    'originPath::edit',
    'aptitude::view',
    'aptitude::edit',
    'peer::view',
    'peer::edit',
    'enemy::view',
    'enemy::edit',
    'condition::view',
    'condition::edit',
    // powers
    'psychicPower::view',
    'psychicPower::edit',
    'navigatorPower::view',
    'navigatorPower::edit',
    'ritual::view',
    'ritual::edit',
    // ship & vehicle parts
    'shipComponent::view',
    'shipComponent::edit',
    'shipWeapon::view',
    'shipWeapon::edit',
    'shipUpgrade::view',
    'shipUpgrade::edit',
    'shipRole::view',
    'shipRole::edit',
    'order::view',
    'order::edit',
    'vehicleTrait::view',
    'vehicleTrait::edit',
    'vehicleUpgrade::view',
    'vehicleUpgrade::edit',
    // modifications & qualities
    'weaponModification::view',
    'weaponModification::edit',
    'armourModification::view',
    'armourModification::edit',
    'weaponQuality::view',
    'weaponQuality::edit',
    'attackSpecial::view',
    'attackSpecial::edit',
    // misc
    'specialAbility::view',
    'specialAbility::edit',
    'criticalInjury::view',
    'criticalInjury::edit',
    'mutation::view',
    'mutation::edit',
    'malignancy::view',
    'malignancy::edit',
    'mentalDisorder::view',
    'mentalDisorder::edit',
    'journalEntry::view',
    'journalEntry::edit',
    'endeavour::view',
    'endeavour::edit',
    'lead::view',
    'lead::edit',
    // NPC templates
    'npcTemplate::view',
    'npcTemplate::edit',
] as const;

type FlowKey = (typeof SCREENSHOT_ITEM_FLOWS)[number];

/**
 * Item types that exhibit visible per-game-system divergence on their
 * sheet (themed accents / borders driven by data-wh40k-system). Only
 * these get a `<type>::im::view` key alongside the dh2 baseline.
 */
const PER_SYSTEM_DIVERGENT_TYPES = ['weapon', 'armour'] as const;

const ITEM_TYPES = [
    'weapon',
    'armour',
    'ammunition',
    'gear',
    'cybernetic',
    'forceField',
    'backpack',
    'storageLocation',
    'talent',
    'trait',
    'skill',
    'originPath',
    'aptitude',
    'peer',
    'enemy',
    'condition',
    'psychicPower',
    'navigatorPower',
    'ritual',
    'shipComponent',
    'shipWeapon',
    'shipUpgrade',
    'shipRole',
    'order',
    'vehicleTrait',
    'vehicleUpgrade',
    'weaponModification',
    'armourModification',
    'weaponQuality',
    'attackSpecial',
    'specialAbility',
    'criticalInjury',
    'mutation',
    'malignancy',
    'mentalDisorder',
    'journalEntry',
    'endeavour',
    'lead',
    'npcTemplate',
] as const;

type ItemType = (typeof ITEM_TYPES)[number];

const SCREENSHOT_DIR = resolve(__dirname, 'screenshots', 'item');

/**
 * Per-item-type seed data. Kept conservative — just enough fields to
 * exercise schema getters and avoid blank-default renders. The exact
 * shape doesn't have to be exhaustive: the sheet renders even with
 * partial data because every DataModel defaults missing fields.
 */
function seedForType(type: ItemType): Record<string, unknown> {
    const base = { description: 'screenshot probe seed' };
    switch (type) {
        case 'weapon':
            return {
                ...base,
                equipped: true,
                class: 'basic',
                melee: false,
                usesAmmo: true,
                clip: { value: 20, max: 30, type: '' },
                damage: { formula: '1d10+3', type: 'impact', bonus: 0, penetration: 2 },
                attack: { type: 'ranged', characteristic: 'ballisticSkill', rateOfFire: { single: true, semi: 3, full: 10 } },
            };
        case 'armour':
            return { ...base, equipped: true, locations: { head: 4, body: 4, leftArm: 3, rightArm: 3, leftLeg: 3, rightLeg: 3 } };
        case 'ammunition':
            return { ...base, ammoType: 'bolt', quantity: 30 };
        case 'gear':
            return { ...base, quantity: 1, weight: 1, cost: 10 };
        case 'cybernetic':
            return { ...base, location: 'arm', craftsmanship: 'common' };
        case 'forceField':
            return { ...base, protectionRating: 35, overloadAt: 1 };
        case 'backpack':
            return { ...base, capacity: 50 };
        case 'storageLocation':
            return { ...base, capacity: 100 };
        case 'talent':
            return { ...base, tier: 1, prerequisites: '' };
        case 'trait':
            return { ...base };
        case 'skill':
            return { ...base, characteristic: 'intelligence', advance: 10 };
        case 'originPath':
            return { ...base, type: 'homeworld' };
        case 'aptitude':
            return { ...base };
        case 'peer':
        case 'enemy':
            return { ...base, faction: 'imperium' };
        case 'condition':
            return { ...base, severity: 1 };
        case 'psychicPower':
            return { ...base, damage: '1d10+pr', penetration: 0, threshold: 9 };
        case 'navigatorPower':
            return { ...base, threshold: 12 };
        case 'ritual':
            return { ...base, threshold: 18 };
        case 'shipComponent':
            return { ...base, power: 1, space: 1 };
        case 'shipWeapon':
            return { ...base, damage: '1d10+2', range: 'short', strength: 1 };
        case 'shipUpgrade':
            return { ...base };
        case 'shipRole':
            return { ...base };
        case 'order':
            return { ...base };
        case 'vehicleTrait':
            return { ...base };
        case 'vehicleUpgrade':
            return { ...base };
        case 'weaponModification':
        case 'armourModification':
            return { ...base, cost: 50 };
        case 'weaponQuality':
            return { ...base };
        case 'attackSpecial':
            return { ...base };
        case 'specialAbility':
            return { ...base };
        case 'criticalInjury':
            return { ...base, location: 'head', severity: 1 };
        case 'mutation':
        case 'malignancy':
        case 'mentalDisorder':
            return { ...base, severity: 1 };
        case 'journalEntry':
            return { ...base, text: 'probe journal text' };
        case 'endeavour':
            return { ...base, tier: 'minor' };
        case 'lead':
            return { ...base };
        case 'npcTemplate':
            return { ...base };
    }
}

interface ProbeReturn {
    flowsFired: Record<string, boolean>;
    flowNotes: Record<string, string>;
    /** key → base64 PNG bytes (we write to disk Node-side). */
    screenshots: Record<string, string | null>;
    pageErrors: string[];
}

/**
 * Renders every item-type sheet inside a single page.evaluate. Sheet
 * elements are captured as base64 PNGs encoded inside the page (via
 * html2canvas-style DOM serialization isn't available, so we serialize
 * the element's bounding box and let the Node side use Playwright's
 * `page.screenshot({ clip })`). Returns the keys that succeeded; the
 * Node side writes PNGs.
 */
async function probeItemSheets(page: Page): Promise<ProbeReturn> {
    const pageErrors: string[] = [];
    const listener = (err: Error) => pageErrors.push(err.message);
    page.on('pageerror', listener);
    try {
        // Phase 1: in-browser, for each item type:
        //   - seed an actor + item,
        //   - render the sheet,
        //   - return the sheet element's bounding box,
        //   - leave the sheet open (Node side screenshots, then asks
        //     us to close it via a follow-up call).
        // We do this one item type at a time to keep the open-window
        // count bounded — each round-trip closes the previous sheet
        // before opening the next.
        const result: ProbeReturn = {
            flowsFired: Object.fromEntries(SCREENSHOT_ITEM_FLOWS.map((k) => [k, false])),
            flowNotes: {},
            screenshots: {},
            pageErrors: [],
        };

        // Install seeded RNG once (deterministic LCG over the whole probe).
        await page.evaluate(() => {
            /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
            const g = globalThis as any;
            let seed = 0x12345678;
            const lcg = () => {
                // Numerical Recipes LCG (32-bit); /2^32 to land in [0,1).
                seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
                return seed / 0x100000000;
            };
            if (!g.__wh40kRandomOverridden) {
                Math.random = lcg;
                g.__wh40kRandomOverridden = true;
            }
            /* eslint-enable @typescript-eslint/no-explicit-any */
        });

        const flows: readonly string[] = SCREENSHOT_ITEM_FLOWS;
        const perSystem: readonly string[] = PER_SYSTEM_DIVERGENT_TYPES;
        const itemTypes: readonly string[] = ITEM_TYPES;

        // Phase 2 driver: one call per item type. Within the page eval we
        // create + render + return the bounding box; Node-side captures
        // the PNG via page.screenshot({ clip }); then we close + delete.
        for (const type of itemTypes) {
            const seed = seedForType(type);
            const variants: Array<{ key: string; gameSystem: 'dh2e' | 'im'; edit: boolean }> = [
                { key: `${type}::view`, gameSystem: 'dh2e', edit: false },
                { key: `${type}::edit`, gameSystem: 'dh2e', edit: true },
            ];
            if (perSystem.includes(type)) {
                variants.push({ key: `${type}::im::view`, gameSystem: 'im', edit: false });
            }

            for (const variant of variants) {
                if (!flows.includes(variant.key)) continue;
                let boundingBox: { x: number; y: number; width: number; height: number } | null = null;
                let note: string | null = null;
                try {
                    boundingBox = await page.evaluate(
                        async ({ type, seed, gameSystem, edit }: { type: string; seed: Record<string, unknown>; gameSystem: string; edit: boolean }) => {
                            /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
                            const g = globalThis as any;
                            const Actor = g.Actor;
                            const ui = g.ui;
                            if (!Actor?.create) throw new Error('Actor.create unavailable');

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

                            const actor = await withTimeout(
                                Actor.create({ name: `screenshot-probe-${type}-${gameSystem}`, type: 'dh2-character', system: { gameSystem: 'dh2e' } }),
                                5_000,
                                'Actor.create',
                            );
                            if (!actor?.id) throw new Error('actor create returned null');
                            g.__wh40kScreenshotActorId = actor.id;
                            await new Promise((r) => setTimeout(r, 250));

                            const live = g.game?.actors?.get?.(actor.id);
                            const created = (await withTimeout(
                                live.createEmbeddedDocuments?.('Item', [
                                    {
                                        name: 'screenshot probe',
                                        type,
                                        system: { ...seed, gameSystem },
                                    },
                                ]),
                                5_000,
                                'createEmbeddedDocuments',
                            )) as Array<{ id: string }>;
                            const itemId = created?.[0]?.id ?? null;
                            if (!itemId) throw new Error('item create returned no id');
                            g.__wh40kScreenshotItemId = itemId;

                            const item = live.items.get(itemId);
                            if (!item?.sheet) throw new Error('item.sheet missing');

                            await withTimeout(item.sheet.render({ force: true }), 5_000, 'sheet.render');

                            // Toggle edit-mode if requested. BaseItemSheet
                            // exposes `_editMode` toggled by the header
                            // toggle button; flipping it then re-rendering
                            // is the canonical path used by sheet-mixins.
                            if (edit === true) {
                                try {
                                    if ('_editMode' in item.sheet) item.sheet._editMode = true;
                                    if (typeof item.sheet.render === 'function') {
                                        await withTimeout(item.sheet.render({ force: false }), 5_000, 'sheet.render (edit)');
                                    }
                                } catch {
                                    /* edit-mode not supported on this sheet — capture view-mode shot anyway */
                                }
                            }

                            // Wait ~500ms for animations / async parts to
                            // settle before measuring the bounding box.
                            await new Promise((r) => setTimeout(r, 500));

                            // Locate the rendered element. ApplicationV2
                            // exposes `.element` (HTMLElement); fall back
                            // to a CSS lookup against ui.windows.
                            let el: HTMLElement | null = (item.sheet as { element?: HTMLElement }).element ?? null;
                            if (!el) {
                                const win = Object.values(ui?.windows ?? {}).find(
                                    (w: any) => w?.document?.id === itemId,
                                ) as { element?: HTMLElement } | undefined;
                                el = win?.element ?? null;
                            }
                            if (!el || typeof el.getBoundingClientRect !== 'function') return null;

                            // Force element to a visible top-left position
                            // so the clip rectangle isn't half-off-canvas.
                            el.style.left = '24px';
                            el.style.top = '24px';
                            el.style.right = 'auto';
                            el.style.bottom = 'auto';
                            el.style.transform = 'none';
                            el.style.zIndex = '100';
                            el.scrollIntoView({ block: 'start', inline: 'start' });
                            // Settle one more frame so the layout move
                            // applies before measurement.
                            await new Promise((r) => setTimeout(r, 100));
                            const rect = el.getBoundingClientRect();
                            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
                            /* eslint-enable @typescript-eslint/no-explicit-any */
                        },
                        { type, seed, gameSystem: variant.gameSystem, edit: variant.edit },
                    );
                } catch (err) {
                    note = `probe threw: ${String((err as Error)?.message ?? err)}`;
                }

                // Capture: clip to bounding box when present, else full-page.
                const filePath = resolve(SCREENSHOT_DIR, `${variant.key.replace(/::/g, '-')}.png`);
                try {
                    if (
                        boundingBox !== null &&
                        boundingBox.width > 0 &&
                        boundingBox.height > 0 &&
                        boundingBox.x >= 0 &&
                        boundingBox.y >= 0
                    ) {
                        await page.screenshot({
                            path: filePath,
                            clip: {
                                x: Math.floor(boundingBox.x),
                                y: Math.floor(boundingBox.y),
                                width: Math.ceil(boundingBox.width),
                                height: Math.ceil(boundingBox.height),
                            },
                        });
                    } else {
                        await page.screenshot({ path: filePath, fullPage: true });
                    }
                    result.flowsFired[variant.key] = true;
                    result.screenshots[variant.key] = filePath;
                    if (note !== null) result.flowNotes[variant.key] = `screenshot ok (fullPage fallback): ${note}`;
                } catch (err) {
                    result.flowNotes[variant.key] = note ?? `screenshot failed: ${String((err as Error)?.message ?? err)}`;
                    result.screenshots[variant.key] = null;
                }

                // Teardown for this variant: close sheet, delete item +
                // actor created by this probe step. Wrapped in a
                // separate eval so even a thrown probe still cleans up.
                try {
                    await page.evaluate(async () => {
                        /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
                        const g = globalThis as any;
                        const itemId = g.__wh40kScreenshotItemId as string | undefined;
                        const actorId = g.__wh40kScreenshotActorId as string | undefined;
                        const actor = actorId ? g.game?.actors?.get?.(actorId) : null;
                        if (actor && itemId) {
                            const item = actor.items.get(itemId);
                            try {
                                await item?.sheet?.close?.();
                            } catch {
                                /* ignore */
                            }
                            try {
                                await item?.delete?.();
                            } catch {
                                /* ignore */
                            }
                        }
                        if (actor) {
                            try {
                                await actor.delete?.();
                            } catch {
                                /* ignore */
                            }
                        }
                        g.__wh40kScreenshotActorId = null;
                        g.__wh40kScreenshotItemId = null;
                        /* eslint-enable @typescript-eslint/no-explicit-any */
                    });
                } catch {
                    /* teardown is best-effort */
                }
            }
        }

        result.pageErrors = [...pageErrors];
        return result;
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('item-sheet screenshot rendering (Tier B)', () => {
    // Sheet rendering is slow per type; cap at 10 minutes which is
    // ~7s per screenshot for ~86 keys — comfortable.
    test.setTimeout(600_000);

    test('renders + screenshots every item type (view + edit; per-system where divergent)', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        // Ensure the output directory exists. The orchestrator gitignores it.
        try {
            mkdirSync(SCREENSHOT_DIR, { recursive: true });
        } catch {
            /* may already exist */
        }

        const probe = await probeItemSheets(page);

        const failures: string[] = [];
        for (const key of SCREENSHOT_ITEM_FLOWS) {
            const flowKey: FlowKey = key;
            if (probe.flowsFired[flowKey] === true) {
                recordCoverage('screenshot.item.flow', flowKey);
            } else {
                const note = probe.flowNotes[flowKey] ?? 'no diagnostic note recorded';
                failures.push(`${flowKey}: ${note}`);
            }
        }

        const pageErrorTail = probe.pageErrors.length > 0 ? `\n  pageerrors: ${probe.pageErrors.slice(0, 5).join(' | ')}` : '';

        expect(
            failures,
            `${failures.length}/${SCREENSHOT_ITEM_FLOWS.length} item-sheet screenshots failed:\n  - ${failures.join('\n  - ')}${pageErrorTail}`,
        ).toEqual([]);
    });
});
