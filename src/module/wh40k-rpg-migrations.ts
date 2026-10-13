import { SYSTEM_ID } from './constants.ts';
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
const WORLD_VERSION = 4;

/** v4 (#501): size the tokens of Hulking-and-larger actors that predate the size ladder. */
const TOKEN_FOOTPRINT_VERSION = 4;

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

export async function checkAndMigrateWorld(): Promise<void> {
    if (!game.user.isGM) return;
    const currentVersion = Number(game.settings.get(SYSTEM_ID, WH40KSettings.SETTINGS.worldVersion));
    if (currentVersion >= WORLD_VERSION) return;

    if (currentVersion < TOKEN_FOOTPRINT_VERSION) await migrateTokenFootprints(game.actors, game.scenes);

    await game.settings.set(SYSTEM_ID, WH40KSettings.SETTINGS.worldVersion, WORLD_VERSION);
}
