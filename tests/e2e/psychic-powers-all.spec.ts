import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, type Page, test as playwrightTest } from '@playwright/test';
import { installInPageHelpers } from './lib/in-page-helpers';
import { joinAsGM } from './lib/join';
import { scaledMs } from './lib/timing';

/**
 * Tier B content gate: cast EVERY psychic power in the locally checked-out
 * compendium packs through the real cast pipeline and check that each one
 * applies the focus test, targeting, damage and effects its OWN data declares.
 *
 * Pack discovery happens at collection time from disk (one Playwright test per
 * `*items-psychic-powers` pack under src/packs-private and src/packs). Inside a
 * test the live compendium index (`game.packs`) is walked in batched
 * `page.evaluate` calls; every expectation is derived from that power's own
 * on-disk source (materialized to its game line by the system's own
 * `materializeItemVariants`) — never from a name table (Direction #7).
 *
 * Per-power defects never fail this spec. They are recorded with a failure
 * CATEGORY in `.e2e-results/psychic-powers/packs/<pack>.json`;
 * `scripts/psychic-powers-ratchet.mjs` aggregates the run into
 * `.e2e-results/psychic-powers.json` and gates it (the passing count may not
 * fall, no category may grow). The spec fails only on HARNESS errors: the world
 * did not boot, a pack is missing from the world, or an evaluate threw outside
 * the per-power try/catch. One test is the exception by design: the cast-effects
 * guard casts a synthetic, content-agnostic power and FAILS the spec when the
 * apply step lands an effect on the wrong actor (or lands one on a failed cast).
 *
 * `PSYCHIC_POWER_LIMIT=<n>` caps the powers cast per pack for quick smoke runs;
 * a limited run is recorded as such and the ratchet refuses to gate on it.
 *
 * The browser-error guard from lib/test.ts is deliberately NOT used: a power
 * whose cast logs a console error is a content/pipeline defect recorded per
 * power (category `console-error`), not a harness failure.
 */

const REPO_ROOT = resolve(__dirname, '..', '..');
const PACK_ROOTS = [resolve(REPO_ROOT, 'src', 'packs-private'), resolve(REPO_ROOT, 'src', 'packs')];
const PACK_DIR_SUFFIX = 'items-psychic-powers';
const RESULTS_DIR = resolve(REPO_ROOT, '.e2e-results', 'psychic-powers', 'packs');
const SYSTEM_ID = 'wh40k-rpg';

/** Powers cast per page.evaluate — bounds one evaluate's wall time. */
const CAST_BATCH_SIZE = 8;

/** Base per-pack budget plus a per-power allowance (both scaled by E2E_TIMEOUT_SCALE). */
const PACK_BASE_BUDGET_MS = 120_000;
const PER_POWER_BUDGET_MS = 15_000;

/** The Psy Rating the seeded psyker carries; range expectations are computed at this PR. */
const SEED_PSY_RATING = 3;

/** Characteristic base for the psyker (every characteristic) and the target. */
const PSYKER_CHARACTERISTIC_BASE = 50;
const TARGET_CHARACTERISTIC_BASE = 20;

/**
 * `CONFIG.Dice.randomUniform` value forcing every die low: Foundry maps a
 * uniform `u` to `ceil((1 - u) * faces)`, so 0.955 → d100 = 5, d10 = 1. A 05 is
 * not a double, so it never triggers phenomena on its own.
 */
const FORCED_UNIFORM = 0.955;
const FORCED_D100 = 5;

/** Every failure category the gate tracks (zero-filled in each pack's counts). */
const FAILURE_CATEGORIES = [
    'load-error',
    'focus-unstructured',
    'activation-undeclared',
    'target-undeclared',
    'range-unresolvable',
    'attack-flag-mismatch',
    'sustained-unstructured',
    'cast-error',
    'console-error',
    'card-mismatch',
    'opposed-not-triggered',
    'card-target-missing',
    'range-mismatch',
    'damage-mismatch',
    'effect-unstructured',
    'effect-not-applied',
] as const;
type FailureCategory = (typeof FAILURE_CATEGORIES)[number];

type Json = string | number | boolean | null | Json[] | JsonObject;
interface JsonObject {
    [key: string]: Json | undefined;
}

interface PowerFailure {
    category: FailureCategory;
    reason: string;
}

interface PowerDiagnostics {
    /** The on-disk `focusPower` was prose; the live document's structured value it became. */
    focusStringCoerced: { raw: string; liveCharacteristic: string; liveModifier: number } | null;
    /** The on-disk `range` was declared but the live document carries none. */
    rangeDroppedAtRuntime: boolean;
}

interface PowerResult {
    uuid: string;
    name: string;
    pack: string;
    line: string;
    pass: boolean;
    failures: PowerFailure[];
    diagnostics: PowerDiagnostics;
}

interface PackResultFile {
    runId: string;
    generatedAt: string;
    pack: string;
    limit: number | null;
    indexCount: number;
    passing: number;
    categories: Partial<Record<FailureCategory, number>>;
    powers: PowerResult[];
}

interface LocalPack {
    name: string;
    /** On-disk psychicPower sources keyed by `_id`. */
    sources: Map<string, JsonObject>;
}

/* -------------------------------------------- */
/*  Collection-time discovery (Node side)        */
/* -------------------------------------------- */

function isJsonObject(value: Json | undefined): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Where a `{ "reference": … }` stub points, resolved exactly as the pack builder
 * does (gulpfile.js `resolveReferencePath`): `packs/…` and `src/packs/…` name a
 * sibling pack inside the stub's own pack root, `src/…` is repo-relative, anything
 * else is relative to the stub file.
 */
function referenceTarget(reference: string, fromFile: string, packRoot: string): string {
    if (reference.startsWith('/')) return reference;
    if (reference.startsWith('packs/')) return resolve(packRoot, reference.slice('packs/'.length));
    if (reference.startsWith('src/packs/')) return resolve(packRoot, reference.slice('src/packs/'.length));
    if (reference.startsWith('src/')) return resolve(REPO_ROOT, reference);
    return resolve(fromFile, '..', reference);
}

/**
 * Read one pack source file, following reference stubs to the canonical body
 * (the stub's own keys override it, as in the built pack). Null when the chain
 * is broken or circular — the live index then has no matching raw source.
 */
function readPackDocument(file: string, packRoot: string, seen: ReadonlySet<string> = new Set()): JsonObject | null {
    if (seen.has(file)) return null;
    let parsed: Json;
    try {
        parsed = JSON.parse(readFileSync(file, 'utf8')) as Json;
    } catch {
        return null;
    }
    if (!isJsonObject(parsed)) return null;
    const { reference, ...overrides } = parsed;
    if (typeof reference !== 'string') return parsed;
    const canonical = readPackDocument(referenceTarget(reference, file, packRoot), packRoot, new Set([...seen, file]));
    return canonical === null ? null : { ...canonical, ...overrides };
}

function readPackSources(dir: string, packRoot: string): Map<string, JsonObject> {
    const sources = new Map<string, JsonObject>();
    const sourceDir = resolve(dir, '_source');
    let files: string[];
    try {
        files = readdirSync(sourceDir).filter((f) => f.endsWith('.json'));
    } catch {
        return sources;
    }
    for (const file of files) {
        const parsed = readPackDocument(resolve(sourceDir, file), packRoot);
        if (parsed === null) continue;
        const id = parsed['_id'];
        if (parsed['type'] === 'psychicPower' && typeof id === 'string') sources.set(id, parsed);
    }
    return sources;
}

function listSubdirs(dir: string): string[] {
    try {
        return readdirSync(dir, { withFileTypes: true })
            .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
            .map((d) => d.name);
    } catch {
        return [];
    }
}

function discoverLocalPacks(): LocalPack[] {
    const packs: LocalPack[] = [];
    for (const root of PACK_ROOTS) {
        for (const line of listSubdirs(root)) {
            for (const name of listSubdirs(resolve(root, line)).filter((n) => n.endsWith(PACK_DIR_SUFFIX))) {
                packs.push({ name, sources: readPackSources(resolve(root, line, name), root) });
            }
        }
    }
    return packs.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The game line a pack belongs to, from the pack naming convention
 * (`<line>-<book>-…`, homebrew `hb-<line>-…`). Used only when a power declares
 * no `gameSystems` of its own.
 */
function packLine(packName: string): string {
    const [head = '', second = ''] = packName.split('-');
    return head === 'hb' ? second : head;
}

/** A power's game line: its own first `gameSystems` entry, else its pack's line. */
function lineOf(packName: string, raw: JsonObject | undefined): string {
    const system = raw?.['system'];
    const systems = isJsonObject(system) ? system['gameSystems'] : undefined;
    const first = Array.isArray(systems) ? systems.at(0) : undefined;
    return typeof first === 'string' && first !== '' ? first : packLine(packName);
}

function readPowerLimit(): number | null {
    const raw = process.env['PSYCHIC_POWER_LIMIT'];
    if (raw === undefined || raw.trim() === '') return null;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
}

/** Identifies one Playwright run: every worker is forked by the same runner process. */
const RUN_ID = String(process.ppid);
const POWER_LIMIT = readPowerLimit();
const LOCAL_PACKS = discoverLocalPacks();

function countCategories(powers: readonly PowerResult[]): Partial<Record<FailureCategory, number>> {
    const counts: Partial<Record<FailureCategory, number>> = {};
    for (const category of FAILURE_CATEGORIES) counts[category] = 0;
    for (const power of powers) {
        // A power counts once per category it fails, however many reasons it has there.
        for (const category of new Set(power.failures.map((f) => f.category))) counts[category] = (counts[category] ?? 0) + 1;
    }
    return counts;
}

function writePackResults(file: PackResultFile): void {
    mkdirSync(RESULTS_DIR, { recursive: true });
    const target = resolve(RESULTS_DIR, `${file.pack}.json`);
    const tmp = `${target}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
    renameSync(tmp, target);
}

/* -------------------------------------------- */
/*  In-page probes                               */
/* -------------------------------------------- */

interface IndexEntry {
    id: string;
    name: string;
}

interface IndexProbe {
    packFound: boolean;
    entries: IndexEntry[];
}

/** Read the live compendium index for one pack, psychic powers only. */
async function readPackIndex(page: Page, packId: string): Promise<IndexProbe> {
    return page.evaluate(async (id: string): Promise<IndexProbe> => {
        interface IndexRow {
            _id: string;
            name: string;
            type: string;
        }
        interface PackLike {
            getIndex: (opts: { fields: string[] }) => Promise<{ contents: IndexRow[] }>;
        }
        interface Globals {
            game: { packs: { get: (packId: string) => PackLike | undefined } };
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global is injected by the licensed app; no shipped types inside page.evaluate
        const g = globalThis as unknown as Globals;
        const pack = g.game.packs.get(id);
        if (pack === undefined) return { packFound: false, entries: [] };
        const helpers = globalThis.wh40kE2E;
        const index = await helpers.withTimeout(pack.getIndex({ fields: ['type'] }), `index ${id}`, helpers.scaledMs(30_000));
        const entries = index.contents
            .filter((row) => row.type === 'psychicPower')
            .map((row) => ({ id: row._id, name: row.name }))
            .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
        return { packFound: true, entries };
    }, packId);
}

interface CastPower {
    id: string;
    name: string;
    line: string;
    /**
     * The power's on-disk source as JSON text (null when absent from disk). Text,
     * not an object, because Playwright's recursive argument typing cannot
     * instantiate a recursive JSON type.
     */
    rawJson: string | null;
}

interface CastArgs {
    systemId: string;
    packId: string;
    packName: string;
    seedPsyRating: number;
    psykerBase: number;
    targetBase: number;
    forcedUniform: number;
    forcedD100: number;
    powers: CastPower[];
}

/**
 * Cast a batch of powers in-page. Self-contained (serialized by Playwright):
 * everything it needs is in `args` or imported from the deployed system modules.
 * Each power runs inside its own try/catch; only a failure OUTSIDE that loop
 * (module import, settings) rejects the evaluate as a harness error.
 */
async function inPageCastBatch(args: CastArgs): Promise<PowerResult[]> {
    type JsonIn = string | number | boolean | null | JsonIn[] | JsonObj;
    interface JsonObj {
        [key: string]: JsonIn | undefined;
    }
    interface Characteristic {
        total: number;
        short: string;
    }
    interface EffectLike {
        id: string;
        name: string;
        origin: string | null;
        /** Foundry V14 shape; a legacy `{rounds}` source migrates into `value` + `units`. */
        duration: { value: number | null; units: string | null };
    }
    interface FieldLike {
        choices?: string[] | Record<string, string> | (() => string[] | Record<string, string>);
        fields?: Record<string, FieldLike | undefined>;
    }
    interface PowerSystem {
        focusPower: { characteristic: string; modifier: number };
        range?: string | number | null;
        schema: { fields: Record<string, FieldLike | undefined> };
    }
    interface ItemLike {
        id: string;
        uuid: string;
        system: PowerSystem;
    }
    interface ActorLike {
        id: string;
        name: string;
        system: { characteristics: Record<string, Characteristic | undefined>; wounds?: { value: number }; corruption?: number };
        items: { get: (id: string) => ItemLike | undefined };
        effects: { contents: EffectLike[] };
        createEmbeddedDocuments: (type: string, data: JsonObj[]) => Promise<Array<{ id: string }>>;
        deleteEmbeddedDocuments: (type: string, ids: string[]) => Promise<object[]>;
        update: (data: JsonObj) => Promise<object>;
        /** Acolytes only: a skill's current target and label. */
        getSkillFuzzy?: (skill: string) => { current: number; label?: string } | null | undefined;
    }
    interface PackDoc {
        system: PowerSystem;
    }
    interface StoredAction {
        rollData: {
            power?: { id: string };
            baseTarget: number;
            baseChar: string;
            modifierSources: Array<{ value: number }>;
            success: boolean;
            isOpposed: boolean;
            opposedRoll?: object | null;
            targetActor: { id: string } | null;
            maxRange: number;
            roll?: { total: number } | null;
        };
        damageData?: { hits: Array<{ damageType: string; penetration: number; damageRoll?: { formula: string } }> };
    }
    interface DialogLike {
        rendered: boolean;
        actionData?: { rollData?: { psychicPowers?: Array<{ id: string }> } };
        _systemRoll: () => Promise<void>;
        close: () => Promise<void>;
    }
    interface MessageLike {
        id: string;
        content: string;
    }
    interface SeededPair {
        psyker: ActorLike;
        target: ActorLike;
    }
    interface Globals {
        game: {
            actors: { get: (id: string) => ActorLike | undefined };
            items: { fromCompendium: (doc: PackDoc) => JsonObj };
            messages: { contents: MessageLike[] };
            packs: { get: (id: string) => { getDocument: (id: string) => Promise<PackDoc | null | undefined> } | undefined };
            settings: { get: (ns: string, key: string) => boolean; set: (ns: string, key: string, v: boolean) => Promise<boolean> };
        };
        CONFIG: { Dice: { randomUniform: () => number }; Actor: { dataModels: Record<string, object | undefined> } };
        Actor: { create: (data: JsonObj) => Promise<ActorLike | null | undefined> };
        ChatMessage: { deleteDocuments: (ids: string[]) => Promise<object[]> };
        foundry: { applications: { instances: Map<string, object> } };
        psychicGateActors?: Map<string, { psyker: string; target: string }>;
    }
    interface VariantModule {
        materializeItemVariants: (source: JsonObj, line: string) => JsonObj;
    }
    interface RangeModule {
        parsePsychicRange: (raw: string | number | null | undefined, psyRating: number) => number | null;
    }
    interface TargetedModule {
        DHTargetedActionManager: { performPsychicCast: (source: ActorLike, target: ActorLike | null, power: ItemLike) => void };
    }
    interface BasicModule {
        DHBasicActionManager: { storedRolls: Record<string, StoredAction> };
    }
    interface DialogModule {
        default: abstract new (...a: never[]) => object;
    }
    /** Everything derived from the power's own (materialized) data before the cast. */
    interface Declared {
        focusKey: string | null;
        /** A skill focus test (Psyniscience, Awareness); rolled instead of `focusKey`. */
        focusSkill: string | null;
        focusModifier: number | null;
        opposed: boolean;
        targetType: string | null;
        rangeText: string;
        rangeMetres: number | null;
        isAttack: boolean;
        damageFormula: string;
        damageType: string;
        damagePenetration: number;
        castEffects: JsonObj[];
        hasStructuredEffect: boolean;
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals (game, CONFIG, Actor, ChatMessage, foundry) are injected by the licensed app; no shipped types inside page.evaluate
    const g = globalThis as unknown as Globals;
    const helpers = globalThis.wh40kE2E;
    const moduleRoot = `/systems/${args.systemId}/module`;
    const variants = (await import(/* @vite-ignore */ `${moduleRoot}/utils/item-variant-utils.js`)) as VariantModule;
    const ranges = (await import(/* @vite-ignore */ `${moduleRoot}/rules/psychic-range.js`)) as RangeModule;
    const targeted = (await import(/* @vite-ignore */ `${moduleRoot}/actions/targeted-action-manager.js`)) as TargetedModule;
    const basic = (await import(/* @vite-ignore */ `${moduleRoot}/actions/basic-action-manager.js`)) as BasicModule;
    const dialogModule = (await import(/* @vite-ignore */ `${moduleRoot}/applications/prompts/unified-roll-dialog.js`)) as DialogModule;

    const isObj = (v: JsonIn | undefined): v is JsonObj => typeof v === 'object' && v !== null && !Array.isArray(v);
    const nonEmpty = (v: JsonIn | undefined): boolean => (Array.isArray(v) ? v.length > 0 : isObj(v) && Object.keys(v).length > 0);
    const describe = (v: JsonIn | undefined): string => (v === undefined ? 'absent' : JSON.stringify(v).slice(0, 120));
    const errorText = (err: Error | string | number | object): string =>
        err instanceof Error ? err.message : typeof err === 'object' ? JSON.stringify(err) : String(err);
    const choicesOf = (field: FieldLike | undefined): string[] => {
        const raw = typeof field?.choices === 'function' ? field.choices() : field?.choices;
        if (raw === undefined) return [];
        return Array.isArray(raw) ? raw : Object.keys(raw);
    };
    const textTokens = (html: string): string[] =>
        new DOMParser()
            .parseFromString(html, 'text/html')
            .body.textContent.split(/\s+/)
            .filter((t) => t !== '');
    const diceTerms = (formula: string): string[] => (formula.toLowerCase().match(/\d*d\d+/g) ?? []).map((t) => (t.startsWith('d') ? `1${t}` : t)).sort();

    /* -- Seed one psyker + one target per game line (reused across batches) -- */
    const seeded = g.psychicGateActors ?? new Map<string, { psyker: string; target: string }>();
    g.psychicGateActors = seeded;
    const seedActor = async (type: string, name: string, characteristicBase: number, psy: boolean): Promise<ActorLike | null> => {
        const created = await helpers.withTimeout(g.Actor.create({ name, type }), `create ${type}`);
        if (created === null || created === undefined) return null;
        const update: JsonObj = {};
        for (const key of Object.keys(created.system.characteristics)) update[`system.characteristics.${key}.base`] = characteristicBase;
        if (psy) update['system.psy.rating'] = args.seedPsyRating;
        // A BC Corruption Test focus rolls against the Corruption total; seed it like a
        // characteristic so a forced success is a success on every focus key.
        if (psy && typeof created.system.corruption === 'number') update['system.corruption'] = characteristicBase;
        await helpers.withTimeout(created.update(update), `seed ${type}`);
        return created;
    };
    const actorsForLine = async (line: string): Promise<SeededPair | string> => {
        const known = seeded.get(line);
        const knownPsyker = known === undefined ? undefined : g.game.actors.get(known.psyker);
        const knownTarget = known === undefined ? undefined : g.game.actors.get(known.target);
        if (knownPsyker !== undefined && knownTarget !== undefined) return { psyker: knownPsyker, target: knownTarget };
        const psykerType = `${line}-character`;
        const targetType = `${line}-npc`;
        if (g.CONFIG.Actor.dataModels[psykerType] === undefined || g.CONFIG.Actor.dataModels[targetType] === undefined) {
            return `no ${psykerType}/${targetType} actor type registered for line '${line}'`;
        }
        const psyker = await seedActor(psykerType, `Psychic Gate Psyker (${line})`, args.psykerBase, true);
        const target = await seedActor(targetType, `Psychic Gate Target (${line})`, args.targetBase, false);
        if (psyker === null || target === null) return `could not create ${psykerType}/${targetType}`;
        seeded.set(line, { psyker: psyker.id, target: target.id });
        return { psyker, target };
    };

    const resolveCharacteristic = (actor: ActorLike, key: string): Characteristic | undefined => {
        const entries = Object.entries(actor.system.characteristics);
        const byKey = entries.find(([k]) => k.toLowerCase() === key.toLowerCase())?.[1];
        return byKey ?? entries.map(([, c]) => c).find((c) => c?.short.toUpperCase() === key.toUpperCase());
    };
    /**
     * What a focus test rolls against, as the code resolves it: a declared skill,
     * else a characteristic, else a numeric actor stat the book tests like one
     * (BC's Corruption Test).
     */
    const resolveFocusBase = (actor: ActorLike, skill: string | null, key: string): { total: number; short: string | null } | undefined => {
        if (skill !== null) {
            const s = actor.getSkillFuzzy?.(skill);
            return s === null || s === undefined ? undefined : { total: s.current, short: null };
        }
        const c = resolveCharacteristic(actor, key);
        if (c !== undefined) return { total: c.total, short: c.short };
        const stat = key === 'corruption' ? actor.system.corruption : undefined;
        return typeof stat === 'number' ? { total: stat, short: null } : undefined;
    };

    const findDialog = (powerId: string): DialogLike | null => {
        for (const app of g.foundry.applications.instances.values()) {
            if (!(app instanceof dialogModule.default)) continue;
            const dialog = app as DialogLike;
            if (dialog.actionData?.rollData?.psychicPowers?.some((p) => p.id === powerId) === true) return dialog;
        }
        return null;
    };

    /**
     * Structure checks over the power's materialized data. Records failures and
     * returns the declared expectations the cast is then held to.
     */
    const checkStructure = (
        m: JsonObj,
        rawDoc: JsonObj,
        doc: PackDoc,
        charKeys: string[],
        isFocusStat: (key: string) => boolean,
        fail: (c: FailureCategory, r: string) => void,
    ): Declared => {
        const schemaFields = doc.system.schema.fields;
        const focusDecl = m['focusPower'];
        let focusKey: string | null = null;
        let focusSkill: string | null = null;
        let focusModifier: number | null = null;
        let opposed = false;
        if (!isObj(focusDecl)) {
            fail(
                'focus-unstructured',
                `focusPower is ${typeof focusDecl === 'string' ? `prose "${focusDecl}"` : describe(focusDecl)}, not a structured object`,
            );
        } else {
            const problems: string[] = [];
            const characteristic = focusDecl['characteristic'];
            const modifier = focusDecl['modifier'];
            const threshold = focusDecl['threshold'];
            const opposedChar = focusDecl['opposedCharacteristic'];
            const skill = focusDecl['skill'];
            const hasSkill = typeof skill === 'string' && skill !== '';
            if (!hasSkill && (typeof characteristic !== 'string' || !(charKeys.includes(characteristic) || isFocusStat(characteristic))))
                problems.push(`characteristic ${describe(characteristic)} is not a characteristic key, and no focus skill is declared`);
            if (typeof modifier !== 'number' || !Number.isInteger(modifier)) problems.push(`modifier ${describe(modifier)} is not an integer`);
            if (threshold !== undefined && threshold !== null && typeof threshold !== 'number')
                problems.push(`threshold ${describe(threshold)} is not a number`);
            if (typeof focusDecl['opposed'] !== 'boolean') problems.push(`opposed ${describe(focusDecl['opposed'])} is not a boolean`);
            if (opposedChar !== undefined && opposedChar !== '' && (typeof opposedChar !== 'string' || !charKeys.includes(opposedChar))) {
                problems.push(`opposedCharacteristic ${describe(opposedChar)} is not a characteristic key`);
            }
            if (problems.length > 0) {
                fail('focus-unstructured', problems.join('; '));
            } else {
                focusKey = typeof characteristic === 'string' ? characteristic : null;
                focusSkill = hasSkill ? skill : null;
                focusModifier = typeof modifier === 'number' ? modifier : null;
                opposed = focusDecl['opposed'] === true;
            }
        }

        const activation = m['activation'];
        const activationType = isObj(activation) ? activation['type'] : undefined;
        if (typeof activationType !== 'string' || !choicesOf(schemaFields['activation']?.fields?.['type']).includes(activationType)) {
            fail('activation-undeclared', `activation.type ${describe(activationType)} (prose action: ${describe(m['action'])})`);
        }

        const targetDecl = m['target'];
        const targetDeclType = isObj(targetDecl) ? targetDecl['type'] : undefined;
        const targetType =
            typeof targetDeclType === 'string' && choicesOf(schemaFields['target']?.fields?.['type']).includes(targetDeclType) ? targetDeclType : null;
        if (targetType === null) fail('target-undeclared', `target.type ${describe(targetDeclType)}`);

        const rangeDecl = m['range'];
        const rangeMetres = typeof rangeDecl === 'string' || typeof rangeDecl === 'number' ? ranges.parsePsychicRange(rangeDecl, args.seedPsyRating) : null;
        if (rangeMetres === null) fail('range-unresolvable', `range ${describe(rangeDecl)} does not resolve to metres at PR ${args.seedPsyRating}`);

        const damageDecl = isObj(m['damage']) ? m['damage'] : {};
        const formula = damageDecl['formula'];
        const damageFormula = typeof formula === 'string' ? formula.trim() : '';
        const isAttack = m['isAttack'] === true;
        if (damageFormula !== '' && !isAttack)
            fail('attack-flag-mismatch', `damage.formula "${damageFormula}" declared but isAttack is ${describe(m['isAttack'])}`);
        if (isAttack && damageFormula === '') fail('attack-flag-mismatch', 'isAttack is true but no damage.formula is declared');

        if (typeof m['sustained'] !== 'boolean') fail('sustained-unstructured', `sustained is ${describe(m['sustained'])}, not a boolean`);

        const rawEffects = rawDoc['effects'];
        const castEffects = (Array.isArray(rawEffects) ? rawEffects.filter(isObj) : []).filter((e) => e['transfer'] !== true);
        const hasStructuredEffect = castEffects.length > 0 || nonEmpty(m['modifiers']) || nonEmpty(m['dynamicModifiers']) || nonEmpty(m['conditions']);
        // A power whose book prints no mechanic is marked narrativeEffect and needs none.
        const narrative = m['narrativeEffect'] === true;
        if (!hasStructuredEffect && !isAttack && !narrative)
            fail(
                'effect-unstructured',
                'non-attack power declares no ActiveEffect, modifiers, dynamicModifiers or conditions (and is not marked narrativeEffect)',
            );

        const damageType = damageDecl['type'];
        const damagePenetration = damageDecl['penetration'];
        return {
            focusKey,
            focusSkill,
            focusModifier,
            opposed,
            targetType,
            rangeText: describe(rangeDecl),
            rangeMetres,
            isAttack,
            damageFormula,
            damageType: typeof damageType === 'string' ? damageType : '',
            damagePenetration: typeof damagePenetration === 'number' ? damagePenetration : 0,
            castEffects,
            hasStructuredEffect,
        };
    };

    /**
     * Hold the resolved cast (action + posted cards) to the declared expectations.
     * `cardHtml` is null when the cast stored its roll state but posted no card
     * (it threw mid-resolution): the roll-state checks still run, the
     * rendered-card checks are skipped (the missing card is already a cast-error).
     */
    const checkResolvedCast = (
        action: StoredAction,
        cardHtml: string | null,
        declared: Declared,
        item: ItemLike,
        pair: SeededPair,
        castTarget: ActorLike | null,
        effectsBefore: Set<string>,
        fail: (c: FailureCategory, r: string) => void,
    ): void => {
        const rd = action.rollData;
        const tokens = cardHtml === null ? null : textTokens(cardHtml);

        // Focus test: characteristic + modifier with provenance.
        const focusKey = declared.focusKey ?? item.system.focusPower.characteristic;
        const focusModifier = declared.focusModifier ?? item.system.focusPower.modifier;
        const focusName = declared.focusSkill ?? focusKey;
        const expected = resolveFocusBase(pair.psyker, declared.focusSkill, focusKey);
        if (expected === undefined) {
            fail('card-mismatch', `focus test '${focusName}' does not resolve on the psyker`);
        } else {
            if (rd.baseTarget !== expected.total) fail('card-mismatch', `focus base target ${rd.baseTarget}, expected ${focusName} ${expected.total}`);
            // A characteristic shows its short label; a skill or stat shows its own label.
            if (expected.short !== null && rd.baseChar !== expected.short)
                fail('card-mismatch', `focus characteristic on card '${rd.baseChar}', expected '${expected.short}'`);
            if (tokens !== null && !tokens.includes(String(expected.total)))
                fail('card-mismatch', `card does not show the ${focusName} base ${expected.total}`);
        }
        if (focusModifier !== 0 && !rd.modifierSources.some((c) => c.value === focusModifier)) {
            fail('card-mismatch', `focus modifier ${focusModifier} has no provenance row on the card`);
        }
        if (!rd.success && rd.roll?.total === args.forcedD100)
            fail('card-mismatch', `focus test failed on a forced ${args.forcedD100} (base ${rd.baseTarget})`);

        // Opposed test when the data declares one.
        if (declared.opposed && castTarget !== null && (!rd.isOpposed || rd.opposedRoll === undefined || rd.opposedRoll === null)) {
            fail('opposed-not-triggered', 'focusPower.opposed is true but no opposed test was rolled');
        }

        // Target recorded on the card.
        if (castTarget !== null) {
            if (rd.targetActor?.id !== castTarget.id) fail('card-target-missing', 'the cast did not record the target actor');
            else if (cardHtml !== null && !cardHtml.includes(castTarget.name)) fail('card-target-missing', 'the chat card does not name the target');
        }

        // Range shown matches the data's range at the seeded PR.
        if (declared.rangeMetres !== null && rd.maxRange !== declared.rangeMetres) {
            fail('range-mismatch', `cast range ${rd.maxRange}m, data declares ${declared.rangeText} = ${declared.rangeMetres}m at PR ${args.seedPsyRating}`);
        }

        // Damage: attack powers roll the data's damage; others roll none.
        const hits = action.damageData?.hits ?? [];
        const hit = hits.at(0);
        if (declared.isAttack && rd.success && hit === undefined) fail('damage-mismatch', 'attack power succeeded but rolled no damage');
        if (declared.isAttack && rd.success && hit !== undefined) {
            if (declared.damageType !== '' && hit.damageType.toLowerCase() !== declared.damageType.toLowerCase()) {
                fail('damage-mismatch', `damage type ${hit.damageType}, data declares ${declared.damageType}`);
            }
            if (hit.penetration !== declared.damagePenetration)
                fail('damage-mismatch', `penetration ${hit.penetration}, data declares ${declared.damagePenetration}`);
            const rolledFormula = hit.damageRoll?.formula ?? '';
            if (diceTerms(rolledFormula).join(',') !== diceTerms(declared.damageFormula).join(',')) {
                fail('damage-mismatch', `damage roll "${rolledFormula}" does not roll the data's dice "${declared.damageFormula}"`);
            }
        }
        if (!declared.isAttack && hits.length > 0) fail('damage-mismatch', `non-attack power rolled ${hits.length} damage hit(s)`);

        // Effects: every declared structured effect lands on the right actor.
        if (!rd.success || !declared.hasStructuredEffect) return;
        // Each effect lands where rules/psychic-cast-effects.ts sends it: its own
        // flags.wh40k-rpg.castRecipient, else the psyker for a self-targeted power,
        // else the target, and always the psyker when the cast named no target.
        const recipientOf = (effect: JsonObj): { actor: typeof pair.psyker; who: string } => {
            if (castTarget === null) return { actor: pair.psyker, who: 'psyker' };
            const flags = effect['flags'];
            const ours = isObj(flags) ? flags['wh40k-rpg'] : undefined;
            const declaredRecipient = isObj(ours) ? ours['castRecipient'] : undefined;
            const toSelf = declaredRecipient === 'self' || (declaredRecipient !== 'target' && declared.targetType === 'self');
            return toSelf ? { actor: pair.psyker, who: 'psyker' } : { actor: castTarget, who: 'target' };
        };
        const defaultRecipient = castTarget ?? pair.psyker;
        const landedOn = (actor: typeof pair.psyker): typeof actor.effects.contents => actor.effects.contents.filter((e) => !effectsBefore.has(e.id));
        if (declared.castEffects.length === 0 && landedOn(defaultRecipient).length === 0)
            fail('effect-not-applied', `declared modifiers/conditions produced no effect on the ${castTarget === null ? 'psyker' : 'target'}`);
        for (const effect of declared.castEffects) {
            const { actor: recipient, who } = recipientOf(effect);
            const landed = landedOn(recipient);
            const name = typeof effect['name'] === 'string' ? effect['name'] : '';
            // Declared either the V14 way ({value, units}) or the legacy way ({rounds}).
            const duration = effect['duration'];
            const declaredValue = !isObj(duration)
                ? null
                : typeof duration['value'] === 'number'
                ? duration['value']
                : typeof duration['rounds'] === 'number'
                ? duration['rounds']
                : null;
            const declaredUnits = !isObj(duration) ? null : typeof duration['units'] === 'string' ? duration['units'] : 'rounds';
            const match = landed.find((e) => e.origin === item.uuid || (name !== '' && e.name === name));
            if (match === undefined) fail('effect-not-applied', `effect "${name}" did not land on the ${who}`);
            else if (declaredValue !== null && (match.duration.value !== declaredValue || match.duration.units !== declaredUnits)) {
                fail(
                    'effect-not-applied',
                    `effect "${name}" landed with ${match.duration.value ?? 'no'} ${match.duration.units ?? ''}, data declares ${declaredValue} ${
                        declaredUnits ?? ''
                    }`,
                );
            }
        }
    };

    // The full (non-simplified) pipeline with auto-damage on is the path under test.
    const simplePsychic = g.game.settings.get(args.systemId, 'simple-psychic-rolls');
    const autoDamage = g.game.settings.get(args.systemId, 'auto-roll-damage');
    if (simplePsychic) await g.game.settings.set(args.systemId, 'simple-psychic-rolls', false);
    if (!autoDamage) await g.game.settings.set(args.systemId, 'auto-roll-damage', true);

    const pack = g.game.packs.get(args.packId);
    const dice = g.CONFIG.Dice;
    const originalUniform = dice.randomUniform;
    const originalConsoleError = console.error;
    const results: PowerResult[] = [];

    /** Cast one power; every failure is recorded, nothing escapes. */
    const castOne = async (entry: CastPower, failures: PowerFailure[], diagnostics: PowerDiagnostics): Promise<void> => {
        const fail = (category: FailureCategory, reason: string): void => {
            failures.push({ category, reason });
        };
        const doc = pack === undefined ? null : await helpers.withTimeout(pack.getDocument(entry.id), `load ${entry.name}`, helpers.scaledMs(15_000));
        if (doc === null || doc === undefined) {
            fail('load-error', 'compendium document did not load (invalid or missing)');
            return;
        }
        const pair = await actorsForLine(entry.line);
        if (typeof pair === 'string') {
            fail('cast-error', pair);
            return;
        }

        if (entry.rawJson === null) fail('load-error', 'no on-disk source (after reference resolution) matches this live index entry');
        const parsedRaw = entry.rawJson === null ? null : (JSON.parse(entry.rawJson) as JsonIn);
        const rawDoc: JsonObj = isObj(parsedRaw) ? parsedRaw : {};
        const rawSystem = rawDoc['system'];
        const m = variants.materializeItemVariants(structuredClone(isObj(rawSystem) ? rawSystem : {}), entry.line);
        const declared = checkStructure(
            m,
            rawDoc,
            doc,
            Object.keys(pair.psyker.system.characteristics),
            (key) => resolveFocusBase(pair.psyker, null, key) !== undefined,
            fail,
        );
        const focusDecl = m['focusPower'];
        if (typeof focusDecl === 'string') {
            diagnostics.focusStringCoerced = {
                raw: focusDecl,
                liveCharacteristic: doc.system.focusPower.characteristic,
                liveModifier: doc.system.focusPower.modifier,
            };
        }
        diagnostics.rangeDroppedAtRuntime = m['range'] !== undefined && m['range'] !== null && (doc.system.range === undefined || doc.system.range === null);

        const messagesBefore = new Set(g.game.messages.contents.map((msg) => msg.id));
        const embedded = (await helpers.withTimeout(pair.psyker.createEmbeddedDocuments('Item', [g.game.items.fromCompendium(doc)]), `embed ${entry.name}`)).at(
            0,
        );
        const item = embedded === undefined ? undefined : pair.psyker.items.get(embedded.id);
        if (item === undefined) {
            fail('cast-error', 'embedding the power on the psyker produced no item');
            return;
        }
        const castTarget = declared.targetType === 'self' ? null : pair.target;
        const effectsBefore = new Set([...pair.psyker.effects.contents, ...pair.target.effects.contents].map((e) => e.id));
        const woundsBefore = pair.target.system.wounds?.value;
        const storedBefore = new Set(Object.keys(basic.DHBasicActionManager.storedRolls));
        const consoleErrors: string[] = [];

        try {
            Object.assign(dice, { randomUniform: (): number => args.forcedUniform });
            Object.assign(console, {
                error: (...parts: Array<Error | string | number | object>): void => {
                    consoleErrors.push(parts.map(errorText).join(' '));
                    originalConsoleError(...parts);
                },
            });
            try {
                targeted.DHTargetedActionManager.performPsychicCast(pair.psyker, castTarget, item);
                await helpers.waitFor(() => findDialog(item.id)?.rendered === true, `roll dialog for ${entry.name}`, helpers.scaledMs(15_000));
                const dialog = findDialog(item.id);
                if (dialog !== null) await helpers.withTimeout(dialog._systemRoll(), `cast ${entry.name}`, helpers.scaledMs(30_000));
            } catch (err) {
                fail('cast-error', errorText(err instanceof Error ? err : String(err)));
            } finally {
                Object.assign(dice, { randomUniform: originalUniform });
                Object.assign(console, { error: originalConsoleError });
                await findDialog(item.id)
                    ?.close()
                    .catch(() => undefined);
            }
            if (consoleErrors.length > 0) fail('console-error', consoleErrors.slice(0, 3).join(' | ').slice(0, 400));

            // The action is stored at the START of resolution, so it is inspectable
            // even when the cast threw before posting its card.
            const action = Object.entries(basic.DHBasicActionManager.storedRolls)
                .filter(([key]) => !storedBefore.has(key))
                .map(([, stored]) => stored)
                .find((stored) => stored.rollData.power?.id === item.id);
            const newMessages = (): MessageLike[] => g.game.messages.contents.filter((msg) => !messagesBefore.has(msg.id));
            const castThrew = failures.some((f) => f.category === 'cast-error');
            const posted = !castThrew && (await helpers.pollUntil(() => newMessages().length > 0, helpers.scaledMs(5_000)));
            if (!castThrew && !posted) fail('cast-error', action === undefined ? 'cast produced no resolved action' : 'cast posted no chat card');
            if (action !== undefined) {
                const cardHtml = posted
                    ? newMessages()
                          .map((msg) => msg.content)
                          .join('\n')
                    : null;
                checkResolvedCast(action, cardHtml, declared, item, pair, castTarget, effectsBefore, fail);
            }
        } finally {
            // Leave both actors exactly as seeded for the next power.
            for (const actor of [pair.psyker, pair.target]) {
                const createdEffects = actor.effects.contents.filter((e) => !effectsBefore.has(e.id)).map((e) => e.id);
                if (createdEffects.length > 0) await actor.deleteEmbeddedDocuments('ActiveEffect', createdEffects);
            }
            if (woundsBefore !== undefined && pair.target.system.wounds?.value !== woundsBefore)
                await pair.target.update({ 'system.wounds.value': woundsBefore });
            await pair.psyker.deleteEmbeddedDocuments('Item', [item.id]);
            const created = g.game.messages.contents.filter((msg) => !messagesBefore.has(msg.id)).map((msg) => msg.id);
            if (created.length > 0) await g.ChatMessage.deleteDocuments(created);
        }
    };

    try {
        for (const entry of args.powers) {
            const failures: PowerFailure[] = [];
            const diagnostics: PowerDiagnostics = { focusStringCoerced: null, rangeDroppedAtRuntime: false };
            try {
                await castOne(entry, failures, diagnostics);
            } catch (err) {
                failures.push({ category: 'cast-error', reason: `unexpected: ${errorText(err instanceof Error ? err : String(err))}` });
            }
            results.push({
                uuid: `Compendium.${args.packId}.Item.${entry.id}`,
                name: entry.name,
                pack: args.packName,
                line: entry.line,
                pass: failures.length === 0,
                failures,
                diagnostics,
            });
        }
    } finally {
        Object.assign(dice, { randomUniform: originalUniform });
        Object.assign(console, { error: originalConsoleError });
        if (simplePsychic) await g.game.settings.set(args.systemId, 'simple-psychic-rolls', true);
        if (!autoDamage) await g.game.settings.set(args.systemId, 'auto-roll-damage', false);
    }
    return results;
}

/** A `CONFIG.Dice.randomUniform` value forcing a failed focus test: 0.025 → d100 = 98 (not a double, so no phenomena). */
const FORCED_FAILURE_UNIFORM = 0.025;
const CAST_EFFECTS_LINE = 'dh2';
const GATE_HEX = { name: 'Gate Hex', rounds: 2 };
const GATE_WARD = { name: 'Gate Ward' };

interface GateArgs {
    systemId: string;
    line: string;
    seedPsyRating: number;
    psykerBase: number;
    targetBase: number;
    successUniform: number;
    failureUniform: number;
    hexName: string;
    hexRounds: number;
    wardName: string;
}

interface GateEffectView {
    name: string;
    origin: string | null;
    /** V14 `duration.value` / `duration.units` (a legacy `rounds` source migrates into these). */
    durationValue: number | null;
    durationUnits: string;
    transfer: boolean;
}

interface GateCastView {
    /** The resolved roll's success, null when no roll was stored for the power. */
    success: boolean | null;
    rolled: number | null;
    /** Effects created on each actor by this cast. */
    psyker: GateEffectView[];
    target: GateEffectView[];
}

interface GateObservation {
    error: string | null;
    itemUuid: string;
    success: GateCastView | null;
    failure: GateCastView | null;
}

/**
 * Cast one synthetic, content-agnostic psychic power twice (forced success,
 * then forced failure) and report which effects each cast created on whom. The
 * Node side holds the observation to the castRecipient rules; this only drives
 * the real pipeline and leaves both actors and the chat log as it found them.
 */
async function inPageCastEffectsGate(args: GateArgs): Promise<GateObservation> {
    interface EffectLike {
        id: string;
        name: string;
        origin: string | null;
        transfer: boolean;
        duration: { value: number | null; units: string };
    }
    interface ItemLike {
        id: string;
        uuid: string;
    }
    interface ActorLike {
        id: string;
        system: { characteristics: Record<string, object> };
        items: { get: (id: string) => ItemLike | undefined };
        effects: { contents: EffectLike[] };
        update: (data: Record<string, number>) => Promise<object>;
        createEmbeddedDocuments: (type: string, data: object[]) => Promise<Array<{ id: string }>>;
        deleteEmbeddedDocuments: (type: string, ids: string[]) => Promise<object[]>;
    }
    interface StoredAction {
        rollData: { power?: { id: string }; success: boolean; roll?: { total: number } | null };
    }
    interface DialogLike {
        rendered: boolean;
        actionData?: { rollData?: { psychicPowers?: Array<{ id: string }> } };
        _systemRoll: () => Promise<void>;
        close: () => Promise<void>;
    }
    interface Globals {
        game: {
            messages: { contents: Array<{ id: string }> };
            settings: { get: (ns: string, key: string) => boolean; set: (ns: string, key: string, v: boolean) => Promise<boolean> };
        };
        CONFIG: { Dice: { randomUniform: () => number } };
        Actor: { create: (data: { name: string; type: string }) => Promise<ActorLike | null | undefined> };
        ChatMessage: { deleteDocuments: (ids: string[]) => Promise<object[]> };
        foundry: { applications: { instances: Map<string, object> } };
        psychicGateActors?: Map<string, { psyker: string; target: string }>;
    }
    interface TargetedModule {
        DHTargetedActionManager: { performPsychicCast: (source: ActorLike, target: ActorLike | null, power: ItemLike) => void };
    }
    interface BasicModule {
        DHBasicActionManager: { storedRolls: Record<string, StoredAction> };
    }
    interface DialogModule {
        default: abstract new (...a: never[]) => object;
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals (game, CONFIG, Actor, ChatMessage, foundry) are injected by the licensed app; no shipped types inside page.evaluate
    const g = globalThis as unknown as Globals;
    const helpers = globalThis.wh40kE2E;
    const moduleRoot = `/systems/${args.systemId}/module`;
    const targeted = (await import(/* @vite-ignore */ `${moduleRoot}/actions/targeted-action-manager.js`)) as TargetedModule;
    const basic = (await import(/* @vite-ignore */ `${moduleRoot}/actions/basic-action-manager.js`)) as BasicModule;
    const dialogModule = (await import(/* @vite-ignore */ `${moduleRoot}/applications/prompts/unified-roll-dialog.js`)) as DialogModule;
    const observation: GateObservation = { error: null, itemUuid: '', success: null, failure: null };

    // Seeded like the pack tests' pairs, and registered so deleteSeededActors removes them.
    const seed = async (type: string, name: string, base: number, psy: boolean): Promise<ActorLike> => {
        const actor = await helpers.withTimeout(g.Actor.create({ name, type }), `create ${type}`);
        if (actor === null || actor === undefined) throw new Error(`could not create ${type}`);
        const update: Record<string, number> = {};
        for (const key of Object.keys(actor.system.characteristics)) update[`system.characteristics.${key}.base`] = base;
        if (psy) update['system.psy.rating'] = args.seedPsyRating;
        await helpers.withTimeout(actor.update(update), `seed ${type}`);
        return actor;
    };
    const psyker = await seed(`${args.line}-character`, `Psychic Gate Psyker (${args.line} effects)`, args.psykerBase, true);
    const target = await seed(`${args.line}-npc`, `Psychic Gate Target (${args.line} effects)`, args.targetBase, false);
    const seeded = g.psychicGateActors ?? new Map<string, { psyker: string; target: string }>();
    seeded.set(`${args.line}-cast-effects`, { psyker: psyker.id, target: target.id });
    g.psychicGateActors = seeded;

    const effectsBefore = new Set([...psyker.effects.contents, ...target.effects.contents].map((e) => e.id));
    const messagesBefore = new Set(g.game.messages.contents.map((m) => m.id));
    const simplePsychic = g.game.settings.get(args.systemId, 'simple-psychic-rolls');
    if (simplePsychic) await g.game.settings.set(args.systemId, 'simple-psychic-rolls', false);
    const dice = g.CONFIG.Dice;
    const originalUniform = dice.randomUniform;

    const view = (actor: ActorLike, seen: ReadonlySet<string>): GateEffectView[] =>
        actor.effects.contents
            .filter((e) => !seen.has(e.id))
            .map((e) => ({
                name: e.name,
                origin: e.origin,
                durationValue: e.duration.value,
                durationUnits: e.duration.units,
                transfer: e.transfer,
            }));
    const findDialog = (powerId: string): DialogLike | null => {
        for (const app of g.foundry.applications.instances.values()) {
            if (!(app instanceof dialogModule.default)) continue;
            const dialog = app as DialogLike;
            if (dialog.actionData?.rollData?.psychicPowers?.some((p) => p.id === powerId) === true) return dialog;
        }
        return null;
    };
    const cast = async (item: ItemLike, uniform: number, label: string): Promise<GateCastView> => {
        const seen = new Set([...psyker.effects.contents, ...target.effects.contents].map((e) => e.id));
        const storedBefore = new Set(Object.keys(basic.DHBasicActionManager.storedRolls));
        Object.assign(dice, { randomUniform: (): number => uniform });
        try {
            targeted.DHTargetedActionManager.performPsychicCast(psyker, target, item);
            await helpers.waitFor(() => findDialog(item.id)?.rendered === true, `roll dialog (${label})`, helpers.scaledMs(15_000));
            const dialog = findDialog(item.id);
            if (dialog === null) throw new Error(`roll dialog (${label}) vanished`);
            // _systemRoll awaits performActionAndSendToChat, which awaits the effect apply step.
            await helpers.withTimeout(dialog._systemRoll(), `cast (${label})`, helpers.scaledMs(30_000));
        } finally {
            Object.assign(dice, { randomUniform: originalUniform });
            await findDialog(item.id)
                ?.close()
                .catch(() => undefined);
        }
        const action = Object.entries(basic.DHBasicActionManager.storedRolls)
            .filter(([key]) => !storedBefore.has(key))
            .map(([, stored]) => stored)
            .find((stored) => stored.rollData.power?.id === item.id);
        return {
            success: action === undefined ? null : action.rollData.success,
            rolled: action?.rollData.roll?.total ?? null,
            psyker: view(psyker, seen),
            target: view(target, seen),
        };
    };

    let itemId: string | null = null;
    try {
        const created = await psyker.createEmbeddedDocuments('Item', [
            {
                name: 'Psychic Gate Cast-Effects Power',
                type: 'psychicPower',
                system: {
                    focusPower: { characteristic: 'willpower', modifier: 0, threshold: null, opposed: false, opposedCharacteristic: '' },
                    isAttack: false,
                    target: { type: 'creature' },
                },
                effects: [
                    { name: args.hexName, transfer: false, duration: { rounds: args.hexRounds } },
                    { name: args.wardName, transfer: false, flags: { 'wh40k-rpg': { castRecipient: 'self' } } },
                ],
            },
        ]);
        itemId = created.at(0)?.id ?? null;
        const item = itemId === null ? undefined : psyker.items.get(itemId);
        if (item === undefined) throw new Error('embedding the synthetic power produced no item');
        observation.itemUuid = item.uuid;
        observation.success = await cast(item, args.successUniform, 'forced success');
        observation.failure = await cast(item, args.failureUniform, 'forced failure');
    } catch (err) {
        observation.error = err instanceof Error ? err.message : String(err);
    } finally {
        Object.assign(dice, { randomUniform: originalUniform });
        if (simplePsychic) await g.game.settings.set(args.systemId, 'simple-psychic-rolls', true);
        for (const actor of [psyker, target]) {
            const createdEffects = actor.effects.contents.filter((e) => !effectsBefore.has(e.id)).map((e) => e.id);
            if (createdEffects.length > 0) await actor.deleteEmbeddedDocuments('ActiveEffect', createdEffects);
        }
        if (itemId !== null) await psyker.deleteEmbeddedDocuments('Item', [itemId]);
        const createdMessages = g.game.messages.contents.filter((m) => !messagesBefore.has(m.id)).map((m) => m.id);
        if (createdMessages.length > 0) await g.ChatMessage.deleteDocuments(createdMessages);
    }
    return observation;
}

/** Delete the psykers/targets seeded by {@link inPageCastBatch} (and the UI smoke). */
async function deleteSeededActors(page: Page): Promise<void> {
    await page.evaluate(async () => {
        interface Globals {
            game: { actors: { get: (id: string) => { delete: () => Promise<object> } | undefined } };
            psychicGateActors?: Map<string, { psyker: string; target: string }>;
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global is injected by the licensed app; no shipped types inside page.evaluate
        const g = globalThis as unknown as Globals;
        const ids = new Set([...(g.psychicGateActors?.values() ?? [])].flatMap(({ psyker, target }) => [psyker, target]));
        for (const id of ids) await g.game.actors.get(id)?.delete();
        g.psychicGateActors = new Map();
    });
}

/* -------------------------------------------- */
/*  Tests                                        */
/* -------------------------------------------- */

/**
 * Plain Playwright `test` with the in-page timing helpers, but without the
 * global browser-error guard (see the file header).
 */
const test = playwrightTest.extend({
    page: async ({ page }, use) => {
        await installInPageHelpers(page);
        await use(page);
    },
});

test.describe('psychic powers — every local power casts as its data declares', () => {
    test('pack discovery found local psychic-power packs', () => {
        test.skip(LOCAL_PACKS.length === 0, 'no local psychic-power packs checked out (src/packs-private absent)');
        const empty = LOCAL_PACKS.filter((p) => p.sources.size === 0).map((p) => p.name);
        if (empty.length > 0) throw new Error(`pack(s) with no psychicPower sources: ${empty.join(', ')}`);
    });

    for (const pack of LOCAL_PACKS) {
        test(`pack ${pack.name}`, async ({ page }) => {
            const castCount = POWER_LIMIT === null ? pack.sources.size : Math.min(POWER_LIMIT, pack.sources.size);
            test.setTimeout(scaledMs(PACK_BASE_BUDGET_MS + castCount * PER_POWER_BUDGET_MS));
            const joined = await joinAsGM(page);
            test.skip(!joined, 'GM join failed');

            const packId = `${SYSTEM_ID}.${pack.name}`;
            const index = await readPackIndex(page, packId);
            if (!index.packFound) throw new Error(`pack ${packId} is not registered in the e2e world`);
            if (index.entries.length === 0) throw new Error(`pack ${packId} has no psychicPower entries in its live index`);

            const selected = POWER_LIMIT === null ? index.entries : index.entries.slice(0, POWER_LIMIT);
            const powers: PowerResult[] = [];
            try {
                for (let start = 0; start < selected.length; start += CAST_BATCH_SIZE) {
                    const batch = selected.slice(start, start + CAST_BATCH_SIZE).map((e): CastPower => {
                        const raw = pack.sources.get(e.id);
                        return { id: e.id, name: e.name, line: lineOf(pack.name, raw), rawJson: raw === undefined ? null : JSON.stringify(raw) };
                    });
                    const args: CastArgs = {
                        systemId: SYSTEM_ID,
                        packId,
                        packName: pack.name,
                        seedPsyRating: SEED_PSY_RATING,
                        psykerBase: PSYKER_CHARACTERISTIC_BASE,
                        targetBase: TARGET_CHARACTERISTIC_BASE,
                        forcedUniform: FORCED_UNIFORM,
                        forcedD100: FORCED_D100,
                        powers: batch,
                    };
                    powers.push(...(await page.evaluate(inPageCastBatch, args)));
                }
            } finally {
                await deleteSeededActors(page);
            }

            writePackResults({
                runId: RUN_ID,
                generatedAt: new Date().toISOString(),
                pack: pack.name,
                limit: POWER_LIMIT,
                indexCount: index.entries.length,
                passing: powers.filter((p) => p.pass).length,
                categories: countCategories(powers),
                powers,
            });
            if (powers.length !== selected.length) throw new Error(`recorded ${powers.length} of ${selected.length} powers for ${pack.name}`);
        });
    }

    test('UI smoke: one power casts through the dialog Roll button', async ({ page }) => {
        const pack = LOCAL_PACKS.find((p) => p.sources.size > 0);
        test.skip(pack === undefined, 'no local psychic-power packs checked out');
        if (pack === undefined) return;
        test.setTimeout(scaledMs(PACK_BASE_BUDGET_MS));
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const packId = `${SYSTEM_ID}.${pack.name}`;
        const index = await readPackIndex(page, packId);
        const first = index.entries.at(0);
        if (first === undefined) throw new Error(`pack ${packId} has no psychicPower entries in its live index`);
        const line = lineOf(pack.name, pack.sources.get(first.id));

        const prepared = await page.evaluate(
            async ({ id, packKey, lineKey, psyRating, characteristicBase, forcedUniform }) => {
                interface ActorLike {
                    id: string;
                    system: { characteristics: Record<string, object> };
                    update: (data: Record<string, number>) => Promise<object>;
                    createEmbeddedDocuments: (type: string, data: object[]) => Promise<Array<{ id: string }>>;
                    rollItem: (itemId: string) => Promise<void>;
                }
                interface Globals {
                    game: {
                        items: { fromCompendium: (doc: object) => object };
                        packs: { get: (key: string) => { getDocument: (docId: string) => Promise<object | null> } | undefined };
                    };
                    CONFIG: { Dice: { randomUniform: () => number } };
                    Actor: { create: (data: { name: string; type: string }) => Promise<ActorLike | null> };
                    psychicGateActors?: Map<string, { psyker: string; target: string }>;
                    psychicGateSavedDice?: { randomUniform: () => number };
                }
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals (game, CONFIG, Actor) are injected by the licensed app; no shipped types inside page.evaluate
                const g = globalThis as unknown as Globals;
                const doc = await g.game.packs.get(packKey)?.getDocument(id);
                const psyker = await g.Actor.create({ name: 'Psychic Gate UI Psyker', type: `${lineKey}-character` });
                if (psyker === null) return { ok: false, itemId: '' };
                g.psychicGateActors = new Map([['ui', { psyker: psyker.id, target: psyker.id }]]);
                if (doc === null || doc === undefined) return { ok: false, itemId: '' };
                const update: Record<string, number> = { 'system.psy.rating': psyRating };
                for (const key of Object.keys(psyker.system.characteristics)) update[`system.characteristics.${key}.base`] = characteristicBase;
                await psyker.update(update);
                const item = (await psyker.createEmbeddedDocuments('Item', [g.game.items.fromCompendium(doc)])).at(0);
                if (item === undefined) return { ok: false, itemId: '' };
                const dice = g.CONFIG.Dice;
                g.psychicGateSavedDice = { randomUniform: dice.randomUniform };
                Object.assign(dice, { randomUniform: (): number => forcedUniform });
                void psyker.rollItem(item.id);
                return { ok: true, itemId: item.id };
            },
            {
                id: first.id,
                packKey: packId,
                lineKey: line,
                psyRating: SEED_PSY_RATING,
                characteristicBase: PSYKER_CHARACTERISTIC_BASE,
                forcedUniform: FORCED_UNIFORM,
            },
        );
        try {
            if (!prepared.ok) throw new Error(`could not seed a ${line} psyker with ${first.name}`);
            const rollButton = page.locator('form.unified-roll-dialog [data-action="systemRoll"]');
            await rollButton.waitFor({ state: 'visible', timeout: scaledMs(30_000) });
            await rollButton.click();
            // The click must reach the cast pipeline: a resolved roll for THIS power is
            // stored. Whether its card then posts is a per-power finding (cast-error)
            // recorded by the pack tests, not a harness failure here.
            const resolved = await page.evaluate(
                async ({ systemId, itemId }) => {
                    interface BasicModule {
                        DHBasicActionManager: { storedRolls: Record<string, { rollData: { power?: { id: string } } }> };
                    }
                    const basic = (await import(/* @vite-ignore */ `/systems/${systemId}/module/actions/basic-action-manager.js`)) as BasicModule;
                    const helpers = globalThis.wh40kE2E;
                    return helpers.pollUntil(
                        () => Object.values(basic.DHBasicActionManager.storedRolls).some((stored) => stored.rollData.power?.id === itemId),
                        helpers.scaledMs(15_000),
                    );
                },
                { systemId: SYSTEM_ID, itemId: prepared.itemId },
            );
            if (!resolved) throw new Error(`clicking Roll for ${first.name} did not resolve a cast for the power`);
        } finally {
            await page.evaluate(async () => {
                interface Closable {
                    close: () => Promise<void>;
                }
                interface Globals {
                    CONFIG: { Dice: { randomUniform: () => number } };
                    foundry: { applications: { instances: Map<string, Closable> } };
                    psychicGateSavedDice?: { randomUniform: () => number };
                }
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals (CONFIG, foundry) are injected by the licensed app; no shipped types inside page.evaluate
                const g = globalThis as unknown as Globals;
                if (g.psychicGateSavedDice !== undefined) Object.assign(g.CONFIG.Dice, g.psychicGateSavedDice);
                // A cast that threw mid-resolution leaves its roll dialog open.
                for (const [id, app] of g.foundry.applications.instances) {
                    if (document.getElementById(id)?.classList.contains('unified-roll-dialog') === true) await app.close().catch(() => undefined);
                }
            });
            await deleteSeededActors(page);
        }
    });

    /*
     * Code-path guard, not a content measurement: a wrong apply step FAILS the
     * spec here instead of being recorded as a per-power category.
     */
    test('cast effects: a manifested power lands each effect on its recipient, a failed one lands none', async ({ page }) => {
        test.setTimeout(scaledMs(PACK_BASE_BUDGET_MS));
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const args: GateArgs = {
            systemId: SYSTEM_ID,
            line: CAST_EFFECTS_LINE,
            seedPsyRating: SEED_PSY_RATING,
            psykerBase: PSYKER_CHARACTERISTIC_BASE,
            targetBase: TARGET_CHARACTERISTIC_BASE,
            successUniform: FORCED_UNIFORM,
            failureUniform: FORCED_FAILURE_UNIFORM,
            hexName: GATE_HEX.name,
            hexRounds: GATE_HEX.rounds,
            wardName: GATE_WARD.name,
        };
        const observed = await (async (): Promise<GateObservation> => {
            try {
                return await page.evaluate(inPageCastEffectsGate, args);
            } finally {
                await deleteSeededActors(page);
            }
        })();

        expect(observed.error).toBeNull();
        expect(observed.itemUuid).not.toBe('');
        const { success, failure } = observed;
        if (success === null || failure === null) throw new Error('a cast produced no observation');

        expect(success.success, `forced d100 ${FORCED_D100} must manifest (rolled ${success.rolled ?? 'nothing'})`).toBe(true);
        const names = (effects: readonly GateEffectView[]): string[] => effects.map((e) => e.name).sort();
        expect(names(success.target), 'effects created on the target').toEqual([GATE_HEX.name]);
        expect(names(success.psyker), 'effects created on the psyker').toEqual([GATE_WARD.name]);
        expect(success.target.at(0)).toEqual({
            name: GATE_HEX.name,
            origin: observed.itemUuid,
            durationValue: GATE_HEX.rounds,
            durationUnits: 'rounds',
            transfer: false,
        });
        expect(success.psyker.at(0)?.origin).toBe(observed.itemUuid);

        expect(failure.success, `forced failure must fail the focus test (rolled ${failure.rolled ?? 'nothing'})`).toBe(false);
        expect(failure.target, 'a failed cast lands nothing on the target').toEqual([]);
        expect(failure.psyker, 'a failed cast lands nothing on the psyker').toEqual([]);
    });
});
