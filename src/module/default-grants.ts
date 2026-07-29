import { SYSTEM_ID } from './constants.ts';
import { isActorWritable } from './documents/actor-liveness.ts';

/**
 * Default item grants.
 *
 * Some content is meant to exist on *every* creature: an Unarmed strike, for
 * instance. Rather than hardcode that item's name or UUID in `src/` (Direction
 * #7), the content declares itself with a structured flag — `system.grantedByDefault`
 * on the weapon DataModel — and this module discovers the flagged items at
 * runtime and grants them to each new creature actor.
 *
 * Per-line stats are NOT resolved here: the granted item is the canonical
 * document (whatever line it is RAW in), and `item-variant-utils` materialises
 * the owning actor's line variant once the item is embedded — so a DH2 actor's
 * Unarmed shows its DH2 numbers, a Deathwatch actor's its (heavier) DW numbers.
 */

/** Foundry Item source data — `toObject()` / `createEmbeddedDocuments` payloads
 *  are open-ended records. */
// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Item source data (toObject() output / createEmbeddedDocuments payload) is an open-ended record
type ItemSourceData = Record<string, unknown>;

/** Actor types that receive default-granted weapons: creatures only. Matches the
 *  `<line>-<role>` type convention and tolerates the planned de-prefixing to bare
 *  `character` / `npc`. Vehicles, starships and voidcraft are excluded. */
const CREATURE_TYPE_RE = /(?:^|-)(?:character|npc)$/;

/** True for character / npc actor types (content-agnostic). */
export function isCreatureActorType(type: string): boolean {
    return CREATURE_TYPE_RE.test(type);
}

/** Stable de-dupe key for an owned/granted item — a JSON tuple of (name, type),
 *  which cannot collide across different (name, type) pairs. */
export function itemKey(name: string, type: string): string {
    return JSON.stringify([name, type]);
}

/**
 * Collapse a source list to one entry per (name, type), keeping the first.
 *
 * The scan walks EVERY system Item pack, and the same canonical document is
 * reachable from more than one of them (a line's pack can carry a `reference`
 * stub at the canonical body). Without this, one flagged Unarmed became one
 * copy per reachable pack (#228: a live hybrid carrying ~8).
 */
export function dedupeByKey<T extends { name: string; type: string }>(sources: readonly T[]): T[] {
    const seen = new Set<string>();
    return sources.filter((source) => {
        const key = itemKey(source.name, source.type);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/**
 * Filter default-grant sources down to those not already present on the actor,
 * comparing by (name, type). Pure — the unit-tested core of the grant decision.
 * De-duping by the source's own name/type (not a hardcoded string) keeps this
 * content-agnostic and idempotent across actor duplication / import.
 *
 * De-dupes WITHIN the batch as well as against the actor. `existingKeys` is
 * snapshotted before the write and the whole batch is embedded in one call, so
 * it can never catch duplicates that arrive together — the intra-batch pass is
 * the only thing that can (#228).
 */
export function selectGrantsToAdd<T extends { name: string; type: string }>(sources: readonly T[], existingKeys: ReadonlySet<string>): T[] {
    return dedupeByKey(sources).filter((source) => !existingKeys.has(itemKey(source.name, source.type)));
}

/** Minimal owned-item surface the duplicate repair reads. */
export interface RepairableItem {
    id?: string | null;
    name: string;
    type: string;
    system?: { grantedByDefault?: boolean };
}

/**
 * Ids of surplus default-granted items on an actor: every copy after the first
 * of each (name, type). Pure, so the repair is unit-testable without a world.
 *
 * Repairs actors that accumulated copies before the intra-batch de-dupe landed.
 * Only `grantedByDefault` items are considered — a player carrying two identical
 * bought weapons is legitimate and must not be touched.
 * @param {readonly RepairableItem[]} items  The actor's owned items.
 * @returns {string[]}  Item ids to delete.
 */
export function selectDuplicateGrantIds(items: readonly RepairableItem[]): string[] {
    const seen = new Set<string>();
    const surplus: string[] = [];
    for (const item of items) {
        if (item.system?.grantedByDefault !== true) continue;
        const key = itemKey(item.name, item.type);
        if (seen.has(key)) {
            if (typeof item.id === 'string' && item.id !== '') surplus.push(item.id);
            continue;
        }
        seen.add(key);
    }
    return surplus;
}

/**
 * Grant policy: auto-granted intrinsic fallback items (the Unarmed strike, any
 * future `grantedByDefault` content) are bound — not droppable, not tradable —
 * because they are the system's fallback when nothing is equipped, not loot the
 * player manipulates. Forces `system.bound = true` (honoured by
 * `ItemDropManager.isBound` / #390) on every payload, returning fresh source
 * objects so the cached scan results are never mutated. Pure and
 * content-agnostic — keyed off the grant decision, no name/UUID hardcoding.
 */
export function applyDefaultGrantPolicy(sources: readonly ItemSourceData[]): ItemSourceData[] {
    return sources.map((source) => {
        const system = source['system'];
        const systemBase = typeof system === 'object' && system !== null ? system : {};
        return { ...source, system: { ...systemBase, bound: true } };
    });
}

/** Minimal compendium-pack surface this module touches (Foundry boundary). */
interface DefaultGrantPack {
    metadata: { type: string; packageName: string };
    getIndex: (options?: { fields?: string[] }) => Promise<Iterable<{ _id?: string; system?: { grantedByDefault?: boolean } }>>;
    getDocument: (id: string) => Promise<{ toObject: () => ItemSourceData } | null | undefined>;
}

/** Minimal actor surface this module touches (Foundry boundary). */
interface GrantableActor {
    type: string;
    items: Iterable<{ name: string; type: string }>;
    createEmbeddedDocuments: (embeddedName: 'Item', data: ItemSourceData[]) => Promise<ItemSourceData[]>;
    /** Foundry sets this false once the document is deleted. */
    readonly _id?: string | null | undefined;
}

/** Minimal actor surface the duplicate repair touches (Foundry boundary). */
interface RepairableActor {
    name?: string | null;
    type: string;
    items: Iterable<RepairableItem>;
    /* eslint-disable-next-line no-restricted-syntax -- boundary: `Document#deleteEmbeddedDocuments` resolves to Foundry's untyped deleted-document array; the result is not inspected */
    deleteEmbeddedDocuments: (embeddedName: 'Item', ids: string[]) => Promise<unknown>;
    /** Foundry clears this once the document is deleted. */
    readonly _id?: string | null | undefined;
}

/**
 * Delete surplus copies of default-granted items from an actor that accumulated
 * them before the intra-batch de-dupe landed. Idempotent and never throws — a
 * failed repair must not block whatever triggered it.
 * @param {RepairableActor} actor  The actor to repair.
 * @returns {Promise<number>}  How many surplus copies were removed.
 */
export async function repairDuplicateGrants(actor: RepairableActor): Promise<number> {
    try {
        if (!isCreatureActorType(actor.type)) return 0;
        const surplus = selectDuplicateGrantIds([...actor.items]);
        if (surplus.length === 0) return 0;
        // Chained off the grant, so the actor may already be gone by the time
        // this runs — a deleted actor has no duplicates worth repairing.
        if (!isActorWritable(actor)) return 0;
        await actor.deleteEmbeddedDocuments('Item', surplus);
        console.warn(`${SYSTEM_ID} | default-grants: removed ${surplus.length} duplicate default-granted item(s) from ${actor.name ?? actor.type}`);
        return surplus.length;
    } catch (error) {
        if (isMissingDocumentError(error)) return 0;
        console.error(`${SYSTEM_ID} | default-grants: failed repairing duplicate grants`, error);
        return 0;
    }
}

/** Session cache of the discovered grant-source scan. The *promise* is cached
 *  (not the resolved array) so concurrent first-callers share one scan rather
 *  than racing to re-scan / re-assign. Built once, lazily. */
let grantSourcesScan: Promise<ItemSourceData[]> | null = null;

/**
 * Scan this system's Item compendiums for documents flagged
 * `system.grantedByDefault === true` and return their source objects. Errors on
 * any single pack are swallowed so a bad pack can never block actor creation.
 */
async function scanForDefaultGrantSources(): Promise<ItemSourceData[]> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: game.packs is Foundry's CompendiumCollection (untyped element shape); narrowed to the DefaultGrantPack surface
    const packs = [...(game.packs as unknown as Iterable<DefaultGrantPack>)].filter(
        (pack) => pack.metadata.type === 'Item' && pack.metadata.packageName === SYSTEM_ID,
    );

    const sources: ItemSourceData[] = [];
    await Promise.all(
        packs.map(async (pack) => {
            try {
                const index = await pack.getIndex({ fields: ['system.grantedByDefault'] });
                const flaggedIds: string[] = [];
                for (const entry of index) {
                    if (entry.system?.grantedByDefault === true && typeof entry._id === 'string') flaggedIds.push(entry._id);
                }
                await Promise.all(
                    flaggedIds.map(async (id) => {
                        const doc = await pack.getDocument(id);
                        if (doc !== null && doc !== undefined) sources.push(doc.toObject());
                    }),
                );
            } catch (error) {
                console.error(`${SYSTEM_ID} | default-grants: failed scanning pack ${pack.metadata.packageName}`, error);
            }
        }),
    );

    // Cross-pack de-dupe at the SOURCE, so a bad scan can't be memoised for the
    // whole session and multiplied onto every creature created afterwards (#228).
    // eslint-disable-next-line no-restricted-syntax -- boundary: compendium toObject() payloads are untyped item source data carrying name/type
    return dedupeByKey(sources as (ItemSourceData & { name: string; type: string })[]);
}

/** Discovered default-grant source objects, scanned once and cached. The promise
 *  is memoised so concurrent callers share one scan rather than re-scanning. */
async function collectDefaultGrantSources(): Promise<ItemSourceData[]> {
    const existing = grantSourcesScan;
    if (existing !== null) {
        const existingSources = await existing;
        return existingSources;
    }
    const scan = scanForDefaultGrantSources();
    grantSourcesScan = scan;
    const scannedSources = await scan;
    return scannedSources;
}

/**
 * Grant the default-flagged items to a newly created creature actor, skipping
 * any it already carries (by name + type). No-op for non-creature actors
 * (vehicles, ships) and when nothing is flagged. Never throws.
 */
/** True when the error is Foundry's "document no longer exists" for a deleted actor. */
// eslint-disable-next-line no-restricted-syntax -- boundary: a caught rejection value is genuinely untyped; the message test below IS the narrowing
function isMissingDocumentError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /does not exist in actors/i.test(message);
}

/**
 * True when the failure came from Foundry's POST-COMMIT token re-render rather
 * than from the write itself.
 *
 * `createEmbeddedDocuments` resolves through Foundry's own descendant-document
 * hook chain, which calls `_updateDependentTokens` → `_onRelatedUpdate` →
 * `RenderFlags.set`. On a client with no initialised canvas (a headless browser,
 * a scene-less world) that last step throws — *after* the documents are already
 * created. Reporting it as "failed granting default items" is simply wrong: the
 * grant succeeded, and the canvas bookkeeping is not something a user can act on.
 * @param {unknown} error  The caught rejection value.
 * @returns {boolean}  True for a canvas render-flag failure raised after the commit.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: a caught rejection value is genuinely untyped; the stack test below IS the narrowing
function isPostCommitRenderError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    return typeof error.stack === 'string' && /RenderFlags\.set|_onRelatedUpdate/.test(error.stack);
}

export async function grantDefaultItemsToActor(actor: GrantableActor): Promise<void> {
    try {
        if (!isCreatureActorType(actor.type)) return;

        const sources = await collectDefaultGrantSources();
        if (sources.length === 0) return;

        const existingKeys = new Set<string>();
        for (const item of actor.items) existingKeys.add(itemKey(item.name, item.type));
        // `existingKeys` is snapshotted here and the batch below is embedded in a
        // single call, so it can never see duplicates that arrive together — the
        // intra-batch de-dupe inside `selectGrantsToAdd` is what prevents that.

        // eslint-disable-next-line no-restricted-syntax -- boundary: compendium toObject() payloads are untyped item source data carrying name/type
        const typedSources = sources as (ItemSourceData & { name: string; type: string })[];
        const toAdd = selectGrantsToAdd(typedSources, existingKeys);
        if (toAdd.length === 0) return;

        // Bind every default-granted item before embedding: intrinsic fallbacks
        // can't be dropped or traded (#228 / #390).
        const boundToAdd = applyDefaultGrantPolicy(toAdd);

        // The grant is async (it awaits the compendium scan), so the actor can be
        // DELETED while it is in flight — routine when a caller creates an actor
        // and tears it down, and the common shape in the e2e suite. Writing to a
        // deleted document is rejected by Foundry with a red toast, so re-check
        // before dispatching; the narrower race that still slips through is
        // absorbed by `isMissingDocumentError` below rather than logged.
        if (!isActorWritable(actor)) return;
        await actor.createEmbeddedDocuments('Item', boundToAdd);
    } catch (error) {
        if (isMissingDocumentError(error) || isPostCommitRenderError(error)) return;
        console.error(`${SYSTEM_ID} | default-grants: failed granting default items to actor`, error);
    }
}
