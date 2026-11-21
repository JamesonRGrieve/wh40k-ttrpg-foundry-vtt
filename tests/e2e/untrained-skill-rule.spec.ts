import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B for #757: each line refuses its own skills untrained, as its core rulebook says.
 *
 * The roll dialog shows the "can't be attempted untrained" banner for a refused test.
 * A fresh character has no skills trained, so every case below is an untrained test:
 * - DH2: a Specialist skill (Forbidden Lore) is refused; Acrobatics, Advanced in the
 *   DH1/RT era but a normal DH2 skill, rolls at −20;
 * - RT: an Advanced skill (Acrobatics) is refused; a Basic one (Awareness) rolls;
 * - BC: only the marked skills are refused: Operate (Voidship) is, Operate (Surface) isn't.
 */

interface Case {
    line: string;
    skill: string;
    specialisation?: string;
    refused: boolean;
}

const CASES: readonly Case[] = [
    { line: 'dh2', skill: 'forbiddenLore', specialisation: 'Daemonology', refused: true },
    { line: 'dh2', skill: 'acrobatics', refused: false },
    { line: 'rt', skill: 'acrobatics', refused: true },
    { line: 'rt', skill: 'awareness', refused: false },
    { line: 'bc', skill: 'operate', specialisation: 'Voidship', refused: true },
    { line: 'bc', skill: 'operate', specialisation: 'Surface', refused: false },
];

interface ProbeActor {
    id: string;
    rollSkill: (skill: string, speciality?: string, options?: { specialisation?: string }) => Promise<void> | void;
    delete: () => Promise<void>;
}
interface ProbeWindow {
    Actor: { create: (data: object) => Promise<ProbeActor | null> };
}

/** Open one untrained skill roll and report whether the dialog refuses it. */
async function probe(page: Page, c: Case): Promise<{ refused: boolean; actorId: string }> {
    const actorId = await page.evaluate(async (args: Case) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        const w = globalThis as unknown as ProbeWindow;
        const actor = await w.Actor.create({ name: `e2e-untrained-${args.line}`, type: `${args.line}-character`, system: { gameSystem: args.line } });
        if (actor === null) throw new Error('Actor.create returned null');
        void actor.rollSkill(args.skill, undefined, args.specialisation === undefined ? {} : { specialisation: args.specialisation });
        return actor.id;
    }, c);
    const dialog = page.locator('form.unified-roll-dialog').last();
    await expect(dialog).toBeVisible();
    const refused = (await dialog.locator('[data-testid="skill-untrained-advanced"]').count()) > 0;
    return { refused, actorId };
}

test.describe.serial('Each line refuses its own skills untrained (Tier B, #757)', () => {
    test.beforeEach(async ({ page }) => {
        await joinOrSkip(page);
    });

    for (const c of CASES) {
        const name = `${c.line} ${c.skill}${c.specialisation === undefined ? '' : ` (${c.specialisation})`}`;
        test(`${name} is ${c.refused ? 'refused' : 'rolled'} untrained`, async ({ page }) => {
            const { refused, actorId } = await probe(page, c);
            expect(refused, `${name}: refusal banner shown`).toBe(c.refused);
            if (c.refused) {
                expect(await snap(page, `untrained-skill-${c.line}-${c.skill}-refused`, { selector: 'form.unified-roll-dialog' })).not.toBeNull();
            }
            await page.evaluate(async (id: string) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
                const g = globalThis as unknown as {
                    foundry: { applications: { instances: Map<string, { close: () => Promise<object>; element?: HTMLElement | null }> } };
                    game: { actors: { get: (i: string) => ProbeActor | undefined } };
                };
                for (const app of [...g.foundry.applications.instances.values()]) {
                    if (app.element?.classList.contains('unified-roll-dialog') === true) await app.close();
                }
                await g.game.actors.get(id)?.delete();
            }, actorId);
            recordCoverage('untrained-skill.rule', `${c.line}:${c.skill}:${c.refused ? 'refused' : 'rolled'}`);
        });
    }
});
