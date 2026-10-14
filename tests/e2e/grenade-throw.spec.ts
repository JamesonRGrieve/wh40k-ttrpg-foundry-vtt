import type { Page } from '@playwright/test';
import { type HarnessScene, installAttackHarness, leanWeapon } from './lib/attack-harness';
import { popOutChatMessage } from './lib/chat-capture';
import { recordCoverage } from './lib/coverage-tracker';
import { assertFlowResults } from './lib/flow-assert';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B coverage of grenade detection (#619, src/module/rules/grenade-weapon.ts and
 * its consumers: the sheet's Throw routing, the Strength Bonus on thrown damage, the
 * Weapon Training exemption) and of grenade riders read from pack data (#135,
 * src/module/rules/grenade-rider.ts and the grenade throw dialog).
 *
 * Detection called `.includes` on `special`, a Set at runtime, so no grenade was ever
 * recognised. It now reads each weapon's class and type, as every grenade in the
 * packs is authored. A grenade's rider — its test, area, duration and effect — is its
 * compendium document's `system.rider`, joined onto the lean owned item. A DH2
 * acolyte (Strength 40) carries a Frag Grenade (no rider) and four rider grenades:
 * Photon Flash, Smoke, Psychotroke and Tears of the Emperor.
 *
 * - the Frag Grenade reads as a grenade, needs no Weapon Training, and its damage
 *   adds no Strength Bonus; its damage prompt shows the whole "Explosive" damage type
 *   inside the select (#624);
 * - throwing the Photon Flash Grenade from the sheet opens the grenade dialog on
 *   that grenade, listing the four rider grenades and not the Frag Grenade;
 * - picking another grenade in the dialog shows its rider (Psychotroke's step-up);
 * - its Throw posts the card with the Photon Flash's pack rider: Agility +10, the
 *   Blast (6) radius, rounds per degree of failure and the book's effect;
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
    'damage-prompt-type-unclipped',
    'save-grenade-opens-dialog-on-it',
    'dialog-lists-only-rider-grenades',
    'dialog-selection-shows-its-rider',
    'save-grenade-card-posted',
    'rider-card-reads-pack-data',
    'damage-grenade-throws-with-blast',
] as const;
type FlowName = (typeof GRENADE_THROW_FLOWS)[number];

const WEAPONS = 'Compendium.wh40k-rpg.dh2-core-items-weapons.Item';
const WITHIN_WEAPONS = 'Compendium.wh40k-rpg.dh2-within-items-weapons.Item';
const FRAG_GRENADE = `${WEAPONS}.x1Y2z3A4b5C6d7E8`;
const PHOTON_FLASH = `${WEAPONS}.rpn0j61j1euqi000`;
const SMOKE_GRENADE = `${WEAPONS}.v5W6x7Y8z9A0b1C2`;
const PSYCHOTROKE = `${WITHIN_WEAPONS}.11H4xA4yCvZojuHn`;
const TEARS = `${WITHIN_WEAPONS}.WUQMZb3rGzvRiJi8`;
const RIDER_GRENADES = ['Photon Flash Grenade', 'Smoke Grenade', 'Psychotroke Grenade', 'Tears of the Emperor'];
/** The Photon Flash rider the DH2 pack authors (Core p.158), as its card prints it. */
const PHOTON_CARD_TEXT = ['Agility +10', '6 m radius', '1 round per degree of failure', 'Ordinary (+10) Agility test or be blinded'];
/** Psychotroke's step-up (Enemies Within p.44), as the dialog prints it. */
const PSYCHOTROKE_SHIFT = '+1 to the effect roll per degree of failure (max 10)';
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
        items: [
            leanWeapon('Frag Grenade', FRAG_GRENADE, 1),
            leanWeapon('Photon Flash Grenade', PHOTON_FLASH, 1),
            leanWeapon('Smoke Grenade', SMOKE_GRENADE, 1),
            leanWeapon('Psychotroke Grenade', PSYCHOTROKE, 1),
            leanWeapon('Tears of the Emperor', TEARS, 1),
        ],
        system: { characteristics: { ballisticSkill: { base: 50 }, strength: { base: 40 } } },
        flags: { 'wh40k-rpg': { sheetSource: 'authored-build' } },
    },
    { key: 'target', name: 'Heretic', type: 'dh2-npc', x: 700, y: 500, system: { characteristics: { agility: { base: 30 } } } },
    { key: 'near', name: 'Accomplice', type: 'dh2-npc', x: 800, y: 500, system: { characteristics: { agility: { base: 30 } } } },
];

/** The damage prompt's damage-type select (#624): its chosen option, its content height and the option's line height. */
interface TypeSelectRead {
    text: string;
    contentHeight: number;
    lineHeight: number;
}

interface ProbeRead {
    /** The damage prompt's damage-type select, or null when the prompt did not open. */
    typeSelect: TypeSelectRead | null;
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
    game: { actors: { get: (id: string) => ActorDoc | undefined }; messages: { contents: Array<{ id: string; content: string }> } };
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
            return { fragClass: '', fragType: '', fragIsGrenade: false, trained: false, damageFormula: null, damageAppId: null, typeSelect: null };
        /** The damage-type select's chosen option and the box it must fit in (#624). */
        const readTypeSelect = (appId: string | null): TypeSelectRead | null => {
            const select = appId === null ? null : document.querySelector<HTMLSelectElement>(`#${appId} [data-damage-type-select]`);
            if (select === null) return null;
            const style = getComputedStyle(select);
            const fontSize = parseFloat(style.fontSize);
            const parsedLine = parseFloat(style.lineHeight);
            return {
                text: Array.from(select.selectedOptions, (option) => option.textContent.trim()).join(''),
                contentHeight: select.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom),
                // `line-height: normal` reports no pixel value; it is ~1.2× the font size.
                lineHeight: Number.isNaN(parsedLine) ? fontSize * 1.2 : parsedLine,
            };
        };
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
            typeSelect: readTypeSelect(prompt?.id ?? null),
        };
    }, actorId);
}

/** Throw a weapon from the sheet: the sheet's own `itemRoll` action on the weapon's row. */
interface ThrownDialog {
    grenadeDialogId: string | null;
    /** The selected picker row's item id, and the thrown weapon's. */
    selected: string | null;
    thrownId: string | null;
    /** The names on the picker rows. */
    listed: string[];
}

async function throwFromSheet(page: Page, actorId: string, weaponName: string): Promise<ThrownDialog> {
    return page.evaluate(
        async (args: { actorId: string; weaponName: string }): Promise<ThrownDialog> => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as Globals;
            const actor = g.game.actors.get(args.actorId);
            const item = actor?.items.contents.find((i) => i.name === args.weaponName);
            if (actor === undefined || item === undefined) return { grenadeDialogId: null, selected: null, thrownId: null, listed: [] };
            const { waitFor, pollUntil, scaledMs: scale } = globalThis.wh40kE2E;
            await actor.sheet.render({ force: true });
            await waitFor(() => actor.sheet.rendered, 'thrower sheet', scale(10_000));
            const target = document.createElement('div');
            target.dataset['itemId'] = item.id;
            await actor.sheet.options.actions.itemRoll?.call(actor.sheet, new Event('click'), target);
            const dialog = (): HTMLElement | null => document.querySelector<HTMLElement>('.grenade-throw-dialog');
            await pollUntil(() => dialog() !== null, scale(3_000));
            const root = dialog();
            return {
                grenadeDialogId: root?.id ?? null,
                selected: root?.querySelector('[data-grenade-id][aria-checked="true"]')?.getAttribute('data-grenade-id') ?? null,
                thrownId: item.id,
                listed: Array.from(root?.querySelectorAll<HTMLElement>('[data-grenade-id] .tw-font-display') ?? []).map((el) => el.textContent.trim()),
            };
        },
        { actorId, weaponName },
    );
}

/** Click a picker row in the open grenade dialog and read the selected grenade's detail panel. */
async function pickInDialog(page: Page, dialogId: string, actorId: string, weaponName: string): Promise<string> {
    const itemId = await page.evaluate(
        (args: { actorId: string; weaponName: string }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as Globals;
            return g.game.actors.get(args.actorId)?.items.contents.find((i) => i.name === args.weaponName)?.id ?? '';
        },
        { actorId, weaponName },
    );
    await page.locator(`#${dialogId} [data-grenade-id="${itemId}"]`).click();
    await page.locator(`#${dialogId} [data-grenade-id="${itemId}"][aria-checked="true"]`).waitFor({ timeout: scaledMs(5_000) });
    return (await page.locator(`#${dialogId} [data-grenade-detail]`).textContent()) ?? '';
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
            const select = frag.typeSelect;
            record(
                'damage-prompt-type-unclipped',
                select !== null && select.text === 'Explosive' && select.lineHeight <= select.contentHeight,
                `damage-type select ${JSON.stringify(select)}: "Explosive" must fit the select's content box`,
            );
            if (frag.damageAppId !== null) {
                await clearScreenOverlays(page, frag.damageAppId);
                await snap(page, 'grenade-frag-damage-prompt-no-sb', { selector: `#${frag.damageAppId}` });
            }

            // --- Photon Flash: the sheet's throw opens the dialog on it ----------
            const photon = await throwFromSheet(page, throwerId, 'Photon Flash Grenade');
            record(
                'save-grenade-opens-dialog-on-it',
                photon.grenadeDialogId !== null && photon.selected !== null && photon.selected === photon.thrownId,
                `grenade dialog ${String(photon.grenadeDialogId)}, selected ${String(photon.selected)}, thrown ${String(photon.thrownId)}`,
            );
            record(
                'dialog-lists-only-rider-grenades',
                JSON.stringify([...photon.listed].sort()) === JSON.stringify([...RIDER_GRENADES].sort()),
                `picker lists ${JSON.stringify(photon.listed)}, expected ${JSON.stringify(RIDER_GRENADES)}`,
            );
            if (photon.grenadeDialogId !== null) {
                recordCoverage('dialog.render', 'GrenadeThrowDialog');
                await clearScreenOverlays(page, photon.grenadeDialogId);
                await snap(page, 'grenade-photon-flash-throw-dialog', { selector: `#${photon.grenadeDialogId}` });

                // Another grenade's rider, picked in the dialog: Psychotroke's step-up.
                const psychotroke = await pickInDialog(page, photon.grenadeDialogId, throwerId, 'Psychotroke Grenade');
                record(
                    'dialog-selection-shows-its-rider',
                    psychotroke.includes(PSYCHOTROKE_SHIFT) && psychotroke.includes('Toughness -40'),
                    `psychotroke detail: ${psychotroke}`,
                );
                await snap(page, 'grenade-psychotroke-picked-in-dialog', { selector: `#${photon.grenadeDialogId}` });
                await pickInDialog(page, photon.grenadeDialogId, throwerId, 'Photon Flash Grenade');
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
                    const message = g.game.messages.contents.find((m) => !known.has(m.id));
                    if (message === undefined) return null;
                    const text = new DOMParser().parseFromString(message.content, 'text/html').body.textContent;
                    return { id: message.id, text: text.replace(/\s+/g, ' ') };
                }, before);
                record('save-grenade-card-posted', card !== null, 'the Throw posted no card');
                const missing = PHOTON_CARD_TEXT.filter((fragment) => card?.text.includes(fragment) !== true);
                record('rider-card-reads-pack-data', card !== null && missing.length === 0, `card lacks ${JSON.stringify(missing)}: ${card?.text ?? ''}`);
                if (card !== null) await snap(page, 'grenade-photon-flash-thrown-card', { selector: await popOutChatMessage(page, card.id) });
            } else {
                record('dialog-selection-shows-its-rider', false, 'no grenade dialog to pick in');
                record('save-grenade-card-posted', false, 'no grenade dialog to throw from');
                record('rider-card-reads-pack-data', false, 'no grenade dialog to throw from');
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
