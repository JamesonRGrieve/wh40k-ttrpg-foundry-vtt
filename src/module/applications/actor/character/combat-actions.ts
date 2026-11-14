/**
 * Character sheet: combat actions (attacks, reloads, grapples, dodges, the combat tracker).
 *
 * Split out of `character-sheet.ts` (#716): `this`-typed handlers the sheet binds in
 * `DEFAULT_OPTIONS.actions`; ApplicationV2 calls each with the sheet as `this`.
 */
import { DHTargetedActionManager } from '../../../actions/targeted-action-manager.ts';
import { SYSTEM_ID } from '../../../constants.ts';
import { AssignDamageData, type ActorLike } from '../../../rolls/assign-damage-data.ts';
import { Hit } from '../../../rolls/damage-data.ts';
import type { ActionKind } from '../../../rules/action-budget.ts';
import { resetActionsForActor, spendActionForActor } from '../../../rules/action-economy.ts';
import { configuredActionType } from '../../../rules/combat-actions.ts';
import { MOVE_MODE_FLAG } from '../../../rules/movement-budget.ts';
import { firstSystemId } from '../../../utils/chat-system-id.ts';
import { formatSigned } from '../../../utils/format.ts';
import { prepareAssignDamageRoll } from '../../prompts/assign-damage-dialog.ts';
import type CharacterSheet from '../character-sheet.ts';

/**
 * Handle weapon attack action.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
// eslint-disable-next-line @typescript-eslint/require-await -- ApplicationV2 action handlers expect Promise<void>
export async function attack(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
    try {
        DHTargetedActionManager.performWeaponAttack(this.actor);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this._notify('error', game.i18n.format('WH40K.Notify.CharacterSheet.AttackFailed', { error: message }), {
            duration: 5000,
        });
        console.error('Attack error:', error);
    }
}

/**
 * Handle dodge action.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
export async function dodge(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
    try {
        await this.actor.rollSkill('dodge');
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this._notify('error', game.i18n.format('WH40K.Notify.CharacterSheet.DodgeFailed', { error: message }), {
            duration: 5000,
        });
        console.error('Dodge error:', error);
    }
}

/**
 * Handle parry action.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
export async function parry(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
    try {
        await this.actor.rollSkill('parry');
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this._notify('error', game.i18n.format('WH40K.Notify.CharacterSheet.ParryFailed', { error: message }), {
            duration: 5000,
        });
        console.error('Parry error:', error);
    }
}

/**
 * Handle assign damage action.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
export function assignDamage(this: CharacterSheet, _event: Event, _target: HTMLElement): void {
    try {
        const hitData = new Hit();
        // eslint-disable-next-line no-restricted-syntax -- boundary: WH40KAcolyte doesn't satisfy ActorLike structurally; double-cast to bridge the type gap
        const assignData = new AssignDamageData(this.actor as unknown as ActorLike, hitData);
        // eslint-disable-next-line no-restricted-syntax -- boundary: prepareAssignDamageRoll expects a generic Record; AssignDamageData is compatible at runtime
        prepareAssignDamageRoll(assignData as unknown as Record<string, unknown>);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this._notify('error', game.i18n.format('WH40K.Notify.CharacterSheet.AssignDamageFailed', { error: message }), {
            duration: 5000,
        });
        console.error('Assign damage error:', error);
    }
}

/**
 * Handle initiative roll.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
export async function rollInitiative(this: CharacterSheet, event: Event, _target: HTMLElement): Promise<void> {
    try {
        const agBonus = this.actor.system.characteristics.agility.bonus;

        // Shift-click rolls immediately with no modifier — matches the convention used
        // by characteristic rolls elsewhere in the sheet. Otherwise open a small prompt
        // for situational modifiers (Low-Gravity, Constant Vigilance swap, Fate burn, etc).
        // Issue #21.
        let modifier = 0;
        let formula = '1d10';
        let formulaLabel = `1d10 + Agility Bonus (${agBonus})`;
        const isShift = (event as MouseEvent).shiftKey;
        if (!isShift) {
            const DialogV2 = (foundry.applications.api as { DialogV2?: typeof foundry.applications.api.DialogV2 }).DialogV2;
            if (DialogV2) {
                const result = await DialogV2.prompt({
                    window: { title: 'WH40K.Combat.InitiativeDialogTitle' },
                    content: `
                        <p>${game.i18n.localize('WH40K.Combat.InitiativeDialogHelp')}</p>
                        <div class="form-group">
                            <label>${game.i18n.localize('WH40K.Combat.InitiativeModifier')}</label>
                            <input type="number" name="modifier" value="0" />
                        </div>
                        <div class="form-group">
                            <label><input type="checkbox" name="fateBurn" /> ${game.i18n.localize('WH40K.Combat.InitiativeFateBurn')}</label>
                        </div>
                    `,
                    ok: {
                        label: 'WH40K.Common.Roll',
                        callback: (_evt: Event, button: HTMLButtonElement) => {
                            const form = button.form ?? null;
                            const mod = Number((form?.elements.namedItem('modifier') as HTMLInputElement | null)?.value ?? 0);
                            const burn = (form?.elements.namedItem('fateBurn') as HTMLInputElement | null)?.checked === true;
                            return { modifier: mod, fateBurn: burn };
                        },
                    },
                    rejectClose: false,
                });
                if (result === null) return;
                // eslint-disable-next-line no-restricted-syntax -- boundary: DialogV2 result is typed as unknown; double-cast to extract modal form values
                modifier = (result as unknown as { modifier: number }).modifier;
                // eslint-disable-next-line no-restricted-syntax -- boundary: DialogV2 result is typed as unknown; double-cast to extract fateBurn flag
                if ((result as unknown as { fateBurn: boolean }).fateBurn) {
                    formula = '10';
                    formulaLabel = `Fate burn (10) + Agility Bonus (${agBonus})`;
                }
            }
        }

        const roll = await new Roll(`${formula} + @ab + @mod`, { ab: agBonus, mod: modifier }).evaluate();
        if (modifier !== 0) {
            formulaLabel += ` ${formatSigned(modifier)}`;
        }

        const content = `
            <div class="wh40k-hit-location-result">
                <h3><i class="fas fa-bolt"></i> Initiative Roll</h3>
                <div class="wh40k-hit-roll">
                    <span class="wh40k-roll-result">${roll.total}</span>
                </div>
                <div class="wh40k-hit-location">
                    <span class="wh40k-location-armour">${formulaLabel}</span>
                </div>
            </div>
        `;

        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content,
            rolls: [roll],
            flags: {
                'wh40k-rpg': {
                    type: 'initiative',
                },
            },
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this._notify('error', game.i18n.format('WH40K.Notify.CharacterSheet.InitiativeFailed', { error: message }), {
            duration: 5000,
        });
        console.error('Initiative roll error:', error);
    }
}

/**
 * Handle toggling a combat action as favorite.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
export async function toggleFavoriteAction(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
    event.stopPropagation(); // Prevent parent action from triggering
    const actionKey = target.dataset['actionKey'];
    if (actionKey === undefined || actionKey === '') return;

    // eslint-disable-next-line no-restricted-syntax -- boundary: actor.system is typed by DataModel; favoriteCombatActions is a flag field not on the schema yet
    const currentFavorites = (this.actor.system as Record<string, unknown> & { favoriteCombatActions?: string[] }).favoriteCombatActions ?? [];
    const newFavorites = currentFavorites.includes(actionKey) ? currentFavorites.filter((k: string) => k !== actionKey) : [...currentFavorites, actionKey];

    await this.actor.update({ 'system.favoriteCombatActions': newFavorites });
}

/**
 * Handle generic combat action from favorites.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
export async function combatAction(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
    const actionKey = target.dataset['combatAction'];
    if (actionKey === undefined || actionKey === '') return;

    // Route to specific handler based on action key
    if (actionKey === 'dodge') {
        await dodge.call(this, event, target);
        return;
    }
    if (actionKey === 'parry') {
        await parry.call(this, event, target);
        return;
    }
    if (actionKey === 'assignDamage') {
        assignDamage.call(this, event, target);
        return;
    }
    if (actionKey === 'initiative') {
        await rollInitiative.call(this, event, target);
        return;
    }
    this._notify('warning', game.i18n.format('WH40K.Notify.CharacterSheet.UnknownCombatAction', { action: actionKey }), {
        duration: 3000,
    });
}

/**
 * Handle clicks on combat action buttons.
 *
 * Default behavior (plain click): show the action's description as a
 * sticky in-sheet tooltip anchored to the clicked button — a "personal"
 * description for the player, not posted anywhere else. This matches the
 * reaction buttons (Dodge/Parry), which never auto-post a description.
 *
 * Modifier behavior (Shift+Click): explicit opt-in to post the action
 * to chat as a public combat-action card. Posting to chat is a deliberate
 * secondary action, never the default.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
export async function vocalizeCombatAction(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
    const actionKey = target.dataset['actionKey'];
    if (actionKey === undefined || actionKey === '') return;

    // Find the action definition in config
    // eslint-disable-next-line no-restricted-syntax -- boundary: CONFIG.wh40k is untyped Foundry config; cast to access combatActions structure
    const wh40kConfig = CONFIG.wh40k as { combatActions?: { attacks?: unknown[]; movement?: unknown[]; utility?: unknown[] } } | undefined;
    const allActions = [
        ...(wh40kConfig?.combatActions?.attacks ?? []),
        ...(wh40kConfig?.combatActions?.movement ?? []),
        ...(wh40kConfig?.combatActions?.utility ?? []),
    ] as Array<{ key: string; label: string; description: string; type?: string; burst?: 'semi' | 'full'; icon?: string; subtypes?: string[] }>;

    const actionConfig = allActions.find((a) => a.key === actionKey);
    if (actionConfig === undefined) {
        this._notify('warning', game.i18n.format('WH40K.Notify.CharacterSheet.UnknownCombatAction', { action: actionKey }), { duration: 3000 });
        return;
    }
    // A burst costs what the actor's line prints: Full in DH1 / DW / RT (#607).
    const actionType = configuredActionType(actionConfig.type, actionConfig.burst, firstSystemId(this.actor));

    const actionName = game.i18n.localize(actionConfig.label);
    const actionDescription = game.i18n.localize(actionConfig.description);
    const actionSubtypes = actionConfig.subtypes !== undefined && actionConfig.subtypes.length > 0 ? ` (${actionConfig.subtypes.join(', ')})` : '';

    // Shift+Click is the explicit opt-in to actually perform the action:
    // vocalize it to chat AND spend its cost from the action economy (#264).
    // Disengage, now a Half Action (#416), spends a half action this way.
    const isShiftClick = event instanceof MouseEvent && event.shiftKey;
    if (isShiftClick) {
        const chatData = {
            user: game.user.id,
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/combat-action-card.hbs', {
                _gameSystemId: firstSystemId(this.actor),
                name: actionName,
                actor: this.actor.name,
                actionType: actionType ?? '',
                description: actionDescription,
                subtypes: actionConfig.subtypes?.join(', ') ?? '',
                icon: actionConfig.icon ?? '',
            }),
        };
        await ChatMessage.create(chatData);

        // Spend the action's economy cost when it maps cleanly to one action
        // kind. Compound / variable costs ('half-full', 'varies', …) are left
        // for the player to spend manually via the action-economy readout.
        const kind = actionKindFor(actionType);
        const actorId = this.actor.id;
        if (kind !== null && actorId !== null) {
            spendActionForActor(actorId, kind);
            void this.render(false);
        }
        return;
    }

    // Default: show the description as a sticky in-sheet tooltip on the
    // clicked button. No chat post, no global notification toast.
    const tooltipText = `<strong>${actionName}${actionSubtypes}</strong><br/>${actionDescription}`;
    const tooltipManager = (
        game as foundry.Game & {
            tooltip?: { activate?: (element: HTMLElement, options?: { text?: string; direction?: string; cssClass?: string }) => void };
        }
    ).tooltip;
    if (tooltipManager?.activate !== undefined) {
        tooltipManager.activate(target, { text: tooltipText, direction: 'UP', cssClass: 'wh40k-action-description' });
    } else {
        // Fallback for environments without the tooltip manager (e.g., tests).
        target.setAttribute('data-tooltip', `${actionName}${actionSubtypes}: ${actionDescription}`);
    }
}

/**
 * Handle clicks on combat-talent buttons in the Actions tab.
 *
 * Default behavior (plain click): show the talent's name + description
 * as a local in-sheet tooltip on the clicked button. This matches the
 * default for {@link #vocalizeCombatAction} and the Reactions block —
 * a plain click never auto-posts to chat (issue #19).
 *
 * Modifier behavior (Shift+Click): explicit opt-in to post the talent
 * card to chat via the item's normal {@link sendToChat} path.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
export async function combatTalentDescribe(this: CharacterSheet, event: Event, target: HTMLElement): Promise<void> {
    const itemId = target.dataset['itemId'] ?? target.closest<HTMLElement>('[data-item-id]')?.dataset['itemId'];
    if (itemId === undefined || itemId === '') {
        console.warn('WH40K | combatTalentDescribe: No item ID found', target);
        return;
    }

    const item = this.actor.items.get(itemId);
    if (item === undefined) {
        console.warn(`WH40K | combatTalentDescribe: Item ${itemId} not found on actor`);
        return;
    }

    // Shift+Click is the explicit opt-in to post to chat.
    const isShiftClick = event instanceof MouseEvent && event.shiftKey;
    if (isShiftClick) {
        try {
            await item.sendToChat();
        } catch (err) {
            console.error('WH40K | combatTalentDescribe: Error sending item to chat', err);
            ui.notifications.error(game.i18n.format('WH40K.Combat.Actions.TalentChatFailed', { name: item.name }));
        }
        return;
    }

    // Default: show the talent description as a local in-sheet tooltip.
    const itemSystem = item.system as { description?: { value?: string } } | undefined;
    const rawDescription = itemSystem?.description?.value ?? '';
    const descriptionText = rawDescription !== '' ? rawDescription : game.i18n.localize('WH40K.Combat.Actions.TalentNoDescription');
    const tooltipText = `<strong>${item.name}</strong><br/>${descriptionText}`;
    const tooltipManager = (
        game as foundry.Game & {
            tooltip?: { activate?: (element: HTMLElement, options?: { text?: string; direction?: string; cssClass?: string }) => void };
        }
    ).tooltip;
    if (tooltipManager?.activate !== undefined) {
        tooltipManager.activate(target, { text: tooltipText, direction: 'UP', cssClass: 'wh40k-action-description' });
    } else {
        // Fallback for environments without the tooltip manager (e.g., tests).
        // Strip HTML tags so the title/data-tooltip attribute reads cleanly.
        const plain = descriptionText.replace(/<[^>]*>/g, '').trim();
        target.setAttribute('data-tooltip', `${item.name}: ${plain}`);
    }
}

/**
 * Handle vocalizing movement to chat.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
export async function vocalizeMovement(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
    const movementType = target.dataset['movementType'] as 'half' | 'full' | 'charge' | 'run' | undefined;
    if (movementType === undefined) return;

    const movementData = {
        half: {
            label: game.i18n.localize('WH40K.MOVEMENT.Type.Half'),
            icon: 'fa-walking',
            description: game.i18n.localize('WH40K.MOVEMENT.Vocalize.Half'),
        },
        full: {
            label: game.i18n.localize('WH40K.MOVEMENT.Type.Full'),
            icon: 'fa-shoe-prints',
            description: game.i18n.localize('WH40K.MOVEMENT.Vocalize.Full'),
        },
        charge: {
            label: game.i18n.localize('WH40K.MOVEMENT.Type.Charge'),
            icon: 'fa-running',
            description: game.i18n.localize('WH40K.MOVEMENT.Vocalize.Charge'),
        },
        run: { label: game.i18n.localize('WH40K.MOVEMENT.Type.Run'), icon: 'fa-wind', description: game.i18n.localize('WH40K.MOVEMENT.Vocalize.Run') },
    };

    const movement = movementData[movementType];

    const distance = this.actor.system.movement[movementType];

    // Prepare chat data
    const chatData = {
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/movement-card.hbs', {
            _gameSystemId: firstSystemId(this.actor),
            actor: this.actor.name,
            movementType: movementType,
            movementLabel: movement.label,
            distance: distance,
            icon: movement.icon,
            description: movement.description,
        }),
    };

    // Create chat message
    await ChatMessage.create(chatData);
}

/**
 * Set the active movement mode on the actor's token.
 * Updates the token's movement action flag for ruler integration.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
export async function setMovementMode(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
    const movementType = target.dataset['movementType'];
    if (movementType === undefined || movementType === '') return;

    // Find the actor's active token on the canvas
    const token = this.actor.getActiveTokens()[0]?.document;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (token === null || token === undefined) {
        ui.notifications.info(game.i18n.format('WH40K.Notify.Token.NoActiveToken', { label: game.i18n.localize('WH40K.MOVEMENT.Label') }));
        return;
    }

    // Store movement action on token flags
    // eslint-disable-next-line no-restricted-syntax -- boundary: token.update() accepts untyped data; cast needed to satisfy the overload
    await token.update({ [`flags.${SYSTEM_ID}.${MOVE_MODE_FLAG}`]: movementType } as Record<string, unknown>);
    // The flag lives on the TOKEN, whose update does not re-render the actor's sheet: redraw the
    // Combat tab so the move-mode cluster shows the pick (#235).
    await this.render({ parts: ['combat'] });

    // eslint-disable-next-line no-restricted-syntax -- boundary: CONFIG is untyped Foundry global; double-cast to access wh40k.movementTypes config
    const config = ((CONFIG as unknown as Record<string, unknown>)['wh40k'] as Record<string, unknown> | undefined)?.['movementTypes'] as
        | Record<string, { label?: string }>
        | undefined;
    const movementConfig = config?.[movementType];
    const label = movementConfig ? game.i18n.localize(movementConfig.label ?? movementType) : movementType;
    // Disengage is a Half Action, not a move mode (#416); only real movement
    // speeds are selectable here.
    const speed = this.actor.system.movement[movementType as keyof typeof this.actor.system.movement];
    ui.notifications.info(game.i18n.format('WH40K.Notify.Token.MovementModeSet', { label, speed: String(speed) }));
}

/**
 * Spend one action of the kind named in the button's `data-kind` (#264) for
 * this actor's combatant, then re-render so the combat-tab readout updates.
 * @this {CharacterSheet}
 */
export function spendAction(this: CharacterSheet, _event: Event, target: HTMLElement): void {
    const actorId = this.actor.id;
    const kind = target.dataset['kind'] as ActionKind | undefined;
    if (actorId === null || kind === undefined) return;
    spendActionForActor(actorId, kind);
    void this.render(false);
}

/**
 * Reset this actor's combatant action budget to a fresh turn (#264).
 * @this {CharacterSheet}
 */
export function resetActions(this: CharacterSheet, _event: Event, _target: HTMLElement): void {
    const actorId = this.actor.id;
    if (actorId === null) return;
    resetActionsForActor(actorId);
    void this.render(false);
}

/**
 * Map a combat-action config `type` to a single action-economy kind, or null
 * when the cost is compound / variable ('half-full', 'varies', …) and should
 * be spent manually. Content-agnostic — a pure enum mapping, no content data.
 */
function actionKindFor(type: string | undefined): ActionKind | null {
    if (type === 'full' || type === 'half' || type === 'free' || type === 'reaction') return type;
    return null;
}
