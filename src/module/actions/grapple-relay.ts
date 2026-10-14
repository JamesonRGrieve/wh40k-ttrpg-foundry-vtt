/**
 * @file grapple-relay — post grapple state changes, and apply them as the GM.
 *
 * Starting or ending a grapple writes BOTH participants' grapple flags
 * (`rules/grapple.ts`): each records its role and the other's UUID, which the
 * grapple actions read to find whom they are opposed against. A player usually
 * owns only one of the two actors, so the change rides on the chat card that
 * announces it (`GRAPPLE_UPDATE_FLAG`) and the active GM's client writes the flags
 * when the card is created.
 */
import { SYSTEM_ID } from '../constants.ts';
import { emitChatFromTemplate } from '../rolls/roll-helpers.ts';
import { GRAPPLE_FLAG, GRAPPLE_UPDATE_FLAG, type GrappleFlagWrite, grappleFlagValue, grappleStartWrites, readGrappleWrites } from '../rules/grapple.ts';

const GRAPPLE_START_TEMPLATE = 'systems/wh40k-rpg/templates/chat/grapple-start-chat.hbs';

/** A grapple participant as the start card needs it. */
interface Participant {
    name: string;
    uuid: string;
}

/**
 * A grapple attempt landed and was not evaded: announce the grapple and carry
 * both participants' flag writes for the active GM.
 */
export async function postGrappleStart(
    controller: Participant,
    target: Participant,
    gameSystem: string,
    speaker: ReturnType<typeof ChatMessage.getSpeaker>,
): Promise<void> {
    await emitChatFromTemplate(
        GRAPPLE_START_TEMPLATE,
        { gameSystem, controllerName: controller.name, targetName: target.name },
        { speaker, flags: { [GRAPPLE_UPDATE_FLAG]: grappleStartWrites(controller.uuid, target.uuid) } },
    );
}

/** Write each participant's grapple flag. */
export async function applyGrappleWrites(writes: readonly GrappleFlagWrite[]): Promise<void> {
    for (const write of writes) {
        // eslint-disable-next-line no-await-in-loop -- the two writes are applied in order so a failure leaves at most one side changed
        const doc = await fromUuid(write.uuid);
        // eslint-disable-next-line no-await-in-loop -- see above
        if (doc instanceof Actor) await doc.setFlag(SYSTEM_ID, GRAPPLE_FLAG, grappleFlagValue(write));
    }
}

/** On a created chat message: the active GM applies the grapple flag writes it carries. */
export function applyGrappleWritesFromMessage(message: ChatMessage): void {
    if (game.users.activeGM?.isSelf !== true) return;
    const writes = readGrappleWrites(message.getFlag(SYSTEM_ID, GRAPPLE_UPDATE_FLAG));
    if (writes.length > 0) void applyGrappleWrites(writes);
}
