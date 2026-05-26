import { ACTOR_SYSTEM_LABELS } from '../applications/dialogs/create-actor-dialog.ts';
import type { WH40KBaseActor } from '../documents/base-actor.ts';

/**
 * Serialized JSON-compatible value. Actor source data produced by `toObject()` /
 * `foundry.utils.deepClone()` is always JSON-serializable, so this models the
 * boundary shape precisely without falling back to `unknown`.
 */
type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

type ActorDirectoryLike = {
    id: string;
    name: string;
    type: string;
    toObject: () => ActorSourceData;
    delete: () => Promise<void>;
};
type SceneTokenSource = {
    _id: string;
    actorId?: string;
    actorLink?: boolean;
};
type SceneTokenLike = {
    toObject: () => SceneTokenSource;
};
type TokenUpdate = {
    _id: string;
    actorId: string;
};
type SceneLike = {
    tokens: {
        contents: SceneTokenLike[];
    };
    updateEmbeddedDocuments: (embeddedName: string, updates: TokenUpdate[]) => Promise<void>;
};

type ActorSystemSource = Record<string, JsonValue>;

type ActorDataModelClass = {
    cleanData: (source?: ActorSystemSource, options?: DataModelV14.CleaningOptions, state?: DataModelV14.UpdateState) => ActorSystemSource;
    migrateData: (source: ActorSystemSource) => ActorSystemSource;
    shimData?: (source: ActorSystemSource, options?: ActorSystemSource) => ActorSystemSource;
};

type ActorConfigLike = {
    dataModels: Record<string, ActorDataModelClass | undefined>;
};

type ActorFlags = {
    core?: { [key: string]: JsonValue };
};

type ActorSourceData = {
    _id?: string;
    type: string;
    system?: ActorSystemSource;
    flags?: ActorFlags;
    [key: string]: JsonValue | ActorSystemSource | ActorFlags | undefined;
};

export type ConvertibleCharacterSystem = keyof typeof ACTOR_SYSTEM_LABELS;
export type ConvertibleActorKind = 'character' | 'npc' | 'vehicle';
export type ConvertibleActorType = `${ConvertibleCharacterSystem}-${ConvertibleActorKind}`;

const TARGET_GAME_SYSTEM_IDS: Record<ConvertibleCharacterSystem, string> = {
    dh2: 'dh2',
    dh1: 'dh1',
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

function normalizeSystemSpecificFields(systemData: ActorSystemSource, targetSystem: ConvertibleCharacterSystem): void {
    systemData['gameSystem'] = TARGET_GAME_SYSTEM_IDS[targetSystem] ?? targetSystem;

    const originPath = systemData['originPath'];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: index access is `JsonValue | undefined` under tsconfig.json (ON) but `JsonValue` under tsconfig.test.json (OFF, the ESLint program); the undefined guard is required for tsc to pass.
    if (originPath === null || originPath === undefined || typeof originPath !== 'object' || Array.isArray(originPath)) return;

    const allowedFields = ORIGIN_PATH_FIELDS_BY_SYSTEM[targetSystem];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: Record index access is `ReadonlySet<string> | undefined` under tsconfig.json (ON) but defined under tsconfig.test.json (OFF, the ESLint program); the guard is required for tsc.
    if (allowedFields === undefined) return;
    for (const field of ORIGIN_PATH_FIELDS) {
        if (!allowedFields.has(field)) {
            originPath[field] = '';
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

    const source: ActorSourceData = foundry.utils.deepClone(actor.toObject());
    const targetType = getConvertedActorType(targetSystem, kind);
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's CONFIG is documented-untyped (Record<string, any>)
    const actorConfig = CONFIG.Actor as ActorConfigLike;
    const targetDataModel = actorConfig.dataModels[targetType];
    if (!targetDataModel) {
        throw new Error(`Missing actor data model for target type ${targetType}`);
    }

    const sourceSystem: ActorSystemSource | undefined = source.system;
    const existingSystem: ActorSystemSource = sourceSystem ?? {};
    const cleanedSystemSource = foundry.utils.deepClone(existingSystem);
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

async function createActorFromSource(replacementSource: ActorSourceData, actorName: string | null): Promise<WH40KBaseActor & { id: string }> {
    // Actor.create's input/output types are Foundry framework boundaries: the source
    // is a plain object Foundry validates internally, and the return is a generic
    // Document we narrow to our concrete actor type.
    // eslint-disable-next-line no-restricted-syntax -- boundary: Actor.create input (Foundry validates the plain source object internally)
    const created = (await Actor.create(replacementSource as unknown as Parameters<typeof Actor.create>[0], {
        renderSheet: false,
        // eslint-disable-next-line no-restricted-syntax -- boundary: Actor.create returns a generic Foundry Document, narrowed to WH40KBaseActor
    })) as unknown as WH40KBaseActor | null;
    if (created === null) {
        throw new Error(`Failed to create converted actor for ${actorName}`);
    }
    if (created.id === null) {
        throw new Error(`Converted actor for ${actorName} is missing an id`);
    }
    return created as WH40KBaseActor & { id: string };
}

async function repointLinkedSceneTokens(oldActorId: string, newActorId: string): Promise<void> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: game.scenes.contents are Foundry Scene Documents projected onto the local SceneLike read-surface
    const scenes = (game.scenes.contents as unknown as SceneLike[]).map(async (scene) => {
        const tokenUpdates: TokenUpdate[] = scene.tokens.contents
            .map((token): SceneTokenSource => token.toObject())
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

    // eslint-disable-next-line no-restricted-syntax -- boundary: WH40KBaseActor is a Foundry Actor Document projected onto the local ActorDirectoryLike read-surface
    const replacementSource = buildConvertedCharacterSource(actor as unknown as ActorDirectoryLike, targetSystem);
    const created = await createActorFromSource(replacementSource, actor.name);

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

    // eslint-disable-next-line no-restricted-syntax -- boundary: WH40KBaseActor is a Foundry Actor Document projected onto the local ActorDirectoryLike read-surface
    const replacementSource = buildConvertedActorSource(actor as unknown as ActorDirectoryLike, targetSystem);
    const created = await createActorFromSource(replacementSource, actor.name);

    await repointLinkedSceneTokens(actor.id, created.id);
    await actor.delete();

    return created;
}
