/**
 * @file Action handlers for the Only War Squad Logistics panel (#154).
 *
 * Exports static functions whose names match the `data-action` strings
 * in `src/templates/actor/panel/ow-logistics-panel.hbs`. The orchestrator
 * registers them in `CharacterSheet.DEFAULT_OPTIONS.actions` so the
 * ApplicationV2 action dispatcher binds `this` to the sheet — the
 * functions therefore read `this.actor` to access the live actor.
 *
 * Three actions:
 *   - `owLogisticsTest`        Open the per-test dialog.
 *   - `owToggleMunitorum`      Flip `system.munitorum` on the actor.
 *   - `owAdjustSituational`    Add `data-delta` to `system.situational`.
 *
 * OW-gated at the call site (the panel only renders for OW actors); the
 * runtime guards here are defensive against accidental invocation.
 */

import LogisticsTestDialog from '../applications/prompts/logistics-test-dialog.ts';
import type { WH40KBaseActor } from '../documents/base-actor.ts';
import { isActorOfSystem } from './action-host.ts';

/** Sheet-like host shape; the ApplicationV2 dispatcher binds the sheet as `this`. */
interface LogisticsActionHost {
    readonly actor: WH40KBaseActor;
    _resolveGameSystemId?: () => string;
}

/**
 * Open the Logistics Test dialog for the active actor (`data-action="owLogisticsTest"`).
 */
export function owLogisticsTest(this: LogisticsActionHost, event: Event, _target: HTMLElement): void {
    event.preventDefault();
    if (!isActorOfSystem(this, 'ow')) return;
    LogisticsTestDialog.show(this.actor);
}

/**
 * Toggle the Munitorum Influence Talent flag (`data-action="owToggleMunitorum"`).
 */
export async function owToggleMunitorum(this: LogisticsActionHost, event: Event, _target: HTMLElement): Promise<void> {
    event.preventDefault();
    if (!isActorOfSystem(this, 'ow')) return;
    // eslint-disable-next-line no-restricted-syntax -- boundary: per-system Logistics scalars live on per-system actor system data, not the abstract base surface
    const sys = this.actor.system as { munitorum?: boolean };
    const current = sys.munitorum === true;
    await this.actor.update({ 'system.munitorum': !current });
}

/**
 * Adjust the persisted situational modifier by `data-delta`
 * (`data-action="owAdjustSituational"`). The increment is read off the
 * triggering element so the panel can advertise ±5 steps without the
 * action module having to know the step size.
 */
export async function owAdjustSituational(this: LogisticsActionHost, event: Event, target: HTMLElement): Promise<void> {
    event.preventDefault();
    if (!isActorOfSystem(this, 'ow')) return;
    const delta = Number(target.dataset['delta'] ?? '0');
    if (!Number.isFinite(delta)) return;
    // eslint-disable-next-line no-restricted-syntax -- boundary: per-system Logistics scalars live on per-system actor system data, not the abstract base surface
    const sys = this.actor.system as { situational?: number };
    const current = typeof sys.situational === 'number' ? sys.situational : 0;
    await this.actor.update({ 'system.situational': Math.trunc(current + delta) });
}
