/**
 * @file ActiveEffect CRUD action handlers shared by every effect-owning sheet.
 *
 * Pulls the create / edit / delete / toggle handlers out of the per-sheet
 * classes (CharacterSheet, BaseActorSheet, BaseItemSheet) so the resolve-then-
 * act mechanic is written once. Mirrors the `stat-adjustment-actions.ts`
 * pattern: handlers are exported as `this`-typed free functions; the Foundry
 * V14 ApplicationV2 action map binds `this` to the sheet instance at click
 * time, so a sheet wires them up like:
 *
 *     import * as EffectActions from '../api/effect-actions.ts';
 *     static DEFAULT_OPTIONS = {
 *         actions: {
 *             effectEdit: EffectActions.effectEdit,
 *             effectDelete: EffectActions.effectDelete,
 *             effectToggle: EffectActions.effectToggle,
 *         },
 *     };
 *
 * The sheet must expose an `effectsOwner` accessor (the Actor or Item that owns
 * the ActiveEffect collection). Sheets that layer their own UX (toast
 * notifications, delete confirmation — e.g. CharacterSheet) call the lower
 * level `resolveEffect` / `createEffect` primitives directly instead.
 */

/* eslint-disable no-restricted-syntax -- boundary: structural adapters over Foundry's untyped ActiveEffect / Document API */

/** Minimal ActiveEffect surface the handlers touch. */
export interface ActiveEffectLike {
    name?: string;
    disabled: boolean;
    sheet?: { render: (force?: boolean) => unknown } | null;
    update: (data: Record<string, unknown>) => Promise<unknown>;
    delete: () => Promise<unknown>;
}

/** Minimal owner surface (an Actor or Item) the handlers need. */
export interface EffectsOwner {
    uuid: string;
    effects: { get: (id: string) => ActiveEffectLike | undefined };
    createEmbeddedDocuments: (type: 'ActiveEffect', data: ReadonlyArray<Record<string, unknown>>, operation?: Record<string, unknown>) => Promise<unknown>;
}

/** The sheet shape these `this`-typed actions expect. */
export interface EffectActionHost {
    readonly effectsOwner: EffectsOwner;
}

/* eslint-enable no-restricted-syntax */

/**
 * Resolve the `data-effect-id` for a clicked control. Uses `closest` so a
 * click on a child icon still resolves, and falls back to the element's own
 * dataset (covers controls that carry the attribute directly).
 */
export function effectIdFromTarget(target: HTMLElement): string | undefined {
    const id = target.closest<HTMLElement>('[data-effect-id]')?.dataset['effectId'] ?? target.dataset['effectId'];
    return id !== undefined && id !== '' ? id : undefined;
}

/** Resolve the ActiveEffect a clicked control refers to, or `undefined`. */
export function resolveEffect(owner: EffectsOwner, target: HTMLElement): ActiveEffectLike | undefined {
    const effectId = effectIdFromTarget(target);
    return effectId !== undefined ? owner.effects.get(effectId) : undefined;
}

/** Create an ActiveEffect on the owner, merging caller overrides over defaults. */
export async function createEffect(
    owner: EffectsOwner,
    // eslint-disable-next-line no-restricted-syntax -- boundary: ActiveEffect creation payload is a free-form Foundry data bag
    overrides: Record<string, unknown> = {},
    // eslint-disable-next-line no-restricted-syntax -- boundary: createEmbeddedDocuments operation options are an opaque Foundry bag
    operation?: Record<string, unknown>,
    // eslint-disable-next-line no-restricted-syntax -- boundary: createEmbeddedDocuments resolves to an opaque Foundry document result
): Promise<unknown> {
    const data = { name: 'New Effect', img: 'icons/svg/aura.svg', ...overrides };
    return owner.createEmbeddedDocuments('ActiveEffect', [data], operation);
}

/** Open the ActiveEffect's own sheet for editing. */
export function effectEdit(this: EffectActionHost, _event: Event, target: HTMLElement): void {
    resolveEffect(this.effectsOwner, target)?.sheet?.render(true);
}

/** Delete the referenced ActiveEffect. */
export async function effectDelete(this: EffectActionHost, _event: Event, target: HTMLElement): Promise<void> {
    await resolveEffect(this.effectsOwner, target)?.delete();
}

/** Toggle the referenced ActiveEffect's enabled/disabled state. */
export async function effectToggle(this: EffectActionHost, _event: Event, target: HTMLElement): Promise<void> {
    const effect = resolveEffect(this.effectsOwner, target);
    if (effect === undefined) return;
    await effect.update({ disabled: !effect.disabled });
}
