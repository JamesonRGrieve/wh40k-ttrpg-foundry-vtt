import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../../../testing/model-import.ts';

/** Minimal structural shapes for exercising synthesizeOriginSpecialistEntries in isolation. */
interface FakeSkillEntry {
    name: string;
    advance?: number;
    characteristic?: string;
    specialization?: string;
}
interface FakeSkill {
    label: string;
    characteristic: string;
    advanced: boolean;
    basic: boolean;
    entries: FakeSkillEntry[];
}
interface FakeGrant {
    name: string;
    specialization?: string;
    level?: string;
}
interface FakeGrantSource {
    grants: { skills: FakeGrant[] };
}
type SynthesizeFn = (grantSources: readonly FakeGrantSource[], skillKey: string, skill: FakeSkill) => void;

describe('CreatureTemplate', () => {
    it('has a default CreatureTemplate symbol exported', async () => {
        const mod = await importModelOrSkip(import('./creature.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    it('does not throw when legacy actor data has no characteristics block', async () => {
        const mod = await importModelOrSkip(import('./creature.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;

        const CreatureTemplate = mod.default;
        const source: Parameters<typeof CreatureTemplate._migrateData>[0] = {};

        expect(() => CreatureTemplate._migrateData(source)).not.toThrow();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - skills array shape (standard + specialist split)
    //   - prepareDerivedData computes skill rank/trained/plus10/plus20/plus30

    describe('synthesizeOriginSpecialistEntries', () => {
        const aat: FakeGrantSource = {
            grants: {
                skills: [
                    { name: 'Common Lore', specialization: 'Adeptus Astra Telepathica', level: 'trained' },
                    { name: 'Forbidden Lore', specialization: 'the Warp', level: 'trained' },
                    { name: 'Awareness', level: 'trained' }, // flat grant — must never seed an entry
                ],
            },
        };

        async function load(): Promise<SynthesizeFn | undefined> {
            const mod = await importModelOrSkip(import('./creature.ts'));
            if (mod === undefined) return undefined;
            return mod.synthesizeOriginSpecialistEntries;
        }

        it('seeds a derived row for an origin-granted specialization, ignoring flat grants', async () => {
            const synth = await load();
            // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom
            if (synth === undefined) return;

            const skill: FakeSkill = { label: 'Common Lore', characteristic: 'Int', advanced: true, basic: false, entries: [] };
            synth([aat], 'commonLore', skill);

            expect(skill.entries.map((e) => e.name)).toEqual(['Adeptus Astra Telepathica']);
            expect(skill.entries[0]?.advance).toBe(0);
            expect(skill.entries[0]?.characteristic).toBe('Int');
        });

        it('does not duplicate a specialization already present (case-insensitive), and is idempotent', async () => {
            const synth = await load();
            // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom
            if (synth === undefined) return;

            const skill: FakeSkill = {
                label: 'Common Lore',
                characteristic: 'Int',
                advanced: true,
                basic: false,
                entries: [{ name: 'adeptus astra telepathica', advance: 1 }],
            };
            synth([aat], 'commonLore', skill);
            synth([aat], 'commonLore', skill);

            expect(skill.entries).toHaveLength(1);
            expect(skill.entries[0]?.advance).toBe(1); // the player's purchased advance is preserved
        });

        it('no-ops for a specialist skill with no matching grant', async () => {
            const synth = await load();
            // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom
            if (synth === undefined) return;

            const skill: FakeSkill = { label: 'Navigate', characteristic: 'Int', advanced: true, basic: false, entries: [] };
            synth([aat], 'navigate', skill);

            expect(skill.entries).toHaveLength(0);
        });
    });
});
