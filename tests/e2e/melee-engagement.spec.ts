import type { Page } from '@playwright/test';
import { type HarnessScene, type HarnessTokenSpec, installAttackHarness, leanWeapon } from './lib/attack-harness';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { compendiumUuid } from './lib/pack-lookup';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B for melee engagement, leaving melee, declaring moves and Charge (0.3.0),
 * on a live DH2 world with 1 m squares:
 * - the combat tracker names who a combatant is engaged with (#804);
 * - two on one, the attack card itemises Ganging Up as "2 against 1" at +10 (#804);
 * - shooting at a foe engaged with an ally selects Engaged in Melee (−20) (#804);
 * - an engaged character's Lasgun is refused and its Laspistol fires (#804);
 * - moving out of melee is held for the foe's free attack; declining lets it go (#770);
 * - the first move of a turn asks which action it is; a Half Move spends a Half Action (#805);
 * - with Charge selected, targets too close are greyed out; rolling the charge moves
 *   the charger into contact (#806).
 *
 * Each flow records under `melee-engagement.flow`. Keys MUST match
 * MELEE_ENGAGEMENT_FLOWS in scripts/e2e-coverage.mjs.
 */
const MELEE_ENGAGEMENT_FLOWS = [
    'tracker-shows-engaged',
    'gang-up-ratio-on-card',
    'shooting-into-melee-auto',
    'ranged-refused-while-engaged',
    'leave-melee-held-then-released',
    'move-declared-as-half',
    'charge-greys-and-moves',
] as const;
type FlowName = (typeof MELEE_ENGAGEMENT_FLOWS)[number];

const CHAINSWORD = compendiumUuid({ line: 'dh2', category: 'weapons' }, 'z5A6b7C8d9E0f1G2');
const LASGUN = compendiumUuid({ line: 'dh2', category: 'weapons' }, 'z3A4b5C6d7E8f9G0');
const LASPISTOL = compendiumUuid({ line: 'dh2', category: 'weapons' }, 'f1G2h3I4j5K6l7M8');
const MODULE_ROOT = '/systems/wh40k-rpg/module';

/** A friendly acolyte with a chainsword, a lasgun and a laspistol; Agility 40 (Half 4 m, Charge 12 m). */
const acolyte = (key: string, name: string, x: number, y: number): HarnessTokenSpec => ({
    key,
    name,
    type: 'dh2-character',
    x,
    y,
    items: [leanWeapon('Chainsword', CHAINSWORD, 0), leanWeapon('Lasgun', LASGUN, 60), leanWeapon('Laspistol', LASPISTOL, 30)],
    system: { characteristics: { weaponSkill: { base: 40 }, ballisticSkill: { base: 40 }, agility: { base: 40 } } },
});

// 100 px squares, 1 m each. The ork at (4,3) is engaged with the acolyte (3,3) and the ally (5,3).
const TOKENS: HarnessTokenSpec[] = [
    acolyte('acolyte', 'Engaged Acolyte', 300, 300),
    acolyte('ally', 'Flanking Ally', 500, 300),
    acolyte('shooter', 'Rear Shooter', 300, 700),
    acolyte('charger', 'Charging Acolyte', 300, 1000),
    { key: 'ork', name: 'Engaged Ork', type: 'dh2-npc', x: 400, y: 300 },
    { key: 'close', name: 'Close Ork', type: 'dh2-npc', x: 500, y: 1000 },
    { key: 'far', name: 'Far Ork', type: 'dh2-npc', x: 1000, y: 1000 },
];
const FRIENDS = ['acolyte', 'ally', 'shooter', 'charger'];
const FOES = ['ork', 'close', 'far'];

/** Set the tokens' dispositions and start a combat holding them all; returns the combat id. */
async function startCombat(page: Page, scene: HarnessScene): Promise<string> {
    return page.evaluate(
        async ({ sceneId, friends, foes }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                game: { scenes: { get: (i: string) => { updateEmbeddedDocuments: (t: string, d: object[]) => Promise<object[]> } | undefined } };
                Combat: {
                    create: (
                        d: object,
                    ) => Promise<{ id: string; createEmbeddedDocuments: (t: string, d: object[]) => Promise<object[]>; startCombat: () => Promise<object> }>;
                };
            };
            await g.game.scenes
                .get(sceneId)
                ?.updateEmbeddedDocuments('Token', [
                    ...friends.map((id) => ({ _id: id, disposition: 1 })),
                    ...foes.map((id) => ({ _id: id, disposition: -1 })),
                ]);
            const combat = await g.Combat.create({ scene: sceneId, active: true });
            await combat.createEmbeddedDocuments(
                'Combatant',
                [...friends, ...foes].map((tokenId) => ({ tokenId, sceneId })),
            );
            await combat.startCombat();
            return combat.id;
        },
        { sceneId: scene.sceneId, friends: FRIENDS.map((k) => scene.tokens[k] ?? ''), foes: FOES.map((k) => scene.tokens[k] ?? '') },
    );
}

/** Make `tokenId`'s combatant the active one. */
async function setTurn(page: Page, tokenId: string): Promise<void> {
    await page.evaluate(async (id) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as { game: { combat: { turns: Array<{ tokenId: string }>; update: (d: object) => Promise<object> } | null } };
        const combat = g.game.combat;
        if (combat === null) throw new Error('no combat');
        await combat.update({ turn: combat.turns.findIndex((c) => c.tokenId === id) });
    }, tokenId);
}

/** The text of the messages an attack posted, joined. */
async function messageText(page: Page, ids: readonly string[]): Promise<string> {
    return page.evaluate((list) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as { game: { messages: { get: (i: string) => { content: string } | undefined } } };
        const div = document.createElement('div');
        div.innerHTML = list.map((id) => g.game.messages.get(id)?.content ?? '').join('\n');
        return div.textContent.replace(/\s+/g, ' ');
    }, ids);
}

/** Who the combat tracker says a combatant's row is engaged with. */
async function trackerEngaged(page: Page, tokenId: string): Promise<string> {
    return page.evaluate(async (id) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as {
            game: { combat: { combatants: { contents: Array<{ id: string; tokenId: string }> } } | null };
            ui: { combat: { render: (o?: object) => Promise<object>; element: HTMLElement | null } };
        };
        await g.ui.combat.render({ force: true });
        const row = g.game.combat?.combatants.contents.find((c) => c.tokenId === id);
        await globalThis.wh40kE2E.pollUntil(
            () => (g.ui.combat.element?.querySelector(`[data-combatant-id="${row?.id ?? ''}"] [data-tracker-engaged]`) ?? null) !== null,
            10_000,
        );
        return (
            g.ui.combat.element?.querySelector<HTMLElement>(`[data-combatant-id="${row?.id ?? ''}"] [data-tracker-engaged]`)?.dataset['trackerEngaged'] ?? ''
        );
    }, tokenId);
}

/** A token's position. */
async function positionOf(page: Page, sceneId: string, tokenId: string): Promise<{ x: number; y: number }> {
    return page.evaluate(
        ({ s, t }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                game: { scenes: { get: (i: string) => { tokens: { get: (i: string) => { x: number; y: number } | undefined } } | undefined } };
            };
            const doc = g.game.scenes.get(s)?.tokens.get(t);
            return { x: doc?.x ?? -1, y: doc?.y ?? -1 };
        },
        { s: sceneId, t: tokenId },
    );
}

/** Move a token (as the GM), with the movement automation setting given. */
async function moveToken(page: Page, sceneId: string, tokenId: string, to: { x: number; y: number }, automation: string): Promise<void> {
    await page.evaluate(
        async ({ s, t, x, y, mode }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                game: {
                    settings: { set: (scope: string, key: string, value: string) => Promise<object> };
                    scenes: { get: (i: string) => { tokens: { get: (i: string) => { update: (d: object) => Promise<object> } | undefined } } | undefined };
                };
            };
            await g.game.settings.set('wh40k-rpg', 'movement-automation', mode);
            void g.game.scenes.get(s)?.tokens.get(t)?.update({ x, y });
            await globalThis.wh40kE2E.settle(800);
        },
        { s: sceneId, t: tokenId, x: to.x, y: to.y, mode: automation },
    );
}

/** The leaving-melee card's foe rows, and press one of its buttons. */
async function pressLeaveMelee(page: Page, button: 'decline' | 'release'): Promise<{ found: boolean; foes: string[] }> {
    return page.evaluate(async (which) => {
        const card = [...document.querySelectorAll<HTMLElement>('#chat-log [data-leave-melee-card]')].at(-1);
        if (card === undefined) return { found: false, foes: [] };
        const foes = [...card.querySelectorAll<HTMLElement>('[data-leave-melee-foe]')].map((li) => li.dataset['leaveMeleeFoe'] ?? '');
        card.querySelector<HTMLElement>(`[data-leave-melee="${which}"]`)?.click();
        await globalThis.wh40kE2E.settle(1500);
        return { found: true, foes };
    }, button);
}

/** Answer the move-declaration dialog with `choice`; returns the choices it offered. */
async function answerMoveDialog(page: Page, choice: string): Promise<string[]> {
    return page.evaluate(async (pick) => {
        await globalThis.wh40kE2E.pollUntil(
            () => document.querySelector('.application.dialog [data-action="half"], .application.dialog [data-action="full"]') !== null,
            10_000,
        );
        const dialog = [...document.querySelectorAll<HTMLElement>('.application.dialog')].at(-1);
        const offered = [...(dialog?.querySelectorAll<HTMLElement>('footer [data-action]') ?? [])].map((b) => b.dataset['action'] ?? '');
        dialog?.querySelector<HTMLElement>(`[data-action="${pick}"]`)?.click();
        await globalThis.wh40kE2E.settle(1500);
        return offered;
    }, choice);
}

/** The combatant's declared move and Half Actions left. */
async function declaredOf(page: Page, tokenId: string): Promise<{ declared: string; halfRemaining: number }> {
    return page.evaluate(
        async ({ id, root }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                game: {
                    combat: {
                        combatants: { contents: Array<{ tokenId: string; actorId: string; getFlag: (s: string, k: string) => string | undefined }> };
                    } | null;
                };
            };
            const economy = (await import(/* @vite-ignore */ `${root}/rules/action-economy.js`)) as {
                actionBudgetForActor: (actorId: string, tokenId: string | null) => { halfRemaining: number } | null;
            };
            const combatant = g.game.combat?.combatants.contents.find((c) => c.tokenId === id);
            return {
                declared: combatant?.getFlag('wh40k-rpg', 'moveDeclared') ?? 'none',
                halfRemaining: combatant === undefined ? -1 : economy.actionBudgetForActor(combatant.actorId, id)?.halfRemaining ?? -1,
            };
        },
        { id: tokenId, root: MODULE_ROOT },
    );
}

/** Open the charger's Chainsword attack with Charge selected and read the target rows. */
async function chargeRows(page: Page, scene: HarnessScene): Promise<{ disabled: string[]; enabled: string[] }> {
    return page.evaluate(
        async ({ root, chargerId }) => {
            interface TokenLike {
                actor: { items: { contents: Array<{ name: string }> } } | null;
            }
            interface Dialog {
                rendered: boolean;
                element: HTMLElement;
                close: () => Promise<void>;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                canvas: { tokens: { get: (i: string) => TokenLike | undefined } };
                foundry: { applications: { instances: Map<string, object> } };
            };
            const targeted = (await import(/* @vite-ignore */ `${root}/actions/targeted-action-manager.js`)) as {
                DHTargetedActionManager: { performWeaponAttack: (s: TokenLike, t: TokenLike | null, w: object) => void };
            };
            const dialogModule = (await import(/* @vite-ignore */ `${root}/applications/prompts/unified-roll-dialog.js`)) as {
                default: abstract new (...a: never[]) => object;
            };
            const findDialog = (): Dialog | null => {
                for (const app of g.foundry.applications.instances.values()) if (app instanceof dialogModule.default) return app as Dialog;
                return null;
            };
            const charger = g.canvas.tokens.get(chargerId);
            const weapon = charger?.actor?.items.contents.find((i) => i.name === 'Chainsword');
            if (charger === undefined || weapon === undefined) throw new Error('no charger or chainsword');
            targeted.DHTargetedActionManager.performWeaponAttack(charger, null, weapon);
            await globalThis.wh40kE2E.pollUntil(() => findDialog()?.rendered === true, 15_000);
            const dialog = findDialog();
            if (dialog === null) throw new Error('no attack dialog');
            dialog.element.querySelector<HTMLElement>('[data-action="selectAttackMode"][data-mode-key="charge"]')?.click();
            await globalThis.wh40kE2E.pollUntil(() => dialog.element.querySelector('option[data-charge-out-of-range]') !== null, 10_000);
            const options = [...dialog.element.querySelectorAll<HTMLOptionElement>('select[name="targetCombatantId"] option')].filter((o) => o.value !== '');
            const result = {
                disabled: options.filter((o) => o.disabled).map((o) => o.textContent.trim()),
                enabled: options.filter((o) => !o.disabled).map((o) => o.textContent.trim()),
            };
            await dialog.close();
            return result;
        },
        { root: MODULE_ROOT, chargerId: scene.tokens['charger'] ?? '' },
    );
}

test.describe.serial('melee engagement, leaving melee, declared moves and Charge (Tier B, #804 #770 #805 #806)', () => {
    test.setTimeout(scaledMs(420_000));
    test('engagement shapes attacks and movement as the rules print', async ({ page }) => {
        await joinOrSkip(page);
        await installAttackHarness(page);
        const passed = new Map<FlowName, string | null>();
        const pass = (flow: FlowName, ok: boolean, detail: string): void => {
            passed.set(flow, ok ? null : detail);
        };
        try {
            const scene: HarnessScene = await page.evaluate(async (tokens) => globalThis.wh40kAttack.setup({ width: 1400, height: 1200, tokens }), TOKENS);
            const id = (key: string): string => scene.tokens[key] ?? '';
            await startCombat(page, scene);

            // --- #804: the tracker names the engaged foe --------------------------------
            const engagedWith = await trackerEngaged(page, id('acolyte'));
            pass('tracker-shows-engaged', engagedWith.includes('Engaged Ork'), engagedWith);

            // --- #804: two on one, Ganging Up +10 on the card ----------------------------
            const gang = await page.evaluate(
                async (a) => globalThis.wh40kAttack.attack({ firer: a.firer, target: a.target, weaponName: 'Chainsword', faces: [[10, 100]] }),
                { firer: id('acolyte'), target: id('ork') },
            );
            const gangText = await messageText(page, gang.messageIds);
            pass('gang-up-ratio-on-card', gangText.includes('Ganging Up (2 against 1)'), gangText.slice(0, 600));

            // --- #804: the rear shooter fires into the melee: Engaged in Melee −20 --------
            const shot = await page.evaluate(
                async (a) => globalThis.wh40kAttack.attack({ firer: a.firer, target: a.target, weaponName: 'Lasgun', faces: [[10, 100]] }),
                { firer: id('shooter'), target: id('ork') },
            );
            const shotText = await messageText(page, shot.messageIds);
            pass('shooting-into-melee-auto', shotText.includes('Engaged in Melee'), shotText.slice(0, 600));

            // --- #804: engaged, the lasgun is refused; the laspistol fires ---------------
            const lasgun = await page.evaluate(
                async (a) => globalThis.wh40kAttack.attack({ firer: a.firer, target: a.target, weaponName: 'Lasgun', faces: [[10, 100]] }),
                { firer: id('acolyte'), target: id('ork') },
            );
            const pistol = await page.evaluate(
                async (a) => globalThis.wh40kAttack.attack({ firer: a.firer, target: a.target, weaponName: 'Laspistol', faces: [[10, 100]] }),
                { firer: id('acolyte'), target: id('ork') },
            );
            pass(
                'ranged-refused-while-engaged',
                lasgun.messageIds.length === 0 && lasgun.notices.some((n) => n.includes('only a Pistol-class weapon')) && pistol.messageIds.length > 0,
                JSON.stringify({ lasgun, pistol: pistol.messageIds.length }),
            );

            // --- #770: the acolyte walks away: held for the ork's free attack ------------
            await setTurn(page, id('acolyte'));
            const start = await positionOf(page, scene.sceneId, id('acolyte'));
            await moveToken(page, scene.sceneId, id('acolyte'), { x: 300, y: 500 }, 'none');
            const held = await positionOf(page, scene.sceneId, id('acolyte'));
            await snap(page, 'melee-engagement-leave-melee-card', { selector: '#chat-log [data-leave-melee-card]' });
            const card = await pressLeaveMelee(page, 'decline');
            const after = await positionOf(page, scene.sceneId, id('acolyte'));
            pass(
                'leave-melee-held-then-released',
                held.x === start.x && held.y === start.y && card.found && card.foes.includes(id('ork')) && after.y === 500,
                JSON.stringify({ start, held, card, after }),
            );

            // --- #805: the shooter's first move of its turn: a Half Move -----------------
            await setTurn(page, id('shooter'));
            const shooterStart = await positionOf(page, scene.sceneId, id('shooter'));
            await moveToken(page, scene.sceneId, id('shooter'), { x: 300, y: 900 }, 'full');
            await snap(page, 'melee-engagement-move-declaration', { selector: '.application.dialog' });
            const offered = await answerMoveDialog(page, 'half');
            const declared = await declaredOf(page, id('shooter'));
            const shooterAfter = await positionOf(page, scene.sceneId, id('shooter'));
            pass(
                'move-declared-as-half',
                offered.includes('half') && offered.includes('run') && !offered.includes('full') && declared.declared === 'half' && shooterAfter.y === 900,
                JSON.stringify({ shooterStart, offered, declared, shooterAfter }),
            );

            // --- #806: Charge greys out the close ork; charging the far ork closes in ------
            await setTurn(page, id('charger'));
            const rows = await chargeRows(page, scene);
            const charge = await page.evaluate(
                async (a) =>
                    globalThis.wh40kAttack.attack({
                        firer: a.firer,
                        target: a.target,
                        weaponName: 'Chainsword',
                        faces: [[10, 100]],
                        choices: { action: 'Charge' },
                    }),
                { firer: id('charger'), target: id('far') },
            );
            const chargerAt = await positionOf(page, scene.sceneId, id('charger'));
            await snap(page, 'melee-engagement-charge-arrived', { selector: '#board' });
            pass(
                'charge-greys-and-moves',
                rows.disabled.some((r) => r.startsWith('Close Ork')) &&
                    rows.enabled.some((r) => r.startsWith('Far Ork')) &&
                    charge.messageIds.length > 0 &&
                    chargerAt.x === 900 &&
                    chargerAt.y === 1000,
                JSON.stringify({ rows, charge: charge.messageIds.length, notices: charge.notices, chargerAt }),
            );
        } finally {
            await page.evaluate(async () => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
                const g = globalThis as unknown as {
                    game: {
                        combats: { contents: Array<{ delete: () => Promise<object> }> };
                        settings: { set: (a: string, b: string, c: string) => Promise<object> };
                    };
                };
                for (const combat of [...g.game.combats.contents]) await combat.delete();
                await g.game.settings.set('wh40k-rpg', 'movement-automation', 'full');
                await globalThis.wh40kAttack.teardown();
            });
        }

        const failures: string[] = [];
        for (const flow of MELEE_ENGAGEMENT_FLOWS) {
            const detail = passed.get(flow);
            if (detail === null) recordCoverage('melee-engagement.flow', flow);
            else failures.push(`flow ${flow}: ${detail ?? 'flow did not run'}`);
        }
        expect(failures, failures.join('\n')).toEqual([]);
    });
});
