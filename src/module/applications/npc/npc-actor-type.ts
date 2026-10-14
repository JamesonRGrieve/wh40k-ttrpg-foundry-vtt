/**
 * @file npc-actor-type — the actor type every NPC generator creates.
 *
 * The NPC tools (template selector, NPC-template sheet, quick-create,
 * batch-create, stat-block import) each hard-coded `npcV2`, a type Foundry does
 * not register, so every NPC they made was rejected. They all ask this one
 * function instead: the line's registered `<line>-npc` type — the line an
 * imported actor already names when it names one, else the world's primary line.
 */
import { ALL_SYSTEM_IDS, type GameSystemId } from '../../config/game-systems/types.ts';
import { npcActorTypeFor } from '../../documents/actor-types.ts';
import { WH40KSettings } from '../../wh40k-rpg-settings.ts';

/** The game line a registered `<line>-npc` type belongs to, or null for any other type. */
export function npcTypeLine(type: string | undefined): GameSystemId | null {
    if (type?.endsWith('-npc') !== true) return null;
    const line = type.slice(0, -'-npc'.length);
    return ALL_SYSTEM_IDS.find((id) => id === line) ?? null;
}

/**
 * The actor type to create a new NPC as: the chosen line's NPC type when the
 * source names one (a pasted `dh1-npc` export stays DH1), else the world's
 * primary line's.
 */
export function newNpcActorType(sourceType?: string): string {
    return npcActorTypeFor(npcTypeLine(sourceType) ?? WH40KSettings.getPrimaryGameSystem());
}
