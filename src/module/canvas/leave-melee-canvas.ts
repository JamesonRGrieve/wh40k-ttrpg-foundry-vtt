/**
 * @file Leaving melee on the live scene (#770).
 *
 * During a started combat, a combatant's move that takes it out of contact with foes
 * it was engaged with (and wasn't a Disengage this turn) is paused. A chat card names
 * each foe left behind with a Free Attack and a Decline button for its owner (or the
 * GM), and a Let Them Go button for the GM. Free Attack targets the mover and opens the
 * foe's attack with its melee weapon, through the normal flow and its Evasion prompt.
 * Once every foe has answered, the mover's client completes the move.
 *
 * Which foes are left behind is the pure `rules/leave-melee.ts`; engagement itself is
 * `rules/engagement.ts`, read off the scene through `engagement-canvas.ts`.
 */
import { SYSTEM_ID } from '../constants.ts';
import { t } from '../i18n/t.ts';
import { disengagedThisTurn } from '../rules/action-economy.ts';
import { answerFreeAttack, everyFoeAnswered, foesLeftBehind, type LeaveMeleeState, releaseMover } from '../rules/leave-melee.ts';
import { emitSystemSocket, onSystemSocket, type SystemSocketMessage } from '../utils/system-socket.ts';
import { engagementRulesFor, type EngagementTokenDoc, sceneEngagementTokens, sceneGridSize } from './engagement-canvas.ts';

const CARD_TEMPLATE = 'systems/wh40k-rpg/templates/chat/leave-melee-card.hbs';
const STATE_FLAG = 'leaveMelee';

/** Movers whose move is paused on this client, so a second drag doesn't post a second card. */
const pausedMovers = new Set<string>();

/** The update options the hook reads: the completed move carries the marker, so it passes. */
interface MoveOptions {
    readonly wh40kLeaveMeleeResolved?: boolean;
}

/** An owned weapon, as the free attack picks one. */
interface WeaponLike {
    readonly id: string | null;
    readonly type: string;
    readonly isMelee?: boolean;
    readonly system?: { readonly state?: { readonly equipped?: boolean } };
}

/** A scene token, as the card reads it. */
interface SceneTokenLike {
    readonly name?: string;
    readonly actor?: {
        readonly isOwner?: boolean;
        readonly items: Iterable<WeaponLike>;
        readonly rollItem?: (id: string) => Promise<object | undefined>;
    } | null;
    readonly object?: { readonly setTarget: (targeted: boolean, options: object) => void } | null;
    readonly update: (data: object, options?: MoveOptions) => Promise<object | undefined>;
}

/** A scene token by scene and token id. */
function sceneToken(sceneId: string, tokenId: string): SceneTokenLike | undefined {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's game.scenes and Scene#tokens collections, read through the structural SceneTokenLike
    const scenes = game.scenes as unknown as { get: (id: string) => { readonly tokens: { get: (id: string) => SceneTokenLike | undefined } } | undefined };
    return scenes.get(sceneId)?.tokens.get(tokenId);
}

/** A token document as the move hook reads it. */
type MovingTokenDoc = EngagementTokenDoc & {
    readonly name?: string;
    readonly parent?: { readonly id?: string | null } | null;
    readonly actor?: (EngagementTokenDoc['actor'] & { readonly id?: string | null }) | null;
};

/** A foe's answer, relayed to a GM by a user who can't update the card. */
interface LeaveMeleeAnswer extends SystemSocketMessage {
    readonly type: 'leaveMeleeAnswer';
    readonly messageId: string;
    readonly foeTokenId: string | null;
    readonly outcome: 'attacked' | 'declined' | 'release';
}

/** A chat message as the card reads and writes it. */
interface CardMessage {
    readonly id: string | null;
    readonly isAuthor?: boolean;
    readonly getFlag: (scope: string, key: string) => LeaveMeleeState | null | undefined;
    readonly update: (data: object) => Promise<object | undefined>;
}

/**
 * The hook payload as a card message, or null when it isn't a chat message document.
 * `renderChatMessageHTML` and `updateChatMessage` hand handlers whatever Foundry or
 * another module passes; a throw inside one aborts every later handler for that
 * message, so a payload without the document methods is skipped.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: the raw renderChatMessageHTML/updateChatMessage hook payload, narrowed by the method checks below
function asCardMessage(payload: unknown): CardMessage | null {
    if (typeof payload !== 'object' || payload === null) return null;
    if (!('getFlag' in payload) || typeof payload.getFlag !== 'function') return null;
    if (!('update' in payload) || typeof payload.update !== 'function') return null;
    // eslint-disable-next-line no-restricted-syntax -- boundary: the renderChatMessageHTML/updateChatMessage hook's ChatMessage, checked above for the methods CardMessage reads
    return payload as unknown as CardMessage;
}

/** Render the card's content for a state. */
async function renderCard(state: LeaveMeleeState): Promise<string> {
    return foundry.applications.handlebars.renderTemplate(CARD_TEMPLATE, {
        moverName: sceneToken(state.sceneId, state.moverTokenId)?.name ?? '',
        foes: state.foes.map((foe) => ({ ...foe, pending: foe.outcome === 'pending', attacked: foe.outcome === 'attacked' })),
        open: !everyFoeAnswered(state),
    });
}

/** Write a new state onto the card (its content and its flag). Only its author or a GM can. */
async function writeState(message: CardMessage, state: LeaveMeleeState): Promise<void> {
    await message.update({ content: await renderCard(state), [`flags.${SYSTEM_ID}.${STATE_FLAG}`]: state });
}

/** preUpdateToken: pause a move that leaves melee; return false to hold it. */
function onPreUpdateToken(doc: MovingTokenDoc, changes: { x?: number; y?: number }, options: MoveOptions): boolean {
    try {
        if (options.wh40kLeaveMeleeResolved === true) return true;
        if (!('x' in changes) && !('y' in changes)) return true;
        const combat = game.combat;
        if (combat?.started !== true || doc.id === null) return true;
        if (!combat.combatants.some((c) => c.tokenId === doc.id)) return true;
        const rules = engagementRulesFor(doc);
        if (rules?.tracked !== true) return true;
        const actorId = doc.actor?.id ?? null;
        if (actorId !== null && disengagedThisTurn(actorId, doc.id)) return true;
        const tokens = sceneEngagementTokens();
        const mover = tokens.find((token) => token.id === doc.id);
        if (mover === undefined) return true;
        const to = { x: changes.x ?? doc.x, y: changes.y ?? doc.y };
        const left = foesLeftBehind(mover, to, tokens, sceneGridSize());
        if (left.length === 0) return true;
        if (pausedMovers.has(doc.id)) {
            ui.notifications.warn(t('WH40K.Combat.LeaveMelee.Waiting'));
            return false;
        }
        pausedMovers.add(doc.id);
        const sceneId = doc.parent?.id ?? '';
        const state: LeaveMeleeState = {
            sceneId,
            moverTokenId: doc.id,
            moverUserId: game.user.id,
            to,
            foes: left.map((foe) => ({ tokenId: foe.id, name: sceneToken(sceneId, foe.id)?.name ?? '', outcome: 'pending' as const })),
            completed: false,
        };
        void postCard(state, doc.name ?? '');
        ui.notifications.info(t('WH40K.Combat.LeaveMelee.Paused'));
        return false;
    } catch (err) {
        console.error('WH40K | leaving melee (preUpdateToken) — allowing on error', err);
        return true;
    }
}

/** Post the leaving-melee card. */
async function postCard(state: LeaveMeleeState, moverName: string): Promise<void> {
    await ChatMessage.create({
        user: game.user.id,
        speaker: { alias: moverName },
        content: await renderCard(state),
        flags: { [SYSTEM_ID]: { [STATE_FLAG]: state } },
    });
}

/** Record an answer on the card, directly when this user may update it, else through a GM. */
async function answer(message: CardMessage, foeTokenId: string | null, outcome: LeaveMeleeAnswer['outcome']): Promise<void> {
    const state = message.getFlag(SYSTEM_ID, STATE_FLAG);
    if (state == null || message.id === null) return;
    if (message.isAuthor === true || game.user.isGM) {
        const next = outcome === 'release' ? releaseMover(state) : answerFreeAttack(state, foeTokenId ?? '', outcome);
        await writeState(message, next);
        return;
    }
    const relay: LeaveMeleeAnswer = { type: 'leaveMeleeAnswer', messageId: message.id, foeTokenId, outcome };
    emitSystemSocket(relay);
}

/** The foe's free attack: target the mover and open its attack with a melee weapon (an equipped one first). */
async function freeAttack(state: LeaveMeleeState, foeTokenId: string): Promise<boolean> {
    const foe = sceneToken(state.sceneId, foeTokenId);
    const actor = foe?.actor ?? null;
    if (actor?.rollItem === undefined) return false;
    const melee = [...actor.items].filter((item) => item.type === 'weapon' && item.isMelee === true);
    const weapon = melee.find((item) => item.system?.state?.equipped === true) ?? melee.at(0);
    if (weapon?.id == null) {
        ui.notifications.warn(t('WH40K.Combat.LeaveMelee.NoMeleeWeapon', { name: foe?.name ?? '' }));
        return false;
    }
    sceneToken(state.sceneId, state.moverTokenId)?.object?.setTarget(true, { releaseOthers: true, groupSelection: false });
    await actor.rollItem(weapon.id);
    return true;
}

/** Bind the card's buttons; each acts only for the foe's owner, or the GM. */
function bindCard(message: CardMessage, html: HTMLElement): void {
    const state = message.getFlag(SYSTEM_ID, STATE_FLAG);
    if (state == null) return;
    for (const button of html.querySelectorAll<HTMLElement>('[data-leave-melee]')) {
        const foeTokenId = button.dataset['foeToken'] ?? null;
        const foeOwned = foeTokenId !== null && sceneToken(state.sceneId, foeTokenId)?.actor?.isOwner === true;
        const mayAct = button.dataset['leaveMelee'] === 'release' ? game.user.isGM : game.user.isGM || foeOwned;
        if (!mayAct) {
            button.remove();
            continue;
        }
        button.addEventListener('click', (event) => {
            event.preventDefault();
            const action = button.dataset['leaveMelee'];
            void (async (): Promise<void> => {
                if (action === 'attack' && foeTokenId !== null) {
                    if (await freeAttack(state, foeTokenId)) await answer(message, foeTokenId, 'attacked');
                } else if (action === 'decline' && foeTokenId !== null) {
                    await answer(message, foeTokenId, 'declined');
                } else if (action === 'release') {
                    await answer(message, null, 'release');
                }
            })();
        });
    }
}

/** When every foe has answered, the mover's client (or a GM, if the mover is gone) completes the move. */
async function maybeComplete(message: CardMessage): Promise<void> {
    const state = message.getFlag(SYSTEM_ID, STATE_FLAG);
    if (state == null || state.completed || !everyFoeAnswered(state)) return;
    const moverOnline = game.users.get(state.moverUserId)?.active === true;
    const completer = state.moverUserId === game.user.id || (game.user.isGM && !moverOnline);
    if (!completer) return;
    pausedMovers.delete(state.moverTokenId);
    await writeState(message, { ...state, completed: true });
    await sceneToken(state.sceneId, state.moverTokenId)?.update({ x: state.to.x, y: state.to.y }, { wh40kLeaveMeleeResolved: true });
}

function isAnswer(message: SystemSocketMessage): message is LeaveMeleeAnswer {
    return message.type === 'leaveMeleeAnswer';
}

/** Register the leaving-melee pause (#770). */
export function registerLeaveMelee(): void {
    Hooks.on('preUpdateToken', (doc, changes, options) =>
        // eslint-disable-next-line no-restricted-syntax -- boundary: the preUpdateToken hook payload (TokenDocument, its change, Foundry's update options) is read structurally
        onPreUpdateToken(doc as unknown as MovingTokenDoc, changes as { x?: number; y?: number }, options as MoveOptions),
    );
    Hooks.on('renderChatMessageHTML', (payload, html) => {
        const message = asCardMessage(payload);
        if (message !== null) bindCard(message, html);
    });
    Hooks.on('updateChatMessage', (payload) => {
        const message = asCardMessage(payload);
        if (message !== null) void maybeComplete(message);
    });
    onSystemSocket((payload) => {
        if (!isAnswer(payload) || !game.user.isGM) return;
        // One GM answers: the first active GM by id.
        const gmIds = game.users
            .filter((user) => user.isGM && user.active)
            .map((user) => user.id)
            .sort();
        if (gmIds[0] !== game.user.id) return;
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's game.messages collection, read through the structural CardMessage
        const message = game.messages.get(payload.messageId) as unknown as CardMessage | undefined;
        if (message !== undefined) void answer(message, payload.foeTokenId, payload.outcome);
    });
}
