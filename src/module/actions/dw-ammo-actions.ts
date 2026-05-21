/**
 * Action handler module for the Deathwatch Special-Issue Ammunition
 * panel (#172).
 *
 * The exported function is registered into the CharacterSheet's
 * `DEFAULT_OPTIONS.actions` map by the orchestrator (see
 * `.integration-staging/172.json`). The handler is bound such that
 * `this` provides an `actor` reference — the orchestrator either wires
 * the method as `static` on the sheet or proxies via a sheet thunk
 * that supplies `{ actor: this.document }`.
 *
 * The handler reads the chosen ammunition id off the click target
 * (`data-ammo-id`), validates it against the closed
 * `DW_SELECTED_AMMO_CHOICES` set, and persists the result to
 * `system.selectedAmmo`. The pure engine in `rules/dw-special-ammo.ts`
 * is consulted at attack-time, not here — selection is plain state.
 *
 * Ammo selection is silent state — no chat card is emitted (see brief:
 * "No chat partial"). The Foundry strict StringField validation on the
 * mixin's `choices:` constraint guarantees an invalid value never
 * reaches persistence.
 */

import { DW_SELECTED_AMMO_CHOICES, type DwSelectedAmmoId } from '../data/actor/mixins/dw-ammo-template.ts';

/**
 * Structural `this` shape for the ammo-select action handler.
 *
 * The orchestrator splices this method onto `CharacterSheet`, whose
 * `actor` field is a `WH40KCharacter`. Using a structural `{ actor }`
 * `this` here keeps the module decoupled from CharacterSheet's full
 * surface — the handler only needs the actor reference to read
 * `system.selectedAmmo` and write the new selection.
 */
export interface DwAmmoActionThis {
    actor: {
        system: {
            selectedAmmo: DwSelectedAmmoId;
        };
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Document.update() signature accepts arbitrary diff records and returns the resolved Document or undefined
        update: (data: Record<string, unknown>) => Promise<unknown>;
    };
}

/**
 * Type guard: narrow an arbitrary string to a valid
 * {@link DwSelectedAmmoId}. Used to gate the persistence write so a
 * tampered `data-ammo-id` attribute is rejected before reaching the
 * DataModel's `choices:` validation.
 */
function isDwSelectedAmmoId(value: string): value is DwSelectedAmmoId {
    return (DW_SELECTED_AMMO_CHOICES as ReadonlyArray<string>).includes(value);
}

/**
 * `data-action="dwSelectAmmo"` handler. Reads `data-ammo-id` off the
 * click target (radio input or its wrapping `<label>`) and persists
 * `system.selectedAmmo` when the value is valid and different from the
 * current selection.
 *
 * The handler is idempotent: re-selecting the currently-loaded ammo is
 * a no-op (no DB write, no re-render).
 */
export async function dwSelectAmmo(this: DwAmmoActionThis, _event: Event, target: HTMLElement): Promise<void> {
    const raw = target.dataset['ammoId'] ?? target.closest<HTMLElement>('[data-ammo-id]')?.dataset['ammoId'] ?? '';
    if (raw === '' || !isDwSelectedAmmoId(raw)) return;

    const next: DwSelectedAmmoId = raw;
    const current = this.actor.system.selectedAmmo;
    if (next === current) return;

    await this.actor.update({ 'system.selectedAmmo': next });
}
