/**
 * @file Stat-adjustment action handlers shared by every actor sheet.
 *
 * Pulls the increment / decrement / adjustStat / pip-toggle / fate-management
 * handlers out of the per-sheet classes so they can be wired identically
 * everywhere (PC, NPC, future sheets). Handlers are exported as `this`-typed
 * free functions; the Foundry V14 ApplicationV2 action map binds `this` to the
 * sheet instance at click-time, so a sheet wires them up like:
 *
 *     import * as StatActions from '../api/stat-adjustment-actions.ts';
 *     static DEFAULT_OPTIONS = {
 *         actions: {
 *             adjustStat: StatActions.adjustStat,
 *             increment: StatActions.increment,
 *             ...
 *         },
 *     };
 *
 * Sheets must satisfy the `StatAdjustmentHost` shape — they need an `actor`,
 * the `_throttle` / `_notify` / `_updateSystemField` helpers from BaseActorSheet
 * (or wherever they currently live), and access to `ConfirmationDialog` /
 * `ChatMessage` / `foundry.utils.getProperty` from the runtime.
 */

import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import ConfirmationDialog from '../dialogs/confirmation-dialog.ts';

/**
 * Structural type the stat-adjustment handlers expect. Any sheet that plays the
 * same role can satisfy this without inheriting from a specific base.
 */
export interface StatAdjustmentHost {
    actor: {
        id: string;
        name: string;
        system: Record<string, unknown> & {
            fate?: { value?: number; max?: number };
            wounds?: { critical?: number; value?: number; max?: number };
            fatigue?: { value?: number; max?: number };
        };
        update(data: Record<string, unknown>): Promise<unknown>;
    };
    _throttle(key: string, wait: number, fn: (...args: unknown[]) => unknown, ctx: unknown, args: unknown[]): Promise<unknown>;
    _notify(type: 'info' | 'warning' | 'error', message: string, options?: Record<string, unknown>): void;
    _updateSystemField(field: string, value: unknown): Promise<void>;
}

type Host = StatAdjustmentHost;

/* -------------------------------------------- */
/*  adjustStat — generic +/- with smart bounds  */
/* -------------------------------------------- */

async function adjustStatImpl(this: Host, _event: Event, target: HTMLElement): Promise<void> {
    const field = target.dataset['field'];
    const action = target.dataset['statAction'];
    if (!field) return;

    if (action === 'clear-fatigue') {
        await this._updateSystemField('system.fatigue.value', 0);
        return;
    }

    const currentValue = (foundry.utils.getProperty(this.actor, field) as number) || 0;

    const min = target.dataset['min'] !== undefined ? parseInt(target.dataset['min']) : null;
    let max: number | null = target.dataset['max'] !== undefined ? parseInt(target.dataset['max']) : null;

    if (max === null && field.endsWith('.value')) {
        const basePath = field.substring(0, field.lastIndexOf('.value'));
        const maxPath = `${basePath}.max`;
        const derivedMax = foundry.utils.getProperty(this.actor, maxPath) as number | undefined;
        if (derivedMax !== undefined && derivedMax !== null) max = derivedMax;
    }

    let newValue = currentValue;
    if (action === 'increment') {
        newValue = currentValue + 1;
        if (max !== null && newValue > max) newValue = max;
    } else if (action === 'decrement') {
        newValue = currentValue - 1;
        if (min !== null && newValue < min) newValue = min;
    } else {
        // adjustStat called directly — read data-delta when present
        const delta = target.dataset['delta'] !== undefined ? parseInt(target.dataset['delta']) : 0;
        newValue = currentValue + delta;
        if (max !== null && newValue > max) newValue = max;
        if (min !== null && newValue < min) newValue = min;
    }

    if (newValue !== currentValue) {
        await this._updateSystemField(field, newValue);
    }
}

export async function adjustStat(this: Host, event: Event, target: HTMLElement): Promise<void> {
    const field = target.dataset['field'];
    if (!field) return;
    const throttleKey = `adjustStat-${field}-${this.actor.id}`;
    await this._throttle(throttleKey, 200, adjustStatImpl as unknown as (...args: unknown[]) => unknown, this, [event, target]);
}

export async function increment(this: Host, event: Event, target: HTMLElement): Promise<void> {
    event.stopPropagation();
    target.dataset['statAction'] = 'increment';
    return adjustStat.call(this, event, target);
}

export async function decrement(this: Host, event: Event, target: HTMLElement): Promise<void> {
    event.stopPropagation();
    target.dataset['statAction'] = 'decrement';
    return adjustStat.call(this, event, target);
}

/* -------------------------------------------- */
/*  Pip toggles — clicking a pip sets its value */
/* -------------------------------------------- */

async function setCriticalPipImpl(this: Host, _event: Event, target: HTMLElement): Promise<void> {
    const level = parseInt(target.dataset['critLevel'] || '0');
    const currentCrit = this.actor.system.wounds?.critical || 0;
    const newValue = level === currentCrit ? level - 1 : level;
    const clampedValue = Math.min(Math.max(newValue, 0), 10);
    await this._updateSystemField('system.wounds.critical', clampedValue);
}

export async function setCriticalPip(this: Host, event: Event, target: HTMLElement): Promise<void> {
    event.stopPropagation();
    const throttleKey = `setCriticalPip-${this.actor.id}`;
    await this._throttle(throttleKey, 200, setCriticalPipImpl as unknown as (...args: unknown[]) => unknown, this, [event, target]);
}

async function setFateStarImpl(this: Host, _event: Event, target: HTMLElement): Promise<void> {
    const index = parseInt(target.dataset['fateIndex'] || '0');
    const currentFate = this.actor.system.fate?.value || 0;
    const newValue = index === currentFate ? index - 1 : index;
    const maxFate = this.actor.system.fate?.max || 0;
    const clampedValue = Math.min(Math.max(newValue, 0), maxFate);
    await this._updateSystemField('system.fate.value', clampedValue);
}

export async function setFateStar(this: Host, event: Event, target: HTMLElement): Promise<void> {
    event.stopPropagation();
    const throttleKey = `setFateStar-${this.actor.id}`;
    await this._throttle(throttleKey, 200, setFateStarImpl as unknown as (...args: unknown[]) => unknown, this, [event, target]);
}

async function setFatigueBoltImpl(this: Host, _event: Event, target: HTMLElement): Promise<void> {
    const index = parseInt(target.dataset['fatigueIndex'] || '0');
    const currentFatigue = this.actor.system.fatigue?.value || 0;
    const newValue = index === currentFatigue ? index - 1 : index;
    const maxFatigue = this.actor.system.fatigue?.max || 0;
    const clampedValue = Math.min(Math.max(newValue, 0), maxFatigue);
    await this._updateSystemField('system.fatigue.value', clampedValue);
}

export async function setFatigueBolt(this: Host, event: Event, target: HTMLElement): Promise<void> {
    event.stopPropagation();
    const throttleKey = `setFatigueBolt-${this.actor.id}`;
    await this._throttle(throttleKey, 200, setFatigueBoltImpl as unknown as (...args: unknown[]) => unknown, this, [event, target]);
}

/* -------------------------------------------- */
/*  Direct value setters (corruption / insanity) */
/* -------------------------------------------- */

async function setCorruptionImpl(this: Host, _event: Event, target: HTMLElement): Promise<void> {
    const targetValue = parseInt(target.dataset['value'] || '0');
    if (isNaN(targetValue) || targetValue < 0 || targetValue > 100) {
        this._notify('error', 'Invalid corruption value', { duration: 3000 });
        return;
    }
    await this._updateSystemField('system.corruption', targetValue);
}

export async function setCorruption(this: Host, event: Event, target: HTMLElement): Promise<void> {
    event.stopPropagation();
    const throttleKey = `setCorruption-${this.actor.id}`;
    await this._throttle(throttleKey, 200, setCorruptionImpl as unknown as (...args: unknown[]) => unknown, this, [event, target]);
}

async function setInsanityImpl(this: Host, _event: Event, target: HTMLElement): Promise<void> {
    const targetValue = parseInt(target.dataset['value'] || '0');
    if (isNaN(targetValue) || targetValue < 0 || targetValue > 100) {
        this._notify('error', 'Invalid insanity value', { duration: 3000 });
        return;
    }
    await this._updateSystemField('system.insanity', targetValue);
}

export async function setInsanity(this: Host, event: Event, target: HTMLElement): Promise<void> {
    event.stopPropagation();
    const throttleKey = `setInsanity-${this.actor.id}`;
    await this._throttle(throttleKey, 200, setInsanityImpl as unknown as (...args: unknown[]) => unknown, this, [event, target]);
}

/* -------------------------------------------- */
/*  Fate point management                       */
/* -------------------------------------------- */

async function restoreFateImpl(this: Host, _event: Event, _target: HTMLElement): Promise<void> {
    const maxFate = this.actor.system.fate?.max || 0;
    await this._updateSystemField('system.fate.value', maxFate);
    this._notify('info', `Restored all fate points to ${maxFate}`, { duration: 3000 });
}

export async function restoreFate(this: Host, event: Event, target: HTMLElement): Promise<void> {
    event.stopPropagation();
    const throttleKey = `restoreFate-${this.actor.id}`;
    await this._throttle(throttleKey, 500, restoreFateImpl as unknown as (...args: unknown[]) => unknown, this, [event, target]);
}

async function spendFateImpl(this: Host, _event: Event, target: HTMLElement): Promise<void> {
    const action = target.dataset['fateAction'];
    const currentFate = this.actor.system.fate?.value || 0;

    if (currentFate <= 0) {
        this._notify('warning', 'No fate points available to spend!', { duration: 3000 });
        return;
    }

    let message = '';
    switch (action) {
        case 'reroll':
            message = `<strong>${this.actor.name}</strong> spends a Fate Point to <strong>re-roll</strong> a test!`;
            break;
        case 'bonus':
            message = `<strong>${this.actor.name}</strong> spends a Fate Point to gain <strong>+10 bonus</strong> to a test!`;
            break;
        case 'dos':
            message = `<strong>${this.actor.name}</strong> spends a Fate Point to add <strong>+1 Degree of Success</strong>!`;
            break;
        case 'heal':
            message = `<strong>${this.actor.name}</strong> spends a Fate Point to <strong>heal damage</strong>!`;
            break;
        case 'avoid':
            message = `<strong>${this.actor.name}</strong> spends a Fate Point to <strong>avoid death</strong>!`;
            break;
        case 'burn': {
            const confirmBurn = await ConfirmationDialog.confirm({
                title: 'Burn Fate Point?',
                content: 'Are you sure you want to <strong>permanently burn</strong> a Fate Point?',
                confirmLabel: 'Burn',
                cancelLabel: 'Cancel',
            });
            if (!confirmBurn) return;
            message = `<strong>${this.actor.name}</strong> <strong style="color: #b63a2b;">BURNS</strong> a Fate Point!`;
            await this.actor.update({
                'system.fate.max': Math.max(0, (this.actor.system.fate?.max || 0) - 1),
            });
            break;
        }
        default:
            return;
    }

    await this._updateSystemField('system.fate.value', currentFate - 1);

    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor as unknown as WH40KBaseActor }),
        content: `
            <div class="wh40k-fate-spend-message">
                <div style="display: flex; align-items: center; gap: 8px; padding: 12px; background: rgba(196, 135, 29, 0.1); border-left: 3px solid #c4871d; border-radius: 4px;">
                    <i class="fas fa-star" style="font-size: 1.5rem; color: #c4871d;"></i>
                    <div>${message}</div>
                </div>
            </div>
        `,
    });
}

export async function spendFate(this: Host, event: Event, target: HTMLElement): Promise<void> {
    event.stopPropagation();
    const action = target.dataset['fateAction'];
    const throttleKey = `spendFate-${action}-${this.actor.id}`;
    await this._throttle(throttleKey, 500, spendFateImpl as unknown as (...args: unknown[]) => unknown, this, [event, target]);
}
