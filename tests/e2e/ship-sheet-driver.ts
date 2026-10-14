import type { Page } from '@playwright/test';
import { showChatMessage } from './lib/chat-capture';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { scaledMs } from './lib/timing';

/**
 * Budget for one UI step (a click, a sheet render, a dialog opening). Playwright's
 * own default is unbounded, so a missing element would otherwise burn the whole
 * test timeout instead of failing at the step that broke.
 */
const UI_STEP_TIMEOUT_MS = scaledMs(20_000);

/** The viewport a chat-card capture uses, tall enough for the longest assault card. */
const TALL_VIEWPORT = { width: 1440, height: 2200 } as const;

/** Join the test world and bound every UI step of the page. */
export async function joinShipWorld(page: Page): Promise<void> {
    await joinOrSkip(page);
    page.setDefaultTimeout(UI_STEP_TIMEOUT_MS);
}

/**
 * Drives the Rogue Trader voidcraft sheet the way a GM does, for the starship
 * Tier B specs (ship actions #186 / #189, ship assault #188): create the ships,
 * open the sheet, switch tabs, click its buttons, fill the dialogs, and read the
 * chat cards they post. Only fixture setup (creating ships, a combat round)
 * goes through the document API; every feature step is a real click.
 *
 * Dice are made deterministic by queueing die faces: `DiceTerm#randomFace`
 * returns the next queued face (falling back to the real RNG when the queue is
 * empty), so every Roll the feature evaluates — through Foundry's own Roll
 * pipeline — lands on a known result. `releaseDice` restores the RNG and
 * reports how many queued faces went unused.
 */

/** One Weapon Component to mount on a fixture ship. */
export interface ShipWeaponFixture {
    name: string;
    weaponType: 'macrobattery' | 'lance';
    location: string;
    strength: number;
    damage: string;
    crit: number;
    range: number;
}

/** The stats of one fixture voidcraft. */
export interface ShipFixture {
    name: string;
    gameSystem: string;
    hullType: string;
    speed: number;
    manoeuvrability: number;
    detection: number;
    armour: number;
    turretRating: number;
    hullIntegrity: number;
    population: number;
    crewRating: number;
    morale: number;
    weapons: ShipWeaponFixture[];
}

/** A created fixture ship: its actor id and its weapons' item ids, in fixture order. */
export interface CreatedShip {
    id: string;
    weaponIds: string[];
}

/** A Rogue Trader frigate with no weapons; spread and override per spec. */
export const RT_FRIGATE: ShipFixture = {
    name: 'Fixture Frigate',
    gameSystem: 'rt',
    hullType: 'frigate',
    speed: 7,
    manoeuvrability: 15,
    detection: 20,
    armour: 18,
    turretRating: 1,
    hullIntegrity: 35,
    population: 80,
    crewRating: 50,
    morale: 75,
    weapons: [],
};

/**
 * Create a voidcraft actor and set its stats. Deep values go through
 * `update()` with dotted paths: a nested `Actor.create` payload does not
 * reliably persist them.
 */
export async function createShip(page: Page, fixture: ShipFixture): Promise<CreatedShip> {
    return page.evaluate(async (fx: ShipFixture): Promise<CreatedShip> => {
        interface ActorDoc {
            id: string;
            update: (data: object) => Promise<object>;
            createEmbeddedDocuments: (type: string, data: object[]) => Promise<Array<{ id: string }>>;
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `Actor` global has no browser-side types
        const g = globalThis as unknown as { Actor: { create: (data: object) => Promise<ActorDoc | null> } };
        const actor = await g.Actor.create({ name: fx.name, type: 'rt-voidcraft', system: { gameSystem: fx.gameSystem } });
        if (actor === null) throw new Error(`Actor.create returned null for ${fx.name}`);
        await actor.update({
            'system.gameSystem': fx.gameSystem,
            'system.hullType': fx.hullType,
            'system.speed': fx.speed,
            'system.manoeuvrability': fx.manoeuvrability,
            'system.detection': fx.detection,
            'system.armour': fx.armour,
            'system.turretRating': fx.turretRating,
            'system.hullIntegrity.value': fx.hullIntegrity,
            'system.hullIntegrity.max': fx.hullIntegrity,
            'system.crew.population': fx.population,
            'system.crew.crewRating': fx.crewRating,
            'system.crew.morale.value': fx.morale,
            'system.crew.morale.max': fx.morale,
        });
        const weapons =
            fx.weapons.length === 0
                ? []
                : await actor.createEmbeddedDocuments(
                      'Item',
                      fx.weapons.map((w) => ({
                          name: w.name,
                          type: 'shipWeapon',
                          system: { weaponType: w.weaponType, location: w.location, strength: w.strength, damage: w.damage, crit: w.crit, range: w.range },
                      })),
                  );
        return { id: actor.id, weaponIds: weapons.map((w) => w.id) };
    }, fixture);
}

/** The live stats a spec asserts after an action. */
export interface ShipState {
    hull: number;
    population: number;
    morale: number;
    statuses: number;
    /** Ship-action modifier effects: their name and flagged payload. */
    modifiers: Array<{ name: string; target: string; value: number; weaponId: string }>;
}

/** Read one ship's live stats. */
export async function readShip(page: Page, actorId: string): Promise<ShipState> {
    return page.evaluate((id: string): ShipState => {
        interface EffectDoc {
            name: string;
            flags: Record<string, Record<string, { target?: string; value?: number; weaponId?: string } | undefined> | undefined>;
        }
        interface ActorDoc {
            system: {
                hullIntegrity: { value: number };
                crew: { population: number; morale: { value: number } };
                shipStatuses: object[];
            };
            effects: { contents: EffectDoc[] };
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
        const g = globalThis as unknown as { game: { actors: { get: (i: string) => ActorDoc | undefined } } };
        const actor = g.game.actors.get(id);
        if (actor === undefined) throw new Error(`no actor ${id}`);
        const modifiers = actor.effects.contents.flatMap((effect) => {
            const flag = effect.flags['wh40k-rpg']?.['shipActionModifier'];
            return flag === undefined ? [] : [{ name: effect.name, target: flag.target ?? '', value: flag.value ?? 0, weaponId: flag.weaponId ?? '' }];
        });
        return {
            hull: actor.system.hullIntegrity.value,
            population: actor.system.crew.population,
            morale: actor.system.crew.morale.value,
            statuses: actor.system.shipStatuses.length,
            modifiers,
        };
    }, actorId);
}

/** Delete fixture actors (closing their sheets first). */
export async function deleteActors(page: Page, ids: readonly string[]): Promise<void> {
    await page.evaluate(async (actorIds: readonly string[]) => {
        interface ActorDoc {
            sheet: { close: () => Promise<object> } | null;
            delete: () => Promise<object>;
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
        const g = globalThis as unknown as { game: { actors: { get: (i: string) => ActorDoc | undefined } } };
        for (const id of actorIds) {
            const actor = g.game.actors.get(id);
            if (actor === undefined) continue;
            await actor.sheet?.close();
            await actor.delete();
        }
    }, ids);
}

/** Open an actor's sheet and return its application element id. */
export async function openSheet(page: Page, actorId: string): Promise<string> {
    const sheetId = await page.evaluate(async (id: string): Promise<string> => {
        interface SheetApp {
            id: string;
            render: (options: { force: boolean }) => Promise<object>;
            setPosition: (position: object) => void;
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
        const g = globalThis as unknown as { game: { actors: { get: (i: string) => { sheet: SheetApp | null } | undefined } } };
        const sheet = g.game.actors.get(id)?.sheet ?? null;
        if (sheet === null) throw new Error(`no sheet for actor ${id}`);
        await sheet.render({ force: true });
        // Top-left and nearly viewport-tall, so a capture shows the whole tab legibly.
        sheet.setPosition({ left: 16, top: 8, width: 1000, height: 880 });
        return sheet.id;
    }, actorId);
    await page.locator(`#${sheetId}`).waitFor({ state: 'visible' });
    // A fresh world's welcome tour starts a moment after `ready`; its overlay would
    // swallow the clicks that follow. Clear it (and stray windows), keeping the sheet.
    await clearScreenOverlays(page, sheetId);
    return sheetId;
}

/** Click a sheet tab in its nav and wait until the tab's section is active. */
export async function showTab(page: Page, sheetId: string, tab: string): Promise<string> {
    await page.locator(`#${sheetId} nav [data-tab="${tab}"]`).first().click();
    const section = `#${sheetId} section.tab[data-tab="${tab}"]`;
    await page.locator(`${section}.active`).waitFor({ state: 'visible' });
    return section;
}

/** Queue die faces for every DiceTerm Foundry evaluates next. */
export async function rigDice(page: Page, faces: readonly number[]): Promise<void> {
    await page.evaluate((queued: readonly number[]) => {
        interface DiceTermProto {
            randomFace: () => number;
        }
        interface RigState {
            original: () => number;
            queue: number[];
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `foundry` global has no browser-side types
        const g = globalThis as unknown as { foundry: { dice: { terms: { DiceTerm: { prototype: DiceTermProto } } } }; __shipDiceRig?: RigState };
        const proto = g.foundry.dice.terms.DiceTerm.prototype;
        const rig: RigState = g.__shipDiceRig ?? { original: proto.randomFace, queue: [] };
        rig.queue = [...queued];
        g.__shipDiceRig = rig;
        proto.randomFace = function randomFace(this: DiceTermProto): number {
            const next = rig.queue.shift();
            return next ?? rig.original.call(this);
        };
    }, faces);
}

/** Restore the RNG and return how many queued faces were never rolled. */
export async function releaseDice(page: Page): Promise<number> {
    return page.evaluate((): number => {
        interface DiceTermProto {
            randomFace: () => number;
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `foundry` global has no browser-side types
        const g = globalThis as unknown as {
            foundry: { dice: { terms: { DiceTerm: { prototype: DiceTermProto } } } };
            __shipDiceRig?: { original: () => number; queue: number[] };
        };
        const rig = g.__shipDiceRig;
        if (rig === undefined) return 0;
        g.foundry.dice.terms.DiceTerm.prototype.randomFace = rig.original;
        g.__shipDiceRig = undefined;
        return rig.queue.length;
    });
}

/** The ids of every chat message currently in the log. */
export async function chatMessageIds(page: Page): Promise<string[]> {
    return page.evaluate((): string[] => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
        const g = globalThis as unknown as { game: { messages: { contents: Array<{ id: string }> } } };
        return g.game.messages.contents.map((m) => m.id);
    });
}

/** A posted chat card. */
export interface PostedCard {
    id: string;
    html: string;
    /** The card's text, whitespace collapsed (entities decoded, unlike `html`). */
    text: string;
}

/** The content marker of a card rendered with `data-wh40k-hook="<hook>"`. */
export function hookMarker(hook: string): string {
    return `data-wh40k-hook="${hook}"`;
}

/** Wait for a message posted after `before` whose content contains `marker` (see {@link hookMarker}). */
export async function waitForCard(page: Page, before: readonly string[], cardMarker: string): Promise<PostedCard> {
    return page.evaluate(
        async ({ known, marker }): Promise<PostedCard> => {
            interface Message {
                id: string;
                content: string;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
            const g = globalThis as unknown as { game: { messages: { contents: Message[] } } };
            const findCard = (): Message | undefined => g.game.messages.contents.find((m) => !known.includes(m.id) && m.content.includes(marker));
            await globalThis.wh40kE2E.waitFor(() => findCard() !== undefined, `chat card ${marker}`);
            const found = findCard();
            if (found === undefined) throw new Error(`no chat card ${marker}`);
            const parsed = document.createElement('div');
            parsed.innerHTML = found.content;
            return { id: found.id, html: found.content, text: parsed.textContent.replace(/\s+/gu, ' ').trim() };
        },
        { known: [...before], marker: cardMarker },
    );
}

/** Delete chat messages by id. */
export async function deleteMessages(page: Page, ids: readonly string[]): Promise<void> {
    await page.evaluate(async (messageIds: readonly string[]) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
        const g = globalThis as unknown as { game: { messages: { get: (i: string) => { delete: () => Promise<object> } | undefined } } };
        for (const id of messageIds) await g.game.messages.get(id)?.delete();
    }, ids);
}

/** Every message posted since `before`, for cleanup. */
export async function messagesSince(page: Page, before: readonly string[]): Promise<string[]> {
    const now = await chatMessageIds(page);
    return now.filter((id) => !before.includes(id));
}

/** Snap a posted chat card in the chat log, with every floating window closed. */
export async function snapChatCard(page: Page, label: string, messageId: string): Promise<string | null> {
    await clearScreenOverlays(page);
    // A tall card (a boarding round) outgrows the chat log at the normal viewport and
    // its foot sits under the chat input; grow the page so the log holds it whole.
    const viewport = page.viewportSize();
    await page.setViewportSize({ width: viewport?.width ?? TALL_VIEWPORT.width, height: TALL_VIEWPORT.height });
    try {
        const selector = await showChatMessage(page, messageId);
        await page.locator(selector).waitFor({ state: 'visible' });
        return await snap(page, label, { selector });
    } finally {
        if (viewport !== null) await page.setViewportSize(viewport);
    }
}

/** Snap one application window (a sheet or a dialog), closing every other floating window first. */
export async function snapWindow(page: Page, label: string, appId: string, selector?: string): Promise<string | null> {
    await clearScreenOverlays(page, appId);
    const target = selector ?? `#${appId}`;
    await page.locator(target).first().waitFor({ state: 'visible' });
    return snap(page, label, { selector: target });
}

/** The element id of the open dialog with this CSS class. */
export async function dialogId(page: Page, cssClass: string): Promise<string> {
    const dialog = page.locator(`.application.${cssClass}`).last();
    await dialog.waitFor({ state: 'visible' });
    const id = await dialog.getAttribute('id');
    if (id === null) throw new Error(`the ${cssClass} dialog has no id`);
    return id;
}

/** Fill a numeric or text field of an open dialog. */
export async function fillField(page: Page, appId: string, name: string, value: string | number): Promise<void> {
    await page.locator(`#${appId} [name="${name}"]`).fill(String(value));
}

/** Start an active combat at round 1, returning its id. Ship actions read the strategic turn from it. */
export async function startCombat(page: Page): Promise<string> {
    return page.evaluate(async (): Promise<string> => {
        interface CombatDoc {
            id: string;
            activate: () => Promise<object>;
            update: (data: object) => Promise<object>;
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `Combat` global has no browser-side types
        const g = globalThis as unknown as { Combat: { create: (data: object) => Promise<CombatDoc | null> } };
        const combat = await g.Combat.create({});
        if (combat === null) throw new Error('Combat.create returned null');
        await combat.activate();
        await combat.update({ round: 1 });
        return combat.id;
    });
}

/** Set a combat's round (the strategic turn). */
export async function setCombatRound(page: Page, combatId: string, round: number): Promise<void> {
    await page.evaluate(
        async ({ id, value }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
            const g = globalThis as unknown as { game: { combats: { get: (i: string) => { update: (d: object) => Promise<object> } | undefined } } };
            await g.game.combats.get(id)?.update({ round: value });
        },
        { id: combatId, value: round },
    );
}

/** Delete a combat. */
export async function deleteCombat(page: Page, combatId: string): Promise<void> {
    await page.evaluate(async (id: string) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
        const g = globalThis as unknown as { game: { combats: { get: (i: string) => { delete: () => Promise<object> } | undefined } } };
        await g.game.combats.get(id)?.delete();
    }, combatId);
}

/** Count the hoverable provenance rows in a rendered card or element. */
export function provenanceRows(html: string): number {
    return html.split('data-wh40k-tooltip="modifier"').length - 1;
}

/** The two voidcraft-sheet tabs that list ship actions. */
export type ShipActionTab = 'extendedActions' | 'manoeuvreActions';

/** One ship action to roll from the sheet. */
export interface ShipActionRoll {
    tab: ShipActionTab;
    /** The action's name as its row shows it. */
    action: string;
    /** Screenshot label prefix: `<label>-dialog`, `<label>-card`. */
    label: string;
    /** The acting character's skill target typed into the dialog. */
    skill: number;
    /** Select fields to set, by name → option label. */
    choices?: Record<string, string>;
    /** Die faces queued for the roll. */
    faces: number[];
}

/** What rolling a ship action produced. */
export interface RolledShipAction {
    card: PostedCard;
    /** The heading the dialog showed. */
    dialogTitle: string;
    /** The options each select offered, by field name. */
    dialogOptions: Record<string, string[]>;
    unusedDice: number;
}

/**
 * Roll a ship action as the GM does: open the sheet on the action's tab, click
 * the row's Roll button, fill the dialog, snap it, Roll, and snap the card.
 */
export async function rollShipActionFromSheet(page: Page, actorId: string, roll: ShipActionRoll): Promise<RolledShipAction> {
    const sheetId = await openSheet(page, actorId);
    const section = await showTab(page, sheetId, roll.tab);
    await page.locator(`${section} li:has-text("${roll.action}") [data-action="rollShipAction"]`).first().click();
    const dialog = await dialogId(page, 'ship-action-dialog');
    await fillField(page, dialog, 'skill', roll.skill);
    const dialogOptions: Record<string, string[]> = {};
    for (const select of await page.locator(`#${dialog} select`).all()) {
        const name = (await select.getAttribute('name')) ?? '';
        dialogOptions[name] = (await select.locator('option').allTextContents()).map((text) => text.trim());
    }
    for (const [name, label] of Object.entries(roll.choices ?? {})) await page.locator(`#${dialog} select[name="${name}"]`).selectOption({ label });
    const dialogTitle = ((await page.locator(`#${dialog} [data-wh40k-hook="ship-action-dialog"] h2`).textContent()) ?? '').trim();
    await snapWindow(page, `${roll.label}-dialog`, dialog);

    const before = await chatMessageIds(page);
    await rigDice(page, roll.faces);
    await page.locator(`#${dialog} [data-action="rollShipAction"]`).click();
    const card = await waitForCard(page, before, hookMarker('ship-action-roll'));
    const unusedDice = await releaseDice(page);
    await snapChatCard(page, `${roll.label}-card`, card.id);
    return { card, dialogTitle, dialogOptions, unusedDice };
}

/** Choose the target ship in an open ship dialog by name, unless it is already the selected one. */
async function pickDefender(page: Page, root: string, defender: string): Promise<string[]> {
    const options = page.locator(`${root} select[name="defender"] option`);
    const targets = (await options.allTextContents()).map((text) => text.trim());
    const select = page.locator(`${root} select[name="defender"]`);
    if (((await select.locator('option:checked').textContent()) ?? '').trim() !== defender) {
        await select.selectOption({ label: defender });
        await page.locator(`${root} select[name="defender"] option:checked`, { hasText: defender }).waitFor({ state: 'attached' });
    }
    return targets;
}

/** One shot of a Weapon Component at a target ship. */
export interface ShipWeaponShot {
    weaponId: string;
    /** The target ship, picked by name in the Fire dialog. */
    defender: string;
    /** The gunner's Ballistic Skill typed into the dialog; the ship's own when omitted. */
    gunnerSkill?: number;
    rangeBand?: 'close' | 'standard' | 'long';
    /** Die faces queued for the shot: the d100, each hit's damage, the 1d5 critical. */
    faces: readonly number[];
    /** Screenshot label prefix: `<label>-weapons-tab`, `-dialog`, `-dialog-resolved`, `-card`. None when omitted. */
    label?: string;
}

/** What firing a Weapon Component produced. */
export interface FiredWeapon {
    card: PostedCard;
    /** The dialog window's title. */
    dialogTitle: string;
    /** Target-select options the dialog offered. */
    targets: string[];
    /** Text of the dialog's preview card after Roll. */
    preview: string;
    unusedDice: number;
}

/**
 * Fire one of the ship's Weapon Components as the GM does (#184): open the
 * sheet on the Weapons tab, click the weapon's Fire control, pick the target
 * ship and fill the gunnery inputs in the dialog, Roll, review the preview, and
 * Apply — snapping each state and the posted card when `label` is given.
 */
export async function fireWeaponFromSheet(page: Page, actorId: string, shot: ShipWeaponShot): Promise<FiredWeapon> {
    const snapAs = async (suffix: string, appId: string, selector?: string): Promise<void> => {
        if (shot.label !== undefined) await snapWindow(page, `${shot.label}-${suffix}`, appId, selector);
    };
    const sheetId = await openSheet(page, actorId);
    const section = await showTab(page, sheetId, 'weapons');
    await snapAs('weapons-tab', sheetId);
    await page.locator(`${section} [data-action="fireShipWeapon"][data-item-id="${shot.weaponId}"]`).click();
    const dialog = await dialogId(page, 'ship-assault-dialog');
    const root = `#${dialog} [data-wh40k-hook="ship-assault-dialog"]`;
    const dialogTitle = ((await page.locator(`#${dialog} .window-title`).textContent()) ?? '').trim();
    const targets = await pickDefender(page, root, shot.defender);
    if (shot.gunnerSkill !== undefined) await fillField(page, dialog, 'gunnerSkill', shot.gunnerSkill);
    if (shot.rangeBand !== undefined) await page.locator(`${root} select[name="rangeBand"]`).selectOption(shot.rangeBand);
    await snapAs('dialog', dialog);

    const before = await chatMessageIds(page);
    await rigDice(page, shot.faces);
    await page.locator(`${root} [data-action="rollAssault"]`).click();
    await page.locator(`${root} [data-action="applyAssault"]`).waitFor({ state: 'visible' });
    const preview = ((await page.locator(root).textContent()) ?? '').replace(/\s+/gu, ' ').trim();
    await snapAs('dialog-resolved', dialog);

    await page.locator(`${root} [data-action="applyAssault"]`).click();
    const card = await waitForCard(page, before, hookMarker('ship-weapon-card'));
    const unusedDice = await releaseDice(page);
    if (shot.label !== undefined) await snapChatCard(page, `${shot.label}-card`, card.id);
    return { card, dialogTitle, targets, preview, unusedDice };
}

/** A posted chat message's card, read by id. */
export async function readCard(page: Page, messageId: string): Promise<PostedCard> {
    return page.evaluate((id: string): PostedCard => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
        const g = globalThis as unknown as { game: { messages: { get: (i: string) => { id: string; content: string } | undefined } } };
        const message = g.game.messages.get(id);
        if (message === undefined) throw new Error(`no chat message ${id}`);
        const parsed = document.createElement('div');
        parsed.innerHTML = message.content;
        return { id: message.id, html: message.content, text: parsed.textContent.replace(/\s+/gu, ' ').trim() };
    }, messageId);
}

/** The Stats tab's Damage Control panel (#184, #187): raised void shields and the recorded Critical Hits. */
export interface ShownDamageControl {
    /** The "up / max" shields text. */
    shields: string;
    /** Each Critical Hit's name, in order. */
    criticals: string[];
}

/** Open a ship's sheet on the Stats tab, snap its Damage Control panel, and return what it shows. */
export async function snapDamageControl(page: Page, actorId: string, label: string): Promise<ShownDamageControl> {
    const sheetId = await openSheet(page, actorId);
    const section = await showTab(page, sheetId, 'stats');
    const panel = `${section} .wh40k-ship-damage-control`;
    await page.locator(panel).scrollIntoViewIfNeeded();
    await snapWindow(page, label, sheetId, panel);
    const shields = ((await page.locator(`${panel} [data-shields-up]`).textContent()) ?? '').replace(/\s+/gu, ' ').trim();
    const criticals = await page
        .locator(`${panel} [data-wh40k-hook="ship-criticals"] li`)
        .evaluateAll((rows) => rows.map((row) => row.querySelector('span')?.firstChild?.textContent?.trim() ?? ''));
    return { shields, criticals };
}

/** Set a ship's void shields (the stat and the raised count), as fixture setup. */
export async function setVoidShields(page: Page, actorId: string, shields: number): Promise<void> {
    await page.evaluate(
        async ({ id, value }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
            const g = globalThis as unknown as { game: { actors: { get: (i: string) => { update: (d: object) => Promise<object> } | undefined } } };
            await g.game.actors.get(id)?.update({
                'system.voidShields': value,
                'system.voidShieldsStatus.active': value,
                'system.voidShieldsStatus.exhausted': 0,
            });
        },
        { id: actorId, value: shields },
    );
}

/** The raised void shields of one ship. */
export async function readShieldsUp(page: Page, actorId: string): Promise<number> {
    return page.evaluate((id: string): number => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
        const g = globalThis as unknown as { game: { actors: { get: (i: string) => { system: { voidShieldsStatus: { active: number } } } | undefined } } };
        const actor = g.game.actors.get(id);
        if (actor === undefined) throw new Error(`no actor ${id}`);
        return actor.system.voidShieldsStatus.active;
    }, actorId);
}

/** The card root hook each assault action posts, by its `data-assault`. */
const ASSAULT_CARD_HOOKS = {
    'ram': 'ship-ramming-card',
    'board': 'ship-boarding-card',
    'boarding-round': 'ship-boarding-card',
    'hit-and-run': 'ship-har-card',
} as const;

/** One ship assault action to run from the attacker's sheet. */
export interface ShipAssaultRun {
    tab: ShipActionTab;
    /** The panel button's `data-assault`. */
    assault: keyof typeof ASSAULT_CARD_HOOKS;
    /** Screenshot label prefix: `<label>-panel`, `-dialog`, `-dialog-resolved`, `-card`. */
    label: string;
    /** The target ship, picked by name in the dialog. */
    defender: string;
    /** Step-one fields: numbers / text are typed, booleans tick a checkbox. */
    inputs: Record<string, string | number | boolean>;
    /** Step-two choices: a number field is typed, a radio is picked by value. */
    choices: Record<string, string | number>;
    /** Die faces queued for both steps. */
    faces: number[];
}

/** What running an assault produced. */
export interface RanShipAssault {
    card: PostedCard;
    /** Target-select options the dialog offered. */
    targets: string[];
    /** Field names of the step-one form. */
    inputNames: string[];
    /** Text of the dialog's preview card after Roll. */
    preview: string;
    unusedDice: number;
}

/**
 * Run a ship assault action as the GM does: open the attacker's sheet on the
 * action's tab, snap the Ship Assault panel, click the action, pick the target
 * and fill the inputs, Roll, make the winner's choices in the resolved dialog,
 * Apply, and snap each state and the posted card.
 */
export async function runAssaultFromSheet(page: Page, attackerId: string, run: ShipAssaultRun): Promise<RanShipAssault> {
    const sheetId = await openSheet(page, attackerId);
    const section = await showTab(page, sheetId, run.tab);
    const panel = `${section} [data-wh40k-hook="ship-assault-panel"]`;
    await snapWindow(page, `${run.label}-panel`, sheetId, panel);
    await page.locator(`${panel} [data-action="openShipAssault"][data-assault="${run.assault}"]`).click();
    const dialog = await dialogId(page, 'ship-assault-dialog');
    const root = `#${dialog} [data-wh40k-hook="ship-assault-dialog"]`;

    const targets = await pickDefender(page, root, run.defender);
    const inputNames = await page.locator(`${root} [name]`).evaluateAll((fields) => fields.map((field) => field.getAttribute('name') ?? ''));
    for (const [name, value] of Object.entries(run.inputs)) {
        const field = page.locator(`${root} [name="${name}"]`);
        if (typeof value === 'boolean') await field.setChecked(value);
        else await field.fill(String(value));
    }
    await snapWindow(page, `${run.label}-dialog`, dialog);

    const before = await chatMessageIds(page);
    await rigDice(page, run.faces);
    await page.locator(`${root} [data-action="rollAssault"]`).click();
    await page.locator(`${root} [data-action="applyAssault"]`).waitFor({ state: 'visible' });
    const preview = ((await page.locator(root).textContent()) ?? '').replace(/\s+/gu, ' ').trim();
    for (const [name, value] of Object.entries(run.choices)) {
        if (typeof value === 'number') await page.locator(`${root} input[name="${name}"]`).fill(String(value));
        else await page.locator(`${root} input[type="radio"][name="${name}"][value="${value}"]`).check();
    }
    await snapWindow(page, `${run.label}-dialog-resolved`, dialog);

    await page.locator(`${root} [data-action="applyAssault"]`).click();
    const card = await waitForCard(page, before, hookMarker(ASSAULT_CARD_HOOKS[run.assault]));
    const unusedDice = await releaseDice(page);
    await snapChatCard(page, `${run.label}-card`, card.id);
    return { card, targets, inputNames, preview, unusedDice };
}

/** The Hull Integrity, Morale and Crew Population the sheet's sidebar shows. */
export interface ShownVitals {
    hull: string;
    morale: string;
    population: string;
}

/**
 * Open a ship's sheet, bring its sidebar vitals (Hull Integrity, Morale, Crew
 * Population, Crew Rating) into view, snap them, and return what they show.
 */
export async function snapShipVitals(page: Page, actorId: string, label: string): Promise<ShownVitals> {
    const sheetId = await openSheet(page, actorId);
    await clearScreenOverlays(page, sheetId);
    // The vitals sit below the portrait in a scrolling sidebar column: scroll them to its
    // top, then clip to the part of the column the sidebar actually shows.
    const clip = await page.evaluate((id: string) => {
        const vitals = document.querySelector(`#${id} .wh40k-hull-box`)?.parentElement ?? null;
        if (vitals === null) return null;
        vitals.scrollIntoView({ block: 'start' });
        let bottom = window.innerHeight;
        for (let el = vitals.parentElement; el !== null; el = el.parentElement) {
            const style = getComputedStyle(el);
            if (/(auto|scroll|hidden)/u.test(style.overflowY)) bottom = Math.min(bottom, el.getBoundingClientRect().bottom);
        }
        const rect = vitals.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: Math.max(1, Math.min(rect.bottom, bottom) - rect.y) };
    }, sheetId);
    if (clip === null) throw new Error(`no vitals on ${sheetId}`);
    await snap(page, label, { clip });
    const value = async (name: string): Promise<string> => page.locator(`#${sheetId} input[name="${name}"]`).first().inputValue();
    return {
        hull: await value('system.hullIntegrity.value'),
        morale: await value('system.crew.morale.value'),
        population: await value('system.crew.population'),
    };
}
