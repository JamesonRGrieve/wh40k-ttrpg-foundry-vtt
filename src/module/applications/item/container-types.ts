/**
 * The item types a container item accepts as nested items (#697).
 *
 * A container's DataModel declares them as a static `containerTypes` getter
 * (StorageLocationData). ContainerItemSheet once read `system.containerTypes` off the
 * DataModel instance, where a static getter is not visible, so every container sheet
 * refused every drop.
 */

/** The item types the DataModel class of `system` accepts; empty when it declares none. */
export function containerTypesOf(system: object): readonly string[] {
    const model = system.constructor;
    if (!('containerTypes' in model) || !Array.isArray(model.containerTypes)) return [];
    return model.containerTypes.filter((type): type is string => typeof type === 'string');
}

/** True when a container whose data is `system` accepts a nested item of `itemType`. */
export function containerAccepts(system: object, itemType: string): boolean {
    return containerTypesOf(system).includes(itemType);
}
