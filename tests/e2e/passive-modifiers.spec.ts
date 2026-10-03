import { joinOrSkip } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B — the read-only passive-modifier block in the Roll Test dialog (#484).
 *
 * Reopened because Superior Chirurgeon's +20 Medicae "showed up nowhere" in the
 * roll screen. `first-aid-flow.spec.ts` already proves the +20 is APPLIED to the
 * live skill; this proves it is also SHOWN — it opens the real Medicae roll
 * dialog on an actor that owns Superior Chirurgeon and asserts the talent renders
 * as a locked, non-interactive passive row (`modifiers.hbs` + `_passiveModifierRows`
 * → `selectPassiveModifierRows`). A screenshot of the open dialog is captured as
 * visual proof.
 */

const SUPERIOR_CHIRURGEON_UUID = 'Compendium.wh40k-rpg.dh2-core-items-talents.Item.DH2aTlnt00000071';

interface DialogProbe {
    dialogPresent: boolean;
    hasSuperiorChirurgeon: boolean;
    hasLockGlyph: boolean;
    passiveRowText: string;
    error: string | null;
}

test('Superior Chirurgeon renders as a read-only passive row in the Medicae roll dialog (#484)', async ({ page }) => {
    await joinOrSkip(page);

    const result = await page.evaluate(async (talentUuid): Promise<DialogProbe> => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals, no repo types available in page.evaluate
        const win = globalThis as unknown as {
            Actor: { create: (data: object) => Promise<ActorProbe | null> };
            fromUuid: (uuid: string) => Promise<{ toObject: () => object } | null>;
        };
        interface ActorProbe {
            createEmbeddedDocuments: (type: string, data: object[]) => Promise<void>;
            prepareData: () => void;
            rollSkill: (key: string) => Promise<void>;
        }
        const fail = (error: string): DialogProbe => ({
            dialogPresent: false,
            hasSuperiorChirurgeon: false,
            hasLockGlyph: false,
            passiveRowText: '',
            error,
        });
        try {
            const actor = await win.Actor.create({
                name: 'probe-passive-medic',
                type: 'dh2-character',
                system: { gameSystem: 'dh2', characteristics: { intelligence: { base: 40, advance: 0, modifier: 0 } } },
            });
            if (actor === null) return fail('Actor.create returned null');
            const talentDoc = await win.fromUuid(talentUuid);
            if (talentDoc?.toObject === undefined) return fail(`talent not found: ${talentUuid}`);
            await actor.createEmbeddedDocuments('Item', [talentDoc.toObject()]);
            actor.prepareData();

            // Open the real Medicae roll dialog (routes through the skill-use flow,
            // which opens the unified Roll Test dialog — nothing is skipped).
            await actor.rollSkill('medicae');
            // Wait for the dialog to render its passive-modifier row (the assertions report a miss).
            await globalThis.wh40kE2E.pollUntil(() => document.querySelector('.unified-roll-dialog')?.textContent.includes('Superior Chirurgeon') === true);

            const dialog = document.querySelector('.unified-roll-dialog');
            if (dialog === null) return fail('unified-roll-dialog did not render');
            const text = dialog.textContent;
            const lock = dialog.querySelector('.fa-lock');
            // The passive row is the <div> containing the source label; capture it.
            const row = Array.from(dialog.querySelectorAll('div')).find((d) => d.textContent.includes('Superior Chirurgeon'));
            return {
                dialogPresent: true,
                hasSuperiorChirurgeon: text.includes('Superior Chirurgeon'),
                hasLockGlyph: lock !== null,
                passiveRowText: (row?.textContent ?? '').replace(/\s+/g, ' ').trim(),
                error: null,
            };
        } catch (err) {
            return fail(err instanceof Error ? err.message : String(err));
        }
    }, SUPERIOR_CHIRURGEON_UUID);

    // Capture the open dialog as visual proof before asserting.
    await page.screenshot({ path: 'test-results/passive-modifiers-dialog.png' });

    expect(result.error, `probe error: ${result.error ?? ''}`).toBeNull();
    expect(result.dialogPresent, 'the Roll Test dialog should open for a Medicae roll').toBe(true);
    expect(result.hasSuperiorChirurgeon, 'Superior Chirurgeon should appear in the dialog').toBe(true);
    expect(result.hasLockGlyph, 'passive rows carry a lock glyph (read-only, non-interactive)').toBe(true);
});
