/**
 * Character sheet: equipment actions (equip, stow, use, consume).
 *
 * Split out of `character-sheet.ts` (#716): `this`-typed handlers the sheet binds in
 * `DEFAULT_OPTIONS.actions`; ApplicationV2 calls each with the sheet as `this`.
 */
import type { WH40KItem } from '../../../documents/item.ts';
import { pluralKey } from '../../../i18n/plural.ts';
import { canEquipWeapon, handsForWeapon } from '../../../rules/hand-budget.ts';
import { errorMessage } from '../../../utils/error-message.ts';
import type CharacterSheet from '../character-sheet.ts';
import * as CombatContext from './combat-context.ts';
import { dialogV2 } from './sheet-support.ts';

/**
 * Consume one use of a consumable / drug from the inventory (the Use button that
 * sits beside the equip toggle). Delegates to the item's own `consume()` on the
 * DataModel — which decrements uses, applies the dose's timed effects, and runs
 * the addiction check (#457) — so a stimm can be used straight from the sheet.
 */
export async function useItem(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
    const item = this._resolveItemFromTarget(target);
    if (!item) return;
    // eslint-disable-next-line no-restricted-syntax -- boundary: consume() lives on the gear/consumable DataModel, not the shared item system union
    const consume = (item.system as { consume?: () => Promise<unknown> }).consume;
    if (typeof consume !== 'function') return;
    await consume.call(item.system);
}

export async function toggleEquip(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
    const item = this._resolveItemFromTarget(target);
    if (!item) return;
    // eslint-disable-next-line no-restricted-syntax -- boundary: item.system.state is Foundry DataModel; equipped not on base type; bracket access needs Record cast
    const currentlyEquipped = ((item.system as Record<string, unknown>)['state'] as Record<string, unknown>)['equipped'] === true;

    // Drawing a weapon (#418): block it when the hands it needs would push the
    // actor past their available-hand budget. Holstering is always allowed.
    if (!currentlyEquipped && (item.type as string) === 'weapon') {
        // eslint-disable-next-line no-restricted-syntax -- boundary: weapon `isTwoHanded` getter and `state.equipped` are not on the shared item system union; narrowed inline
        const weaponSystem = item.system as { isTwoHanded?: boolean; state?: { equipped?: boolean } };
        const cost = handsForWeapon(weaponSystem.isTwoHanded === true);
        const otherEquippedCosts = this.actor.items
            .filter((i) => (i.type as string) === 'weapon' && i !== item)
            // eslint-disable-next-line no-restricted-syntax -- boundary: per-weapon `isTwoHanded`/`state` fields are not on the shared item system union; narrowed inline
            .filter((i) => (i.system as { state?: { equipped?: boolean } }).state?.equipped === true)
            // eslint-disable-next-line no-restricted-syntax -- boundary: per-weapon `isTwoHanded` getter is not on the shared item system union; narrowed inline
            .map((i) => handsForWeapon((i.system as { isTwoHanded?: boolean }).isTwoHanded === true));
        const available = CombatContext.availableHands.call(this);
        if (!canEquipWeapon(available, otherEquippedCosts, cost)) {
            const remaining = Math.max(0, available - otherEquippedCosts.reduce((sum, c) => sum + c, 0));
            this._notify(
                'warning',
                game.i18n.format(pluralKey('WH40K.Combat.HandBudgetExceeded', cost, game.i18n.lang), {
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- item.name may be null per fvtt-types; ?? guard is intentional
                    weapon: item.name ?? '',
                    cost: String(cost),
                    remaining: String(remaining),
                    available: String(available),
                }),
                { duration: 5000 },
            );
            return;
        }
    }

    await item.update({ 'system.state.equipped': !currentlyEquipped });
}

/**
 * Handle stowing an item.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
export async function stowItem(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
    await this._setStowState(target, {
        'system.state.equipped': false,
        'system.state.inBackpack': true,
        'system.state.inShipStorage': false,
    });
}

/**
 * Handle unstowing an item.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
export async function unstowItem(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
    await this._setStowState(target, { 'system.state.inBackpack': false });
}

/**
 * Handle stowing an item in ship storage.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
export async function stowToShip(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
    await this._setStowState(target, {
        'system.state.equipped': false,
        'system.state.inBackpack': false,
        'system.state.inShipStorage': true,
    });
}

/**
 * Handle unstowing an item from ship storage.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
export async function unstowFromShip(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
    await this._setStowState(target, { 'system.state.inShipStorage': false });
}

/**
 * Swap all checked items between backpack and ship storage.
 * Items checked in the backpack column move to ship; items checked in ship move to backpack.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
export async function swapCheckedItems(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
    event.preventDefault();
    const panel = target.closest('.wh40k-panel-backpack-split') ?? this.element.querySelector('.wh40k-panel-backpack-split');
    if (!panel) return;

    // Gather checked items from backpack (left) column
    const backpackChecks = panel.querySelectorAll('.wh40k-backpack-inventory .wh40k-transfer-check:checked');
    // Gather checked items from ship (right) column
    const shipChecks = panel.querySelectorAll('.wh40k-ship-storage .wh40k-transfer-check:checked');

    if (!backpackChecks.length && !shipChecks.length) {
        ui.notifications.warn(game.i18n.localize('WH40K.Notify.Transfer.NoneSelected'));
        return;
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: transferOperations holds promises to Foundry update calls; no concrete result type
    const transferOperations: Promise<unknown>[] = [];

    // Backpack → Ship
    backpackChecks.forEach((cb: Element) => {
        const itemId = (cb as HTMLElement).dataset['itemId'];
        if (itemId === undefined || itemId === '') return;

        const item = this.actor.items.get(itemId);
        if (!item) return;

        // eslint-disable-next-line no-restricted-syntax -- boundary: item.system is Foundry DataModel; stowInShipStorage is a duck-typed method not on the schema
        const equippable = item.system as Record<string, unknown>;
        // eslint-disable-next-line no-restricted-syntax -- boundary: stowInShipStorage checked via typeof; cast to invocable signature for push
        if (typeof (equippable as { stowInShipStorage?: unknown }).stowInShipStorage === 'function') {
            // eslint-disable-next-line no-restricted-syntax -- boundary: method retrieved as unknown; cast to concrete call signature
            transferOperations.push((equippable as { stowInShipStorage: () => Promise<unknown> }).stowInShipStorage());
            return;
        }

        transferOperations.push(
            item.update({
                'system.state.equipped': false,
                'system.state.inBackpack': false,
                'system.state.inShipStorage': true,
            }),
        );
    });

    // Ship → Backpack/Carried
    shipChecks.forEach((cb: Element) => {
        const itemId = (cb as HTMLElement).dataset['itemId'];
        if (itemId === undefined || itemId === '') return;

        const item = this.actor.items.get(itemId);
        if (!item) return;

        // eslint-disable-next-line no-restricted-syntax -- boundary: item.system is Foundry DataModel; removeFromShipStorage is a duck-typed method not on the schema
        const equippable = item.system as Record<string, unknown>;
        // eslint-disable-next-line no-restricted-syntax -- boundary: removeFromShipStorage checked via typeof; cast to invocable signature for push
        if (typeof (equippable as { removeFromShipStorage?: unknown }).removeFromShipStorage === 'function') {
            // eslint-disable-next-line no-restricted-syntax -- boundary: method retrieved as unknown; cast to concrete call signature
            transferOperations.push((equippable as { removeFromShipStorage: () => Promise<unknown> }).removeFromShipStorage());
            return;
        }

        transferOperations.push(
            item.update({
                'system.state.inShipStorage': false,
            }),
        );
    });

    if (!transferOperations.length) return;

    await Promise.all(transferOperations);
}

/**
 * Give all checked items (from both backpack and ship columns) to another actor.
 * Opens an actor picker dialog and transfers each selected item.
 */
export async function giveCheckedItems(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
    event.preventDefault();
    const panel = target.closest('.wh40k-panel-backpack-split') ?? this.element.querySelector('.wh40k-panel-backpack-split');
    if (!panel) return;

    const allChecks = panel.querySelectorAll('.wh40k-transfer-check:checked');
    if (!allChecks.length) {
        ui.notifications.warn(game.i18n.localize('WH40K.Notify.Transfer.NoneSelectedToGive'));
        return;
    }

    const itemIds: string[] = [];
    allChecks.forEach((cb: Element) => {
        const id = (cb as HTMLElement).dataset['itemId'];
        if (id !== undefined && id !== '') itemIds.push(id);
    });
    if (!itemIds.length) return;

    const sourceActor = this.actor;
    const targets = game.actors.filter((a) => a.id !== sourceActor.id && a.isOwner);

    if (!targets.length) {
        ui.notifications.warn(game.i18n.localize('WH40K.Notify.Transfer.NoRecipients'));
        return;
    }

    const options = targets.map((a) => `<option value="${a.id}">${a.name}</option>`).join('');
    const content = `<form><div class="form-group"><label>${game.i18n.format(pluralKey('WH40K.Notify.Transfer.GiveTo', itemIds.length, game.i18n.lang), {
        count: String(itemIds.length),
    })}</label><select name="targetActorId">${options}</select></div></form>`;

    const targetId = await dialogV2.prompt({
        window: { title: game.i18n.localize('WH40K.Notify.Transfer.GiveTitle') },
        content,
        ok: {
            label: game.i18n.localize('WH40K.Notify.Transfer.GiveButton'),
            icon: 'fas fa-hand-holding',
            callback: (_event: Event, button: HTMLElement) => {
                return ((button as HTMLElement & { form: HTMLFormElement }).form.elements.namedItem('targetActorId') as HTMLInputElement | null)?.value;
            },
        },
    });

    if (targetId === null || targetId === undefined || typeof targetId !== 'string') return;
    const targetActor = game.actors.get(targetId);
    if (!targetActor) return;

    const itemsData = itemIds
        .map((id: string) => sourceActor.items.get(id))
        .filter(Boolean)
        .map((item) => {
            /* eslint-disable no-restricted-syntax -- boundary: item.toObject() returns Foundry document data with no typed shape; cast to access system fields for transfer */
            const data = (item as WH40KItem).toObject() as Record<string, unknown> & {
                system?: Record<string, unknown> & { state?: { equipped?: unknown; inBackpack?: unknown; inShipStorage?: unknown } };
                _id?: string;
            };
            /* eslint-enable no-restricted-syntax */
            if (data.system) {
                data.system.state = { ...data.system.state, equipped: false, inBackpack: true, inShipStorage: false };
            }
            delete data._id;
            return data;
        });

    if (!itemsData.length) return;

    // eslint-disable-next-line no-restricted-syntax -- boundary: createEmbeddedDocuments data param type doesn't accept our Record shape; double-cast to satisfy the overload
    await targetActor.createEmbeddedDocuments('Item', itemsData as unknown as Parameters<typeof targetActor.createEmbeddedDocuments<'Item'>>[1]);
    await sourceActor.deleteEmbeddedDocuments('Item', itemIds);
    ui.notifications.info(
        game.i18n.format(pluralKey('WH40K.Notify.Transfer.Gave', itemsData.length, game.i18n.lang), {
            count: String(itemsData.length),
            target: targetActor.name,
        }),
    );
}

/**
 * Handle toggling force field activation.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
export async function toggleActivate(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
    const item = this._resolveItemFromTarget(target);
    if (!item) return;
    // eslint-disable-next-line no-restricted-syntax -- boundary: item.system.state is Foundry DataModel; activated not on base type; bracket access needs Record cast
    await item.update({ 'system.state.activated': ((item.system as Record<string, unknown>)['state'] as Record<string, unknown>)['activated'] !== true });
}

/**
 * Handle bulk equipment operations.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
export async function bulkEquip(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
    try {
        const action: string | undefined = target.dataset['bulkAction'];
        const items = this.actor.items;
        let count = 0;

        if (action === undefined) {
            // no-op
        } else if (action === 'equip-armour') {
            const armourItems = items.filter((i: WH40KItem & { isArmour?: boolean }) => i.type === 'armour' || i.isArmour);
            const toEquip = armourItems.filter((item) => item.system.state.equipped !== true);
            await Promise.all(toEquip.map(async (item) => item.update({ 'system.state.equipped': true })));
            count = toEquip.length;
            this._notify(
                'info',
                game.i18n.format(count !== 1 ? 'WH40K.Notify.CharacterSheet.EquippedArmourMany' : 'WH40K.Notify.CharacterSheet.EquippedArmourOne', {
                    count: String(count),
                }),
                {
                    duration: 3000,
                },
            );
        } else if (action === 'unequip-all') {
            const equippedItems = items.filter((i: WH40KItem) => (i.system as { state?: { equipped?: boolean } }).state?.equipped === true);
            await Promise.all(equippedItems.map(async (item) => item.update({ 'system.state.equipped': false })));
            count = equippedItems.length;
            this._notify(
                'info',
                game.i18n.format(count !== 1 ? 'WH40K.Notify.CharacterSheet.UnequippedMany' : 'WH40K.Notify.CharacterSheet.UnequippedOne', {
                    count: String(count),
                }),
                {
                    duration: 3000,
                },
            );
        } else if (action === 'stow-gear') {
            const gearItems = items.filter(
                (i: WH40KItem & { isGear?: boolean; system: WH40KItem['system'] & { state?: { inBackpack?: boolean } } }) =>
                    (i.type === 'gear' || i.isGear) && i.system.state.inBackpack !== true,
            );
            await Promise.all(
                gearItems.map(async (item) =>
                    item.update({
                        'system.state.inBackpack': true,
                        'system.state.equipped': false,
                    }),
                ),
            );
            count = gearItems.length;
            this._notify(
                'info',
                game.i18n.format(count !== 1 ? 'WH40K.Notify.CharacterSheet.StowedGearMany' : 'WH40K.Notify.CharacterSheet.StowedGearOne', {
                    count: String(count),
                }),
                {
                    duration: 3000,
                },
            );
        } else {
            this._notify('warning', game.i18n.format('WH40K.Notify.CharacterSheet.UnknownBulkAction', { action }), {
                duration: 3000,
            });
        }
    } catch (error) {
        this._notify('error', game.i18n.format('WH40K.Notify.CharacterSheet.BulkFailed', { error: errorMessage(error) }), {
            duration: 5000,
        });
        console.error('Bulk equipment error:', error);
    }
}
