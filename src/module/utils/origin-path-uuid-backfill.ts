import { uuidNameCache } from './uuid-name-cache.ts';

/**
 * Phase F runtime backfill — populate `system.originPath.<step>Uuid` for
 * existing character actors whose origin steps are stored only as legacy
 * name strings.
 *
 * Resolves each name against the per-game-system reverse index built by
 * `uuidNameCache`, scoped to the actor's own `system.gameSystem` (with the
 * trailing `e` stripped to match the pack prefix used by `compendium-resync`).
 *
 * Non-destructive: only writes the parallel `*Uuid` field, never overwrites
 * the display-name field; only fires when the UUID slot is empty AND a
 * resolution succeeds. Unresolvable names are left untouched so a future
 * data fix-up can populate them.
 */

const ORIGIN_PATH_STEPS = [
    'homeWorld',
    'birthright',
    'lureOfTheVoid',
    'trialsAndTravails',
    'motivation',
    'career',
    'background',
    'role',
    'elite',
    'divination',
    'race',
    'archetype',
    'pride',
    'disgrace',
    'regiment',
    'speciality',
    'chapter',
] as const;

type Step = (typeof ORIGIN_PATH_STEPS)[number];

interface OriginPathLike {
    [key: string]: string | undefined;
}

interface ActorLike {
    type?: string;
    system?: { gameSystem?: string; originPath?: OriginPathLike };
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Actor.update accepts open-ended Record<string,unknown>
    update?: (data: Record<string, unknown>) => Promise<unknown>;
}

function packPrefixForActor(gameSystem: string | undefined): string {
    if (gameSystem === 'dh1e') return 'dh1';
    if (gameSystem === 'dh2e') return 'dh2';
    return gameSystem ?? '';
}

export async function backfillOriginPathUuids(): Promise<void> {
    if (!uuidNameCache.isReady()) return;
    // eslint-disable-next-line no-restricted-syntax -- boundary: game.actors is a Foundry WorldCollection typed loosely by fvtt-types; narrowing to ActorLike shapes the surface we read on the next pass
    const actors = Array.from(game.actors as unknown as Iterable<ActorLike>);

    for (const actor of actors) {
        if (actor.type !== 'character') continue;
        const sys = actor.system;
        const origin = sys?.originPath;
        if (origin == null) continue;
        const prefix = packPrefixForActor(sys?.gameSystem);
        if (prefix.length === 0) continue;

        const updates: Record<string, string> = {};
        for (const step of ORIGIN_PATH_STEPS) {
            const name = origin[step];
            const uuidKey: `${Step}Uuid` = `${step}Uuid`;
            const existingUuid = origin[uuidKey];
            if (typeof name !== 'string' || name.length === 0) continue;
            if (typeof existingUuid === 'string' && existingUuid.length > 0) continue;
            const resolved = uuidNameCache.findByName(prefix, name);
            if (resolved != null) updates[`system.originPath.${uuidKey}`] = resolved;
        }

        if (Object.keys(updates).length === 0) continue;
        if (typeof actor.update === 'function') {
            try {
                // eslint-disable-next-line no-await-in-loop -- sequential actor updates avoid race against Foundry's actor-document write queue
                await actor.update(updates);
            } catch (err) {
                console.warn('[wh40k-rpg] originPath UUID backfill: actor update failed', err);
            }
        }
    }
}
