import { SYSTEM_ID } from '../constants.ts';

/**
 * Synchronous UUID → display-name cache.
 *
 * Compendium references in this system are stored as UUIDs. Display names are
 * looked up at render time via this cache so that renaming a compendium item
 * propagates to every stored reference automatically — no name copies, no
 * stale data.
 *
 * The cache is populated on the `ready` hook from:
 *   - every compendium pack index for this system (`game.packs.contents`)
 *   - every world-side document (Items, Actors, JournalEntries, RollTables)
 *
 * It stays warm via `createDocument` / `updateDocument` / `deleteDocument`
 * hooks for world docs. Compendium packs are read once at boot — they don't
 * change at runtime in normal play; the manual `refresh()` entry point covers
 * the unusual case of importing a new pack mid-session.
 *
 * Failure mode: `getName('Compendium.…unresolved…')` returns the literal
 * fragment `'[broken link]'` and logs a one-shot warning per UUID, so a stale
 * stored reference shows up visibly rather than silently rendering as an
 * empty string.
 */

type PackLike = {
    metadata: { id: string; name: string; type: string };
    getIndex: (options?: { fields?: string[] }) => Promise<Iterable<unknown>>;
};

type IndexEntry = { _id: string; name: string; type?: string };

const BROKEN = '[broken link]';
const TOKEN_RE = /\{\{(Compendium\.[A-Za-z0-9_.-]+)\}\}/g;

class UuidNameCache {
    /** uuid → display name */
    readonly #cache = new Map<string, string>();
    /**
     * Reverse index: `${packPrefix}|${normalized-name}` → uuid. Used by the
     * Phase F originPath backfill where we have a legacy name string and need
     * to find the matching compendium UUID. Pack-prefix scoping keeps the
     * lookup per-game-system; see `findByName()` for the resolution order.
     */
    readonly #byName = new Map<string, string>();
    /** uuids we've already logged a "broken" warning for, to avoid log spam */
    readonly #warned = new Set<string>();
    #initialized = false;

    /**
     * Build the cache from every compendium pack and every world-side document.
     * Safe to call multiple times — subsequent calls clear and rebuild.
     */
    async build(): Promise<void> {
        this.#cache.clear();
        this.#byName.clear();
        this.#warned.clear();

        // eslint-disable-next-line no-restricted-syntax -- boundary: game.packs is Foundry framework state typed loosely by fvtt-types
        const packs = Array.from(game.packs.contents) as PackLike[];
        const ourPacks = packs.filter((p) => p.metadata.id.startsWith(`${SYSTEM_ID}.`));

        await Promise.all(
            ourPacks.map(async (pack) => {
                let index: Iterable<unknown>;
                try {
                    index = await pack.getIndex({ fields: ['name', 'type'] });
                } catch (err) {
                    console.warn(`[wh40k-rpg] uuid-name-cache: failed to read index for ${pack.metadata.id}`, err);
                    return;
                }
                const docKey = packDocumentType(pack.metadata.type);
                const packPrefix = pack.metadata.name.split('-')[0] ?? '';
                for (const raw of index) {
                    if (!isIndexEntry(raw)) continue;
                    const uuid = `Compendium.${pack.metadata.id}.${docKey}.${raw._id}`;
                    this.#cache.set(uuid, raw.name);
                    const reverseKey = `${packPrefix}|${raw.name.trim().toLowerCase()}`;
                    if (!this.#byName.has(reverseKey)) this.#byName.set(reverseKey, uuid);
                }
            }),
        );

        for (const collection of worldCollections()) {
            for (const doc of collection) {
                const uuid = readUuid(doc);
                const name = readName(doc);
                if (uuid != null && name != null) {
                    this.#cache.set(uuid, name);
                }
            }
        }

        this.#initialized = true;
    }

    /** Synchronous name lookup. Returns `[broken link]` on miss. */
    getName(uuid: string): string {
        const hit = this.#cache.get(uuid);
        if (hit != null) return hit;
        if (!this.#warned.has(uuid)) {
            this.#warned.add(uuid);
            console.warn(`[wh40k-rpg] uuid-name-cache: broken reference ${uuid}`);
        }
        return BROKEN;
    }

    /** True once `build()` has finished at least once. */
    isReady(): boolean {
        return this.#initialized;
    }

    /** Update the cached name for a UUID. Called by document CRUD hooks. */
    set(uuid: string, name: string): void {
        this.#cache.set(uuid, name);
        this.#warned.delete(uuid);
    }

    /** Drop a UUID from the cache. Called by document delete hooks. */
    remove(uuid: string): void {
        this.#cache.delete(uuid);
    }

    /**
     * Reverse lookup: find a UUID by display name, scoped to the given pack
     * prefix (`dh1`, `dh2`, `bc`, `dw`, `ow`, `rt`). Falls back to a
     * specialization-stripped match. Returns null on miss — callers should
     * treat that as "leave the legacy name alone" rather than a hard error.
     */
    findByName(packPrefix: string, name: string): string | null {
        const normalized = name.trim().toLowerCase();
        const exact = this.#byName.get(`${packPrefix}|${normalized}`);
        if (exact != null) return exact;
        const stripped = normalized.replace(/\s*\([^)]*\)\s*$/u, '').trim();
        if (stripped !== normalized) {
            const fallback = this.#byName.get(`${packPrefix}|${stripped}`);
            if (fallback != null) return fallback;
        }
        return null;
    }

    /**
     * Expand every `{{Compendium.…}}` template token in a string to the linked
     * document's current display name. Used for freeform text fields where a
     * structured UUID slot is overkill (e.g. NavigatorPower prerequisite text).
     * Tokens that don't match the Compendium UUID shape are left untouched.
     */
    expandTemplates(text: string): string {
        if (typeof text !== 'string' || !text.includes('{{Compendium.')) return text;
        return text.replace(TOKEN_RE, (_match, uuid: string) => this.getName(uuid));
    }
}

function isIndexEntry(value: unknown): value is IndexEntry {
    if (value == null || typeof value !== 'object') return false;
    const entry = value as Partial<IndexEntry>;
    return typeof entry._id === 'string' && typeof entry.name === 'string';
}

/**
 * Map a pack metadata type (`Item` / `Actor` / `JournalEntry` / `RollTable`)
 * onto the segment that appears in a Foundry compendium UUID.
 */
function packDocumentType(packType: string): string {
    return packType;
}

/**
 * Enumerate the world-side document collections this cache covers. Each entry
 * yields plain documents (no embedded subdocs) — embedded items are stored as
 * UUID references on their parent and don't need their own cache entry.
 */
function* worldCollections(): IterableIterator<Iterable<unknown>> {
    /* eslint-disable no-restricted-syntax -- boundary: game.* collections are framework-typed loosely by fvtt-types */
    if (game.items != null) yield game.items as unknown as Iterable<unknown>;
    if (game.actors != null) yield game.actors as unknown as Iterable<unknown>;
    if (game.journal != null) yield game.journal as unknown as Iterable<unknown>;
    if (game.tables != null) yield game.tables as unknown as Iterable<unknown>;
    /* eslint-enable no-restricted-syntax */
}

function readUuid(doc: unknown): string | null {
    if (doc == null || typeof doc !== 'object') return null;
    const u = (doc as { uuid?: unknown }).uuid;
    return typeof u === 'string' ? u : null;
}

function readName(doc: unknown): string | null {
    if (doc == null || typeof doc !== 'object') return null;
    const n = (doc as { name?: unknown }).name;
    return typeof n === 'string' ? n : null;
}

export const uuidNameCache = new UuidNameCache();
