/**
 * The voidcraft Crew tab's Ship Officers rows (#701): each ship role the ship
 * holds, with the actor assigned to it. The table rendered only its header: it
 * bound a `system.officer` field ship roles never had.
 */

/** An owned ship role, as far as the officer table reads it. */
export interface ShipRoleLike {
    id: string | null;
    name: string;
    img: string | null;
    system: { effect: string; state: { officer: string } };
}

/** Is `item` an owned ship role, carrying its officer state? */
export function isShipRole<T extends { type: string; system: object }>(item: T): item is T & ShipRoleLike {
    if (item.type !== 'shipRole') return false;
    const { system } = item;
    return (
        'state' in system && typeof system.state === 'object' && system.state !== null && 'officer' in system.state && typeof system.state.officer === 'string'
    );
}

/** One Ship Officers row. */
export interface ShipOfficerRow {
    id: string;
    name: string;
    img: string;
    /** The assigned actor's UUID, '' when unassigned. */
    officerUuid: string;
    /** The assigned actor's name; null when unassigned or the actor is gone. */
    officerName: string | null;
    /** The role's effect, as authored HTML. */
    effect: string;
}

/** A character a role can be assigned to. */
export interface OfficerCandidate {
    uuid: string;
    name: string;
}

/**
 * The rows the table lists, by role rank order as owned. An officer UUID that no
 * longer resolves reads as unassigned, never as its raw id.
 */
export function shipOfficerRows(roles: readonly ShipRoleLike[], resolveName: (uuid: string) => string | null): ShipOfficerRow[] {
    return roles.map((role) => {
        const officerUuid = role.system.state.officer;
        return {
            id: role.id ?? '',
            name: role.name,
            img: role.img ?? '',
            officerUuid,
            officerName: officerUuid === '' ? null : resolveName(officerUuid),
            effect: role.system.effect,
        };
    });
}

/** The actors a role can be assigned to: every player-character type, by name. */
export function officerCandidates(actors: Iterable<{ uuid: string; name: string; type: string }>): OfficerCandidate[] {
    return Array.from(actors)
        .filter((actor) => actor.type.endsWith('character'))
        .map((actor) => ({ uuid: actor.uuid, name: actor.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
}
