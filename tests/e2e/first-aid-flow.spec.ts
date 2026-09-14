import { joinOrSkip } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B live verification of the Medicae First-Aid flow (#432).
 *
 * Runs against a real Foundry world:
 *  1. Superior Chirurgeon's structured `modifiers.skills.medicae = 20` flows
 *     through the compendium-hydrate join + the central skill aggregator onto a
 *     medic's live `system.skills.medicae.current` (the "+20 applied nowhere" bug).
 *  2. A First-Aid resolution reads the patient's wounds + critical damage, removes
 *     (medic Intelligence Bonus + degrees of success) damage taking critical
 *     first (RAW), and **writes the result back to the target** — including the
 *     unlinked-token-shaped path where the actor id resolves normally for a GM.
 */

interface FoundryWindow {
    Actor: { create?: (data: object) => Promise<{ id?: string | null } | null> };
    foundry: { utils?: { getProperty?: (obj: object, path: string) => number | string | boolean | null | undefined } };
}

const SUPERIOR_CHIRURGEON_UUID = 'Compendium.wh40k-rpg.dh2-core-items-talents.Item.DH2aTlnt00000071';

test.describe.serial('First Aid flow (Tier B, #432)', () => {
    test('Superior Chirurgeon grants +20 to Medicae on a live actor', async ({ page }) => {
        await joinOrSkip(page);

        const result = await page.evaluate(async (talentUuid): Promise<{ baseline: number | null; withTalent: number | null; error: string | null }> => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals, no repo types
            const win = globalThis as unknown as FoundryWindow & {
                fromUuid?: (uuid: string) => Promise<{ toObject?: () => object } | null>;
            };
            const ActorCls = win.Actor;
            const getProp = win.foundry.utils?.getProperty;
            if (ActorCls.create === undefined || getProp === undefined || win.fromUuid === undefined) {
                return { baseline: null, withTalent: null, error: 'Foundry globals unavailable' };
            }
            try {
                const actor = await ActorCls.create({
                    name: 'probe-firstaid-medic',
                    type: 'dh2-character',
                    system: { gameSystem: 'dh2', characteristics: { intelligence: { base: 40, advance: 0, modifier: 0 } } },
                });
                if (actor === null) return { baseline: null, withTalent: null, error: 'Actor.create returned null' };
                const readMedicae = (): number => {
                    const v = getProp(actor, 'system.skills.medicae.current');
                    const n = Number(v);
                    return Number.isFinite(n) ? n : Number.NaN;
                };
                const baseline = readMedicae();
                const talentDoc = await win.fromUuid(talentUuid);
                if (talentDoc?.toObject === undefined) return { baseline, withTalent: null, error: `talent not found: ${talentUuid}` };
                // eslint-disable-next-line no-restricted-syntax -- boundary: embedded-document create on a live Actor, untyped here
                await (actor as unknown as { createEmbeddedDocuments: (t: string, d: object[]) => Promise<unknown> }).createEmbeddedDocuments('Item', [
                    talentDoc.toObject(),
                ]);
                // eslint-disable-next-line no-restricted-syntax -- boundary: prepareData re-runs derived skill aggregation
                (actor as unknown as { prepareData: () => void }).prepareData();
                const withTalent = readMedicae();
                return { baseline, withTalent, error: null };
            } catch (err) {
                return { baseline: null, withTalent: null, error: err instanceof Error ? err.message : String(err) };
            }
        }, SUPERIOR_CHIRURGEON_UUID);

        expect(result.error, `probe error: ${result.error ?? ''}`).toBeNull();
        expect(result.baseline, 'baseline medicae unreadable').not.toBeNull();
        expect(result.withTalent, 'with-talent medicae unreadable').not.toBeNull();
        // The talent's structured modifier must add exactly +20 to the live skill.
        expect((result.withTalent ?? 0) - (result.baseline ?? 0)).toBe(20);
    });

    test('First Aid removes IntB + DoS damage (critical first) and writes it to the patient', async ({ page }) => {
        await joinOrSkip(page);

        const result = await page.evaluate(
            async (): Promise<{ critBefore: number; critAfter: number; woundsBefore: number; woundsAfter: number; error: string | null }> => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals, no repo types
                const win = globalThis as unknown as FoundryWindow;
                const ActorCls = win.Actor;
                const getProp = win.foundry.utils?.getProperty;
                const fail = (error: string): { critBefore: number; critAfter: number; woundsBefore: number; woundsAfter: number; error: string } => ({
                    critBefore: 0,
                    critAfter: 0,
                    woundsBefore: 0,
                    woundsAfter: 0,
                    error,
                });
                if (ActorCls.create === undefined || getProp === undefined) return fail('Foundry globals unavailable');
                try {
                    const medic = await ActorCls.create({
                        name: 'probe-firstaid-medic2',
                        type: 'dh2-character',
                        system: { gameSystem: 'dh2', characteristics: { intelligence: { base: 40, advance: 0, modifier: 0 } } },
                    });
                    const patient = await ActorCls.create({
                        name: 'probe-firstaid-patient',
                        type: 'dh2-character',
                        system: { gameSystem: 'dh2', wounds: { value: 3, max: 12, critical: 2 } },
                    });
                    if (medic === null || patient === null) return fail('Actor.create returned null');

                    const numAt = (obj: object, path: string): number => {
                        const n = Number(getProp(obj, path));
                        return Number.isFinite(n) ? n : 0;
                    };
                    const critBefore = numAt(patient, 'system.wounds.critical');
                    const woundsBefore = numAt(patient, 'system.wounds.value');

                    const moduleUrl = '/systems/wh40k-rpg/module/rolls/action-data.js';
                    const mod = (await import(moduleUrl)) as {
                        MedicaeActionData: new (kind: string) => {
                            rollData: { sourceActor: object; targetActor: object; dos: number; success: boolean };
                            descriptionText: () => Promise<void>;
                        };
                    };
                    const ad = new mod.MedicaeActionData('firstAid');
                    ad.rollData.sourceActor = medic;
                    ad.rollData.targetActor = patient;
                    ad.rollData.dos = 1;
                    ad.rollData.success = true;
                    await ad.descriptionText();

                    const critAfter = numAt(patient, 'system.wounds.critical');
                    const woundsAfter = numAt(patient, 'system.wounds.value');
                    return { critBefore, critAfter, woundsBefore, woundsAfter, error: null };
                } catch (err) {
                    return { critBefore: 0, critAfter: 0, woundsBefore: 0, woundsAfter: 0, error: err instanceof Error ? err.message : String(err) };
                }
            },
        );

        expect(result.error, `probe error: ${result.error ?? ''}`).toBeNull();
        // IntB 4 + 1 degree = 5 removed; 2 clear critical first, 3 heal wounds.
        expect(result.critBefore).toBe(2);
        expect(result.critAfter, 'critical damage should be cleared first').toBe(0);
        expect(result.woundsAfter - result.woundsBefore, 'remaining 3 should heal wounds').toBe(3);
    });
});
