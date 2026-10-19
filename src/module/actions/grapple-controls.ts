/**
 * @file grapple-controls — the prompts a grapple option needs once it resolves (#665).
 *
 * - Push Opponent: the won card's GM button asks the direction, and whether the
 *   controller moves with its opponent or lets go (DH2 core p. 221: "The active
 *   character must move with his Grappled opponent in order to maintain the
 *   Grapple, or he can choose to let go of his opponent as a Free Action, which
 *   ends the Grapple, but allows the active character to keep his ground"), then
 *   moves the tokens. Only the GM moves them, so a push never moves a token
 *   without the GM confirming it.
 * - Ready and Use Item: the controller picks which of its own items the option
 *   names (DH2 core p. 222: "ready one of his own items", "use a readied item").
 */

import { t } from '../i18n/t.ts';
import {
    GRAPPLE_ACTION_LABEL_KEYS,
    grappleEndWrites,
    type GrappleItemChoice,
    type GrappleOptionId,
    type GrapplePushDirection,
    grapplePushOffset,
    isGrapplePushDirection,
} from '../rules/grapple.ts';
import { applyGrappleWrites } from './grapple-relay.ts';

const PUSH_DIALOG_TEMPLATE = 'systems/wh40k-rpg/templates/prompt/grapple-push-dialog.hbs';
const ITEM_DIALOG_TEMPLATE = 'systems/wh40k-rpg/templates/prompt/grapple-item-dialog.hbs';

/** The compass the push dialog lays out, row by row; '' is the opponent in the centre. */
const COMPASS: readonly (GrapplePushDirection | '')[] = ['nw', 'n', 'ne', 'w', '', 'e', 'sw', 's', 'se'];

/** One cell of the push dialog's compass. */
export interface GrapplePushDirectionCell {
    /** The direction, or '' for the centre cell. */
    value: GrapplePushDirection | '';
    labelKey: string;
    checked: boolean;
}

/** The push dialog's compass cells, with `checked` pre-selected. */
export function grapplePushCompass(checked: GrapplePushDirection = 'n'): GrapplePushDirectionCell[] {
    return COMPASS.map((value) => ({ value, labelKey: value === '' ? '' : `WH40K.Grapple.Push.Dir.${value}`, checked: value === checked }));
}

/** What the push card's button carries. */
export interface GrapplePushButtonData {
    controllerUuid: string;
    targetUuid: string;
    targetName: string;
    metres: number;
}

/** The push card's button data, or null when it is incomplete. */
export function readGrapplePushButton(dataset: DOMStringMap): GrapplePushButtonData | null {
    const controllerUuid = dataset['controllerUuid'] ?? '';
    const targetUuid = dataset['targetUuid'] ?? '';
    const metres = Number(dataset['metres']);
    if (controllerUuid === '' || targetUuid === '' || !Number.isFinite(metres) || metres <= 0) return null;
    return { controllerUuid, targetUuid, targetName: dataset['targetName'] ?? '', metres };
}

/** What the GM chose in the push dialog. */
export interface GrapplePushChoice {
    direction: GrapplePushDirection;
    /** The controller moves with its opponent (true) or lets go, ending the grapple (false). */
    follow: boolean;
}

/** The push dialog's form, read; null when no direction is chosen. */
export function readGrapplePushForm(form: { direction: string; controller: string }): GrapplePushChoice | null {
    if (!isGrapplePushDirection(form.direction)) return null;
    return { direction: form.direction, follow: form.controller !== 'let-go' };
}

/** A token's position, as the push moves it. */
export interface PushedToken {
    id: string;
    x: number;
    y: number;
}

/** The token updates a push makes: the opponent moves by the offset, and the controller with it when it follows. */
export function grapplePushTokenUpdates(target: PushedToken, controller: PushedToken | null, offset: { x: number; y: number }): PushedToken[] {
    const moved = (token: PushedToken): PushedToken => ({ id: token.id, x: token.x + offset.x, y: token.y + offset.y });
    return controller === null ? [moved(target)] : [moved(target), moved(controller)];
}

/** A scene token, as the push finds and moves it. */
interface SceneToken {
    readonly id: string | null;
    readonly x: number;
    readonly y: number;
    readonly actor: { readonly uuid: string | null } | null;
}

/** The token of the actor with `uuid` among the scene's tokens, as a position. */
function sceneTokenOf(tokens: Iterable<SceneToken>, uuid: string): PushedToken | null {
    for (const token of tokens) {
        if (token.actor?.uuid === uuid && token.id !== null) return { id: token.id, x: token.x, y: token.y };
    }
    return null;
}

/** Ask the GM the push's direction and whether the controller follows; null on cancel. */
async function promptGrapplePush(data: GrapplePushButtonData): Promise<GrapplePushChoice | null> {
    const content = await foundry.applications.handlebars.renderTemplate(PUSH_DIALOG_TEMPLATE, {
        targetName: data.targetName,
        metres: data.metres,
        directions: grapplePushCompass(),
    });
    // eslint-disable-next-line no-restricted-syntax -- boundary: DialogV2.prompt resolves to the ok callback's return or null on close; narrowed below
    const result = (await foundry.applications.api.DialogV2.prompt({
        window: { title: t('WH40K.Grapple.Push.DialogTitle', { target: data.targetName, metres: data.metres }) },
        classes: ['wh40k-rpg'],
        position: { width: 420 },
        content,
        ok: {
            label: t('WH40K.Grapple.Push.Submit'),
            callback: (_event: Event, button: HTMLButtonElement): GrapplePushChoice | null => {
                const form = button.form;
                const direction = form?.querySelector<HTMLInputElement>('input[name="direction"]:checked')?.value ?? '';
                const controller = form?.querySelector<HTMLInputElement>('input[name="controller"]:checked')?.value ?? 'follow';
                return readGrapplePushForm({ direction, controller });
            },
        },
        rejectClose: false,
    })) as GrapplePushChoice | null | undefined;
    return result ?? null;
}

/**
 * The push card's GM button: ask the direction and whether the controller
 * follows, then move the tokens; a controller that lets go ends the grapple.
 */
export async function grapplePushFromCard(button: HTMLButtonElement): Promise<void> {
    if (!game.user.isGM) {
        ui.notifications.warn(t('WH40K.Grapple.Push.GMOnly'));
        return;
    }
    const data = readGrapplePushButton(button.dataset);
    const scene = canvas.scene;
    if (data === null || scene === null) return;
    const target = sceneTokenOf(scene.tokens, data.targetUuid);
    if (target === null) {
        ui.notifications.warn(t('WH40K.Grapple.Push.NoToken', { name: data.targetName }));
        return;
    }
    const choice = await promptGrapplePush(data);
    if (choice === null) return;
    const controller = choice.follow ? sceneTokenOf(scene.tokens, data.controllerUuid) : null;
    const offset = grapplePushOffset(choice.direction, data.metres, scene.grid);
    const updates = grapplePushTokenUpdates(target, controller, offset).map((token) => ({ _id: token.id, x: token.x, y: token.y }));
    await scene.updateEmbeddedDocuments('Token', updates);
    if (!choice.follow) await applyGrappleWrites(grappleEndWrites(data.controllerUuid, data.targetUuid));
    // One push per won test: the card's button is spent.
    button.toggleAttribute('disabled', true);
    ui.notifications.info(t('WH40K.Grapple.Push.Done', { target: data.targetName, metres: data.metres, squares: offset.squares }));
}

/** An owned item, as the Ready / Use Item picker reads it. */
export interface GrappleItemCandidate {
    readonly uuid: string;
    readonly name: string;
    readonly img: string | null;
    readonly system: object;
}

/**
 * The items a Ready or Use Item may name: Ready, the carried items not yet
 * readied (equipped); Use Item, the readied ones. Only items with a carried state
 * count, and never an always-present default grant (the unarmed strike).
 */
export function grappleItemChoices<T extends GrappleItemCandidate>(option: GrappleOptionId, items: Iterable<T>): T[] {
    const wantsReadied = option === 'use-item';
    const choices: T[] = [];
    for (const item of items) {
        const system = item.system as { state?: { equipped?: boolean }; grantedByDefault?: boolean };
        if (system.state === undefined || system.grantedByDefault === true) continue;
        if ((system.state.equipped === true) === wantsReadied) choices.push(item);
    }
    return choices;
}

/**
 * Ask which of the actor's items a Ready or Use Item names; null when it has
 * none to offer (with a warning) or the dialog is cancelled.
 */
export async function promptGrappleItem(
    actor: { name: string; items: Iterable<GrappleItemCandidate> },
    option: GrappleOptionId,
): Promise<GrappleItemChoice | null> {
    const optionLabel = t(GRAPPLE_ACTION_LABEL_KEYS[option]);
    const choices = grappleItemChoices(option, actor.items);
    if (choices.length === 0) {
        ui.notifications.warn(t('WH40K.Grapple.Item.NoItems', { actor: actor.name, option: optionLabel }));
        return null;
    }
    const content = await foundry.applications.handlebars.renderTemplate(ITEM_DIALOG_TEMPLATE, {
        legend: t('WH40K.Grapple.Item.Legend', { actor: actor.name }),
        items: choices.map((item, index) => ({ uuid: item.uuid, name: item.name, img: item.img ?? 'icons/svg/item-bag.svg', checked: index === 0 })),
    });
    // eslint-disable-next-line no-restricted-syntax -- boundary: DialogV2.prompt resolves to the ok callback's return or null on close; narrowed below
    const uuid = (await foundry.applications.api.DialogV2.prompt({
        window: { title: t('WH40K.Grapple.Item.DialogTitle', { option: optionLabel }) },
        classes: ['wh40k-rpg'],
        position: { width: 380 },
        content,
        ok: {
            label: t('WH40K.Grapple.Item.Submit'),
            callback: (_event: Event, button: HTMLButtonElement): string =>
                button.form?.querySelector<HTMLInputElement>('input[name="itemUuid"]:checked')?.value ?? '',
        },
        rejectClose: false,
    })) as string | null | undefined;
    const chosen = choices.find((item) => item.uuid === uuid);
    return chosen === undefined ? null : { uuid: chosen.uuid, name: chosen.name };
}
