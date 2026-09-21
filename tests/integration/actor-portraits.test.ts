/**
 * Tier A — the portrait pool (#567) is declared on the UNIVERSAL actor base, so
 * it survives on EVERY actor type, not only the CreatureTemplate → CommonTemplate
 * branch.
 *
 * Regression guard for a real bug caught by the Tier B portrait-control e2e:
 * `NPCData extends HordeTemplate(ActorDataModel)` and does NOT go through
 * CommonTemplate, so while the field lived on CommonTemplate an NPC's authored
 * `system.portraits.variants` was silently dropped by `SchemaField.clean` — and
 * NPCs (bestiary / reinforcement mobs) are exactly what the pool is for. Moving
 * the field to `ActorDataModel` fixes it; this asserts an NPC keeps its pool.
 */

import { describe, expect, it } from 'vitest';
import { bootFoundryOnce, type FoundryRuntime } from './lib/boot';
import { createActor } from './lib/fixtures';
import { requireOrSkip } from './lib/has-foundry';

const ok = requireOrSkip('A');
const bootResult = await bootFoundryOnce();
const skipAll = !ok || !bootResult.booted;
const runtime: FoundryRuntime = bootResult.runtime ?? ({} as FoundryRuntime);

/** The pool a fixture authors; the DataModel must preserve both entries. */
const POOL = {
    portraits: {
        variants: [
            { img: 'icons/svg/cowled.svg', tokenFrame: { cx: 0.5, cy: 0.3, zoom: 1 } },
            { img: 'icons/svg/terror.svg', tokenFrame: { cx: 0.5, cy: 0.3, zoom: 1 } },
        ],
        pinned: null,
    },
};

interface ActorWithPortraits {
    system: { portraits?: { variants?: object[]; pinned?: number | null } };
}

// The NPC branch is the regression (HordeTemplate, not CommonTemplate); the
// character branch is the one that always worked — both must keep the pool.
const ACTOR_TYPES = ['dh2-npc', 'dh2-character'] as const;

describe.skipIf(skipAll)('actor portrait pool survives on every actor type (#567)', () => {
    it.each(ACTOR_TYPES)('%s keeps its authored portraits.variants through the DataModel', async (type) => {
        const actor = (await createActor(runtime, { type, name: `Pool ${type}`, system: { gameSystem: 'dh2', ...POOL } })) as ActorWithPortraits;
        const variants = actor.system.portraits?.variants;
        expect(Array.isArray(variants), `${type}: portraits.variants should be an array (field present on the schema)`).toBe(true);
        expect(variants).toHaveLength(2);
    });

    it('dh2-npc — the regressed branch — keeps the pinned slot too', async () => {
        const actor = (await createActor(runtime, {
            type: 'dh2-npc',
            name: 'Pinned NPC',
            system: { gameSystem: 'dh2', portraits: { variants: POOL.portraits.variants, pinned: 1 } },
        })) as ActorWithPortraits;
        expect(actor.system.portraits?.pinned).toBe(1);
    });
});
