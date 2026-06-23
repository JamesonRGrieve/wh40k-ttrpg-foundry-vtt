import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the NPC tooling pipeline:
 *   - `src/module/applications/npc/stat-block-parser.ts` — static parse()
 *     / parseJSON() / parseText() pipeline, including the validator
 *     branches that fire on any non-empty input.
 *   - `src/module/applications/npc/stat-block-exporter.ts` — static
 *     toJSON() / toText() round-trip against a real NPC actor.
 *   - `src/module/applications/npc/threat-scaler-dialog.ts` —
 *     constructor, render path, slider mutation, scale-up + scale-down
 *     against actor.update(). Drives ThreatCalculator.scaleToThreat()
 *     under coverage.
 *   - `src/module/applications/npc/difficulty-calculator-dialog.ts` —
 *     constructor + render + _getDifficultyRating() branches (every
 *     ratio bucket).
 *   - `src/module/applications/npc/encounter-builder.ts` — singleton
 *     show, programmatic addNPC() / clear(), getData() snapshot
 *     accounting across add / remove flows.
 *   - `src/module/applications/npc/combat-preset-dialog.ts` — library
 *     render, createPresetFromNPC + addPreset + getPreset + apply-back
 *     round-trip via the static API surface.
 *
 * `tests/e2e/combat.spec.ts` already renders the dialog shells for
 * coverage of the constructor + first-render path; this spec drives the
 * actual parsing / scaling / computation logic that no other spec hits.
 *
 * The dialog `.render(true)` calls are best-effort — the goal is to
 * exercise the underlying static API surface and DataModel updates, not
 * to round-trip the user-driven form submission. Render failures are
 * tolerated; only mutation-bearing assertions are gating.
 *
 * Strategy:
 *   - Single GM join.
 *   - Per-probe: seed an isolated NPC, run the flow, assert mutation,
 *     cleanup.
 *   - Collect-failures-then-assert so a single broken probe doesn't
 *     mask the others.
 *   - All module imports go through the deployed dist URLs (matching
 *     the dialogs.spec.ts pattern) so the v8 coverage capture in
 *     `lib/test.ts` picks them up under `/systems/wh40k-rpg/module/`.
 */

const NPC_MODULE_BASE = '/systems/wh40k-rpg/module/applications/npc';
const PARSER_URL = `${NPC_MODULE_BASE}/stat-block-parser.js`;
const EXPORTER_URL = `${NPC_MODULE_BASE}/stat-block-exporter.js`;
const SCALER_URL = `${NPC_MODULE_BASE}/threat-scaler-dialog.js`;
const DIFFICULTY_URL = `${NPC_MODULE_BASE}/difficulty-calculator-dialog.js`;
const BUILDER_URL = `${NPC_MODULE_BASE}/encounter-builder.js`;
const PRESET_URL = `${NPC_MODULE_BASE}/combat-preset-dialog.js`;
const THREAT_CALC_URL = `${NPC_MODULE_BASE}/threat-calculator.js`;

const FLOW_PARSER = 'stat-block-parser-imports-npc';
const FLOW_EXPORTER = 'stat-block-exporter-roundtrip';
const FLOW_SCALER = 'threat-scaler-up-and-down';
const FLOW_DIFFICULTY = 'difficulty-calculator-computes';
const FLOW_BUILDER = 'encounter-builder-add-remove-NPCs';
const FLOW_PRESET = 'combat-preset-save-and-load-library';

interface FlowResult {
    ok: boolean;
    error: string | null;
}

/**
 * Browser-side type surface shared by the `page.evaluate` probes below.
 * These describe only the slices of the runtime Foundry / NPC-tool APIs
 * that the probes actually touch — they are erased at compile time and
 * exist purely to type the in-page callbacks (which run in the browser,
 * where these declarations are not present).
 */
type DataValue = string | number | boolean | null | DataLeaf | DataLeaf[];
interface DataLeaf {
    [key: string]: DataValue;
}
type DocData = Record<string, DataValue>;

/** Minimal parsed-NPC payload the parser/exporter probes inspect. */
interface ParsedNPC {
    name?: string;
    system?: {
        threatLevel?: number;
        characteristics?: Record<string, { base?: number } | undefined>;
    };
}

interface ParseOutcome {
    data: ParsedNPC | null;
    errors: string[];
    warnings: string[];
}

interface ActorLike {
    id: string;
    uuid: string;
    system?: {
        threatLevel?: number;
        characteristics?: Record<string, { base?: number } | undefined>;
    };
    update: (data: DocData) => Promise<void>;
    delete?: () => Promise<void>;
}

interface ActorStatic {
    create?: (data: DocData) => Promise<ActorLike | null>;
}

interface ActorRegistryGlobal {
    Actor?: ActorStatic;
    game?: { actors?: { get?: (id: string) => ActorLike | null | undefined } };
}

/**
 * Sample DH2-style stat block text. Loose-format and minimal — the
 * parser is designed to tolerate sparse input. The validator will
 * surface warnings but produce a non-null `data` payload.
 */
const SAMPLE_STAT_BLOCK_TEXT = [
    'Probe Cultist',
    '',
    'WS BS S T Ag Int Per WP Fel Inf',
    '35 30 40 40 35 30 30 30 25 20',
    '',
    'Movement: 3/6/9/18',
    'Wounds: 12',
    'Threat Level: 5',
    '',
    'Skills: Awareness, Dodge, Stealth',
    '',
    'Weapons: Stub Revolver (Pistol; 30m; S/2/-; 1d10+2 I; Pen 0; Clip 6; Reload Full)',
    '',
    'Armour: Flak Jacket (Body 3)',
].join('\n');

/**
 * Register the `combatPresets` setting alias if missing. The
 * CombatPresetDialog reads `game.settings.get('wh40k-rpg', 'combatPresets')`
 * but the canonical registered key is `combat-presets` (the static
 * SETTING_KEY hardcodes the camelCase form — same caveat documented in
 * combat.spec.ts). Register the alias as a transient world setting so
 * the dialog's getPresets() doesn't throw.
 */
async function ensurePresetSetting(page: Page): Promise<void> {
    await page
        .evaluate(() => {
            interface SettingRegistration {
                scope: string;
                config: boolean;
                default: DataValue;
                type: ArrayConstructor;
            }
            interface SettingsGlobal {
                game?: {
                    settings?: {
                        settings?: { get?: (k: string) => object | undefined };
                        register?: (ns: string, key: string, opts: SettingRegistration) => void;
                    };
                };
            }
            // eslint-disable-next-line no-restricted-syntax -- named Foundry framework boundary: browser-side globalThis (game.settings)
            const g = globalThis as unknown as SettingsGlobal;
            const s = g.game?.settings;
            const registered = s?.settings?.get?.('wh40k-rpg.combatPresets');
            if (registered === undefined && typeof s?.register === 'function') {
                try {
                    s.register('wh40k-rpg', 'combatPresets', {
                        scope: 'world',
                        config: false,
                        default: [],
                        type: Array,
                    });
                } catch {
                    /* best-effort */
                }
            }
        })
        .catch(() => undefined);
}

/**
 * Probe 1 — StatBlockParser.parse() / quickParse() entry points.
 * Drives parseText() against a sample DH2 stat block and asserts that
 * the returned characteristics shape contains keys for the standard
 * characteristic set. The parser also routes JSON-shaped input through
 * parseJSON(); we exercise that branch too.
 */
async function probeParser(page: Page): Promise<FlowResult> {
    return page.evaluate(
        async ({ moduleUrl, text }): Promise<FlowResult> => {
            try {
                const mod = (await import(moduleUrl)) as {
                    default?: {
                        parse: (input: string) => ParseOutcome;
                        quickParse: (input: string) => ParseOutcome;
                        parseJSON: (input: string) => ParseOutcome;
                    };
                };
                const Parser = mod.default;
                if (typeof Parser?.parse !== 'function') {
                    return { ok: false, error: 'StatBlockParser.parse unavailable' };
                }

                // Text path — should produce a non-null data payload.
                const textResult = Parser.parse(text);
                if (textResult.data === null) {
                    return { ok: false, error: `parse(text) returned null data; errors=${textResult.errors.join('; ')}` };
                }

                const chars = textResult.data.system?.characteristics;
                if (chars === undefined) {
                    return { ok: false, error: 'parsed data missing system.characteristics' };
                }
                const charKeys = Object.keys(chars);
                if (charKeys.length === 0) {
                    return { ok: false, error: 'parsed characteristics empty' };
                }

                // JSON path — minimal valid system-data shape.
                const jsonInput = JSON.stringify({ characteristics: { weaponSkill: { base: 30 } }, threatLevel: 4 });
                const jsonResult = Parser.parseJSON(jsonInput);
                if (jsonResult.data === null) {
                    return { ok: false, error: `parseJSON returned null data; errors=${jsonResult.errors.join('; ')}` };
                }

                // quickParse is the no-dialog convenience wrapper.
                const quick = Parser.quickParse(text);
                if (quick.data === null) {
                    return { ok: false, error: 'quickParse returned null data' };
                }

                return { ok: true, error: null };
            } catch (err) {
                return { ok: false, error: `parser probe threw: ${String(err instanceof Error ? err.message : String(err))}` };
            }
        },
        { moduleUrl: PARSER_URL, text: SAMPLE_STAT_BLOCK_TEXT },
    );
}

/**
 * Probe 2 — StatBlockExporter round-trip. Create an NPC with known
 * characteristics, call StatBlockExporter.toJSON() + toText(), parse the
 * JSON back through StatBlockParser.parseJSON(), and assert the
 * characteristic base values survive the round-trip.
 */
async function probeExporter(page: Page): Promise<FlowResult> {
    return page.evaluate(
        async ({ exporterUrl, parserUrl }): Promise<FlowResult> => {
            // eslint-disable-next-line no-restricted-syntax -- named Foundry framework boundary: browser-side globalThis (Actor)
            const g = globalThis as unknown as ActorRegistryGlobal;
            const ActorClass = g.Actor;
            if (typeof ActorClass?.create !== 'function') return { ok: false, error: 'Actor.create unavailable' };

            let npc: ActorLike | null;
            try {
                npc = await ActorClass.create({
                    name: 'probe-exporter-npc',
                    type: 'bc-npc',
                    system: {
                        gameSystem: 'bc',
                        threatLevel: 7,
                        characteristics: {
                            weaponSkill: { base: 42, total: 42, short: 'WS' },
                            ballisticSkill: { base: 38, total: 38, short: 'BS' },
                        },
                        wounds: { value: 18, max: 18 },
                    },
                });
            } catch (err) {
                return { ok: false, error: `npc create failed: ${String(err instanceof Error ? err.message : String(err))}` };
            }
            if (npc === null) return { ok: false, error: 'npc create returned null' };

            try {
                const expMod = (await import(exporterUrl)) as {
                    default?: {
                        toJSON: (a: ActorLike, opts?: { includeItems?: boolean; prettyPrint?: boolean }) => string;
                        toText: (a: ActorLike) => string;
                    };
                };
                const Exp = expMod.default;
                if (typeof Exp?.toJSON !== 'function' || typeof Exp.toText !== 'function') {
                    return { ok: false, error: 'exporter static methods unavailable' };
                }

                const jsonOut = Exp.toJSON(npc, { includeItems: false, prettyPrint: false });
                if (typeof jsonOut !== 'string' || jsonOut === '') {
                    return { ok: false, error: 'toJSON produced empty output' };
                }
                const parsedExport = JSON.parse(jsonOut) as ParsedNPC;
                if (parsedExport.name !== 'probe-exporter-npc') {
                    return { ok: false, error: `exported name mismatch: ${parsedExport.name}` };
                }
                if (parsedExport.system?.threatLevel !== 7) {
                    return { ok: false, error: `threat level lost in export: ${parsedExport.system?.threatLevel}` };
                }

                const textOut = Exp.toText(npc);
                if (typeof textOut !== 'string' || !textOut.includes('PROBE-EXPORTER-NPC')) {
                    return { ok: false, error: 'toText did not include actor name header' };
                }

                // Round-trip the JSON back through the parser.
                const parserMod = (await import(parserUrl)) as { default?: { parseJSON: (s: string) => ParseOutcome } };
                const Parser = parserMod.default;
                if (typeof Parser?.parseJSON !== 'function') {
                    return { ok: false, error: 'StatBlockParser.parseJSON unavailable' };
                }
                const reparsed = Parser.parseJSON(jsonOut);
                if (reparsed.data === null) {
                    return { ok: false, error: `parseJSON round-trip failed: ${reparsed.errors.join('; ')}` };
                }
                const wsBase = reparsed.data.system?.characteristics?.['weaponSkill']?.base;
                if (wsBase !== 42) {
                    return { ok: false, error: `WS base did not survive round-trip: got ${wsBase}` };
                }

                return { ok: true, error: null };
            } catch (err) {
                return { ok: false, error: `exporter probe threw: ${String(err instanceof Error ? err.message : String(err))}` };
            } finally {
                try {
                    await npc.delete?.();
                } catch {
                    /* best-effort */
                }
            }
        },
        { exporterUrl: EXPORTER_URL, parserUrl: PARSER_URL },
    );
}

/**
 * Probe 3 — NPCThreatScalerDialog drives ThreatCalculator.scaleToThreat
 * with +1 then -1 deltas. We instantiate the dialog (exercising its
 * constructor + #originalThreat capture), render it (best-effort), then
 * call ThreatCalculator.scaleToThreat directly with the dialog's stored
 * actor.system to drive both directions of the scaling pipeline and
 * write the result back through actor.update(). That mirrors what the
 * dialog's #onSubmit handler does and exercises the same coverage
 * paths without needing to round-trip a form submission.
 */
async function probeScaler(page: Page): Promise<FlowResult> {
    return page.evaluate(
        async ({ scalerUrl, threatCalcUrl }): Promise<FlowResult> => {
            interface ScaleOptions {
                scaleCharacteristics: boolean;
                scaleWounds: boolean;
                scaleSkills: boolean;
                scaleWeapons: boolean;
                scaleArmour: boolean;
            }
            interface DialogInstance {
                render: (f: boolean) => Promise<void>;
                close: () => Promise<void>;
                element?: HTMLElement;
            }
            // eslint-disable-next-line no-restricted-syntax -- named Foundry framework boundary: browser-side globalThis (Actor, game)
            const g = globalThis as unknown as ActorRegistryGlobal;
            const ActorClass = g.Actor;
            if (typeof ActorClass?.create !== 'function') return { ok: false, error: 'Actor.create unavailable' };

            let npc: ActorLike | null;
            try {
                npc = await ActorClass.create({
                    name: 'probe-scaler-npc',
                    type: 'bc-npc',
                    system: {
                        gameSystem: 'bc',
                        threatLevel: 5,
                        characteristics: {
                            weaponSkill: { base: 30, total: 30, short: 'WS' },
                            ballisticSkill: { base: 30, total: 30, short: 'BS' },
                            strength: { base: 30, total: 30, short: 'S' },
                        },
                        wounds: { value: 10, max: 10 },
                        armour: { mode: 'simple', total: 4, locations: { head: 4, body: 4, leftArm: 4, rightArm: 4, leftLeg: 4, rightLeg: 4 } },
                        trainedSkills: {},
                        weapons: { simple: [] },
                    },
                });
            } catch (err) {
                return { ok: false, error: `npc create failed: ${String(err instanceof Error ? err.message : String(err))}` };
            }
            if (npc === null) return { ok: false, error: 'npc create returned null' };
            const actor = npc;

            try {
                const dialogMod = (await import(scalerUrl)) as {
                    default?: new (a: ActorLike) => DialogInstance;
                };
                const ScalerDialog = dialogMod.default;
                if (typeof ScalerDialog !== 'function') {
                    return { ok: false, error: 'NPCThreatScalerDialog default export not a constructor' };
                }

                const calcMod = (await import(threatCalcUrl)) as {
                    default?: { scaleToThreat: (sys: ActorLike['system'], cur: number, next: number, opts?: ScaleOptions) => DocData };
                };
                const Calc = calcMod.default;
                if (typeof Calc?.scaleToThreat !== 'function') {
                    return { ok: false, error: 'ThreatCalculator.scaleToThreat unavailable' };
                }

                // Construct the dialog — drives constructor + #originalThreat
                // capture from actor.system.threatLevel.
                let dialog: DialogInstance | null = null;
                try {
                    dialog = new ScalerDialog(actor);
                    await dialog.render(true).catch(() => undefined);
                    await new Promise<void>((r) => {
                        setTimeout(r, 30);
                    });
                } catch {
                    /* render is best-effort; the static-API drive below is what gates the probe */
                }

                const fetchActor = (): ActorLike | null | undefined => g.game?.actors?.get?.(actor.id);

                // Scale up: 5 → 6.
                const wsBefore = Number(fetchActor()?.system?.characteristics?.['weaponSkill']?.base ?? 0);
                const upUpdates = Calc.scaleToThreat(actor.system, 5, 6, {
                    scaleCharacteristics: true,
                    scaleWounds: true,
                    scaleSkills: true,
                    scaleWeapons: true,
                    scaleArmour: true,
                });
                const upPayload: DocData = {};
                for (const [k, v] of Object.entries(upUpdates)) {
                    upPayload[`system.${k}`] = v;
                }
                await actor.update(upPayload);
                const wsAfterUp = Number(fetchActor()?.system?.characteristics?.['weaponSkill']?.base ?? 0);
                if (wsAfterUp <= wsBefore) {
                    return { ok: false, error: `scale-up did not raise WS base: before=${wsBefore}, after=${wsAfterUp}` };
                }
                const threatAfterUp = Number(fetchActor()?.system?.threatLevel ?? 0);
                if (threatAfterUp !== 6) {
                    return { ok: false, error: `scale-up threatLevel mismatch: ${threatAfterUp}` };
                }

                // Scale down: 6 → 5.
                const refreshedSystem = fetchActor()?.system;
                const downUpdates = Calc.scaleToThreat(refreshedSystem, 6, 5, {
                    scaleCharacteristics: true,
                    scaleWounds: true,
                    scaleSkills: true,
                    scaleWeapons: true,
                    scaleArmour: true,
                });
                const downPayload: DocData = {};
                for (const [k, v] of Object.entries(downUpdates)) {
                    downPayload[`system.${k}`] = v;
                }
                await actor.update(downPayload);
                const wsAfterDown = Number(fetchActor()?.system?.characteristics?.['weaponSkill']?.base ?? 0);
                if (wsAfterDown >= wsAfterUp) {
                    return { ok: false, error: `scale-down did not lower WS base: after-up=${wsAfterUp}, after-down=${wsAfterDown}` };
                }

                if (dialog) {
                    try {
                        await dialog.close();
                    } catch {
                        /* ignore */
                    }
                }

                return { ok: true, error: null };
            } catch (err) {
                return { ok: false, error: `scaler probe threw: ${String(err instanceof Error ? err.message : String(err))}` };
            } finally {
                try {
                    await actor.delete?.();
                } catch {
                    /* best-effort */
                }
            }
        },
        { scalerUrl: SCALER_URL, threatCalcUrl: THREAT_CALC_URL },
    );
}

/**
 * Probe 4 — DifficultyCalculatorDialog drives the constructor +
 * _getDifficultyRating() branches by calling the private method against
 * known ratios (via dialog instance) to exercise every bucket.
 */
async function probeDifficulty(page: Page): Promise<FlowResult> {
    return page.evaluate(
        async ({ difficultyUrl }): Promise<FlowResult> => {
            // eslint-disable-next-line no-restricted-syntax -- named Foundry framework boundary: browser-side globalThis (Actor)
            const g = globalThis as unknown as ActorRegistryGlobal;
            const ActorClass = g.Actor;
            if (typeof ActorClass?.create !== 'function') return { ok: false, error: 'Actor.create unavailable' };

            let npc: ActorLike | null;
            try {
                npc = await ActorClass.create({
                    name: 'probe-difficulty-npc',
                    type: 'bc-npc',
                    system: { gameSystem: 'bc', threatLevel: 8 },
                });
            } catch (err) {
                return { ok: false, error: `npc create failed: ${String(err instanceof Error ? err.message : String(err))}` };
            }
            if (npc === null) return { ok: false, error: 'npc create returned null' };
            const actor = npc;

            try {
                const mod = (await import(difficultyUrl)) as {
                    default?: new (npc: ActorLike) => {
                        render: (f: boolean) => Promise<void>;
                        close: () => Promise<void>;
                        _getDifficultyRating: (ratio: number) => { key: string; label: string; color: string };
                    };
                };
                const DifficultyDialog = mod.default;
                if (typeof DifficultyDialog !== 'function') {
                    return { ok: false, error: 'DifficultyCalculatorDialog default export not a constructor' };
                }

                const dialog = new DifficultyDialog(actor);

                // Drive every bucket in _getDifficultyRating. Each call
                // covers one branch arm.
                // Bands (threat-utils DIFFICULTY_BANDS, ascending maxRatio): trivial ≤0.5,
                // easy ≤0.8, moderate ≤1.2, dangerous ≤1.6, deadly ≤2.0, else apocalyptic.
                const buckets = [
                    { ratio: 0.3, expected: 'trivial' },
                    { ratio: 0.7, expected: 'easy' },
                    { ratio: 1.0, expected: 'moderate' },
                    { ratio: 1.5, expected: 'dangerous' },
                    { ratio: 1.9, expected: 'deadly' },
                    { ratio: 2.5, expected: 'apocalyptic' },
                ];
                for (const b of buckets) {
                    const result = dialog._getDifficultyRating(b.ratio);
                    if (result.key !== b.expected) {
                        return { ok: false, error: `ratio ${b.ratio} → expected key ${b.expected}, got ${result.key}` };
                    }
                }

                // Best-effort render so _prepareContext executes against
                // a real party computation.
                try {
                    await dialog.render(true);
                    await new Promise<void>((r) => {
                        setTimeout(r, 30);
                    });
                } catch {
                    /* render is best-effort */
                }
                try {
                    await dialog.close();
                } catch {
                    /* ignore */
                }

                return { ok: true, error: null };
            } catch (err) {
                return { ok: false, error: `difficulty probe threw: ${String(err instanceof Error ? err.message : String(err))}` };
            } finally {
                try {
                    await actor.delete?.();
                } catch {
                    /* best-effort */
                }
            }
        },
        { difficultyUrl: DIFFICULTY_URL },
    );
}

/**
 * Probe 5 — EncounterBuilder programmatic addNPC + clear flow. Creates
 * three NPCs, adds them via addNPC(uuid), verifies count via getData(),
 * removes one (by clearing and re-adding the remaining two), and asserts
 * the count math.
 */
async function probeBuilder(page: Page): Promise<FlowResult> {
    return page.evaluate(
        async ({ builderUrl }): Promise<FlowResult> => {
            // eslint-disable-next-line no-restricted-syntax -- named Foundry framework boundary: browser-side globalThis (Actor, game)
            const g = globalThis as unknown as ActorRegistryGlobal;
            const ActorClass = g.Actor;
            if (typeof ActorClass?.create !== 'function') return { ok: false, error: 'Actor.create unavailable' };

            const createdIds: string[] = [];
            const npcUuids: string[] = [];
            for (let i = 0; i < 3; i++) {
                try {
                    const a = await ActorClass.create({
                        name: `probe-builder-npc-${i}`,
                        type: 'bc-npc',
                        system: { gameSystem: 'bc', threatLevel: 3 + i },
                    });
                    if (a === null) continue;
                    createdIds.push(a.id);
                    npcUuids.push(a.uuid);
                } catch {
                    /* skip — partial fixture still validates the API */
                }
            }
            if (npcUuids.length === 0) {
                return { ok: false, error: 'failed to create any builder fixture NPCs' };
            }

            try {
                const mod = (await import(builderUrl)) as {
                    default?: {
                        show: () => {
                            addNPC: (u: string, c?: number) => Promise<void>;
                            getData: () => { npcs: { count: number }[] };
                            clear: () => void;
                            close: () => Promise<void>;
                        };
                    };
                };
                const Builder = mod.default;
                if (typeof Builder?.show !== 'function') {
                    return { ok: false, error: 'EncounterBuilder.show unavailable' };
                }

                const builder = Builder.show();
                // Ensure a clean slate (singleton may retain state from
                // earlier specs — combat.spec.ts touches it).
                builder.clear();
                await new Promise<void>((r) => {
                    setTimeout(r, 20);
                });

                for (const uuid of npcUuids) {
                    await builder.addNPC(uuid, 1);
                }
                let snapshot = builder.getData();
                let totalCount = snapshot.npcs.reduce((s, n) => s + n.count, 0);
                if (totalCount !== npcUuids.length) {
                    return { ok: false, error: `expected ${npcUuids.length} NPCs after add, got ${totalCount}` };
                }

                // Remove one: clear + re-add all but the last. clear()
                // is the public removal surface; the per-row #removeNPC
                // action lives behind the UI.
                builder.clear();
                for (let i = 0; i < npcUuids.length - 1; i++) {
                    const uuid = npcUuids[i];
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.json types npcUuids[i] as string|undefined (guard required by tsc); the eslint parser project (tsconfig.test.json) has the flag off, so the guard reads as unnecessary here.
                    if (uuid !== undefined) await builder.addNPC(uuid, 1);
                }
                snapshot = builder.getData();
                totalCount = snapshot.npcs.reduce((s, n) => s + n.count, 0);
                const expectedAfter = npcUuids.length - 1;
                if (totalCount !== expectedAfter) {
                    return { ok: false, error: `expected ${expectedAfter} NPCs after remove, got ${totalCount}` };
                }

                // Final cleanup of singleton state so downstream specs
                // see an empty builder.
                builder.clear();
                try {
                    await builder.close();
                } catch {
                    /* ignore */
                }

                return { ok: true, error: null };
            } catch (err) {
                return { ok: false, error: `builder probe threw: ${String(err instanceof Error ? err.message : String(err))}` };
            } finally {
                for (const id of createdIds) {
                    try {
                        await g.game?.actors?.get?.(id)?.delete?.();
                    } catch {
                        /* best-effort */
                    }
                }
            }
        },
        { builderUrl: BUILDER_URL },
    );
}

/**
 * Probe 6 — CombatPresetDialog round-trip via static API:
 *   - showLibrary() (constructor + render)
 *   - createPresetFromNPC + addPreset (write)
 *   - getPresets + getPreset (read)
 *   - applyPresetToNPC (apply state back onto an NPC, verify mutation)
 *   - deletePresetById (cleanup so subsequent runs start fresh)
 */
async function probePreset(page: Page): Promise<FlowResult> {
    return page.evaluate(
        async ({ presetUrl }): Promise<FlowResult> => {
            type PresetData = Record<string, DataValue>;
            // eslint-disable-next-line no-restricted-syntax -- named Foundry framework boundary: browser-side globalThis (Actor, game)
            const g = globalThis as unknown as ActorRegistryGlobal;
            const ActorClass = g.Actor;
            if (typeof ActorClass?.create !== 'function') return { ok: false, error: 'Actor.create unavailable' };

            let sourceNPC: ActorLike | null;
            let targetNPC: ActorLike | null;
            try {
                sourceNPC = await ActorClass.create({
                    name: 'probe-preset-source',
                    type: 'bc-npc',
                    system: {
                        gameSystem: 'bc',
                        faction: 'Probe Faction',
                        type: 'troop',
                        role: 'specialist',
                        threatLevel: 9,
                        characteristics: { weaponSkill: { base: 50, total: 50, short: 'WS' } },
                        wounds: { value: 20, max: 20 },
                        movement: { half: 3, full: 6, charge: 9, run: 18 },
                        size: 4,
                        initiative: { value: 0 },
                        trainedSkills: {},
                        weapons: { simple: [] },
                        armour: { mode: 'simple', total: 5, locations: { head: 5, body: 5, leftArm: 5, rightArm: 5, leftLeg: 5, rightLeg: 5 } },
                        horde: { enabled: false },
                    },
                });
                targetNPC = await ActorClass.create({
                    name: 'probe-preset-target',
                    type: 'bc-npc',
                    system: {
                        gameSystem: 'bc',
                        faction: '',
                        type: 'troop',
                        role: 'support',
                        threatLevel: 1,
                        characteristics: { weaponSkill: { base: 25, total: 25, short: 'WS' } },
                        wounds: { value: 10, max: 10 },
                        movement: { half: 3, full: 6, charge: 9, run: 18 },
                        size: 4,
                        initiative: { value: 0 },
                        trainedSkills: {},
                        weapons: { simple: [] },
                        armour: { mode: 'simple', total: 0, locations: { head: 0, body: 0, leftArm: 0, rightArm: 0, leftLeg: 0, rightLeg: 0 } },
                        horde: { enabled: false },
                    },
                });
            } catch (err) {
                return { ok: false, error: `npc create failed: ${String(err instanceof Error ? err.message : String(err))}` };
            }
            if (sourceNPC === null || targetNPC === null) return { ok: false, error: 'npc create returned null' };
            const source = sourceNPC;
            const target = targetNPC;

            let createdPresetId: string | null = null;
            try {
                const mod = (await import(presetUrl)) as {
                    default?: {
                        showLibrary: () => { close: () => Promise<void> };
                        createPresetFromNPC: (npc: ActorLike, name: string, description?: string) => PresetData;
                        addPreset: (p: PresetData) => Promise<void>;
                        getPresets: () => Array<{ id: string; name: string }>;
                        getPreset: (id: string) => PresetData | null;
                        applyPresetToNPC: (npc: ActorLike, preset: PresetData) => Promise<void>;
                        deletePresetById: (id: string) => Promise<void>;
                    };
                };
                const PresetDialog = mod.default;
                if (typeof PresetDialog?.showLibrary !== 'function') {
                    return { ok: false, error: 'CombatPresetDialog.showLibrary unavailable' };
                }

                // Library mode render — exercises constructor (mode=library)
                // + _prepareContext.
                let lib: { close: () => Promise<void> } | null = null;
                try {
                    lib = PresetDialog.showLibrary();
                    await new Promise<void>((r) => {
                        setTimeout(r, 40);
                    });
                } catch {
                    /* render is best-effort */
                }

                const beforeCount = PresetDialog.getPresets().length;
                const preset = PresetDialog.createPresetFromNPC(source, 'probe-preset-name', 'probe-preset-description');
                await PresetDialog.addPreset(preset);

                const afterPresets = PresetDialog.getPresets();
                if (afterPresets.length !== beforeCount + 1) {
                    return { ok: false, error: `expected presets length ${beforeCount + 1}, got ${afterPresets.length}` };
                }
                const saved = afterPresets.find((p) => p.name === 'probe-preset-name');
                if (saved === undefined) {
                    return { ok: false, error: 'saved preset not found in getPresets()' };
                }
                createdPresetId = saved.id;

                const fetched = PresetDialog.getPreset(createdPresetId);
                if (fetched === null) {
                    return { ok: false, error: 'getPreset by id returned null after save' };
                }

                // Apply to target NPC — should mutate target.system.threatLevel
                // from 1 → 9 (source's value).
                await PresetDialog.applyPresetToNPC(target, fetched);
                const targetThreat = Number(g.game?.actors?.get?.(target.id)?.system?.threatLevel ?? 0);
                if (targetThreat !== 9) {
                    return { ok: false, error: `applyPresetToNPC did not transfer threatLevel: ${targetThreat}` };
                }

                if (lib) {
                    try {
                        await lib.close();
                    } catch {
                        /* ignore */
                    }
                }

                return { ok: true, error: null };
            } catch (err) {
                return { ok: false, error: `preset probe threw: ${String(err instanceof Error ? err.message : String(err))}` };
            } finally {
                if (createdPresetId !== null) {
                    try {
                        const m = (await import(presetUrl)) as { default?: { deletePresetById: (id: string) => Promise<void> } };
                        await m.default?.deletePresetById(createdPresetId);
                    } catch {
                        /* best-effort */
                    }
                }
                try {
                    await source.delete?.();
                } catch {
                    /* best-effort */
                }
                try {
                    await target.delete?.();
                } catch {
                    /* best-effort */
                }
            }
        },
        { presetUrl: PRESET_URL },
    );
}

test.describe.serial('npc tooling pipeline (Tier B)', () => {
    test('parser, exporter, threat scaler, difficulty, encounter builder, presets', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        await ensurePresetSetting(page);

        const probes: { flow: string; run: () => Promise<FlowResult> }[] = [
            { flow: FLOW_PARSER, run: async () => probeParser(page) },
            { flow: FLOW_EXPORTER, run: async () => probeExporter(page) },
            { flow: FLOW_SCALER, run: async () => probeScaler(page) },
            { flow: FLOW_DIFFICULTY, run: async () => probeDifficulty(page) },
            { flow: FLOW_BUILDER, run: async () => probeBuilder(page) },
            { flow: FLOW_PRESET, run: async () => probePreset(page) },
        ];

        const failures: string[] = [];
        for (const probe of probes) {
            const result = await probe.run();
            if (result.ok) {
                recordCoverage('npc-tool.flow', probe.flow);
            } else {
                failures.push(`${probe.flow}: ${result.error ?? 'unknown error'}`);
            }
        }

        expect(failures, `${failures.length} npc-tool flow(s) failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
