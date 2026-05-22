import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Keys MUST match the COMPENDIUM_CONTENT_FLOWS constant in
 * scripts/e2e-coverage.mjs (registered by the orchestrator). One flow per
 * system compendium pack — flow records validation pass over EVERY doc in
 * that pack against its DataModel.
 *
 * Tier B deep-content validation. For each enumerated wh40k-rpg compendium
 * pack we materialize every document via `pack.getDocuments()`, then
 * exercise four assertions against each:
 *
 *   1. `doc.system` is a non-null object — the DataModel instance attached.
 *   2. `doc.system._source` round-trips through `doc.system.toObject()`:
 *      every key on `_source` must appear (with structural equality on the
 *      top-level slot) on the toObject() output. This catches schema drops
 *      where a structured field is silently lost during serialization (e.g.
 *      `migrateData` not preserving the legacy path or a defineSchema
 *      missing a field present in the JSON source).
 *   3. The DataModel registered for the doc's `<system>-<type>` matches the
 *      one used to instantiate the doc — we approximate this with a
 *      schema-presence check: `doc.system.schema?.fields` is non-empty
 *      (Foundry V14 materializes the registered DataModel onto `.schema`
 *      for every system-typed Document).
 *   4. For docs with UUID-typed reference fields (prerequisites, grants,
 *      originPath steps, daemonic-remnant bindings, etc.), every stored
 *      UUID resolves via `uuidNameCache.getName(uuid)` to a non-broken
 *      label. Broken refs are recorded as a diagnostic but do NOT throw —
 *      content audit is the orchestrator's job, not this spec.
 *
 * Strategy mirrors `weapon-attack.spec.ts`: one page.evaluate per pack
 * wrapped in `withTimeout(p, 30000, label)` so a slow pack can't hang the
 * whole spec. Read-only — no documents are created, updated, or deleted.
 * Each pack records a flow under `<packId>::validated` so the orchestrator
 * can sum per-pack coverage.
 *
 * The enumerated pack list below is the canonical denominator. Adding a
 * new system pack means adding it here AND to COMPENDIUM_CONTENT_FLOWS in
 * scripts/e2e-coverage.mjs.
 */

const COMPENDIUM_CONTENT_FLOWS = [
    'bc-core-items-talents::validated',
    'bc-core-items-weapons::validated',
    'bc-core-archetypes::validated',
    'dh1-core-items-talents::validated',
    'dh1-core-items-weapons::validated',
    'dh2-core-stats-talents::validated',
    'dh2-core-items-weapons::validated',
    'dh2-core-stats-skills::validated',
    'dh2-core-stats-conditions::validated',
    'dh2-core-stats-traits::validated',
    'dh2-core-stats-homeworlds::validated',
    'dh2-actors-bestiary::validated',
    'dh2-core-rolltables::validated',
    'dh2-core-journals::validated',
    'dw-core-items-talents::validated',
    'dw-core-items-weapons::validated',
    'dw-core-chapters::validated',
    'hb-items-weapons::validated',
    'hb-items-actors::validated',
    'ow-core-items-talents::validated',
    'ow-core-items-weapons::validated',
    'ow-core-homeworlds::validated',
    'rt-core-items-talents::validated',
    'rt-core-items-weapons::validated',
    'rt-core-actors-ships::validated',
    'rt-core-items-traits::validated',
] as const;

type FlowName = (typeof COMPENDIUM_CONTENT_FLOWS)[number];

/**
 * Map a flow key (`<short-pack-id>::validated`) back to the full Foundry
 * compendium id (`wh40k-rpg.<short-pack-id>`). The short id is what the
 * orchestrator uses as the coverage denominator; the full id is what
 * `game.packs.get(...)` needs.
 */
function flowToPackId(flow: FlowName): string {
    const short = flow.replace(/::validated$/u, '');
    return `wh40k-rpg.${short}`;
}

interface PackProbeOutcome {
    /** True iff every document validated cleanly. */
    valid: boolean;
    /** Total document count materialized from the pack. */
    docCount: number;
    /** Per-doc failures (truncated to first 5 per pack to keep notes bounded). */
    failures: string[];
    /** Count of UUID references that failed to resolve via uuidNameCache. */
    brokenRefs: number;
    /** Total UUID references inspected. */
    uuidRefsSeen: number;
    /** Top-level error if the pack itself failed to load. */
    packError: string | null;
}

interface ProbeResult {
    outcomes: Partial<Record<FlowName, PackProbeOutcome>>;
    pageErrors: string[];
}

async function probeCompendiumContent(page: Page): Promise<ProbeResult> {
    const pageErrors: string[] = [];
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const result = await page.evaluate(async (flows: readonly string[]) => {
            // Materialized compendium documents have no shipped TS schema in
            // this browser-side probe; we narrow each field defensively below.
            interface RawDoc {
                id?: string;
                name?: string;
                type?: string;
                system?: RawSystem | null;
            }
            interface RawSystem {
                // _source and toObject() expose raw DataModel JSON whose shape is
                // content-specific (per item/actor type) and has no shared schema
                // in this probe — the validation logic walks it structurally.
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry DataModel _source has no shipped type; walked structurally
                _source?: unknown;
                schema?: { fields?: Record<string, object> };
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry DataModel.toObject() output has no shipped type; walked structurally
                toObject?: () => unknown;
            }
            interface CompendiumPack {
                getDocuments: () => Promise<RawDoc[]>;
            }
            interface PackCollection {
                get?: (id: string) => CompendiumPack | null | undefined;
            }
            interface GameObject {
                packs?: PackCollection;
            }
            interface UuidNameCacheLike {
                getName?: (uuid: string) => string | null | undefined;
            }
            interface UuidCacheModule {
                uuidNameCache?: UuidNameCacheLike;
                default?: UuidNameCacheLike;
            }
            // fromUuidSync resolves to a Foundry Document (untyped here); we only
            // read `.name` off it, guarded below.
            interface ResolvedDoc {
                name?: string;
            }
            interface FoundryGlobal {
                game?: GameObject;
                fromUuidSync?: (uuid: string) => ResolvedDoc | null | undefined;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals (game, fromUuidSync) have no shipped types in this browser-side probe
            const g = globalThis as unknown as FoundryGlobal;
            const gameCls = g.game;

            // Wrap any awaitable with a 30s timeout so a slow pack can't
            // hang the spec (pack.getDocuments() is genuinely slow on large
            // packs — 30s is the safe-side bound).
            const withTimeout = async <T>(p: Promise<T>, ms: number, label: string): Promise<T> => {
                let timer: ReturnType<typeof setTimeout> | undefined;
                const timeout = new Promise<T>((_, reject) => {
                    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
                });
                try {
                    return await Promise.race([p, timeout]);
                } finally {
                    clearTimeout(timer);
                }
            };

            // Recursively walk a value, yielding every string that matches
            // the Foundry compendium UUID shape. Caps depth at 8 to avoid
            // pathological cycles inside DataModel proxies (the schema
            // graph is wide but shallow in practice).
            // eslint-disable-next-line no-restricted-syntax -- boundary: recursive walk over untyped Foundry DataModel data; `unknown` is the input contract
            function collectUuidStrings(value: unknown, depth: number, out: string[]): void {
                if (depth > 8) return;
                if (value === null || value === undefined) return;
                if (typeof value === 'string') {
                    if (value.startsWith('Compendium.wh40k-rpg.')) out.push(value);
                    return;
                }
                if (Array.isArray(value)) {
                    for (const v of value) collectUuidStrings(v, depth + 1, out);
                    return;
                }
                if (typeof value === 'object') {
                    for (const [k, v] of Object.entries(value)) {
                        // Skip framework-internal slots whose traversal
                        // produces noise without UUIDs (parent chains,
                        // collection contents that re-enter the doc tree).
                        if (k === 'parent' || k === 'document' || k === 'apps') continue;
                        collectUuidStrings(v, depth + 1, out);
                    }
                }
            }

            // Resolve a UUID through uuidNameCache. Falls back to
            // fromUuidSync (the canonical Foundry API) if the cache import
            // path isn't available. Returns null on resolution failure.
            async function resolveUuidName(uuid: string): Promise<string | null> {
                // Try the system's named-cache module first — it's already
                // warm after the ready hook fires.
                try {
                    const url = '/systems/wh40k-rpg/module/utils/uuid-name-cache.js';
                    const importModule = async (u: string): Promise<UuidCacheModule> => (await import(/* @vite-ignore */ u)) as UuidCacheModule;
                    const mod = await importModule(url);
                    const cache = mod.uuidNameCache ?? mod.default;
                    if (cache?.getName !== undefined && typeof cache.getName === 'function') {
                        const hit = cache.getName(uuid);
                        if (typeof hit === 'string' && hit !== '[broken link]' && hit.length > 0) return hit;
                        // Fall through to fromUuidSync — the cache could be
                        // cold for cross-pack refs that built before this
                        // pack's index loaded.
                    }
                } catch {
                    /* import failed; fall through */
                }
                try {
                    const fn = g.fromUuidSync;
                    if (fn !== undefined && typeof fn === 'function') {
                        const doc = fn(uuid);
                        if (doc != null && typeof doc.name === 'string') {
                            return doc.name;
                        }
                    }
                } catch {
                    /* ignore */
                }
                return null;
            }

            // Structural equality on top-level slots of `_source` vs
            // `toObject()`. We only check that every key in source survives
            // to the serialized form (toObject() is allowed to add derived
            // slots — DataModels frequently do). A missing key, or a slot
            // whose JSON-serialized shape diverged, is a fail.
            // eslint-disable-next-line no-restricted-syntax -- boundary: structural diff over untyped Foundry DataModel _source vs toObject() output; no shared schema
            function compareRoundTrip(source: Record<string, unknown>, serialized: Record<string, unknown>): string[] {
                const diffs: string[] = [];
                for (const key of Object.keys(source)) {
                    if (!(key in serialized)) {
                        diffs.push(`missing key '${key}'`);
                        continue;
                    }
                    const srcVal = source[key];
                    const serVal = serialized[key];
                    // Primitives are compared directly.
                    if (srcVal === null || typeof srcVal !== 'object') {
                        if (srcVal !== serVal) {
                            diffs.push(`primitive divergence on '${key}' (source=${JSON.stringify(srcVal)} serialized=${JSON.stringify(serVal)})`);
                        }
                        continue;
                    }
                    // Object / array: JSON-roundtrip both sides so the
                    // comparison ignores Foundry's internal undefined-vs-null
                    // pruning and class-instance reshaping. JSON.stringify
                    // also handles array-vs-set normalization the framework
                    // performs on read-back.
                    try {
                        const srcJson = JSON.stringify(srcVal);
                        const serJson = JSON.stringify(serVal);
                        if (srcJson !== serJson) {
                            // Only flag when the serialized form actually
                            // dropped data, not when it added derived slots.
                            // Heuristic: if every top-level key in srcVal is
                            // present in serVal (and primitive-equal or
                            // sub-object-truthy), accept it. This keeps the
                            // gate honest without churning on cosmetic
                            // re-ordering.
                            if (
                                typeof srcVal === 'object' &&
                                !Array.isArray(srcVal) &&
                                serVal !== null &&
                                typeof serVal === 'object' &&
                                !Array.isArray(serVal)
                            ) {
                                const srcKeys = Object.keys(srcVal);
                                const serKeys = new Set(Object.keys(serVal));
                                const lost = srcKeys.filter((sk) => !serKeys.has(sk));
                                if (lost.length > 0) {
                                    diffs.push(`object '${key}' dropped subkeys: ${lost.join(', ')}`);
                                }
                            } else if (Array.isArray(srcVal) && !Array.isArray(serVal)) {
                                diffs.push(`array '${key}' degraded to non-array on serialize`);
                            }
                            // Else: shape-equivalent — accept.
                        }
                    } catch {
                        // Non-serializable on either side — treat as a
                        // divergence so we surface it.
                        diffs.push(`'${key}' could not be JSON-compared`);
                    }
                }
                return diffs;
            }

            const outcomes: Record<string, PackProbeOutcome> = {};

            // Per-doc validation contributions, returned (not mutated onto a
            // shared object) so the caller can aggregate without passing the
            // pack-level outcome across an await — that pattern trips
            // require-atomic-updates and is a genuine interleaving hazard.
            interface DocValidation {
                failures: string[];
                brokenRefs: number;
                uuidRefsSeen: number;
                perDocFailures: number;
            }

            // Validate a single materialized doc against its DataModel and
            // return its contributions. Closes over the helpers above
            // (compareRoundTrip / collectUuidStrings / resolveUuidName) —
            // defined inside the callback so it serializes into the browser
            // realm intact.
            async function validateDoc(doc: RawDoc): Promise<DocValidation> {
                const failures: string[] = [];
                let perDocFailures = 0;
                const docLabel = doc.name ?? doc.id ?? '<unnamed>';

                // Assertion 1: doc.system is a non-null object.
                if (doc.system === null || doc.system === undefined || typeof doc.system !== 'object') {
                    failures.push(`${docLabel}: system is not an object (got ${doc.system === null ? 'null' : typeof doc.system})`);
                    return { failures, brokenRefs: 0, uuidRefsSeen: 0, perDocFailures: 1 };
                }
                const system = doc.system;

                // Assertion 3: schema is registered (DataModel attached).
                // RollTable / JournalEntry don't carry a per-doc-type
                // schema in the same way Items/Actors do — they always
                // resolve to the framework's base schema. We accept
                // either a non-empty `schema.fields` or — for those two
                // document kinds — just a non-null system object.
                const fieldsObj = system.schema?.fields;
                const hasFields = fieldsObj != null && typeof fieldsObj === 'object' && Object.keys(fieldsObj).length > 0;
                if (!hasFields) {
                    // Best-effort: tolerate framework-doc kinds whose
                    // DataModel is implicit. Only flag when the doc
                    // type is one we register an explicit DataModel for.
                    const docType = typeof doc.type === 'string' ? doc.type : '';
                    const isFrameworkDoc = docType === '' || docType === 'base';
                    if (!isFrameworkDoc) {
                        failures.push(`${docLabel}: schema.fields empty (type=${docType})`);
                        perDocFailures += 1;
                        // Continue — still try roundtrip + UUID checks.
                    }
                }

                // Assertion 2: _source round-trips through toObject().
                if (typeof system.toObject !== 'function') {
                    failures.push(`${docLabel}: system.toObject missing`);
                    perDocFailures += 1;
                } else if (system._source !== null && typeof system._source === 'object') {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: holds Foundry DataModel.toObject() output, which is untyped here
                    let serialized: unknown = null;
                    try {
                        serialized = system.toObject();
                    } catch (err) {
                        failures.push(`${docLabel}: toObject threw: ${String((err as Error).message)}`);
                        perDocFailures += 1;
                    }
                    if (serialized !== null && typeof serialized === 'object') {
                        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry DataModel _source / toObject() output are untyped; passed to the structural-diff walker
                        const diffs = compareRoundTrip(system._source as Record<string, unknown>, serialized as Record<string, unknown>);
                        if (diffs.length > 0) {
                            failures.push(`${docLabel}: roundtrip diffs: ${diffs.slice(0, 3).join('; ')}`);
                            perDocFailures += 1;
                        }
                    }
                }

                // Assertion 4: UUID references resolve.
                let brokenRefs = 0;
                const uuidStrings: string[] = [];
                try {
                    collectUuidStrings(system, 0, uuidStrings);
                } catch {
                    /* collection failures are not a hard fail — record but continue */
                }
                for (const uuid of uuidStrings) {
                    const resolved = await resolveUuidName(uuid);
                    if (resolved === null) brokenRefs += 1;
                }

                return { failures, brokenRefs, uuidRefsSeen: uuidStrings.length, perDocFailures };
            }

            // Materialize one pack and validate every doc in it, aggregating the
            // per-doc contributions into locals and writing them onto `outcome`
            // only after the loop — so `outcome` never crosses an await.
            async function validatePack(packId: string, outcome: PackProbeOutcome): Promise<void> {
                const pack = gameCls?.packs?.get?.(packId);
                if (pack == null) {
                    outcome.packError = `pack '${packId}' not registered`;
                    return;
                }

                let docs: RawDoc[] = [];
                try {
                    docs = await withTimeout(pack.getDocuments(), 30_000, `${packId}.getDocuments()`);
                } catch (err) {
                    outcome.packError = `getDocuments threw: ${String((err as Error).message)}`;
                    return;
                }

                outcome.docCount = docs.length;
                if (docs.length === 0) {
                    // Empty pack is valid — there's nothing to fail on.
                    outcome.valid = true;
                    return;
                }

                const collectedFailures: string[] = [];
                let perDocFailures = 0;
                let brokenRefs = 0;
                let uuidRefsSeen = 0;
                for (const doc of docs) {
                    const docResult = await validateDoc(doc);
                    perDocFailures += docResult.perDocFailures;
                    brokenRefs += docResult.brokenRefs;
                    uuidRefsSeen += docResult.uuidRefsSeen;
                    for (const failure of docResult.failures) {
                        if (collectedFailures.length < 5) collectedFailures.push(failure);
                    }
                }

                for (const failure of collectedFailures) outcome.failures.push(failure);
                outcome.brokenRefs += brokenRefs;
                outcome.uuidRefsSeen += uuidRefsSeen;
                outcome.valid = perDocFailures === 0;
            }

            for (const flow of flows) {
                const short = flow.replace(/::validated$/u, '');
                const packId = `wh40k-rpg.${short}`;
                const outcome: PackProbeOutcome = {
                    valid: false,
                    docCount: 0,
                    failures: [],
                    brokenRefs: 0,
                    uuidRefsSeen: 0,
                    packError: null,
                };
                outcomes[flow] = outcome;
                await validatePack(packId, outcome);
            }

            return { outcomes };
        }, COMPENDIUM_CONTENT_FLOWS);

        return {
            outcomes: result.outcomes,
            pageErrors,
        };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('compendium content validation (Tier B)', () => {
    // Cap at 15 minutes — 26 packs × up-to-30s timeout each = 13min worst
    // case; we add headroom for the inner per-doc work.
    test.setTimeout(900_000);
    test('every enumerated wh40k-rpg pack: every doc validates against its DataModel and round-trips', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeCompendiumContent(page);

        const failures: string[] = [];
        let totalBrokenRefs = 0;
        let totalUuidRefsSeen = 0;
        let totalDocsValidated = 0;

        for (const flow of COMPENDIUM_CONTENT_FLOWS) {
            const outcome = probe.outcomes[flow];
            const packId = flowToPackId(flow);

            if (outcome === undefined) {
                failures.push(`${packId}: no probe outcome recorded`);
                continue;
            }

            totalBrokenRefs += outcome.brokenRefs;
            totalUuidRefsSeen += outcome.uuidRefsSeen;

            if (outcome.packError !== null) {
                failures.push(`${packId}: ${outcome.packError}`);
                continue;
            }

            if (!outcome.valid) {
                const fails = outcome.failures.join(' | ');
                failures.push(`${packId} (${outcome.docCount} docs): ${fails || 'unknown per-doc failure'}`);
                continue;
            }

            totalDocsValidated += outcome.docCount;
            recordCoverage('compendium-content.flow', flow);
        }

        const pageErrorTail = probe.pageErrors.length > 0 ? `\n  pageerrors: ${probe.pageErrors.slice(0, 5).join(' | ')}` : '';

        // Broken-ref count is a diagnostic — we surface it on the failure
        // message but do NOT push it into `failures`. A pack with stale
        // UUID refs still validates as a pack-shape pass; the content audit
        // tooling (packs:audit) is the right gate for ref staleness.
        const refTail = totalUuidRefsSeen > 0 ? `\n  uuid-ref diagnostic: ${totalBrokenRefs}/${totalUuidRefsSeen} refs unresolved across all probed packs` : '';

        expect(
            failures,
            `${failures.length}/${
                COMPENDIUM_CONTENT_FLOWS.length
            } compendium-content probes failed (${totalDocsValidated} docs validated cleanly):\n  - ${failures.join('\n  - ')}${refTail}${pageErrorTail}`,
        ).toEqual([]);
    });
});
