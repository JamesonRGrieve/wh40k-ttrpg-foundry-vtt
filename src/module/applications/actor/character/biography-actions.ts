/**
 * Character sheet: biography and origin actions.
 *
 * Split out of `character-sheet.ts` (#716): `this`-typed handlers the sheet binds in
 * `DEFAULT_OPTIONS.actions`; ApplicationV2 calls each with the sheet as `this`.
 */
import { BC_INFAMY_ADVANCE_CAP, BC_INFAMY_INCREMENT, chaosAlignmentLabelKey, infamyAdvanceCost } from '../../../config/game-systems/bc-advancement-config.ts';
import { deriveAlignmentFromTally, nextAlignmentCheckpoint, shouldRecheckAlignment, tallyAdvancesByAlignment } from '../../../rules/bc-alignment-derivation.ts';
import { errorMessage } from '../../../utils/error-message.ts';
import CharacteristicSetupDialog from '../../dialogs/characteristic-setup-dialog.ts';
import FateUsesDialog from '../../dialogs/fate-uses-dialog.ts';
import InquestTrackerDialog from '../../dialogs/inquest-tracker-dialog.ts';
import type CharacterSheet from '../character-sheet.ts';
import { dialogV2, type UtilityMenuOption } from './sheet-support.ts';

/**
 * Open the Origin Path Builder dialog for this character.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
export async function openOriginPathBuilder(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
    try {
        if (typeof game.wh40k.openOriginPathBuilder === 'function') {
            const gameSystem = this._resolveGameSystemId();
            await game.wh40k.openOriginPathBuilder(this.actor, gameSystem ? { gameSystem } : {});
        } else {
            this._notify('warning', game.i18n.localize('WH40K.Utility.OriginPathNotAvailable'), {
                duration: 3000,
            });
            console.warn('game.wh40k.openOriginPathBuilder not found');
        }
    } catch (error) {
        this._notify('error', `${game.i18n.localize('WH40K.Utility.OriginPathError')}: ${errorMessage(error)}`, {
            duration: 5000,
        });
        console.error('Origin Path Builder error:', error);
    }
}

/**
 * Open the Fate Point uses reference dialog. Triggered by clicking the
 * Fate Point icon / label on the character sheet (issue #35).
 * @this {CharacterSheet}
 */
export function viewFateUses(this: CharacterSheet, _event: Event, _target: HTMLElement): void {
    FateUsesDialog.open({
        gameSystem: this._resolveGameSystemId(),
    });
}

/**
 * Open a compendium/world document's sheet from a clicked reference control
 * (#389). Reads the target UUID from `data-uuid`, resolves it via `fromUuid`,
 * and renders the linked document's sheet. Used by the divination line under
 * the portrait (the divination's compendium entry carries the mechanical
 * bonus authored in #316); generic enough to back any `data-uuid` link.
 * @this {CharacterSheet}
 */
export async function openUuid(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
    const uuid = target.dataset['uuid'];
    if (uuid === undefined || uuid === '') return;
    // eslint-disable-next-line no-restricted-syntax -- boundary: foundry.utils.fromUuid is loosely typed in fvtt-types
    const fromUuidFn = (globalThis as unknown as { fromUuid?: (uuid: string) => Promise<object | null> }).fromUuid;
    if (fromUuidFn === undefined) return;
    let doc: { sheet?: { render: (force: boolean) => void } } | null = null;
    try {
        doc = await fromUuidFn(uuid);
    } catch {
        doc = null;
    }
    const sheet = doc?.sheet;
    if (sheet === undefined) {
        ui.notifications.warn(game.i18n.localize('WH40K.OriginPath.DivinationEntryMissing'));
        return;
    }
    sheet.render(true);
}

export async function toggleAgeMode(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
    const mode = target.dataset['mode'];
    if (mode !== 'age' && mode !== 'birthdate') return;
    await this.actor.update({ 'system.bio.ageMode': mode });
}

/**
 * GM-only manual stepper for the Warband Subtlety pool (#87).
 * Reads `data-delta` (±1) from the clicked button and routes the
 * adjustment through `WH40KBaseActor.applySubtlety(delta, 'manual')`
 * so the loss-clamp adjusters discovered by
 * `collectSubtletyAdjusters()` are honoured uniformly.
 */
export async function adjustSubtletyManually(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
    if (!game.user.isGM) return;
    const deltaAttr = target.dataset['delta'];
    if (deltaAttr === undefined || deltaAttr === '') return;
    const delta = Number.parseInt(deltaAttr, 10);
    if (!Number.isFinite(delta) || delta === 0) return;
    await this.actor.applySubtlety(delta, 'manual');
}

/**
 * Open a read-only popout listing every Subtlety adjuster currently
 * collected on this actor (#87). Uses Foundry's DialogV2 directly to
 * keep the surface minimal — the list is computed inline from
 * `collectSubtletyAdjusters()`.
 */
export function viewSubtletyBreakdown(this: CharacterSheet, _event: Event, _target: HTMLElement): void {
    const adjusters = this.actor.collectSubtletyAdjusters();
    const rows = adjusters.length
        ? adjusters
              .map((adj) => {
                  const right =
                      adj.kind === 'clamp'
                          ? game.i18n.format('WH40K.SubtletyPanel.Clamped', { value: String(adj.minAbsoluteDelta) })
                          : `${adj.delta > 0 ? '+' : ''}${adj.delta}`;
                  return `<li><strong>${foundry.utils.escapeHTML(adj.label)}</strong> — <span>${foundry.utils.escapeHTML(right)}</span></li>`;
              })
              .join('')
        : `<li><em>${game.i18n.localize('WH40K.SubtletyPanel.EmptyAdjusters')}</em></li>`;
    const content = `<ul class="wh40k-subtlety-breakdown-list">${rows}</ul>`;
    void dialogV2.prompt({
        window: { title: game.i18n.localize('WH40K.SubtletyPanel.BreakdownTitle') },
        content,
        ok: { label: 'OK' },
    });
}

/** Open the GM Inquest tracker (#90) for this actor's line. */
export function openInquestTracker(this: CharacterSheet, _event: Event, _target: HTMLElement): void {
    InquestTrackerDialog.open(this._resolveGameSystemId() ?? undefined);
}

/** Roll one Malignancy Test the character owes (button shown while any are due). */
export function rollMalignancyTest(this: CharacterSheet, _event: Event, _target: HTMLElement): void {
    this.actor.rollMalignancyTest();
}

/**
 * Re-evaluate the BC Alignment at the next 10-CP threshold (#173).
 *
 * Walks the actor's chaos-advance log via `tallyAdvancesByAlignment`
 * and `deriveAlignmentFromTally`, persists the new `chaosAlignment`
 * and `alignmentCheckpoint` in a single update, then posts a chat
 * card reporting the outcome. The button is only rendered by the
 * panel when `recheckDue` is true, but we still guard against a
 * stale click here by no-op-ing if `shouldRecheckAlignment` returns
 * false. Naming matches the partial's `data-action="recheckBcAlignment"`
 * — the BC-prefixed name disambiguates it from a generic re-check
 * that may exist for other systems in the future.
 */
export async function recheckBcAlignment(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
    if (this._resolveGameSystemId() !== 'bc') return;
    const system = this.actor.system;
    const corruption = system.corruption;
    const previousCheckpoint = system.alignmentCheckpoint;
    if (!shouldRecheckAlignment(corruption, previousCheckpoint)) return;
    const previous = system.chaosAlignment;
    const tally = tallyAdvancesByAlignment(system.chaosAdvancements);
    const next = deriveAlignmentFromTally(tally);
    const newCheckpoint = nextAlignmentCheckpoint(corruption);
    try {
        await this.actor.update({
            'system.chaosAlignment': next,
            'system.alignmentCheckpoint': newCheckpoint,
        });
        const flipped = previous !== next;
        const messageKey = flipped ? 'WH40K.BC.Advancement.RecheckFlippedTo' : 'WH40K.BC.Advancement.RecheckUnchanged';
        const formatted = flipped
            ? game.i18n.format(messageKey, {
                  previous: game.i18n.localize(chaosAlignmentLabelKey(previous)),
                  next: game.i18n.localize(chaosAlignmentLabelKey(next)),
              })
            : game.i18n.localize(messageKey);
        await ChatMessage.create({
            user: game.user.id,
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: `<p><strong>${game.i18n.localize('WH40K.BC.Advancement.RecheckChatTitle')}</strong></p><p>${formatted}</p>`,
        });
    } catch (error) {
        this._notify('error', game.i18n.format('WH40K.Notify.CharacterSheet.AlignmentRecheckFailed', { error: errorMessage(error) }), { duration: 5000 });
        console.error('BC alignment recheck error:', error);
    }
}

/**
 * Purchase an Infamy advance for a BC actor per the core advance cost table (#173).
 *
 * Pulls cost and increment from `bc-advancement-config.ts`, confirms
 * the spend via DialogV2.prompt (matching the prompt-driven XP-spend
 * style used elsewhere in the sheet), and writes the new
 * `experience.used` + `infamy` value in a single update. The cap is
 * enforced in two places defensively: `infamyAdvanceCost` returns
 * null when at/over the cap, and the partial collapses the button to
 * the "InfamyCapped" notice.
 */
export async function buyBcInfamyAdvance(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
    if (this._resolveGameSystemId() !== 'bc') return;
    const system = this.actor.system;
    const currentInfamy = system.infamy;
    const cost = infamyAdvanceCost(currentInfamy);
    if (cost === null) {
        this._notify('warning', game.i18n.format('WH40K.BC.Advancement.BuyInfamyCapped', { cap: String(BC_INFAMY_ADVANCE_CAP) }), {
            duration: 4000,
        });
        return;
    }
    const available = system.experience.available;
    if (available < cost) {
        this._notify(
            'warning',
            game.i18n.format('WH40K.BC.Advancement.BuyInfamyInsufficientXP', {
                cost: String(cost),
                available: String(available),
            }),
            { duration: 4000 },
        );
        return;
    }
    const nextInfamy = Math.min(currentInfamy + BC_INFAMY_INCREMENT, BC_INFAMY_ADVANCE_CAP);
    const confirmContent = `<p>${game.i18n.format('WH40K.BC.Advancement.BuyInfamyConfirmBody', {
        xp: String(cost),
        step: String(BC_INFAMY_INCREMENT),
        next: String(nextInfamy),
    })}</p>`;
    const confirmed = await dialogV2.confirm({
        window: { title: game.i18n.localize('WH40K.BC.Advancement.BuyInfamyConfirmTitle') },
        content: confirmContent,
        rejectClose: false,
    });
    if (!confirmed) return;
    try {
        await this.actor.update({
            'system.infamy': nextInfamy,
            // No `experience.used` write: it is derived from the
            // `chaosAdvancements` ledger below, and the derive is its only
            // writer (#509).
            'system.chaosAdvancements': [
                ...system.chaosAdvancements,
                {
                    category: 'infamy',
                    key: `infamy:${nextInfamy}`,
                    xpCost: cost,
                    alignment: 'unaligned',
                    fromArchetype: false,
                },
            ],
        });
    } catch (error) {
        this._notify('error', game.i18n.format('WH40K.Notify.CharacterSheet.InfamyPurchaseFailed', { error: errorMessage(error) }), { duration: 5000 });
        console.error('BC infamy advance purchase error:', error);
    }
}

/**
 * Open the characteristic setup dialog.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering event.
 * @param {HTMLElement} target  Element that triggered the event.
 */
export async function openCharacteristicSetup(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
    await CharacteristicSetupDialog.open(this.actor);
}

/**
 * Show the utility menu.
 * @param {Event} event     The originating click event
 * @param {HTMLElement} target  The capturing HTML element which defined a [data-action]
 */
export function showUtilityMenu(this: CharacterSheet, event: Event, target: HTMLElement): void {
    event.preventDefault();
    event.stopPropagation();

    const options = this._getUtilityMenuOptions();
    if (options.length === 0) return;

    // Create a simple context menu programmatically
    const menu = document.createElement('div');
    menu.className = 'wh40k-context-menu wh40k-utility-menu';
    menu.style.position = 'fixed';
    menu.style.zIndex = '1000';

    // Position the menu
    const rect = target.getBoundingClientRect();
    menu.style.left = `${rect.left}px`;
    menu.style.top = `${rect.bottom + 5}px`;

    // Add menu items
    options.forEach((option: UtilityMenuOption) => {
        if (option.condition && !option.condition()) return;

        const item = document.createElement('div');
        item.className = 'context-menu-item';
        item.innerHTML = `${option.icon} ${option.name}`;
        item.addEventListener('click', () => {
            void option.callback();
            menu.remove();
        });
        menu.appendChild(item);
    });

    // Add close listener
    const closeMenu = (e: Event): void => {
        if (!menu.contains(e.target as Node | null)) {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        }
    };

    document.body.appendChild(menu);
    document.addEventListener('click', closeMenu);
}

/**
 * Header control — reset the window to its default width and height.
 */
export function resetWindowSize(this: CharacterSheet, event: Event, _target: HTMLElement): void {
    event.preventDefault();
    const defaults = (this.constructor as typeof CharacterSheet).DEFAULT_OPTIONS.position as { width?: number; height?: number };
    const pos: { width?: number; height?: number } = {};
    if (defaults.width !== undefined) pos.width = defaults.width;
    if (defaults.height !== undefined) pos.height = defaults.height;
    this.setPosition(pos);
}
