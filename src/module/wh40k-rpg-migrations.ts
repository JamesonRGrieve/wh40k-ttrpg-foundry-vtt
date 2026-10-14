import { SYSTEM_ID } from './constants.ts';
import { type ClipMaxResolver, canonicalClipMax, fullMagazineFor, loadableFromSource } from './utils/magazine-load.ts';
import { type GridScale, legacyFootprintUpgrade, type PhysicalDimensions } from './utils/token-footprint.ts';
import { WH40KSettings } from './wh40k-rpg-settings.ts';

/**
 * One-time world migrations, run by a GM on `ready`.
 *
 * Each step is gated on the world's stored `world-version` being below the step's
 * version, so it runs once per world; the version is persisted afterwards so it
 * never re-runs. Earlier steps (v2 img paths, v3 inception-date encoding) were
 * retired — see git history — so their numbers are spent: a world that ran them
 * stores 3, and the next step is 4.
 *
 * To add a step: give it the next version, gate it on `currentVersion < N`, and
 * raise {@link WORLD_VERSION} to N.
 */
const WORLD_VERSION = 5;

/** v4 (#501): size the tokens of Hulking-and-larger actors that predate the size ladder. */
const TOKEN_FOOTPRINT_VERSION = 4;

/** v5 (#574): load the empty magazines of compendium weapons that predate arrive-loaded creation. */
const MAGAZINE_LOAD_VERSION = 5;

/** The actor facts the footprint step reads. */
interface FootprintSystem {
    /** The 1–10 size descriptor. Some lines' schemas type it `string | number`; only a number sizes a token. */
    size?: number | string | null;
    footprint?: PhysicalDimensions | null;
}

/** The numeric size descriptor, or null when the schema holds anything else. */
function sizeOf(system: FootprintSystem): number | null {
    return typeof system.size === 'number' ? system.size : null;
}

/** A world actor, as far as the footprint step touches it. */
interface FootprintActor {
    system: FootprintSystem;
    prototypeToken: { width: number; height: number };
    update: (data: { prototypeToken: { width: number; height: number } }) => Promise<object | undefined>;
}

/** A placed token, as far as the footprint step touches it. */
interface FootprintToken {
    id: string | null;
    width: number;
    height: number;
    actor: { system: FootprintSystem } | null;
}

/** A scene, as far as the footprint step touches it. */
interface FootprintScene {
    grid: GridScale;
    tokens: Iterable<FootprintToken>;
    updateEmbeddedDocuments: (type: 'Token', updates: Array<{ _id: string; width: number; height: number }>) => Promise<object[]>;
}

/**
 * v4 (#501): the size ladder (#582) only stamps a footprint when an actor or token
 * is created, so Hulking-and-larger actors created before it — or imported with
 * an explicit 1×1 — sit at 1×1 on the map. Grow every such actor's prototype
 * token, and every placed token of one, to the footprint creation would give it
 * today. Only tokens still at the 1×1 default are touched: any other size was set
 * by hand and is kept. Each document is migrated independently, so one failure
 * does not stop the rest.
 */
async function migrateTokenFootprints(actors: Iterable<FootprintActor>, scenes: Iterable<FootprintScene>): Promise<void> {
    for (const actor of actors) {
        const target = legacyFootprintUpgrade({
            currentWidth: actor.prototypeToken.width,
            currentHeight: actor.prototypeToken.height,
            size: sizeOf(actor.system),
        });
        if (target === null) continue;
        try {
            // eslint-disable-next-line no-await-in-loop -- sequential: one write at a time keeps a large world's migration from flooding the server
            await actor.update({ prototypeToken: target });
        } catch (err) {
            console.error('WH40K | token footprint migration: actor update failed', err);
        }
    }

    for (const scene of scenes) {
        const updates: Array<{ _id: string; width: number; height: number }> = [];
        for (const token of scene.tokens) {
            if (token.id === null || token.actor === null) continue;
            const target = legacyFootprintUpgrade({
                currentWidth: token.width,
                currentHeight: token.height,
                size: sizeOf(token.actor.system),
                dimensions: token.actor.system.footprint,
                grid: scene.grid,
            });
            if (target !== null) updates.push({ _id: token.id, ...target });
        }
        if (updates.length === 0) continue;
        try {
            // eslint-disable-next-line no-await-in-loop -- sequential: one scene batch at a time
            await scene.updateEmbeddedDocuments('Token', updates);
        } catch (err) {
            console.error('WH40K | token footprint migration: scene update failed', err);
        }
    }
}

/** An embedded item, as far as the magazine step reads it. */
interface MagazineItem {
    id: string | null;
    name: string;
    _source: object;
}

/** An actor (world or token-synthetic), as far as the magazine step touches it. */
interface MagazineActor {
    name: string;
    items: Iterable<MagazineItem>;
    updateEmbeddedDocuments: (type: 'Item', updates: Array<{ '_id': string; 'system.clip.value': number }>) => Promise<object[]>;
}

/** A world actor or a scene's placed tokens, each holding a magazine actor. */
interface MagazineScene {
    tokens: Iterable<{ actorLink: boolean; actor: MagazineActor | null }>;
}

/**
 * v5 (#574): a compendium weapon created before weapons arrived loaded stored
 * no round count, and the compendium join keeps a stored `clip.value` (instance
 * state) — so every such weapon reads as fired empty. Load each COMPENDIUM-LINKED
 * weapon whose stored magazine is empty and whose clip size (its own, else its
 * compendium source's) is positive, on world actors and on unlinked placed
 * tokens' actors (a linked token IS its world actor). The join cannot tell
 * "never loaded" from "fired empty", so a weapon genuinely fired empty is refilled
 * once, here — the accepted cost. Each actor is migrated independently; every
 * change is logged.
 */
async function migrateEmptyMagazines(actors: Iterable<MagazineActor>, scenes: Iterable<MagazineScene>, resolveMax: ClipMaxResolver): Promise<void> {
    const targets: MagazineActor[] = [...actors];
    for (const scene of scenes) {
        for (const token of scene.tokens) if (!token.actorLink && token.actor !== null) targets.push(token.actor);
    }
    for (const actor of targets) {
        const updates: Array<{ '_id': string; 'system.clip.value': number }> = [];
        const loaded: string[] = [];
        for (const item of actor.items) {
            const weapon = loadableFromSource(item._source);
            if (item.id === null || weapon.compendiumSource === null) continue;
            // eslint-disable-next-line no-await-in-loop -- sequential: compendium lookups are cached per pack; one actor at a time keeps the migration's writes ordered
            const rounds = await fullMagazineFor(weapon, resolveMax);
            if (rounds === null) continue;
            updates.push({ '_id': item.id, 'system.clip.value': rounds });
            loaded.push(`${item.name} (${rounds})`);
        }
        if (updates.length === 0) continue;
        try {
            // eslint-disable-next-line no-await-in-loop -- sequential: one write at a time keeps a large world's migration from flooding the server
            await actor.updateEmbeddedDocuments('Item', updates);
            console.warn(`WH40K | magazine migration (#574): loaded ${actor.name}: ${loaded.join(', ')}`);
        } catch (err) {
            console.error(`WH40K | magazine migration (#574): ${actor.name} update failed`, err);
        }
    }
}

export async function checkAndMigrateWorld(): Promise<void> {
    if (!game.user.isGM) return;
    const currentVersion = Number(game.settings.get(SYSTEM_ID, WH40KSettings.SETTINGS.worldVersion));
    if (currentVersion >= WORLD_VERSION) return;

    if (currentVersion < TOKEN_FOOTPRINT_VERSION) await migrateTokenFootprints(game.actors, game.scenes);
    if (currentVersion < MAGAZINE_LOAD_VERSION) await migrateEmptyMagazines(game.actors, game.scenes, canonicalClipMax);

    await game.settings.set(SYSTEM_ID, WH40KSettings.SETTINGS.worldVersion, WORLD_VERSION);
}
