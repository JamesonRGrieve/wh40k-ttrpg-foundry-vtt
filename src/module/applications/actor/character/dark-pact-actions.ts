/**
 * Character sheet: Dark Pact actions (#84).
 *
 * Split out of `character-sheet.ts` (#716): `this`-typed handlers the sheet binds in
 * `DEFAULT_OPTIONS.actions`; ApplicationV2 calls each with the sheet as `this`.
 */
import { chooseCompendiumDarkPact, removeDarkPact as removePactFromActor, toggleDarkPactEntry } from '../../../documents/dark-pacts.ts';
import { adjustPactDisposition as shiftDisposition, PACT_ENTRY_KINDS, type PactEntryKind } from '../../../rules/dark-pact.ts';
import AcquisitionDialog from '../../dialogs/acquisition-dialog.ts';
import ColonyGrowthDialog from '../../prompts/colony-growth-dialog.ts';
import type CharacterSheet from '../character-sheet.ts';

/**
 * Shift the Daemon's Disposition (core, 0–100) by the button's
 * `data-delta`. The GM applies Interaction-test outcomes here.
 */
export async function adjustPactDisposition(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
    const index = this._pactIndex(target);
    const delta = parseInt(target.dataset['delta'] ?? '0', 10);
    if (index === null || Number.isNaN(delta) || delta === 0) return;
    await this._updatePact(index, (record) => ({ ...record, disposition: shiftDisposition(record.disposition, delta) }));
}

/**
 * Mark a pact discovered (or hidden again). The rules leave the
 * Subtlety change "tailored to the individual bargain", so discovery applies
 * no number of its own; the GM adjusts Subtlety on its panel.
 */
export async function togglePactDiscovered(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
    const index = this._pactIndex(target);
    if (index === null) return;
    await this._updatePact(index, (record) => ({ ...record, discovered: !record.discovered }));
}

/** Mark the pact's most recent payment made (or lapsed). */
export async function togglePactPayment(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
    const index = this._pactIndex(target);
    if (index === null) return;
    await this._updatePact(index, (record) => ({ ...record, paymentCurrent: !record.paymentCurrent }));
}

/** Add a Boon or Bane to a pact's bargain, or take it away (`data-kind`, `data-entry`). */
export async function togglePactEntry(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
    const index = this._pactIndex(target);
    const kind = PACT_ENTRY_KINDS.find((candidate) => candidate === target.dataset['kind']);
    const entry = target.dataset['entry'] ?? '';
    if (index === null || kind === undefined || entry === '') return;
    await toggleDarkPactEntry(this.actor, index, kind satisfies PactEntryKind, entry);
}

/** Strike a pact chosen from the compendiums (the panel's Add Pact). */
export async function addDarkPact(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
    const pact = await chooseCompendiumDarkPact();
    if (pact === null) {
        this._notify('warning', game.i18n.localize('WH40K.DarkPact.NoneAvailable'));
        return;
    }
    await this._strikeDarkPact(pact);
}

/** End a pact and remove everything its Boons and Banes gave the character. */
export async function removeDarkPact(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
    const index = this._pactIndex(target);
    if (index === null) return;
    await removePactFromActor(this.actor, index);
}

/**
 * Toggle the `complete` flag on an Endeavour's Objective. Updates the
 * parent Endeavour item's `apEarned` total in lockstep — when an
 * objective is checked, its AP contribution is added; when unchecked, it
 * is reversed. Once `apEarned >= apRequired`, the actor sheet renders a
 * "grant reward" button which calls `completeEndeavour`.
 *
 * The action's button carries:
 *   - data-endeavour-id  → the parent Endeavour item id on the actor
 *   - data-objective-index → numeric index into `system.objectives`
 */
export async function completeObjective(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
    const endeavourId = target.dataset['endeavourId'];
    const idxStr = target.dataset['objectiveIndex'];
    if (endeavourId === undefined || idxStr === undefined) return;
    const idx = Number.parseInt(idxStr, 10);
    if (!Number.isFinite(idx)) return;
    const item = this.actor.items.get(endeavourId);
    if (item?.type !== 'endeavour') return;
    // eslint-disable-next-line no-restricted-syntax -- boundary: ItemDataModel index signature widens; narrow to endeavour-specific surface via unknown
    const sys = item.system as unknown as {
        apEarned: number;
        apRequired: number;
        objectives: Array<{ name: string; description: string; complete: boolean; ap: number }>;
    };
    if (idx < 0 || idx >= sys.objectives.length) return;
    const objective = sys.objectives[idx];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- tsconfig.test parser lacks noUncheckedIndexedAccess; strict tsconfig sees indexed access as possibly undefined
    if (objective === undefined) return;
    const nextObjectives = sys.objectives.map((o, i) => (i === idx ? { ...o, complete: !o.complete } : o));
    const delta = objective.complete ? -objective.ap : objective.ap;
    const nextApEarned = Math.max(0, sys.apEarned + delta);
    await item.update({
        'system.objectives': nextObjectives,
        'system.apEarned': nextApEarned,
    });
}

/**
 * Grant the reward for a completed Endeavour: add the Endeavour's
 * `reward.profitFactor` to `actor.system.rogueTrader.profitFactor.current`
 * and post a chat card summarising the reward. The Endeavour item is
 * left in place (with `apEarned >= apRequired`) so the GM still sees
 * the historical record on the sheet.
 *
 * Guarded against double-spending: refuses to act unless
 * `system.isComplete` evaluates to true on the embedded Endeavour.
 */
export async function completeEndeavour(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
    const endeavourId = target.dataset['endeavourId'];
    if (endeavourId === undefined) return;
    const item = this.actor.items.get(endeavourId);
    if (item?.type !== 'endeavour') return;
    // eslint-disable-next-line no-restricted-syntax -- boundary: ItemDataModel index signature widens; narrow to endeavour-specific surface via unknown
    const sys = item.system as unknown as {
        apEarned: number;
        apRequired: number;
        isComplete: boolean;
        reward: { profitFactor: number; narrative: string };
    };
    if (!sys.isComplete) return;
    const award = Math.max(0, sys.reward.profitFactor);
    // eslint-disable-next-line no-restricted-syntax -- boundary: rogueTrader.profitFactor.current is a per-system actor schema field not exposed on the abstract WH40KBaseActor system surface
    const currentPF = (this.actor.system as { rogueTrader?: { profitFactor?: { current?: number } } }).rogueTrader?.profitFactor?.current ?? 0;
    if (award > 0) {
        await this.actor.update({ 'system.rogueTrader.profitFactor.current': currentPF + award });
    }
    const headerLabel = game.i18n.localize('WH40K.Endeavours.RewardGrantedHeader');
    const apLabel = game.i18n.localize('WH40K.Endeavours.APShort');
    const pfLabel = game.i18n.localize('WH40K.Endeavours.RewardProfitFactor');
    const narrative = sys.reward.narrative === '' ? '' : `<p>${foundry.utils.escapeHTML(sys.reward.narrative)}</p>`;
    const content = `
        <div class="endeavour-chat-card">
            <h3>${headerLabel}: ${foundry.utils.escapeHTML(item.name)}</h3>
            <p><strong>${apLabel}:</strong> ${sys.apEarned}/${sys.apRequired}</p>
            ${award > 0 ? `<p><strong>${pfLabel}:</strong> +${award}</p>` : ''}
            ${narrative}
        </div>
    `;
    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content,
        flags: {
            'wh40k-rpg': {
                type: 'endeavour-reward',
                endeavourId,
            },
        },
    });
}

/**
 * Open the Acquisition Dialog for rolling acquisition tests.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
export async function openAcquisitionDialog(this: CharacterSheet, event: Event, _target: HTMLElement): Promise<void> {
    event.preventDefault();
    await AcquisitionDialog.show(this.actor);
}

/**
 * Open the Colony Growth Dialog for resolving a 90-day Colony growth
 * cycle (#195). RT-gated — the Dynasty tab where
 * this button lives is only rendered for RT characters, so the
 * runtime guard is defensive against accidental invocation on other
 * systems.
 * @this {CharacterSheet}
 * @param {Event} event Triggering click event.
 * @param {HTMLElement} target Button that was clicked.
 */
// eslint-disable-next-line @typescript-eslint/require-await -- ApplicationV2 action handlers expect Promise<void>; concrete impl is synchronous
export async function openColonyGrowthDialog(this: CharacterSheet, event: Event, _target: HTMLElement): Promise<void> {
    event.preventDefault();
    if (this._resolveGameSystemId() !== 'rt') return;
    ColonyGrowthDialog.show(this.actor);
}
