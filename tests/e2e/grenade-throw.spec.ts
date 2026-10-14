import type { Page } from '@playwright/test';
import { type HarnessScene, installAttackHarness, leanWeapon } from './lib/attack-harness';
import { popOutChatMessage } from './lib/chat-capture';
import { assertFlowResults } from './lib/flow-assert';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B coverage of grenade detection (#619, src/module/rules/grenade-weapon.ts and
 * its consumers: the sheet's Throw routing, the Strength Bonus on thrown damage, the
 * Weapon Training exemption).
 *
 * Detection called `.includes` on `special`, a Set at runtime, so no grenade was ever
 * recognised. It now reads each weapon's class and type, as every grenade in the
 * packs is authored. A DH2 acolyte (Strength 40) carries a Frag Grenade and a Photon
 * Flash Grenade:
 *
 * - the Frag Grenade reads as a grenade, needs no Weapon Training, and its damage
 *   adds no Strength Bonus;
 * - throwing the Photon Flash Grenade from the sheet opens the grenade dialog on
 *   that grenade, and its Throw posts the save card;
 * - throwing the Frag Grenade at a target takes the weapon roll, which places its
 *   Blast and resolves who it catches.
 *
 * Grid: 100 px = 1 m. Each flow records under `grenade-throw.flow`. Keys MUST match
 * GRENADE_THROW_FLOWS in scripts/e2e-coverage.mjs.
 */

const GRENADE_THROW_FLOWS = [
    'frag-reads-as-grenade',
    'grenade-needs-no-training',
    'grenade-damage-adds-no-strength-bonus',
    'save-grenade-opens-dialog-on-it',
    'save-grenade-card-posted',
    'damage-grenade-throws-with-blast',
] as const;
type FlowName = (typeof GRENADE_THROW_FLOWS)[number];

const WEAPONS = 'Compendium.wh40k-rpg.dh2-core-items-weapons.Item';
const FRAG_GRENADE = `${WEAPONS}.x1Y2z3A4b5C6d7E8`;
const PHOTON_FLASH = `${WEAPONS}.rpn0j61j1euqi000`;
const STRENGTH_BONUS = 4;
/** The Frag Grenade's printed damage: no Strength Bonus is added to a grenade. */
const FRAG_DAMAGE = '2d10';

const TOKENS = [
    {
        key: 'thrower',
        name: 'Grenadier',
        type: 'dh2-character',
        x: 200,
        y: 500,
        items: [leanWeapon('Frag Grenade', FRAG_GRENADE, 1), leanWeapon('Photon Flash Grenade', PHOTON_FLASH, 1)],
        system: { characteristics: { ballisticSkill: { base: 50 }, strength: { base: 40 } } },
        flags: { 'wh40k-rpg': { sheetSource: 'authored-build' } },
    },
    { key: 'target', name: 'Heretic', type: 'dh2-npc', x: 700, y: 500, system: { characteristics: { agility: { base: 30 } } } },
    { key: 'near', name: 'Accomplice', type: 'dh2-npc', x: 800, y: 500, system: { characteristics: { agility: { base: 30 } } } },
];

interface ProbeRead {
    fragClass: string;
    fragType: string;
    fragIsGrenade: boolean;
    trained: boolean;
    /** The formula the damage prompt shows for the Frag Grenade. */
    damageFormula: string | null;
    damageAppId: string | null;
}

interface WeaponItem {
    id: string;
    name: string;
    system: { class: string; type: string; special: Set<string>; requiredTraining?: string };
    update: (d: object) => Promise<object>;
}

interface ActorDoc {
    id: string;
    items: { contents: WeaponItem[] };
    damageItem: (id: string) => Promise<void>;
    sheet: {
        id: string;
        rendered: boolean;
        render: (o: { force: boolean }) => Promise<object>;
        options: { actions: { itemRoll?: (this: object, event: Event, target: HTMLElement) => Promise<void> } };
    };
}

interface Globals {
    game: { actors: { get: (id: string) => ActorDoc | undefined }; messages: { contents: Array<{ id: string }> } };
    foundry: {
        applications: {
            instances: Map<string, { id: string; constructor: { name: string }; rollData?: { damage?: string | object }; close: () => Promise<object> }>;
        };
    };
}

/** Read the Frag Grenade's classification, its training check and the bonus its damage prompt carries. */
async function probeFrag(page: Page, actorId: string): Promise<ProbeRead> {
    return page.evaluate(async (id: string): Promise<ProbeRead> => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as Globals;
        const actor = g.game.actors.get(id);
        const frag = actor?.items.contents.find((item) => item.name === 'Frag Grenade');
        if (actor === undefined || frag === undefined)
            return { fragClass: '', fragType: '', fragIsGrenade: false, trained: false, damageFormula: null, damageAppId: null };
        const rulesRoot = '/systems/wh40k-rpg/module/rules';
        const grenadeModule = (await import(/* @vite-ignore */ `${rulesRoot}/grenade-weapon.js`)) as {
            isGrenadeWeapon: (s: object) => boolean;
        };
        const trainingModule = (await import(/* @vite-ignore */ `${rulesRoot}/weapon-training.js`)) as {
            checkWeaponTraining: (a: object, w: object) => { trained: boolean };
        };
        // The damage prompt is opened by the actor's own damage roll; an equipped weapon only.
        await frag.update({ 'system.state.equipped': true });
        const before = new Set(g.foundry.applications.instances.keys());
        await actor.damageItem(frag.id);
        const { pollUntil } = globalThis.wh40kE2E;
        const findPrompt = (): { id: string; rollData?: { damage?: string | object } } | undefined =>
            Array.from(g.foundry.applications.instances.values()).find((app) => !before.has(app.id) && app.constructor.name === 'DamageRollDialog');
        await pollUntil(() => findPrompt() !== undefined);
        const prompt = findPrompt();
        return {
            fragClass: frag.system.class,
            fragType: frag.system.type,
            fragIsGrenade: grenadeModule.isGrenadeWeapon(frag.system),
            trained: trainingModule.checkWeaponTraining(actor, frag).trained,
            damageFormula: typeof prompt?.rollData?.damage === 'string' ? prompt.rollData.damage : null,
            damageAppId: prompt?.id ?? null,
        };
    }, actorId);
}

/** Throw a weapon from the sheet: the sheet's own `itemRoll` action on the weapon's row. */
async function throwFromSheet(page: Page, actorId: string, weaponName: string): Promise<{ grenadeDialogId: string | null; selected: string | null }> {
    return page.evaluate(
        async (args: { actorId: string; weaponName: string }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as Globals;
            const actor = g.game.actors.get(args.actorId);
            const item = actor?.items.contents.find((i) => i.name === args.weaponName);
            if (actor === undefined || item === undefined) return { grenadeDialogId: null, selected: null };
            const { waitFor, pollUntil, scaledMs: scale } = globalThis.wh40kE2E;
            await actor.sheet.render({ force: true });
            await waitFor(() => actor.sheet.rendered, 'thrower sheet', scale(10_000));
            const target = document.createElement('div');
            target.dataset['itemId'] = item.id;
            await actor.sheet.options.actions.itemRoll?.call(actor.sheet, new Event('click'), target);
            const dialog = (): HTMLElement | null => document.querySelector<HTMLElement>('.grenade-throw-dialog');
            await pollUntil(() => dialog() !== null, scale(3_000));
            return {
                grenadeDialogId: dialog()?.id ?? null,
                selected: dialog()?.querySelector('[data-grenade-id][aria-checked="true"]')?.getAttribute('data-grenade-id') ?? null,
            };
        },
        { actorId, weaponName },
    );
}

test.describe.serial('grenade detection (Tier B, #619)', () => {
    test.setTimeout(scaledMs(300_000));
    test('a grenade is read from its class and type: no training, no SB, the right throw path', async ({ page }) => {
        await joinOrSkip(page);
        await installAttackHarness(page);
        const results: Array<{ name: FlowName; ok: boolean; detail: string | null }> = [];
        const record = (name: FlowName, ok: boolean, detail: string): void => {
            results.push({ name, ok, detail: ok ? null : detail });
        };
        try {
            const scene: HarnessScene = await page.evaluate(async (tokens) => globalThis.wh40kAttack.setup({ width: 1400, height: 1000, tokens }), TOKENS);
            const throwerId = scene.actors['thrower'] ?? '';

            // --- the Frag Grenade's classification, training and damage bonus ----
            const frag = await probeFrag(page, throwerId);
            record('frag-reads-as-grenade', frag.fragClass === 'thrown' && frag.fragType === 'grenade' && frag.fragIsGrenade, `frag ${JSON.stringify(frag)}`);
            record('grenade-needs-no-training', frag.trained, `frag ${JSON.stringify(frag)}`);
            record(
                'grenade-damage-adds-no-strength-bonus',
                frag.damageFormula === FRAG_DAMAGE,
                `damage prompt formula ${String(frag.damageFormula)}, expected ${FRAG_DAMAGE} (Strength Bonus ${STRENGTH_BONUS} must not be added)`,
            );
            if (frag.damageAppId !== null) {
                await clearScreenOverlays(page, frag.damageAppId);
                await snap(page, 'grenade-frag-damage-prompt-no-sb', { selector: `#${frag.damageAppId}` });
            }

            // --- Photon Flash: the sheet's throw opens the dialog on it ----------
            const photon = await throwFromSheet(page, throwerId, 'Photon Flash Grenade');
            record(
                'save-grenade-opens-dialog-on-it',
                photon.grenadeDialogId !== null && photon.selected === 'photonFlash',
                `grenade dialog ${String(photon.grenadeDialogId)}, selected ${String(photon.selected)}`,
            );
            if (photon.grenadeDialogId !== null) {
                await clearScreenOverlays(page, photon.grenadeDialogId);
                await snap(page, 'grenade-photon-flash-throw-dialog', { selector: `#${photon.grenadeDialogId}` });
                const before = await page.evaluate(() => {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
                    const g = globalThis as unknown as Globals;
                    return g.game.messages.contents.map((m) => m.id);
                });
                await page.locator(`#${photon.grenadeDialogId} [data-action="throw"]`).first().click();
                const card = await page.evaluate(async (seen: string[]) => {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
                    const g = globalThis as unknown as Globals;
                    const known = new Set(seen);
                    await globalThis.wh40kE2E.pollUntil(() => g.game.messages.contents.some((m) => !known.has(m.id)));
                    return g.game.messages.contents.find((m) => !known.has(m.id))?.id ?? null;
                }, before);
                record('save-grenade-card-posted', card !== null, 'the Throw posted no card');
                if (card !== null) await snap(page, 'grenade-photon-flash-thrown-card', { selector: await popOutChatMessage(page, card) });
            } else {
                record('save-grenade-card-posted', false, 'no grenade dialog to throw from');
            }

            // --- Frag: the weapon roll throws it and places its Blast ------------
            const thrown = await page.evaluate(async (a) => globalThis.wh40kAttack.attack(a), {
                firer: scene.tokens['thrower'] ?? '',
                target: scene.tokens['target'] ?? '',
                weaponName: 'Frag Grenade',
                faces: [[20, 100]] as Array<[number, number]>,
            });
            const blastCard = await page.evaluate(async (ids: readonly string[]) => {
                for (const id of ids) {
                    const sel = `#sidebar .chat-log .message[data-message-id="${id}"]`;
                    // eslint-disable-next-line no-await-in-loop -- each card is read once it renders
                    await globalThis.wh40kE2E.pollUntil(() => document.querySelector(sel) !== null);
                    if (document.querySelector(`${sel} .roll-control__resolve-area`) !== null) return id;
                }
                return null;
            }, thrown.messageIds);
            let resolved: string | null = null;
            if (blastCard !== null) {
                const posted = await page.evaluate(
                    async (id: string) =>
                        globalThis.wh40kAttack.clickInMessage({ messageId: id, buttonSelector: '.roll-control__resolve-area', faces: [], expectMessages: 1 }),
                    blastCard,
                );
                resolved = posted.at(-1) ?? null;
            }
            record(
                'damage-grenade-throws-with-blast',
                blastCard !== null && resolved !== null,
                `thrown messages ${thrown.messageIds.length}, blast card ${String(blastCard)}, results ${String(resolved)}; notices ${thrown.notices.join(
                    ' | ',
                )}`,
            );
            if (blastCard !== null) await snap(page, 'grenade-frag-thrown-attack-card', { selector: await popOutChatMessage(page, blastCard) });
            if (resolved !== null) await snap(page, 'grenade-frag-blast-results-card', { selector: await popOutChatMessage(page, resolved) });
        } finally {
            await page.evaluate(async () => globalThis.wh40kAttack.teardown());
        }
        assertFlowResults({ results }, GRENADE_THROW_FLOWS, { dimension: 'grenade-throw.flow', label: 'grenade throw' });
    });
});
