/**
 * @file The one client that writes shared world state (#713).
 *
 * `game.user.isGM` is true on every connected GM's client, so a job gated on it
 * runs once per GM: two GMs (or a GM and an Assistant GM) logged in at `ready`
 * both migrate the same documents, both reconcile the same grants, and both see
 * no armoury and create one each. Foundry elects exactly one active GM, so a
 * job gated on being that GM runs on exactly one client.
 *
 * Use this for anything that writes the world on its own initiative (ready-time
 * jobs, hook-driven automation, relayed socket requests). Keep `game.user.isGM`
 * for UI decisions: what a GM may see or click is not a write race.
 */

/**
 * True on the client of the active GM, the single client that performs
 * world writes no user asked for. False on players, on every other GM, and on
 * any client while no GM is connected.
 * @returns {boolean}  Whether this client is the world writer.
 */
export function isWorldWriter(): boolean {
    return game.users.activeGM?.isSelf === true;
}
