/**
 * What the chosen origins hand the Origin Path Builder to create on the actor:
 * the talent and trait items they grant, and the character-creation values a
 * race or similar origin sets (the Chaos Space Marine's characteristic base of
 * 30 and 500 starting XP, #727).
 *
 * Pure, so it is unit-tested; the builder fetches each planned UUID and creates
 * the item.
 */

/** A talent or trait grant as an origin stores it in `grants.talents` / `grants.traits`. */
interface ItemGrantEntry {
    name?: string;
    specialization?: string;
    /** A trait's level ("Unnatural Characteristic (X)" at 4); a skill grant's rank word is not a level. */
    level?: number | string | null;
    uuid?: string;
}

/** A choice-resolved grant (`OriginPathData.activeModifiers`). */
interface ResolvedGrantModifier {
    type?: string;
    key?: string;
    value?: number | string | null;
    itemUuid?: string | null;
    specialization?: string;
}

/** The slice of an origin's system the planner reads. */
export interface GrantSourceSystem {
    grants?: { talents?: ItemGrantEntry[]; traits?: ItemGrantEntry[] };
    activeModifiers?: ResolvedGrantModifier[];
    characterCreation?: { characteristicBase?: number | null; startingXP?: number | null };
}

/** One item to create: its compendium UUID, plus the specialisation and level to stamp on the copy. */
interface ItemGrantPlan {
    uuid: string;
    specialization?: string;
    level?: number;
}

/** The plans for one item kind, and the grants that name no compendium entry (and so cannot be created). */
interface ItemGrantPlans {
    plans: ItemGrantPlan[];
    unresolved: string[];
}

export type GrantedItemKind = 'talent' | 'trait';

function plan(uuid: string, specialization: string | undefined, level: number | undefined): ItemGrantPlan {
    return {
        uuid,
        ...(specialization !== undefined && specialization !== '' ? { specialization } : {}),
        ...(level !== undefined ? { level } : {}),
    };
}

/** A numeric level, or undefined (a skill grant's "trained" and an unset level are not levels). */
function levelOf(value: number | string | null | undefined): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * Every talent or trait the origins grant, fixed (`grants.<kind>s`) or picked in
 * a choice (`activeModifiers` of that type), in origin order. A grant with no
 * UUID is listed in `unresolved` by name instead: the builder cannot create it,
 * and the GM is told so rather than the grant vanishing.
 */
export function collectItemGrantPlans(systems: Iterable<GrantSourceSystem>, kind: GrantedItemKind): ItemGrantPlans {
    const plans: ItemGrantPlan[] = [];
    const unresolved: string[] = [];
    for (const system of systems) {
        const fixed = (kind === 'talent' ? system.grants?.talents : system.grants?.traits) ?? [];
        for (const entry of fixed) {
            const level = kind === 'trait' ? levelOf(entry.level) : undefined;
            if (typeof entry.uuid === 'string' && entry.uuid !== '') plans.push(plan(entry.uuid, entry.specialization, level));
            else if (typeof entry.name === 'string' && entry.name !== '') unresolved.push(entry.name);
        }
        for (const mod of system.activeModifiers ?? []) {
            if (mod.type !== kind) continue;
            const level = kind === 'trait' ? levelOf(mod.value) : undefined;
            if (typeof mod.itemUuid === 'string' && mod.itemUuid !== '') plans.push(plan(mod.itemUuid, mod.specialization, level));
            else if (typeof mod.key === 'string' && mod.key !== '') {
                const spec = mod.specialization;
                unresolved.push(spec !== undefined && spec !== '' ? `${mod.key} (${spec})` : mod.key);
            }
        }
    }
    return { plans, unresolved };
}

/** Character-creation values the chosen origins set; null where none sets one (the line's default applies). */
interface CreationOverrides {
    characteristicBase: number | null;
    startingXP: number | null;
}

/**
 * The first characteristic base and the first starting XP any chosen origin
 * sets, in origin order. A race sets them (Chaos Space Marine: 30 and 500); a
 * line whose origins set nothing keeps the world setting and the line's XP.
 */
export function resolveCreationOverrides(systems: Iterable<GrantSourceSystem>): CreationOverrides {
    let characteristicBase: number | null = null;
    let startingXP: number | null = null;
    for (const system of systems) {
        const creation = system.characterCreation;
        if (characteristicBase === null && typeof creation?.characteristicBase === 'number') characteristicBase = creation.characteristicBase;
        if (startingXP === null && typeof creation?.startingXP === 'number') startingXP = creation.startingXP;
    }
    return { characteristicBase, startingXP };
}
