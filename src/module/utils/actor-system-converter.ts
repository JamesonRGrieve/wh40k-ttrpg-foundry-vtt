import { ACTOR_SYSTEM_LABELS } from '../applications/dialogs/create-actor-dialog.ts';
import type { WH40KBaseActor } from '../documents/base-actor.ts';

/* eslint-disable no-restricted-syntax -- boundary: converter types wrap untyped Foundry API shapes */
type ActorDirectoryLike = {
    id: string;
    name: string;
    type: string;
    toObject: () => Record<string, unknown>;
    delete: () => Promise<unknown>;
};
type SceneTokenSource = {
    _id: string;
    actorId?: string;
    actorLink?: boolean;
};
type SceneLike = {
    tokens: {
        contents: Array<{ toObject: () => Record<string, unknown> }>;
    };
    updateEmbeddedDocuments: (embeddedName: string, updates: Array<Record<string, unknown>>) => Promise<unknown>;
};

type ActorDataModelClass = {
    cleanData: (source?: Record<string, unknown>, options?: DataModelV14.CleaningOptions, state?: DataModelV14.UpdateState) => Record<string, unknown>;
    migrateData: (source: Record<string, unknown>) => Record<string, unknown>;
    shimData?: (source: Record<string, unknown>, options?: Record<string, unknown>) => Record<string, unknown>;
};

type ActorConfigLike = {
    dataModels: Record<string, ActorDataModelClass | undefined>;
};

type ActorSourceData = Record<string, unknown> & {
    _id?: string;
    type: string;
    system?: Record<string, unknown>;
    flags?: Record<string, unknown> & {
        core?: Record<string, unknown>;
    };
};
/* eslint-enable no-restricted-syntax */

export type ConvertibleCharacterSystem = keyof typeof ACTOR_SYSTEM_LABELS;
export type ConvertibleActorKind = 'character' | 'npc' | 'vehicle';
export type ConvertibleActorType = `${ConvertibleCharacterSystem}-${ConvertibleActorKind}`;

const TARGET_GAME_SYSTEM_IDS: Record<ConvertibleCharacterSystem, string> = {
    dh2: 'dh2e',
    dh1: 'dh1e',
    rt: 'rt',
    bc: 'bc',
    ow: 'ow',
    dw: 'dw',
    im: 'im',
};

const ORIGIN_PATH_FIELDS = [
    'homeWorld',
    'birthright',
    'lureOfTheVoid',
    'trialsAndTravails',
    'motivation',
    'career',
    'background',
    'role',
    'elite',
    'divination',
    'race',
    'archetype',
    'pride',
    'disgrace',
    'regiment',
    'speciality',
    'chapter',
] as const;

const ORIGIN_PATH_FIELDS_BY_SYSTEM: Record<ConvertibleCharacterSystem, ReadonlySet<string>> = {
    dh2: new Set(['homeWorld', 'background', 'role', 'elite', 'divination']),
    dh1: new Set(['homeWorld', 'career', 'role', 'divination']),
    rt: new Set(['homeWorld', 'birthright', 'lureOfTheVoid', 'trialsAndTravails', 'motivation', 'career']),
    bc: new Set(['homeWorld', 'background', 'role', 'trialsAndTravails', 'motivation', 'race', 'archetype', 'pride', 'disgrace']),
    ow: new Set(['homeWorld', 'background', 'role', 'motivation', 'regiment', 'speciality']),
    dw: new Set(['homeWorld', 'career', 'role', 'motivation', 'chapter', 'speciality']),
    im: new Set(['homeWorld', 'background', 'role', 'motivation']),
};

export const CONVERTIBLE_CHARACTER_SYSTEMS = Object.freeze(Object.keys(ACTOR_SYSTEM_LABELS));
export const CONVERTIBLE_ACTOR_KINDS = Object.freeze(['character', 'npc', 'vehicle'] as const);

export function isConvertibleActorKind(kind: string): kind is ConvertibleActorKind {
    return CONVERTIBLE_ACTOR_KINDS.includes(kind as ConvertibleActorKind);
}

export function isConvertibleActorType(type: string): type is ConvertibleActorType {
    const [systemId, kind] = type.split('-') as [string?, string?];
    return CONVERTIBLE_CHARACTER_SYSTEMS.includes(systemId as ConvertibleCharacterSystem) && typeof kind === 'string' && isConvertibleActorKind(kind);
}

export function getActorKind(type: string): ConvertibleActorKind | null {
    if (!isConvertibleActorType(type)) return null;
    return type.split('-')[1] as ConvertibleActorKind;
}

export function getActorSystemId(type: string): ConvertibleCharacterSystem | null {
    if (!isConvertibleActorType(type)) return null;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- noUncheckedIndexedAccess guard for strict tsconfig
    return (type.split('-')[0] as string | undefined) ?? null;
}

export function getConvertedActorType(targetSystem: ConvertibleCharacterSystem, kind: ConvertibleActorKind): ConvertibleActorType {
    return `${targetSystem}-${kind}`;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: systemData is untyped actor system data
function normalizeSystemSpecificFields(systemData: Record<string, unknown>, targetSystem: ConvertibleCharacterSystem): void {
    // eslint-disable-next-line no-restricted-syntax -- boundary: systemData is untyped
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- noUncheckedIndexedAccess guard for strict tsconfig
    systemData['gameSystem'] = TARGET_GAME_SYSTEM_IDS[targetSystem] as string | undefined;

    const originPath = systemData['originPath'];
    if (originPath === null || originPath === undefined || typeof originPath !== 'object') return;

    const allowedFields = ORIGIN_PATH_FIELDS_BY_SYSTEM[targetSystem] as ReadonlySet<string> | undefined;
    if (allowedFields === undefined) return;
    for (const field of ORIGIN_PATH_FIELDS) {
        if (!allowedFields.has(field)) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: originPath is untyped system data
            (originPath as Record<string, unknown>)[field] = '';
        }
    }
}

export function isConvertibleCharacterActorType(type: string): type is `${ConvertibleCharacterSystem}-character` {
    return isConvertibleActorType(type) && getActorKind(type) === 'character';
}

export function getCharacterSystemId(type: string): ConvertibleCharacterSystem | null {
    if (!isConvertibleCharacterActorType(type)) return null;
    return type.slice(0, -'-character'.length);
}

export function getConvertedCharacterType(targetSystem: ConvertibleCharacterSystem): `${ConvertibleCharacterSystem}-character` {
    return `${targetSystem}-character`;
}

export function buildConvertedActorSource(actor: ActorDirectoryLike, targetSystem: ConvertibleCharacterSystem): ActorSourceData {
    const kind = getActorKind(actor.type);
    if (!kind) {
        throw new Error(`Actor ${actor.id} is not a convertible actor type: ${actor.type}`);
    }

    const source = foundry.utils.deepClone(actor.toObject()) as ActorSourceData;
    const targetType = getConvertedActorType(targetSystem, kind);
    const actorConfig = CONFIG.Actor as ActorConfigLike;
    const targetDataModel = actorConfig.dataModels[targetType];
    if (!targetDataModel) {
        throw new Error(`Missing actor data model for target type ${targetType}`);
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: source.system comes from deepClone of untyped actor data; fallback is legitimate
    const cleanedSystemSource = foundry.utils.deepClone(source.system ?? {});
    normalizeSystemSpecificFields(cleanedSystemSource, targetSystem);
    targetDataModel.migrateData(cleanedSystemSource);
    targetDataModel.shimData?.(cleanedSystemSource);
    const cleanedSystem = targetDataModel.cleanData(cleanedSystemSource);

    source.type = targetType;
    source.system = cleanedSystem;
    delete source._id;

    if (source.flags?.core && typeof source.flags.core === 'object') {
        delete source.flags.core['sheetClass'];
        if (Object.keys(source.flags.core).length === 0) {
            delete source.flags.core;
        }
    }

    return source;
}

export function buildConvertedCharacterSource(actor: ActorDirectoryLike, targetSystem: ConvertibleCharacterSystem): ActorSourceData {
    if (!isConvertibleCharacterActorType(actor.type)) {
        throw new Error(`Actor ${actor.id} is not a convertible character type: ${actor.type}`);
    }
    return buildConvertedActorSource(actor, targetSystem);
}

async function repointLinkedSceneTokens(oldActorId: string, newActorId: string): Promise<void> {
    const scenes = (game.scenes.contents as SceneLike[]).map(async (scene) => {
        const tokenUpdates = scene.tokens.contents
            .map((token): SceneTokenSource => token.toObject() as SceneTokenSource)
            .filter((token) => token.actorLink === true && token.actorId === oldActorId)
            .map((token) => ({ _id: token._id, actorId: newActorId }));

        if (tokenUpdates.length > 0) {
            await scene.updateEmbeddedDocuments('Token', tokenUpdates);
        }
    });

    await Promise.all(scenes);
}

export async function convertCharacterActorSystem(actor: WH40KBaseActor, targetSystem: ConvertibleCharacterSystem): Promise<WH40KBaseActor> {
    if (actor.id === null) {
        throw new Error(`Actor ${actor.name} is missing an id`);
    }
    const currentSystem = getCharacterSystemId(actor.type);
    if (currentSystem === null) {
        throw new Error(`Actor ${actor.id} is not a convertible character actor`);
    }
    if (currentSystem === targetSystem) {
        return actor;
    }

    const replacementSource = buildConvertedCharacterSource(actor as WH40KBaseActor & { id: string }, targetSystem);
    /* eslint-disable no-restricted-syntax -- boundary: Actor.create returns untyped Foundry document */
    const createdRaw = await Actor.create(replacementSource as unknown as Parameters<typeof Actor.create>[0], { renderSheet: false });
    const created = createdRaw as unknown as WH40KBaseActor | null;
    /* eslint-enable no-restricted-syntax */
    if (created === null) {
        throw new Error(`Failed to create converted actor for ${actor.name}`);
    }
    if (created.id === null) {
        throw new Error(`Converted actor for ${actor.name} is missing an id`);
    }

    await repointLinkedSceneTokens(actor.id, created.id);
    await actor.delete();

    return created;
}

export async function convertActorSystem(actor: WH40KBaseActor, targetSystem: ConvertibleCharacterSystem): Promise<WH40KBaseActor> {
    if (actor.id === null) {
        throw new Error(`Actor ${actor.name} is missing an id`);
    }
    const currentSystem = getActorSystemId(actor.type);
    if (currentSystem === null) {
        throw new Error(`Actor ${actor.id} is not a convertible actor`);
    }
    if (currentSystem === targetSystem) {
        return actor;
    }

    const replacementSource = buildConvertedActorSource(actor as WH40KBaseActor & { id: string }, targetSystem);
    /* eslint-disable no-restricted-syntax -- boundary: Actor.create returns untyped Foundry document */
    const createdRaw2 = await Actor.create(replacementSource as unknown as Parameters<typeof Actor.create>[0], { renderSheet: false });
    const created = createdRaw2 as unknown as WH40KBaseActor | null;
    /* eslint-enable no-restricted-syntax */
    if (created === null) {
        throw new Error(`Failed to create converted actor for ${actor.name}`);
    }
    if (created.id === null) {
        throw new Error(`Converted actor for ${actor.name} is missing an id`);
    }

    await repointLinkedSceneTokens(actor.id, created.id);
    await actor.delete();

    return created;
}
