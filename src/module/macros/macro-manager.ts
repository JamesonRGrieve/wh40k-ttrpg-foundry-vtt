function getTokenActor(actorId: string | undefined): Actor | undefined {
    // Fetch the actor from the current users token or the actor collection.
    const speaker = ChatMessage.getSpeaker();
    let actor: Actor | null | undefined;
    if (actorId !== undefined && actorId !== '') actor = game.actors.get(actorId);
    if (actor === null || actor === undefined) {
        const tokenId = speaker.token;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- speaker.token type may be narrower in fvtt-types but runtime can be undefined
        if (tokenId !== undefined && tokenId !== null && tokenId !== '') {
            // eslint-disable-next-line no-restricted-syntax -- boundary: game.actors.tokens is a non-standard extension not in fvtt-types
            actor = (game.actors as unknown as { tokens: Record<string, Actor> }).tokens[tokenId];
        }
    }
    if ((actor === null || actor === undefined) && typeof speaker.actor === 'string') actor = game.actors.get(speaker.actor);
    if (actor === null || actor === undefined) {
        // eslint-disable-next-line no-restricted-syntax -- boundary: hardcoded fallback; i18n keys not established at macro invocation
        ui.notifications.warn(`Cannot find controlled Actor. Is an Actor selector and do you have permissions?`);
        return undefined;
    }
    return actor;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: data param accepts caller-supplied macro args which may be any type
function checkCanRollMacro(data: unknown): boolean {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- game.actors may be undefined at macro invocation time
    if (game.actors === undefined) {
        // eslint-disable-next-line no-restricted-syntax -- boundary: hardcoded fallback; i18n keys not established at macro invocation
        ui.notifications.warn(`Game or Actors not found. Unable to perform roll`);
        return false;
    } else if (data === undefined || data === null || data === '') {
        // eslint-disable-next-line no-restricted-syntax -- boundary: hardcoded fallback; i18n keys not established at macro invocation
        ui.notifications.warn(`Must provide data to perform roll`);
        return false;
    }
    return true;
}

function checkMacroCanCreate(): boolean {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- game.macros/game.user may be undefined at macro invocation time
    if (game.macros === undefined || game.user === undefined) {
        // eslint-disable-next-line no-restricted-syntax -- boundary: hardcoded fallback; i18n keys not established at macro invocation
        ui.notifications.warn(`Game or User not found. Unable to create macro`);
        return false;
    }
    return true;
}

function checkExistingMacro(name: string, command: string): boolean {
    const existingMacro = game.macros.find((m) => m.name === name && m.command === command);
    if (existingMacro !== undefined) {
        // eslint-disable-next-line no-restricted-syntax -- boundary: hardcoded fallback; i18n keys not established at macro invocation
        ui.notifications.warn(`Macro already exists`);
        return true;
    }
    return false;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: hotbarDrop data payload is an untyped Record from Foundry hook
export async function createItemMacro(data: Record<string, unknown>, slot: number): Promise<void> {
    if (!checkMacroCanCreate()) return;

    // eslint-disable-next-line no-restricted-syntax -- boundary: hotbarDrop payload; data['data'] is an untyped Record from Foundry hook
    const macroData = data['data'] as Record<string, unknown>;
    const macroName = `${data['actorName'] as string}: ${macroData['name'] as string}`;
    // Create the macro command
    const command = `game.wh40k.rollItemMacro("${data['actorId'] as string}", "${macroData['_id'] as string}");`;
    if (checkExistingMacro(macroName, command)) return;

    // eslint-disable-next-line no-restricted-syntax -- boundary: flags.dh is a system-scoped namespace not declared in fvtt-types CoreFlags; cast is necessary
    const macro = await (Macro.create as (data: Record<string, unknown>) => ReturnType<typeof Macro.create>)({
        name: macroName,
        type: 'script',
        img: macroData['img'],
        command: command,
        flags: { dh: { itemMacro: true } },
    });
    const macroInstance = Array.isArray(macro) ? macro[0] : macro;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Macro.create can return null on failure
    if (macroInstance !== null && macroInstance !== undefined) await game.user.assignHotbarMacro(macroInstance, slot);
}

// eslint-disable-next-line no-restricted-syntax -- boundary: return type unknown because rollItem result is opaque at this layer
export function rollItemMacro(actorId: string, itemId: string): unknown {
    // eslint-disable-next-line no-restricted-syntax -- boundary: game.wh40k is a system-global not in fvtt-types
    (game as unknown as { wh40k: { log: (s: string) => void } }).wh40k.log('RollItemMacro');
    if (!checkCanRollMacro(itemId)) return undefined;
    const actor = getTokenActor(actorId);
    if (actor === undefined) return undefined;

    const item = actor.items.find((i) => i._id === itemId);
    if (item === undefined) {
        // eslint-disable-next-line no-restricted-syntax -- boundary: hardcoded fallback; i18n keys not established at macro invocation
        ui.notifications.warn(`Actor does not have an item id: ${itemId}`);
        return undefined;
    }
    // eslint-disable-next-line no-restricted-syntax, @typescript-eslint/no-unnecessary-condition -- boundary: rollItem is system extension; item._id may be undefined per noUncheckedIndexedAccess
    return (actor as unknown as { rollItem: (id: string) => unknown }).rollItem(item._id ?? '');
}

// eslint-disable-next-line no-restricted-syntax -- boundary: hotbarDrop data payload is an untyped Record from Foundry hook
export async function createSkillMacro(data: Record<string, unknown>, slot: number): Promise<void> {
    if (!checkMacroCanCreate()) return;

    // eslint-disable-next-line no-restricted-syntax -- boundary: hotbarDrop payload; data['data'] is an untyped Record from Foundry hook
    const macroData = data['data'] as Record<string, unknown>;
    const { skill, speciality, name } = macroData as { skill: string; speciality?: string; name: string };
    const macroName = `${data['actorName'] as string}: ${name}`;
    // eslint-disable-next-line no-restricted-syntax -- boundary: game.wh40k is a system-global not in fvtt-types
    (game as unknown as { wh40k: { log: (s: string) => void } }).wh40k.log(`Creating macro with name: ${macroName}`);

    // Setup macro data.
    let command = `game.wh40k.rollSkillMacro("${data['actorId'] as string}", "${skill}");`;
    if (speciality !== undefined && speciality !== '') {
        command = `game.wh40k.rollSkillMacro("${data['actorId'] as string}", "${skill}", "${speciality}");`;
    }
    if (checkExistingMacro(macroName, command)) return;

    // eslint-disable-next-line no-restricted-syntax -- boundary: flags.dh is a system-scoped namespace not declared in fvtt-types CoreFlags; cast is necessary
    const macro = await (Macro.create as (data: Record<string, unknown>) => ReturnType<typeof Macro.create>)({
        name: macroName,
        img: 'systems/wh40k-rpg/icons/talents/red/r_36.png',
        type: 'script',
        command: command,
        flags: { dh: { skillMacro: true } },
    });
    const macroInstance = Array.isArray(macro) ? macro[0] : macro;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Macro.create can return null on failure
    if (macroInstance !== null && macroInstance !== undefined) await game.user.assignHotbarMacro(macroInstance, slot);
}

export async function rollSkillMacro(actorId: string, skillName: string, speciality?: string): Promise<void> {
    if (!checkCanRollMacro(skillName)) return;
    const actor = getTokenActor(actorId);
    if (actor === undefined) return;

    /* eslint-disable no-restricted-syntax -- boundary: getSkillFuzzy/rollSkill are system extensions on Actor not in fvtt-types */
    const actorExt = actor as unknown as {
        getSkillFuzzy?: (s: string) => unknown;
        skills?: Record<string, unknown>;
        rollSkill: (s: string, sp?: string) => Promise<void>;
    };
    /* eslint-enable no-restricted-syntax */
    const skill = actorExt.getSkillFuzzy !== undefined ? actorExt.getSkillFuzzy(skillName) : actorExt.skills?.[skillName];
    if (skill === undefined || skill === null) {
        // eslint-disable-next-line no-restricted-syntax -- boundary: hardcoded fallback; i18n keys not established at macro invocation
        ui.notifications.warn(`Your controlled Actor does not have a skill named ${skillName}`);
        return;
    }
    await actorExt.rollSkill(skillName, speciality);
}

// eslint-disable-next-line no-restricted-syntax -- boundary: hotbarDrop data payload is an untyped Record from Foundry hook
export async function createCharacteristicMacro(data: Record<string, unknown>, slot: number): Promise<void> {
    if (!checkMacroCanCreate()) return;

    // eslint-disable-next-line no-restricted-syntax -- boundary: hotbarDrop payload; data['data'] is an untyped Record from Foundry hook
    const macroData = data['data'] as Record<string, unknown>;
    const { characteristic, name } = macroData as { characteristic: string; name: string };
    const macroName = `${data['actorName'] as string}: ${name}`;

    // Create the macro command
    const command = `game.wh40k.rollCharacteristicMacro("${data['actorId'] as string}","${characteristic}");`;
    if (checkExistingMacro(macroName, command)) return;

    // eslint-disable-next-line no-restricted-syntax -- boundary: flags.dh is a system-scoped namespace not declared in fvtt-types CoreFlags; cast is necessary
    const macro = await (Macro.create as (data: Record<string, unknown>) => ReturnType<typeof Macro.create>)({
        name: macroName,
        img: 'systems/wh40k-rpg/icons/talents/violet/p_05.png',
        type: 'script',
        command: command,
        flags: { dh: { characteristicMacro: true } },
    });
    const macroInstance = Array.isArray(macro) ? macro[0] : macro;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Macro.create can return null on failure
    if (macroInstance !== null && macroInstance !== undefined) await game.user.assignHotbarMacro(macroInstance, slot);
}

export async function rollCharacteristicMacro(actorId: string, characteristic: string): Promise<void> {
    if (!checkCanRollMacro(characteristic)) return;
    const actor = getTokenActor(actorId);
    if (actor === undefined) return;

    // eslint-disable-next-line no-restricted-syntax -- boundary: characteristics/rollCharacteristic are system extensions on Actor not in fvtt-types
    const actorExt = actor as unknown as { characteristics: Record<string, unknown>; rollCharacteristic: (c: string) => Promise<void> };
    const charCheck = actorExt.characteristics[characteristic];
    if (charCheck === undefined || charCheck === null) {
        // eslint-disable-next-line no-restricted-syntax -- boundary: hardcoded fallback; i18n keys not established at macro invocation
        ui.notifications.warn(`Your controlled Actor does not have a characteristic named ${characteristic}`);
        return;
    }
    await actorExt.rollCharacteristic(characteristic);
}
