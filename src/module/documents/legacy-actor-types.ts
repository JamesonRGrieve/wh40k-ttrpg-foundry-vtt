/**
 * Legacy actor types (#701): still registered so an existing world actor of the
 * type opens and reads, never offered for creation, and convertible in place to
 * the type that replaced it.
 *
 * `rt-starship` was the second ship type. `rt-voidcraft` is the one ship type
 * now, with the same data model, document class and sheet; compendium packs,
 * fixtures and specs use it. A GM converts each legacy ship from its sheet.
 * Unregistering a legacy type waits until worlds have converted their actors.
 */

/** Each legacy type, and the type that replaced it. */
export const LEGACY_ACTOR_TYPES: Readonly<Record<string, string>> = Object.freeze({
    'rt-starship': 'rt-voidcraft',
});

/** The type a legacy actor converts to, or null when `type` is current. */
export function legacyConversionTarget(type: string): string | null {
    return Object.hasOwn(LEGACY_ACTOR_TYPES, type) ? LEGACY_ACTOR_TYPES[type] ?? null : null;
}

/** The `types` restriction a caller passed to `createDialog`, when it passed a list of type ids. */
export function requestedTypes(options: object | undefined): string[] | undefined {
    if (options === undefined || !('types' in options)) return undefined;
    const { types } = options;
    return Array.isArray(types) && types.every((type): type is string => typeof type === 'string') ? [...types] : undefined;
}

/**
 * The actor types a creation dialog offers: the caller's restriction when given,
 * else every registered type, without the legacy ones.
 */
export function creatableActorTypes(registered: readonly string[], restrict?: readonly string[]): string[] {
    return (restrict ?? registered).filter((type) => legacyConversionTarget(type) === null);
}

/**
 * The update that converts a legacy actor in place: its new type, and its whole
 * system source carried over. Foundry accepts a type change only with the system
 * field wrapped in a ForcedReplacement, which `replace` builds. Null for an
 * actor that is not of a legacy type.
 */
export function legacyConversionUpdate<R>(type: string, systemSource: object, replace: (system: object) => R): { type: string; system: R } | null {
    const target = legacyConversionTarget(type);
    return target === null ? null : { type: target, system: replace(systemSource) };
}
