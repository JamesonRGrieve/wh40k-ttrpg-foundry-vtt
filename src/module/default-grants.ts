import { SYSTEM_ID } from './constants.ts';

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
 * Filter default-grant sources down to those not already present on the actor,
 * comparing by (name, type). Pure — the unit-tested core of the grant decision.
 * De-duping by the source's own name/type (not a hardcoded string) keeps this
 * content-agnostic and idempotent across actor duplication / import.
 */
export function selectGrantsToAdd<T extends { name: string; type: string }>(sources: readonly T[], existingKeys: ReadonlySet<string>): T[] {
    return sources.filter((source) => !existingKeys.has(itemKey(source.name, source.type)));
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

    return sources;
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
export async function grantDefaultItemsToActor(actor: GrantableActor): Promise<void> {
    try {
        if (!isCreatureActorType(actor.type)) return;

        const sources = await collectDefaultGrantSources();
        if (sources.length === 0) return;

        const existingKeys = new Set<string>();
        for (const item of actor.items) existingKeys.add(itemKey(item.name, item.type));

        // eslint-disable-next-line no-restricted-syntax -- boundary: compendium toObject() payloads are untyped item source data carrying name/type
        const typedSources = sources as (ItemSourceData & { name: string; type: string })[];
        const toAdd = selectGrantsToAdd(typedSources, existingKeys);
        if (toAdd.length === 0) return;

        // Bind every default-granted item before embedding: intrinsic fallbacks
        // can't be dropped or traded (#228 / #390).
        const boundToAdd = applyDefaultGrantPolicy(toAdd);
        await actor.createEmbeddedDocuments('Item', boundToAdd);
    } catch (error) {
        console.error(`${SYSTEM_ID} | default-grants: failed granting default items to actor`, error);
    }
}
