import type { Page } from '@playwright/test';
import { type HarnessScene, installAttackHarness, leanWeapon } from './lib/attack-harness';
import { type CanvasPoint, canvasClip } from './lib/canvas-capture';
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
 *   Blast and resolves who it catches;
 * - Tears of the Emperor is a rider grenade that deals damage (#622): its Throw takes
 *   the weapon roll too (BS test, Blast, damage), and its damage card states its rider
 *   after the hits, for both creatures the Blast caught;
 * - the Frag Grenade's damage prompt has its Roll and Cancel footer (#698): Cancel closes
 *   it and posts nothing, Roll posts the damage card and closes it;
 * - the Photon Flash's Throw places its rider area on the targeted Heretic (#623), and
 *   its card's Resolve Rider rolls Agility +10 for both creatures inside: the Heretic
 *   fails by three degrees and is Blinded for three rounds (the status on its token),
 *   the Accomplice resists;
 * - the Rad Grenade (Enemies Within p.44) rolls its damage, then its damage card's
 *   Resolve Rider rolls Toughness −20 for both creatures struck, and the one that fails
 *   takes its rolled 2d10 Toughness damage (#698);
 * - a Rogue Trader thrower's Psyk-out (the shared document's RT branch, Faith and Coin
 *   p.85) tests the psyker only: it is Stunned for its rolled rounds, its Stunned visual
 *   on the token, and the bystander is unaffected.
 *
 * Grid: 100 px = 1 m. Each flow records under `grenade-throw.flow`. Keys MUST match
 * GRENADE_THROW_FLOWS in scripts/e2e-coverage.mjs.
 */

const GRENADE_THROW_FLOWS = [
    'frag-reads-as-grenade',
    'grenade-needs-no-training',
    'grenade-damage-adds-no-strength-bonus',
    'damage-prompt-type-unclipped',
    'damage-prompt-rolls-and-cancels',
    'save-grenade-opens-dialog-on-it',
    'dialog-lists-only-rider-grenades',
    'dialog-selection-shows-its-rider',
    'save-grenade-card-posted',
    'rider-card-reads-pack-data',
    'damage-grenade-throws-with-blast',
    'damaging-rider-grenade-takes-weapon-roll',
    'damaging-rider-follows-damage',
    'rider-area-placed-on-throw',
    'rider-resolve-rolls-each-caught',
    'rider-condition-applied-to-token',
    'damaging-rider-resolves-after-damage',
    'rider-psyker-only-condition-with-visual',
] as const;
type FlowName = (typeof GRENADE_THROW_FLOWS)[number];

const WEAPONS = 'Compendium.wh40k-rpg.dh2-core-items-weapons.Item';
const WITHIN_WEAPONS = 'Compendium.wh40k-rpg.dh2-within-items-weapons.Item';
const FRAG_GRENADE = `${WEAPONS}.x1Y2z3A4b5C6d7E8`;
const PHOTON_FLASH = `${WEAPONS}.rpn0j61j1euqi000`;
const SMOKE_GRENADE = `${WEAPONS}.v5W6x7Y8z9A0b1C2`;
const PSYCHOTROKE = `${WITHIN_WEAPONS}.11H4xA4yCvZojuHn`;
const TEARS = `${WITHIN_WEAPONS}.WUQMZb3rGzvRiJi8`;
const RAD_GRENADE = `${WITHIN_WEAPONS}.Pr6BN0flDXSlUxnc`;
/** The Psyk-out canonical (DH2 Enemies Beyond); an RT owner reads its `rt` branch (Faith and Coin p.85). */
const PSYK_OUT = 'Compendium.wh40k-rpg.dh2-beyond-items-weapons.Item.lScsj4tB78fJdtkt';
/** The RT Psyk-out results card: Willpower −10 for psykers only; the psyker (30 − 10 = 20 against 60) is Stunned, the bystander untouched. */
const PSYK_OUT_RESULTS_TEXT = ['Willpower -10', 'Psykers only', 'Rogue Psyker', 'Stunned for', 'Applied', 'Bystander', 'Unaffected'];
/** The face both creatures roll on a rider test (see TOKENS). */
const PHOTON_RIDER_FACE = 60;
/**
 * The Rad rider's dice (#698), in turn. The canvas order of the two creatures is not
 * fixed, so the faces give the same outcome either way. Heretic first: it rolls 30
 * against Toughness −20 (10) and fails; its 2d10 Toughness damage lands 3 + 7; the
 * Accomplice rolls 30 against 40 and resists. Accomplice first: it rolls 30 and resists;
 * the Heretic's d100 reads the d10 3 as 25 and fails; its 2d10 lands 7, then the last
 * d100 30 read as a d10, 3. Either way the Heretic takes 10 Toughness damage.
 */
const RAD_RIDER_FACES: Array<[number, number]> = [
    [30, 100],
    [3, 10],
    [7, 10],
    [30, 100],
];
/** The Toughness damage the Rad rider deals the Heretic on those faces. */
const RAD_TOUGHNESS_DAMAGE = 10;
/** The Photon Flash results card (Core p.158): Agility +10, the Heretic blinded for its three degrees, the Accomplice resisting. */
const PHOTON_RESULTS_TEXT = ['Grenade Rider', 'Agility +10', 'Heretic', 'Accomplice', 'Blinded for 3 rounds', 'Applied', 'Resisted', '3 DoF'];
/** The Rad Grenade results card (Enemies Within p.44): Toughness −20, the Heretic taking its rolled Toughness damage, applied, the Accomplice resisting. */
const RAD_RESULTS_TEXT = ['Grenade Rider', 'Toughness -20', 'Heretic', 'Accomplice', 'Applied', 'Resisted', '2d10 Toughness damage'];
/** What the Rad rider's one failing row states landed (the effect prose above also says "2d10 Toughness damage", so the row is read alone). */
const RAD_EFFECT_ROW = `${RAD_TOUGHNESS_DAMAGE} Toughness damage Applied`;
/** The rider grenades the dialog lists: those that deal no damage. Tears of the Emperor deals 1d10 X, so it takes the weapon roll (#622). */
const RIDER_GRENADES = ['Photon Flash Grenade', 'Smoke Grenade', 'Psychotroke Grenade'];
/** Tears of the Emperor's damage card (Enemies Within p.45): its rider, after the damage, on both creatures its Blast (2) caught. */
const TEARS_DAMAGE_CARD_TEXT = ['Rider — after the damage', 'Perils of the Warp', 'Until the end of the encounter'];
/** Who the Blast struck, as the rider's Struck line names them (in canvas order, which is not fixed). */
const TEARS_STRUCK = ['Accomplice', 'Heretic'];
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
            leanWeapon('Rad Grenade', RAD_GRENADE, 1),
        ],
        system: { characteristics: { ballisticSkill: { base: 50 }, strength: { base: 40 } } },
        flags: { 'wh40k-rpg': { sheetSource: 'authored-build' } },
    },
    // A rider test rolls the same face for both creatures (their order on the canvas is not
    // fixed), so they differ in the tested characteristic instead: on a 60 the Heretic fails
    // Agility +10 (40) by three degrees and the Accomplice passes (80); against Toughness −20
    // the Heretic (10) fails and the Accomplice (40) passes on a 30 (see RAD_RIDER_FACES).
    { key: 'target', name: 'Heretic', type: 'dh2-npc', x: 700, y: 500, system: { characteristics: { agility: { base: 30 }, toughness: { base: 30 } } } },
    { key: 'near', name: 'Accomplice', type: 'dh2-npc', x: 800, y: 500, system: { characteristics: { agility: { base: 70 }, toughness: { base: 60 } } } },
    // A Rogue Trader group well clear of every DH2 area: the RT Psyk-out (Faith and Coin p.85)
    // touches psykers only and Stuns them for 1d5+3 rounds — a condition with a token visual (#595).
    {
        key: 'rtThrower',
        name: 'Witch Hunter',
        type: 'rt-character',
        x: 200,
        y: 1200,
        items: [leanWeapon('Psyk-Out Grenade', PSYK_OUT, 1)],
        system: { characteristics: { ballisticSkill: { base: 50 }, strength: { base: 40 } } },
        flags: { 'wh40k-rpg': { sheetSource: 'authored-build' } },
    },
    { key: 'rtPsyker', name: 'Rogue Psyker', type: 'rt-npc', x: 700, y: 1200, system: { characteristics: { willpower: { base: 30 } }, psy: { rating: 3 } } },
    { key: 'rtBystander', name: 'Bystander', type: 'rt-npc', x: 800, y: 1200, system: { characteristics: { willpower: { base: 30 } } } },
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

/** The damage prompt's footer buttons, in order (#698). */
const DAMAGE_PROMPT_BUTTONS = ['Roll', 'Cancel'];

/** Open the Frag Grenade's damage prompt again, as its damage roll does; null when it did not open. */
async function openFragDamagePrompt(page: Page, actorId: string): Promise<string | null> {
    return page.evaluate(async (id: string): Promise<string | null> => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as Globals;
        const actor = g.game.actors.get(id);
        const frag = actor?.items.contents.find((item) => item.name === 'Frag Grenade');
        if (actor === undefined || frag === undefined) return null;
        const before = new Set(g.foundry.applications.instances.keys());
        await actor.damageItem(frag.id);
        const findPrompt = (): { id: string } | undefined =>
            Array.from(g.foundry.applications.instances.values()).find((app) => !before.has(app.id) && app.constructor.name === 'DamageRollDialog');
        await globalThis.wh40kE2E.pollUntil(() => findPrompt() !== undefined);
        return findPrompt()?.id ?? null;
    }, actorId);
}

/** What a damage prompt's footer showed, and what clicking one of its buttons did. */
interface FooterClickRead {
    /** The footer's button labels, in order. */
    buttons: string[];
    /** Whether the clicked button was the topmost element at its centre. */
    onTop: boolean;
    /** Whether the prompt closed. */
    closed: boolean;
    newMessages: number;
    /** Whether the one new message is a damage card. */
    damageCard: boolean;
}

/** Read a damage prompt's footer, click its `roll` or `cancel` button as a user would, and read what followed. */
async function clickDamagePromptFooter(page: Page, appId: string, action: 'roll' | 'cancel'): Promise<FooterClickRead> {
    const button = `#${appId} [data-roll-dialog-footer] button[data-action="${action}"]`;
    const before = await page.evaluate(
        (args: { appId: string; button: string }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as Globals;
            const labels = Array.from(document.querySelectorAll<HTMLButtonElement>(`#${args.appId} [data-roll-dialog-footer] button`), (label) =>
                label.textContent.trim(),
            );
            const clicked = document.querySelector<HTMLElement>(args.button);
            const box = clicked?.getBoundingClientRect();
            const top = box === undefined ? null : document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
            return { labels, onTop: clicked !== null && top !== null && clicked.contains(top), messages: g.game.messages.contents.map((m) => m.id) };
        },
        { appId, button },
    );
    await page.locator(button).click();
    const after = await page.evaluate(
        async (args: { appId: string; known: string[]; action: string }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as Globals & { game: { i18n: { localize: (key: string) => string } } };
            const { pollUntil, settle } = globalThis.wh40kE2E;
            const known = new Set(args.known);
            const fresh = (): Array<{ id: string; content: string }> => g.game.messages.contents.filter((m) => !known.has(m.id));
            await pollUntil(() => !g.foundry.applications.instances.has(args.appId) && (args.action === 'cancel' || fresh().length > 0));
            // A Cancel posts nothing: give a stray message time to arrive before counting.
            await settle(300);
            const overline = g.game.i18n.localize('WH40K.Chat.Damage.Overline');
            const created = fresh();
            return {
                closed: !g.foundry.applications.instances.has(args.appId),
                newMessages: created.length,
                damageCard: created.length === 1 && (created[0]?.content.includes(overline) ?? false),
            };
        },
        { appId, known: before.messages, action },
    );
    return { buttons: before.labels, onTop: before.onTop, ...after };
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

/** A grenade thrown through the weapon roll: its attack card, and the card resolving its Blast. */
interface WeaponRollThrow {
    blastCard: string | null;
    resolved: string | null;
    detail: string;
}

/** Throw `weaponName` at the target through the weapon roll (a BS hit), then resolve its Blast from the attack card. */
async function throwThroughWeaponRoll(page: Page, scene: HarnessScene, weaponName: string): Promise<WeaponRollThrow> {
    const thrown = await page.evaluate(async (a) => globalThis.wh40kAttack.attack(a), {
        firer: scene.tokens['thrower'] ?? '',
        target: scene.tokens['target'] ?? '',
        weaponName,
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
    const detail = `${weaponName}: thrown messages ${thrown.messageIds.length}, blast card ${String(blastCard)}, results ${String(
        resolved,
    )}; notices ${thrown.notices.join(' | ')}`;
    return { blastCard, resolved, detail };
}

/** The damage card a Roll Damage posts: its text, and whether its rider block follows every hit. */
interface DamageCardRead {
    id: string;
    text: string;
    riderAfterHits: boolean;
    /** The names on the rider's Struck line, sorted. */
    struck: string[];
}

/** Click Roll Damage on an area-results card and read the damage card it posts. */
async function rollDamageFrom(page: Page, resultsCard: string): Promise<DamageCardRead | null> {
    const posted = await page.evaluate(
        async (id: string) =>
            globalThis.wh40kAttack.clickInMessage({ messageId: id, buttonSelector: '.roll-control__roll-damage', faces: [[5, 10]], expectMessages: 1 }),
        resultsCard,
    );
    const damageCard = posted.at(-1);
    if (damageCard === undefined) return null;
    return page.evaluate(async (messageId: string): Promise<DamageCardRead> => {
        const sel = `#sidebar .chat-log .message[data-message-id="${messageId}"]`;
        await globalThis.wh40kE2E.pollUntil(() => document.querySelector(sel) !== null);
        const root = document.querySelector<HTMLElement>(sel);
        const rider = root?.querySelector('[data-damage-rider]') ?? null;
        const hits = Array.from(root?.querySelectorAll('[data-damage-effective], [data-hit-target]') ?? []);
        const riderAfterHits = rider !== null && hits.every((el) => (el.compareDocumentPosition(rider) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
        const struckLine = root?.querySelector('[data-damage-rider-struck] span')?.textContent ?? '';
        const struck = struckLine
            .split(',')
            .map((name) => name.trim())
            .filter((name) => name !== '')
            .sort();
        return { id: messageId, text: (root?.textContent ?? '').replace(/\s+/g, ' '), riderAfterHits, struck };
    }, damageCard);
}

/** A thrown grenade's rider area (#623): whether it sits on the target, and canvas points framing it. */
interface RiderAreaRead {
    templateId: string;
    onTarget: boolean;
    radius: number;
    points: CanvasPoint[];
}

/** Read the rider area a throw card's flag names: the template on the scene, against the targeted token. */
async function riderAreaOf(page: Page, messageId: string): Promise<RiderAreaRead | null> {
    return page.evaluate((id: string): RiderAreaRead | null => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as {
            game: {
                messages: { get: (i: string) => { getFlag: (s: string, k: string) => { templateId?: string } | undefined } | undefined };
                user: { targets: { first: () => { center: CanvasPoint } | undefined } };
            };
            canvas: {
                scene: { templates: { get: (i: string) => { x: number; y: number; distance: number } | undefined } };
                dimensions: { distancePixels: number };
            };
        };
        const flag = g.game.messages.get(id)?.getFlag('wh40k-rpg', 'grenadeRider');
        const template = flag?.templateId === undefined ? undefined : g.canvas.scene.templates.get(flag.templateId);
        const target = g.game.user.targets.first();
        if (template === undefined || target === undefined) return null;
        const ppu = g.canvas.dimensions.distancePixels;
        const radius = template.distance * ppu;
        return {
            templateId: flag?.templateId ?? '',
            onTarget: Math.hypot(template.x - target.center.x, template.y - target.center.y) < 1,
            radius: template.distance,
            points: [
                { x: template.x - radius, y: template.y - radius },
                { x: template.x + radius, y: template.y + radius },
            ],
        };
    }, messageId);
}

/** The results card a Resolve Rider posts: its text and how many creatures it lists. */
interface RiderResultsRead {
    id: string;
    text: string;
    rows: number;
    /** Each row's "what landed" line, in row order. */
    effects: string[];
}

/** Both creatures rolling `face` on their d100. */
function bothRoll(face: number): Array<[number, number]> {
    return [
        [face, 100],
        [face, 100],
    ];
}

/** Click Resolve Rider on a card, the dice landing on `faces` in turn, and read the results card. */
async function resolveRiderFrom(page: Page, messageId: string, faces: Array<[number, number]>): Promise<RiderResultsRead | null> {
    const posted = await page.evaluate(
        async (args: { id: string; faces: Array<[number, number]> }) =>
            globalThis.wh40kAttack.clickInMessage({
                messageId: args.id,
                buttonSelector: '.roll-control__resolve-rider',
                faces: args.faces,
                expectMessages: 1,
            }),
        { id: messageId, faces },
    );
    const resultsCard = posted.at(-1);
    if (resultsCard === undefined) return null;
    return page.evaluate(async (id: string): Promise<RiderResultsRead> => {
        const sel = `#sidebar .chat-log .message[data-message-id="${id}"]`;
        await globalThis.wh40kE2E.pollUntil(() => document.querySelector(sel) !== null);
        const root = document.querySelector<HTMLElement>(sel);
        return {
            id,
            text: (root?.textContent ?? '').replace(/\s+/g, ' '),
            rows: root?.querySelectorAll('[data-rider-target]').length ?? 0,
            effects: Array.from(root?.querySelectorAll('[data-rider-effect]') ?? [], (el) => el.textContent.replace(/\s+/g, ' ').trim()),
        };
    }, resultsCard);
}

/** A token's active statuses and its centre, in canvas pixels. */
interface TokenConditions {
    statuses: string[];
    center: CanvasPoint;
}

/** Each token's active statuses (#495), read from its own actor (an unlinked token carries its own). */
async function conditionsOn(page: Page, tokenIds: readonly string[]): Promise<TokenConditions[]> {
    return page.evaluate(async (ids: readonly string[]): Promise<TokenConditions[]> => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as {
            canvas: { tokens: { get: (id: string) => { center: CanvasPoint; actor: { statuses: Set<string> } | null } | undefined } };
        };
        // The status visuals (#595) draw on the next canvas frame.
        await globalThis.wh40kE2E.settle(600);
        return ids.map((id) => {
            const token = g.canvas.tokens.get(id);
            return { statuses: [...(token?.actor?.statuses ?? [])], center: token?.center ?? { x: 0, y: 0 } };
        });
    }, tokenIds);
}

/** Each token's Toughness damage (#698), read from its own actor (an unlinked token carries its own). */
async function toughnessDamageOn(page: Page, tokenIds: readonly string[]): Promise<Array<number | null>> {
    return page.evaluate((ids: readonly string[]): Array<number | null> => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as {
            canvas: { tokens: { get: (id: string) => { actor: { system: { characteristics: { toughness?: { damage?: number } } } } | null } | undefined } };
        };
        return ids.map((id) => g.canvas.tokens.get(id)?.actor?.system.characteristics.toughness?.damage ?? null);
    }, tokenIds);
}

/** Canvas pixels of padding around a framed region. */
const CANVAS_FRAME_PAD = 120;
/** Canvas zoom for token captures: two tokens fill the frame. */
const CANVAS_ZOOM = 2;
/** Canvas zoom for an area capture: a 6 m Blast fits the viewport. */
const AREA_ZOOM = 0.6;

/** Make `tokenId` the user's only target. */
async function targetToken(page: Page, tokenId: string): Promise<void> {
    await page.evaluate((id: string) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as { canvas: { tokens: { get: (i: string) => { setTarget: (t: boolean, o: object) => void } | undefined } } };
        g.canvas.tokens.get(id)?.setTarget(true, { releaseOthers: true });
    }, tokenId);
}

/** A posted chat card: its id and text. */
interface PostedCard {
    id: string;
    text: string;
}

/** Click the open grenade dialog's Throw and read the card it posts. */
async function throwFromDialog(page: Page, dialogId: string): Promise<PostedCard | null> {
    const before = await page.evaluate(() => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as Globals;
        return g.game.messages.contents.map((m) => m.id);
    });
    await page.locator(`#${dialogId} [data-action="throw"]`).first().click();
    return page.evaluate(async (seen: string[]): Promise<PostedCard | null> => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as Globals;
        const known = new Set(seen);
        await globalThis.wh40kE2E.pollUntil(() => g.game.messages.contents.some((m) => !known.has(m.id)));
        const message = g.game.messages.contents.find((m) => !known.has(m.id));
        if (message === undefined) return null;
        const text = new DOMParser().parseFromString(message.content, 'text/html').body.textContent;
        return { id: message.id, text: text.replace(/\s+/g, ' ') };
    }, before);
}

/** Delete a template from the viewed scene. */
async function removeTemplate(page: Page, templateId: string): Promise<void> {
    await page.evaluate(async (id: string) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as { canvas: { scene: { deleteEmbeddedDocuments: (type: string, ids: string[]) => Promise<object[]> } } };
        await g.canvas.scene.deleteEmbeddedDocuments('MeasuredTemplate', [id]);
    }, templateId);
}

/** Capture the canvas region framing `points`, then reopen the sidebar the capture collapsed, for the chat cards that follow. */
async function snapCanvas(page: Page, label: string, points: readonly CanvasPoint[], scale = CANVAS_ZOOM): Promise<void> {
    // Centre the view on the region and zoom in, so it sits clear of the hotbar and reads;
    // then let core's "+(Blinded)" scrolling status text finish so it does not cover the tokens.
    await page.evaluate(
        async (args: { points: readonly CanvasPoint[]; scale: number }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                canvas: { animatePan: (o: { x: number; y: number; scale: number; duration: number }) => Promise<boolean> };
                foundry: { canvas: { animation: { CanvasAnimation: { animations: object } } } };
            };
            const x = args.points.reduce((sum, p) => sum + p.x, 0) / args.points.length;
            const y = args.points.reduce((sum, p) => sum + p.y, 0) / args.points.length;
            await g.canvas.animatePan({ x, y, scale: args.scale, duration: 0 });
            await globalThis.wh40kE2E.pollUntil(() => Object.keys(g.foundry.canvas.animation.CanvasAnimation.animations).length === 0);
        },
        { points, scale },
    );
    await page.waitForTimeout(scaledMs(500));
    const clip = await canvasClip(page, points, CANVAS_FRAME_PAD);
    await snap(page, label, clip === null ? { selector: '#board', closeWindows: true } : { clip, closeWindows: true });
    await page.evaluate(() => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `ui` global is injected by the licensed app; no shipped types
        const g = globalThis as unknown as { ui?: { sidebar?: { expanded?: boolean; expand?: () => void } } };
        if (g.ui?.sidebar?.expanded !== true) g.ui?.sidebar?.expand?.();
    });
}

/** How the sheet's Throw resolves the named weapon: `grenade-dialog` or `weapon-roll` (#619, #622). */
async function throwPathOf(page: Page, actorId: string, weaponName: string): Promise<string> {
    return page.evaluate(
        async (args: { actorId: string; weaponName: string }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as Globals;
            const item = g.game.actors.get(args.actorId)?.items.contents.find((i) => i.name === args.weaponName);
            const rulesRoot = '/systems/wh40k-rpg/module/rules';
            const combat = (await import(/* @vite-ignore */ `${rulesRoot}/combat-actions.js`)) as {
                resolveThrow: (s: object) => { path: string };
            };
            return item === undefined ? 'missing' : combat.resolveThrow(item.system).path;
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
            const scene: HarnessScene = await page.evaluate(async (tokens) => globalThis.wh40kAttack.setup({ width: 1400, height: 1500, tokens }), TOKENS);
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

            // --- the damage prompt's footer: Cancel closes it, Roll posts the damage (#698)
            const cancelled = frag.damageAppId === null ? null : await clickDamagePromptFooter(page, frag.damageAppId, 'cancel');
            const reopened = await openFragDamagePrompt(page, throwerId);
            if (reopened !== null) {
                await clearScreenOverlays(page, reopened);
                await snap(page, 'grenade-frag-damage-prompt-roll-cancel', { selector: `#${reopened}` });
            }
            const rolled = reopened === null ? null : await clickDamagePromptFooter(page, reopened, 'roll');
            record(
                'damage-prompt-rolls-and-cancels',
                cancelled !== null &&
                    rolled !== null &&
                    [cancelled, rolled].every((footer) => footer.buttons.join('|') === DAMAGE_PROMPT_BUTTONS.join('|') && footer.onTop && footer.closed) &&
                    cancelled.newMessages === 0 &&
                    rolled.newMessages === 1 &&
                    rolled.damageCard,
                `cancel ${JSON.stringify(cancelled)}; roll ${JSON.stringify(rolled)}`,
            );

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
                // The thrower aims at the Heretic: the rider's area lands on the user's target (#623).
                await targetToken(page, scene.tokens['target'] ?? '');
                const card = await throwFromDialog(page, photon.grenadeDialogId);
                record('save-grenade-card-posted', card !== null, 'the Throw posted no card');
                const missing = PHOTON_CARD_TEXT.filter((fragment) => card?.text.includes(fragment) !== true);
                record('rider-card-reads-pack-data', card !== null && missing.length === 0, `card lacks ${JSON.stringify(missing)}: ${card?.text ?? ''}`);
                if (card !== null) await snap(page, 'grenade-photon-flash-thrown-card', { selector: await popOutChatMessage(page, card.id) });

                // --- #623: the card's Resolve Rider rolls everyone in the area ---------
                const area = card === null ? null : await riderAreaOf(page, card.id);
                record('rider-area-placed-on-throw', area?.onTarget === true, `rider area ${JSON.stringify(area)}`);
                const photonResults = card === null ? null : await resolveRiderFrom(page, card.id, bothRoll(PHOTON_RIDER_FACE));
                const resultsMissing = PHOTON_RESULTS_TEXT.filter((fragment) => photonResults?.text.includes(fragment) !== true);
                record(
                    'rider-resolve-rolls-each-caught',
                    photonResults !== null && photonResults.rows === 2 && resultsMissing.length === 0,
                    `results ${JSON.stringify(photonResults)} lack ${JSON.stringify(resultsMissing)}`,
                );
                if (photonResults !== null)
                    await snap(page, 'grenade-photon-flash-rider-results-card', { selector: await popOutChatMessage(page, photonResults.id) });
                const conditions = await conditionsOn(page, [scene.tokens['target'] ?? '', scene.tokens['near'] ?? '']);
                record(
                    'rider-condition-applied-to-token',
                    conditions[0]?.statuses.includes('blinded') && !conditions[1]?.statuses.includes('blinded'),
                    `token statuses ${JSON.stringify(conditions)}`,
                );
                if (area !== null) {
                    await snapCanvas(page, 'grenade-photon-flash-rider-area', area.points, AREA_ZOOM);
                    // The area's fill covers the tokens: clear it so the Blinded visual (#595) reads.
                    await removeTemplate(page, area.templateId);
                }
                await snapCanvas(
                    page,
                    'grenade-photon-flash-blinded-tokens',
                    conditions.map((token) => token.center),
                );
            } else {
                record('dialog-selection-shows-its-rider', false, 'no grenade dialog to pick in');
                record('save-grenade-card-posted', false, 'no grenade dialog to throw from');
                record('rider-card-reads-pack-data', false, 'no grenade dialog to throw from');
                record('rider-area-placed-on-throw', false, 'no grenade dialog to throw from');
                record('rider-resolve-rolls-each-caught', false, 'no grenade dialog to throw from');
                record('rider-condition-applied-to-token', false, 'no grenade dialog to throw from');
            }

            // --- Frag: the weapon roll throws it and places its Blast ------------
            const fragThrow = await throwThroughWeaponRoll(page, scene, 'Frag Grenade');
            record('damage-grenade-throws-with-blast', fragThrow.blastCard !== null && fragThrow.resolved !== null, fragThrow.detail);
            if (fragThrow.blastCard !== null)
                await snap(page, 'grenade-frag-thrown-attack-card', { selector: await popOutChatMessage(page, fragThrow.blastCard) });
            if (fragThrow.resolved !== null)
                await snap(page, 'grenade-frag-blast-results-card', { selector: await popOutChatMessage(page, fragThrow.resolved) });

            // --- Tears of the Emperor: a rider grenade that deals damage (#622) ---
            const tearsPath = await throwPathOf(page, throwerId, 'Tears of the Emperor');
            const tears = await throwThroughWeaponRoll(page, scene, 'Tears of the Emperor');
            record(
                'damaging-rider-grenade-takes-weapon-roll',
                tearsPath === 'weapon-roll' && tears.blastCard !== null && tears.resolved !== null,
                `throw path ${tearsPath}; ${tears.detail}`,
            );
            const tearsDamage = tears.resolved === null ? null : await rollDamageFrom(page, tears.resolved);
            const tearsMissing = TEARS_DAMAGE_CARD_TEXT.filter((fragment) => tearsDamage?.text.includes(fragment) !== true);
            record(
                'damaging-rider-follows-damage',
                tearsDamage !== null &&
                    tearsDamage.riderAfterHits &&
                    tearsMissing.length === 0 &&
                    JSON.stringify(tearsDamage.struck) === JSON.stringify(TEARS_STRUCK),
                `damage card ${JSON.stringify(tearsDamage)} lacks ${JSON.stringify(tearsMissing)}`,
            );
            if (tearsDamage !== null) {
                const popout = await popOutChatMessage(page, tearsDamage.id);
                await snap(page, 'grenade-tears-damage-card-with-rider', { selector: popout });
                // Two hits outgrow the window, so the rider block below them gets its own capture.
                await snap(page, 'grenade-tears-damage-card-rider-block', { selector: `${popout} [data-damage-rider]` });
            }

            // --- Rad Grenade: damage first, then its rider's test for everyone struck (#622, #623)
            const rad = await throwThroughWeaponRoll(page, scene, 'Rad Grenade');
            const radDamage = rad.resolved === null ? null : await rollDamageFrom(page, rad.resolved);
            const radResults = radDamage === null ? null : await resolveRiderFrom(page, radDamage.id, RAD_RIDER_FACES);
            const radMissing = RAD_RESULTS_TEXT.filter((fragment) => radResults?.text.includes(fragment) !== true);
            // The failure's 2d10 lands on the Heretic's Toughness (#698): the row names it, and the actor carries it.
            const radEffects = radResults?.effects ?? [];
            const radToughness = await toughnessDamageOn(page, [scene.tokens['target'] ?? '', scene.tokens['near'] ?? '']);
            const radDamageLands =
                radEffects.length === 1 && radEffects[0] === RAD_EFFECT_ROW && radToughness[0] === RAD_TOUGHNESS_DAMAGE && radToughness[1] === 0;
            record(
                'damaging-rider-resolves-after-damage',
                radDamage !== null && radDamage.riderAfterHits && radResults !== null && radResults.rows === 2 && radMissing.length === 0 && radDamageLands,
                `${rad.detail}; damage card ${JSON.stringify(radDamage)}; results ${JSON.stringify(radResults)} lack ${JSON.stringify(
                    radMissing,
                )}; Toughness damage [Heretic, Accomplice] ${JSON.stringify(radToughness)}`,
            );
            if (radDamage !== null) {
                const popout = await popOutChatMessage(page, radDamage.id);
                await snap(page, 'grenade-rad-damage-card-resolve-rider', { selector: `${popout} [data-damage-rider]` });
            }
            if (radResults !== null) await snap(page, 'grenade-rad-rider-results-card', { selector: await popOutChatMessage(page, radResults.id) });

            // --- RT Psyk-out: psykers only, a rolled duration, a condition with a token visual (#623)
            const rtThrow = await throwFromSheet(page, scene.actors['rtThrower'] ?? '', 'Psyk-Out Grenade');
            await targetToken(page, scene.tokens['rtPsyker'] ?? '');
            const psykOutCard = rtThrow.grenadeDialogId === null ? null : await throwFromDialog(page, rtThrow.grenadeDialogId);
            const psykOutResults = psykOutCard === null ? null : await resolveRiderFrom(page, psykOutCard.id, bothRoll(PHOTON_RIDER_FACE));
            const psykOutMissing = PSYK_OUT_RESULTS_TEXT.filter((fragment) => psykOutResults?.text.includes(fragment) !== true);
            const rtConditions = await conditionsOn(page, [scene.tokens['rtPsyker'] ?? '', scene.tokens['rtBystander'] ?? '']);
            record(
                'rider-psyker-only-condition-with-visual',
                psykOutResults !== null &&
                    psykOutMissing.length === 0 &&
                    rtConditions[0]?.statuses.includes('stunned') &&
                    rtConditions[1]?.statuses.length === 0,
                `dialog ${String(rtThrow.grenadeDialogId)}; results ${JSON.stringify(psykOutResults)} lack ${JSON.stringify(
                    psykOutMissing,
                )}; statuses ${JSON.stringify(rtConditions)}`,
            );
            if (psykOutCard !== null) await snap(page, 'grenade-rt-psyk-out-thrown-card', { selector: await popOutChatMessage(page, psykOutCard.id) });
            if (psykOutResults !== null)
                await snap(page, 'grenade-rt-psyk-out-rider-results-card', { selector: await popOutChatMessage(page, psykOutResults.id) });
            const psykOutArea = psykOutCard === null ? null : await riderAreaOf(page, psykOutCard.id);
            if (psykOutArea !== null) await removeTemplate(page, psykOutArea.templateId);
            await snapCanvas(
                page,
                'grenade-rt-psyk-out-stunned-psyker',
                rtConditions.map((token) => token.center),
            );
        } finally {
            await page.evaluate(async () => globalThis.wh40kAttack.teardown());
        }
        assertFlowResults({ results }, GRENADE_THROW_FLOWS, { dimension: 'grenade-throw.flow', label: 'grenade throw' });
    });
});
