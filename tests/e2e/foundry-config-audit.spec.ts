import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B audit of every Foundry CONFIG / collection / namespace registration
 * the wh40k-rpg system installs at world boot. This is the runtime mirror of
 * the static `actor-types.spec.ts` / `item-types.spec.ts` pairs (which
 * already cover per-type instantiability) and the `hooks.spec.ts` pair
 * (which already covers hook-firing). Those specs prove the registrations
 * *function*; this one proves they are *present* and *well-typed* at the
 * exact CONFIG / collection slots `src/module/hooks-manager.ts` writes them
 * to. The two surfaces fail in different ways — a missing dataModel makes
 * actor-types skip with an unhelpful "no <bc-*> types declared"; a sheet
 * class with `name === ''` (the V14 anonymous-class collision gotcha noted
 * under "Critical gotchas" #10 in CLAUDE.md) silently overwrites the
 * previous registration with the same key, which neither hook-firing nor
 * actor-instantiation will catch.
 *
 * Surfaces probed (read end-to-end from `src/module/hooks-manager.ts` and
 * `src/module/wh40k-rpg.ts`):
 *   - `CONFIG.Actor.documentClass` (WH40KActorProxy)
 *   - `CONFIG.Actor.documentClasses` (per-type concrete class map)
 *   - `CONFIG.Item.documentClass` (WH40KItem)
 *   - `CONFIG.ActiveEffect.documentClass` (WH40KActiveEffect)
 *   - `CONFIG.ChatMessage.documentClass` (ChatMessageWH40K)
 *   - `CONFIG.Token.documentClass` (TokenDocumentWH40K)
 *   - `CONFIG.Token.rulerClass` (TokenRulerWH40K)
 *   - `CONFIG.Token.movement.costAggregator` (Math.max aggregator)
 *   - `CONFIG.Combat.initiative.formula`
 *   - `CONFIG.MeasuredTemplate.defaults.angle`
 *   - `CONFIG.Dice.rolls` carrying BasicRollWH40K + D100Roll
 *   - `CONFIG.wh40k` (system rules config)
 *   - `CONFIG.Actor.dataModels[<type>]` for every (system, role) pair plus
 *     legacy fallbacks and loot
 *   - `CONFIG.Item.dataModels[<type>]` for every item-type category
 *   - `CONFIG.Actor.sheetClasses[<type>]` for every actor type the system
 *     registers a default sheet for
 *   - `CONFIG.Item.sheetClasses[*]` populated by the system, every entry
 *     carrying a non-empty class `name` (V14 anonymous-class collision
 *     guard — see CLAUDE.md "Critical gotchas" #10)
 *   - `CONFIG.TextEditor.enrichers` carrying the four custom patterns from
 *     `src/module/enrichers.ts` (characteristic / skill / modifier / armor)
 *   - `CONFIG.statusEffects` (the homologated condition list)
 *   - `game.wh40k.*` namespace surface (logging, macro proxies, roll-table
 *     utilities, compendium browser, origin-path builder, NPC tooling,
 *     dice classes)
 *
 * Each assertion records one flow key. Flow keys MUST match the
 * FOUNDRY_CONFIG_FLOWS constant in scripts/e2e-coverage.mjs — that is the
 * coverage denominator and must agree with the recordCoverage keys here.
 */

const FOUNDRY_CONFIG_FLOWS = [
    // --- CONFIG core document-class slots ---
    'config::Actor.documentClass',
    'config::Actor.documentClasses-map',
    'config::Item.documentClass',
    'config::ActiveEffect.documentClass',
    'config::ChatMessage.documentClass',
    'config::Token.documentClass',
    'config::Token.rulerClass',
    'config::Token.movement.costAggregator',
    // --- CONFIG misc system-installed values ---
    'config::Combat.initiative.formula',
    'config::MeasuredTemplate.defaults.angle',
    'config::Dice.rolls.BasicRollWH40K',
    'config::Dice.rolls.D100Roll',
    'config::wh40k.config-installed',
    // --- Actor dataModels (one key per game system + loot) ---
    'config::Actor.dataModels.bc-all',
    'config::Actor.dataModels.dh1-all',
    'config::Actor.dataModels.dh2-all',
    'config::Actor.dataModels.rt-all',
    'config::Actor.dataModels.ow-all',
    'config::Actor.dataModels.dw-all',
    'config::Actor.dataModels.im-all',
    'config::Actor.dataModels.loot',
    // --- Item dataModels (one key per category) ---
    'config::Item.dataModels.equipment',
    'config::Item.dataModels.features',
    'config::Item.dataModels.powers',
    'config::Item.dataModels.ship-vehicle',
    'config::Item.dataModels.modifications',
    'config::Item.dataModels.misc',
    // --- Actor sheetClasses (one key per game system + loot) ---
    'config::Actor.sheetClasses.bc-all',
    'config::Actor.sheetClasses.dh1-all',
    'config::Actor.sheetClasses.dh2-all',
    'config::Actor.sheetClasses.rt-all',
    'config::Actor.sheetClasses.ow-all',
    'config::Actor.sheetClasses.dw-all',
    'config::Actor.sheetClasses.im-all',
    'config::Actor.sheetClasses.loot',
    // --- Sheet hygiene: V14 anonymous-class collision guard ---
    'config::Actor.sheetClasses.no-anonymous-collisions',
    'config::Item.sheetClasses.populated',
    'config::Item.sheetClasses.no-anonymous-collisions',
    // --- TextEditor enrichers + status effects ---
    'config::TextEditor.enrichers.populated',
    'config::statusEffects.populated',
    // --- game.wh40k namespace surface ---
    'config::game.wh40k.namespace',
    'config::game.wh40k.log',
    'config::game.wh40k.warn',
    'config::game.wh40k.error',
    'config::game.wh40k.rollItemMacro',
    'config::game.wh40k.rollSkillMacro',
    'config::game.wh40k.rollCharacteristicMacro',
    'config::game.wh40k.rollTable',
    'config::game.wh40k.openCompendiumBrowser',
    'config::game.wh40k.OriginPathBuilder',
    'config::game.wh40k.openOriginPathBuilder',
    'config::game.wh40k.npc',
    'config::game.wh40k.dice',
    'config::game.wh40k.BasicRollWH40K',
    'config::game.wh40k.D100Roll',
] as const;

type FlowName = (typeof FOUNDRY_CONFIG_FLOWS)[number];

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string | null;
}

/**
 * Actor types the system declares per game-system prefix. Mirrors the
 * registration loop in `src/module/hooks-manager.ts` `init()` so that
 * adding a new (system, role) pair surfaces here as a missing key.
 */
const ACTOR_TYPES_BY_PREFIX: Record<string, readonly string[]> = {
    bc: ['bc-character', 'bc-npc', 'bc-vehicle'],
    dh1: ['dh1-character', 'dh1-npc', 'dh1-vehicle'],
    dh2: ['dh2-character', 'dh2-npc', 'dh2-vehicle'],
    rt: ['rt-character', 'rt-npc', 'rt-vehicle', 'rt-starship'],
    ow: ['ow-character', 'ow-npc', 'ow-vehicle'],
    dw: ['dw-character', 'dw-npc', 'dw-vehicle'],
    im: ['im-character', 'im-npc', 'im-vehicle'],
};

/** Item-type categories that match the grouping in `init()`'s CONFIG.Item.dataModels block. */
const ITEM_TYPE_CATEGORIES: Record<string, readonly string[]> = {
    'equipment': ['weapon', 'armour', 'ammunition', 'gear', 'consumable', 'tool', 'drug', 'cybernetic', 'forceField', 'backpack', 'storageLocation'],
    'features': ['talent', 'trait', 'skill', 'originPath', 'aptitude', 'peer', 'enemy', 'condition'],
    'powers': ['psychicPower', 'navigatorPower', 'ritual'],
    'ship-vehicle': ['shipComponent', 'shipWeapon', 'shipUpgrade', 'shipRole', 'order', 'vehicleTrait', 'vehicleUpgrade'],
    'modifications': ['weaponModification', 'armourModification', 'weaponQuality', 'attackSpecial'],
    'misc': [
        'miscellaneous',
        'specialAbility',
        'criticalInjury',
        'mutation',
        'malignancy',
        'mentalDisorder',
        'journalEntry',
        'endeavour',
        'lead',
        'npcTemplate',
    ],
};

async function probeFoundryConfig(page: Page): Promise<{ results: FlowResult[]; pageErrors: string[] }> {
    const pageErrors: string[] = [];
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const results = await page.evaluate(
            ({
                foundryConfigFlowsInner,
                actorTypesByPrefixInner,
                itemTypeCategoriesInner,
            }: {
                foundryConfigFlowsInner: readonly string[];
                actorTypesByPrefixInner: Record<string, readonly string[]>;
                itemTypeCategoriesInner: Record<string, readonly string[]>;
            }): FlowResult[] => {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- boundary: Foundry document classes are runtime constructors with no shipped types
                type DocCtor = Function;
                interface SheetEntry {
                    cls?: { name?: string };
                    id?: string;
                    label?: string;
                }
                interface DocumentClass {
                    documentClass?: DocCtor;
                    documentClasses?: Record<string, DocCtor>;
                    dataModels?: Record<string, DocCtor>;
                    sheetClasses?: Record<string, Record<string, SheetEntry>>;
                }
                interface TokenConfig extends DocumentClass {
                    rulerClass?: DocCtor;
                    movement?: {
                        costAggregator?: (entries: Array<{ cost: number }>, a: undefined, b: undefined) => number;
                    };
                }
                interface Wh40kNamespace {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: game.wh40k namespace is a dynamically-populated Foundry surface with no shipped types
                    [key: string]: unknown;
                }
                interface FoundryCONFIG {
                    Actor?: DocumentClass;
                    Item?: DocumentClass;
                    ActiveEffect?: DocumentClass;
                    ChatMessage?: DocumentClass;
                    Token?: TokenConfig;
                    Combat?: { initiative?: { formula?: string } };
                    MeasuredTemplate?: { defaults?: { angle?: number } };
                    Dice?: { rolls?: Array<{ name?: string }> };
                    wh40k?: Wh40kNamespace;
                    TextEditor?: { enrichers?: Array<{ pattern?: RegExp | string }> };
                    statusEffects?: Array<{ id?: string; name?: string; img?: string; icon?: string }>;
                }
                interface FoundryGame {
                    wh40k?: Wh40kNamespace;
                }
                interface FoundryGlobals {
                    CONFIG?: FoundryCONFIG;
                    game?: FoundryGame;
                }
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-side globals have no shipped types
                const gt = globalThis as unknown as FoundryGlobals;

                const out: FlowResult[] = [];
                const allowedKeys = new Set(foundryConfigFlowsInner);
                const record = (name: string, ok: boolean, detail: string | null = null): void => {
                    if (!allowedKeys.has(name)) {
                        out.push({ name: name as FlowName, ok: false, detail: `unknown flow key emitted: ${name}` });
                        return;
                    }
                    out.push({ name: name as FlowName, ok, detail });
                };
                const guarded = (name: string, fn: () => boolean | string): void => {
                    try {
                        const r = fn();
                        if (typeof r === 'string') record(name, false, r);
                        else record(name, r, null);
                    } catch (err) {
                        record(name, false, String(err instanceof Error ? err.message : err));
                    }
                };

                const cfg = gt.CONFIG;
                const gameRef = gt.game;

                // ---------- CONFIG core document-class slots ----------
                guarded('config::Actor.documentClass', () => {
                    const cls = cfg?.Actor?.documentClass;
                    const name = (cls as { name?: string } | undefined)?.name;
                    return typeof cls === 'function' && typeof name === 'string' && name.length > 0 && name.includes('Actor');
                });
                guarded('config::Actor.documentClasses-map', () => {
                    const map = cfg?.Actor?.documentClasses;
                    if (map === undefined) return 'CONFIG.Actor.documentClasses is undefined';
                    const expected = ['dh2-character', 'dh2-npc', 'dh2-vehicle', 'rt-starship', 'bc-character', 'im-character', 'loot'];
                    const missing = expected.filter((k) => typeof map[k] !== 'function');
                    return missing.length === 0 ? true : `missing concrete classes: ${missing.join(', ')}`;
                });
                guarded('config::Item.documentClass', () => {
                    const cls = cfg?.Item?.documentClass;
                    const name = (cls as { name?: string } | undefined)?.name;
                    return typeof cls === 'function' && typeof name === 'string' && name.length > 0 && /Item/i.test(name);
                });
                guarded('config::ActiveEffect.documentClass', () => {
                    const cls = cfg?.ActiveEffect?.documentClass;
                    const name = (cls as { name?: string } | undefined)?.name;
                    return typeof cls === 'function' && typeof name === 'string' && name.length > 0;
                });
                guarded('config::ChatMessage.documentClass', () => {
                    const cls = cfg?.ChatMessage?.documentClass;
                    const name = (cls as { name?: string } | undefined)?.name;
                    return typeof cls === 'function' && typeof name === 'string' && name.length > 0;
                });
                guarded('config::Token.documentClass', () => {
                    const cls = cfg?.Token?.documentClass;
                    const name = (cls as { name?: string } | undefined)?.name;
                    return typeof cls === 'function' && typeof name === 'string' && name.length > 0;
                });
                guarded('config::Token.rulerClass', () => {
                    const cls = cfg?.Token?.rulerClass;
                    const name = (cls as { name?: string } | undefined)?.name;
                    return typeof cls === 'function' && typeof name === 'string' && name.length > 0;
                });
                guarded('config::Token.movement.costAggregator', () => {
                    const fn = cfg?.Token?.movement?.costAggregator;
                    if (typeof fn !== 'function') return 'costAggregator is not a function';
                    const v = fn([{ cost: 1 }, { cost: 5 }, { cost: 3 }], undefined, undefined);
                    return v === 5 ? true : `aggregator returned ${String(v)}; expected max=5`;
                });

                // ---------- CONFIG misc system-installed values ----------
                guarded('config::Combat.initiative.formula', () => {
                    const f = cfg?.Combat?.initiative?.formula;
                    return typeof f === 'string' && f.includes('initiative');
                });
                guarded('config::MeasuredTemplate.defaults.angle', () => cfg?.MeasuredTemplate?.defaults?.angle === 30);
                guarded('config::Dice.rolls.BasicRollWH40K', () => {
                    const rolls = cfg?.Dice?.rolls;
                    if (!Array.isArray(rolls)) return 'CONFIG.Dice.rolls is not an array';
                    return rolls.some((r) => r.name === 'BasicRollWH40K') ? true : 'BasicRollWH40K missing from CONFIG.Dice.rolls';
                });
                guarded('config::Dice.rolls.D100Roll', () => {
                    const rolls = cfg?.Dice?.rolls;
                    if (!Array.isArray(rolls)) return 'CONFIG.Dice.rolls is not an array';
                    return rolls.some((r) => r.name === 'D100Roll') ? true : 'D100Roll missing from CONFIG.Dice.rolls';
                });
                guarded('config::wh40k.config-installed', () => {
                    const w = cfg?.wh40k;
                    return w !== undefined && typeof w === 'object';
                });

                // ---------- Actor dataModels (per game-system prefix) ----------
                const actorDataModels: Record<string, DocCtor> = cfg?.Actor?.dataModels ?? {};
                for (const [prefix, types] of Object.entries(actorTypesByPrefixInner)) {
                    const key = `config::Actor.dataModels.${prefix}-all`;
                    guarded(key, () => {
                        const missing = types.filter((t) => typeof actorDataModels[t] !== 'function');
                        return missing.length === 0 ? true : `missing dataModels for: ${missing.join(', ')}`;
                    });
                }
                guarded('config::Actor.dataModels.loot', () => typeof actorDataModels['loot'] === 'function');

                // ---------- Item dataModels (by category) ----------
                const itemDataModels: Record<string, DocCtor> = cfg?.Item?.dataModels ?? {};
                for (const [category, types] of Object.entries(itemTypeCategoriesInner)) {
                    const key = `config::Item.dataModels.${category}`;
                    guarded(key, () => {
                        const missing = types.filter((t) => typeof itemDataModels[t] !== 'function');
                        return missing.length === 0 ? true : `missing dataModels for: ${missing.join(', ')}`;
                    });
                }

                // ---------- Actor sheetClasses (per game-system prefix) ----------
                const actorSheetClasses: Record<string, Record<string, SheetEntry> | undefined> = cfg?.Actor?.sheetClasses ?? {};
                for (const [prefix, types] of Object.entries(actorTypesByPrefixInner)) {
                    const key = `config::Actor.sheetClasses.${prefix}-all`;
                    guarded(key, () => {
                        const missing = types.filter((t) => {
                            const entry = actorSheetClasses[t];
                            return entry === undefined || Object.keys(entry).length === 0;
                        });
                        return missing.length === 0 ? true : `no registered sheets for: ${missing.join(', ')}`;
                    });
                }
                guarded('config::Actor.sheetClasses.loot', () => {
                    const entry = actorSheetClasses['loot'];
                    return entry !== undefined && Object.keys(entry).length > 0;
                });

                // ---------- Sheet hygiene: V14 anonymous-class collision guard ----------
                // Foundry V14's registerSheet receives factory-returned anonymous
                // classes that all carry `name = ''` and collide on the
                // sheetClasses map. The system fixes each with
                // `Object.defineProperty(cls, 'name', { value: '<Name>' })` — if
                // any registered sheet still has an empty class name, the V14
                // anonymous-class collision is present and silent.
                guarded('config::Actor.sheetClasses.no-anonymous-collisions', () => {
                    const anon: string[] = [];
                    for (const [type, sheets] of Object.entries(actorSheetClasses)) {
                        for (const [sheetId, entry] of Object.entries(sheets ?? {})) {
                            const cls = (entry as { cls?: { name?: string } } | undefined)?.cls;
                            const clsName = cls?.name;
                            if (clsName === undefined || clsName === '') {
                                anon.push(`${type}/${sheetId}`);
                            }
                        }
                    }
                    return anon.length === 0 ? true : `anonymous sheet classes found: ${anon.slice(0, 5).join(', ')}`;
                });

                const itemSheetClasses: Record<string, Record<string, SheetEntry>> = cfg?.Item?.sheetClasses ?? {};
                guarded('config::Item.sheetClasses.populated', () => {
                    const totalEntries = Object.values(itemSheetClasses).reduce((sum, sheets) => sum + Object.keys(sheets).length, 0);
                    return totalEntries > 0 ? true : 'CONFIG.Item.sheetClasses is empty';
                });
                guarded('config::Item.sheetClasses.no-anonymous-collisions', () => {
                    const anon: string[] = [];
                    for (const [type, sheets] of Object.entries(itemSheetClasses)) {
                        for (const [sheetId, entry] of Object.entries(sheets)) {
                            const cls = (entry as { cls?: { name?: string } } | undefined)?.cls;
                            const clsName = cls?.name;
                            if (clsName === undefined || clsName === '') {
                                anon.push(`${type}/${sheetId}`);
                            }
                        }
                    }
                    return anon.length === 0 ? true : `anonymous sheet classes found: ${anon.slice(0, 5).join(', ')}`;
                });

                // ---------- TextEditor enrichers ----------
                guarded('config::TextEditor.enrichers.populated', () => {
                    const enrichers = (cfg?.TextEditor?.enrichers ?? []) as Array<{ pattern?: RegExp | string }>;
                    if (!Array.isArray(enrichers) || enrichers.length === 0) return 'CONFIG.TextEditor.enrichers is empty';
                    // `registerCustomEnrichers` pushes 4 system patterns:
                    // /characteristic, /skill, /modifier, /armor. Each appears
                    // as a literal substring in its compiled RegExp source.
                    const required = ['characteristic', 'skill', 'modifier', 'armor'];
                    const sources = enrichers.map((e) => (e.pattern instanceof RegExp ? e.pattern.source : String(e.pattern ?? '')));
                    const missing = required.filter((needle) => !sources.some((s) => s.includes(needle)));
                    return missing.length === 0 ? true : `missing enricher patterns: ${missing.join(', ')}`;
                });

                // ---------- statusEffects ----------
                guarded('config::statusEffects.populated', () => {
                    const effects = (cfg?.statusEffects ?? []) as Array<{ id?: string; name?: string; img?: string; icon?: string }>;
                    if (!Array.isArray(effects) || effects.length === 0) return 'CONFIG.statusEffects is empty';
                    // Each entry should carry an `id` and either `name` (V12+)
                    // or `label` (V11), plus `img` (V12+) or `icon` (V11). The
                    // homologated condition list set up via the compendium
                    // resync should reach here as well.
                    const malformed = effects.filter((e) => typeof e.id !== 'string' || e.id.length === 0);
                    return malformed.length === 0 ? true : `${malformed.length} statusEffect entries missing an id`;
                });

                // ---------- game.wh40k namespace surface ----------
                const wh40k = gameRef?.wh40k;
                guarded('config::game.wh40k.namespace', () => wh40k !== undefined && typeof wh40k === 'object');
                guarded('config::game.wh40k.log', () => typeof wh40k?.['log'] === 'function');
                guarded('config::game.wh40k.warn', () => typeof wh40k?.['warn'] === 'function');
                guarded('config::game.wh40k.error', () => typeof wh40k?.['error'] === 'function');
                guarded('config::game.wh40k.rollItemMacro', () => typeof wh40k?.['rollItemMacro'] === 'function');
                guarded('config::game.wh40k.rollSkillMacro', () => typeof wh40k?.['rollSkillMacro'] === 'function');
                guarded('config::game.wh40k.rollCharacteristicMacro', () => typeof wh40k?.['rollCharacteristicMacro'] === 'function');
                guarded('config::game.wh40k.rollTable', () => {
                    const rt = wh40k?.['rollTable'];
                    return rt !== null && rt !== undefined && (typeof rt === 'object' || typeof rt === 'function');
                });
                guarded('config::game.wh40k.openCompendiumBrowser', () => typeof wh40k?.['openCompendiumBrowser'] === 'function');
                guarded('config::game.wh40k.OriginPathBuilder', () => {
                    const opb = wh40k?.['OriginPathBuilder'];
                    return typeof opb === 'function' || (typeof opb === 'object' && opb !== null);
                });
                guarded('config::game.wh40k.openOriginPathBuilder', () => typeof wh40k?.['openOriginPathBuilder'] === 'function');
                guarded('config::game.wh40k.npc', () => {
                    const npc = wh40k?.['npc'];
                    return npc !== null && npc !== undefined && typeof npc === 'object';
                });
                guarded('config::game.wh40k.dice', () => {
                    const d = wh40k?.['dice'];
                    return d !== null && d !== undefined && typeof d === 'object';
                });
                guarded('config::game.wh40k.BasicRollWH40K', () => typeof wh40k?.['BasicRollWH40K'] === 'function');
                guarded('config::game.wh40k.D100Roll', () => typeof wh40k?.['D100Roll'] === 'function');

                return out;
            },
            {
                foundryConfigFlowsInner: FOUNDRY_CONFIG_FLOWS,
                actorTypesByPrefixInner: ACTOR_TYPES_BY_PREFIX,
                itemTypeCategoriesInner: ITEM_TYPE_CATEGORIES,
            },
        );
        return { results, pageErrors };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('foundry CONFIG registration audit (Tier B)', () => {
    test('every CONFIG / collection / game.wh40k slot the system installs is present and well-typed', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeFoundryConfig(page);
        const seen = new Set<string>();
        const failures: string[] = [];
        for (const r of probe.results) {
            seen.add(r.name);
            if (r.ok) {
                recordCoverage('foundry-config.flow', r.name);
            } else {
                failures.push(`${r.name}: ${r.detail ?? 'failed'}`);
            }
        }
        for (const expected of FOUNDRY_CONFIG_FLOWS) {
            if (!seen.has(expected)) failures.push(`${expected}: flow did not run`);
        }
        if (probe.pageErrors.length > 0) {
            failures.push(`page errors: ${probe.pageErrors.slice(0, 5).join(' | ')}`);
        }

        expect(failures, `${failures.length}/${FOUNDRY_CONFIG_FLOWS.length} foundry-config flows failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
