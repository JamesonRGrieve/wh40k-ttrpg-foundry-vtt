/**
 * Tier A regression (#689 freeze): every actor sheet asks for the Fate breakdown
 * (`getStatBreakdown('fate')`) while preparing its context. A craft or vehicle has
 * no creature profile (its `characteristics` is null) and no Fate, and
 * `getStatBreakdown` indexed the null characteristics, so no vehicle, craft or
 * terracraft sheet rendered.
 *
 * This runs `getStatBreakdown` on real vehicle, terracraft and character documents
 * built against the booted Foundry runtime. Tier A registers no sheet classes, so
 * the sheet render itself is covered by Tier B (sheet-body-renders, craft-notes-source,
 * screenshots-actor-sheets and the other vehicle-sheet specs).
 */
import { describe, expect, it } from 'vitest';
import { bootFoundryOnce, type FoundryRuntime } from './lib/boot';
import { createActor } from './lib/fixtures';
import { requireOrSkip } from './lib/has-foundry';

const ok = requireOrSkip('A');
const bootResult = await bootFoundryOnce();
const skipAll = !ok || !bootResult.booted;
const runtime: FoundryRuntime = bootResult.runtime ?? ({} as FoundryRuntime);

/** The slice of an actor document this test drives. */
interface ActorProbe {
    getStatBreakdown: (key: string) => { label: string; total: number } | null;
}

async function actorOf(type: string): Promise<ActorProbe> {
    return (await createActor(runtime, { type, name: `Breakdown ${type}` })) as ActorProbe;
}

describe.skipIf(skipAll)('stat breakdown on actors without Fate (Tier A, #689)', () => {
    for (const type of ['dh2-vehicle', 'dh2-terracraft']) {
        it(`${type}: no Fate breakdown, and no characteristic or skill lookup throws`, async () => {
            const actor = await actorOf(type);
            expect(actor.getStatBreakdown('fate')).toBeNull();
            expect(actor.getStatBreakdown('agility')).toBeNull();
            expect(actor.getStatBreakdown('dodge')).toBeNull();
        });
    }

    it('dh2-character: the Fate breakdown is there', async () => {
        const actor = await actorOf('dh2-character');
        expect(actor.getStatBreakdown('fate')).not.toBeNull();
    });
});
