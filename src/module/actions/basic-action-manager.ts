import { ConfirmationDialog } from '../applications/dialogs/_module.ts';
import { prepareAssignDamageRoll } from '../applications/prompts/assign-damage-dialog.ts';
import type { ActionData } from '../rolls/action-data.ts';
import type { ActorLike } from '../rolls/assign-damage-data.ts';
import { AssignDamageData } from '../rolls/assign-damage-data.ts';
import { Hit } from '../rolls/damage-data.ts';
import { uuid, applyRollModeWhispers } from '../rolls/roll-helpers.ts';
import type { WH40KBaseActorDocument } from '../types/global.d.ts';
import { DHTargetedActionManager } from './targeted-action-manager.ts';

export class BasicActionManager {
    // This is stored rolls for allowing re-rolls, ammo refund, etc.
    storedRolls: Record<string, ActionData> = {};

    initializeHooks(): void {
        // Add show/hide support for chat messages
        Hooks.on('renderChatMessageHTML', (message: ChatMessage, html: HTMLElement, context: ChatMessage.MessageData) => {
            game.wh40k.log('renderChatMessageHTML', { message, html, context });
            // Tailwind's `important: '.wh40k-rpg'` config scopes every tw-* utility
            // under `.wh40k-rpg`. Chat messages render outside the system's sheet
            // root, so without this class the chat cards lose all Tailwind styling.
            html.classList.add('wh40k-rpg');
            html.querySelectorAll('.roll-control__hide-control').forEach((el) =>
                el.addEventListener('click', (ev: Event) => {
                    this._toggleExpandChatMessage(ev);
                }),
            );
            html.querySelectorAll('.roll-control__refund').forEach((el) =>
                el.addEventListener('click', (ev: Event) => {
                    void this._refundResources(ev);
                }),
            );
            html.querySelectorAll('.roll-control__fate-reroll').forEach((el) =>
                el.addEventListener('click', (ev: Event) => {
                    void this._fateReroll(ev);
                }),
            );
            html.querySelectorAll('.roll-control__assign-damage').forEach((el) =>
                el.addEventListener('click', (ev: Event) => {
                    void this._assignDamage(ev);
                }),
            );
            html.querySelectorAll('.roll-control__roll-damage').forEach((el) =>
                el.addEventListener('click', (ev: Event) => {
                    void this._rollDamage(ev);
                }),
            );
            html.querySelectorAll('.roll-control__apply-damage').forEach((el) =>
                el.addEventListener('click', (ev: Event) => {
                    void this._applyDamage(ev);
                }),
            );
        });

        // Initialize Scene Control Buttons
        // V14: controls is Record<string, SceneControl> keyed by control name, not an array
        Hooks.on('getSceneControlButtons', (controls: Record<string, foundry.applications.ui.SceneControls.Control>) => {
            const bar = controls['tokens'];
            if (bar == null) return;
            const toolOrder = Object.keys(bar.tools).length;
            bar.tools['assignDamage'] = {
                name: 'Assign Damage',
                title: 'Assign Damage',
                icon: 'fas fa-shield',
                visible: true,
                onChange: () => {
                    void this.assignDamageTool();
                },
                button: true,
                order: toolOrder,
            };
        });
    }

    _toggleExpandChatMessage(event: Event): void {
        game.wh40k.log('roll-control-toggle');
        event.preventDefault();
        const displayToggle = event.currentTarget as HTMLElement;
        const span = displayToggle.querySelector('span');
        if (span != null) {
            span.classList.toggle('active');
        }
        const target = displayToggle.dataset['toggle'];
        const targetEl = target != null && target !== '' ? document.getElementById(target) : null;
        if (targetEl != null) {
            targetEl.style.display = targetEl.style.display === 'none' ? '' : 'none';
        }
    }

    async _rollDamage(event: Event): Promise<void> {
        event.preventDefault();
        const btn = event.currentTarget as HTMLButtonElement;
        const rollId = btn.dataset['rollId'];
        const actionData = this.getActionData(rollId);
        if (actionData == null) {
            ui.notifications.warn('Roll data no longer available. Cannot roll damage.');
            return;
        }

        // Disable button to prevent double-rolling
        btn.disabled = true;
        const statusSpan = btn.querySelector('span:last-child');
        if (statusSpan != null) statusSpan.textContent = 'Rolled';

        // Calculate hits (deferred from attack roll)
        await actionData.calculateHits();

        // Build template data
        const damageRolls = actionData.damageData?.hits.map((h: Hit) => h.damageRoll).filter((r: Roll | undefined): r is Roll => r != null);
        const templateData = {
            weaponName: actionData.rollData.name,
            hits: actionData.damageData?.hits,
            targetActor: actionData.rollData.targetActor,
            psychicEffect: (actionData as { psychicEffect?: unknown }).psychicEffect ?? null,
        };

        const template = 'systems/wh40k-rpg/templates/chat/damage-roll-chat.hbs';
        const html = await foundry.applications.handlebars.renderTemplate(template, templateData);
        const chatData: Record<string, unknown> = {
            user: game.user.id,
            rollMode: game.settings.get('core', 'rollMode'),
            content: html,
            rolls: damageRolls,
        };
        applyRollModeWhispers(chatData);
        await ChatMessage.create(chatData);
    }

    async _refundResources(event: Event): Promise<void> {
        event.preventDefault();
        const div = event.currentTarget as HTMLElement;
        const rollId = div.dataset['rollId'];
        const actionData = this.getActionData(rollId);

        if (!actionData) {
            ui.notifications.warn(`Action data expired. Unable to perform action.`);
            return;
        }

        const confirmed = await ConfirmationDialog.confirm({
            title: 'Confirm Refund',
            content: 'Are you sure you would like to refund ammo, fate, etc for this action?',
            confirmLabel: 'Refund',
            cancelLabel: 'Cancel',
        });

        if (confirmed) {
            await actionData.refundResources();
            ui.notifications.info(`Resources refunded`);
        }
    }

    async _fateReroll(event: Event): Promise<void> {
        event.preventDefault();
        const div = event.currentTarget as HTMLElement;
        const rollId = div.dataset['rollId'];
        const actionData = this.getActionData(rollId);

        if (!actionData) {
            ui.notifications.warn(`Action data expired. Unable to perform action.`);
            return;
        }

        const sourceActor = actionData.rollData.sourceActor;
        const sourceFate = (sourceActor?.system as { fate?: { value?: number } } | undefined)?.fate?.value ?? 0;
        if (sourceFate <= 0) {
            ui.notifications.warn(`Actor does not have enough fate points!`);
            return;
        }

        const confirmed = await ConfirmationDialog.confirm({
            title: 'Confirm Re-Roll',
            content: 'Are you sure you would like to use a fate point to re-roll action?',
            confirmLabel: 'Re-Roll',
            cancelLabel: 'Cancel',
        });

        if (confirmed) {
            // Generate new ID for action data
            actionData.id = uuid();
            // Use a FP
            await sourceActor?.spendFate?.();
            // Refund Initial Resources
            await actionData.refundResources();
            // Reset
            actionData.reset();
            // Run it back
            await actionData.performActionAndSendToChat();
        }
    }

    async _assignDamage(event: Event): Promise<void> {
        event.preventDefault();
        const div = event.currentTarget as HTMLElement;

        const location = div.dataset['location'];
        const totalDamage = div.dataset['totalDamage'];
        const totalPenetration = div.dataset['totalPenetration'];
        const totalFatigue = div.dataset['totalFatigue'];
        const damageType = div.dataset['damageType'];

        const hitData = new Hit();
        hitData.location = location ?? 'Body';
        // dataset values are strings; the AssignDamageData consumer parses them.
        const hitWritable = hitData as unknown as { totalDamage: unknown; totalPenetration: unknown; totalFatigue: unknown };
        hitWritable.totalDamage = totalDamage;
        hitWritable.totalPenetration = totalPenetration;
        hitWritable.totalFatigue = totalFatigue;
        hitData.damageType = damageType ?? 'Impact';

        const targetUuid = div.dataset['targetUuid'];

        let targetActor: WH40KBaseActorDocument | undefined;
        if (targetUuid != null && targetUuid !== '') {
            const doc = await fromUuid(targetUuid);
            const actor = doc instanceof Actor ? doc : (doc as { actor?: unknown } | null)?.actor;
            targetActor = actor instanceof Actor ? (actor as unknown as WH40KBaseActorDocument) : undefined;
        } else {
            const targetedObjects = game.user.targets;
            if (targetedObjects.size > 0) {
                const token = targetedObjects.values().next().value as Token;
                targetActor = token.actor as WH40KBaseActorDocument | undefined;
            }
        }
        if (targetActor == null) {
            ui.notifications.warn(`Cannot determine target actor to assign hit.`);
            return;
        }

        const assignData = new AssignDamageData(targetActor as unknown as ActorLike, hitData);
        prepareAssignDamageRoll(assignData as unknown as Record<string, unknown>);
    }

    async _applyDamage(event: Event): Promise<void> {
        event.preventDefault();
        const div = event.currentTarget as HTMLElement;
        const targetUuid = div.dataset['uuid'];
        const damageType = div.dataset['type'];
        const ignoreArmour = div.dataset['ignoreArmour'];
        const location = div.dataset['location'];
        const damage = div.dataset['damage'];
        const penetration = div.dataset['penetration'];
        const fatigue = div.dataset['fatigue'];

        if (targetUuid == null || targetUuid === '') {
            ui.notifications.warn(`Cannot determine target UUID to assign hit.`);
            return;
        }

        const actor = await fromUuid(targetUuid);
        const targetActor =
            actor instanceof Actor
                ? (actor as unknown as WH40KBaseActorDocument)
                : ((actor as { actor?: unknown } | null)?.actor as WH40KBaseActorDocument | undefined);

        if (targetActor == null) {
            ui.notifications.warn(`Cannot determine actor to assign hit.`);
            return;
        }
        for (const field of [damage, penetration, fatigue]) {
            if (field != null && field !== '' && Number.isNaN(parseInt(field, 10))) {
                ui.notifications.warn(`Unable to determine damage/penetration/fatigue to assign.`);
                return;
            }
        }

        const hit = new Hit();
        if (location != null && location !== '') hit.location = location;
        if (damage != null && damage !== '') hit.totalDamage = Number.parseInt(damage, 10);
        if (penetration != null && penetration !== '') hit.totalPenetration = Number.parseInt(penetration, 10);
        if (fatigue != null && fatigue !== '') hit.totalFatigue = Number.parseInt(fatigue, 10);
        if (damageType != null && damageType !== '') hit.damageType = damageType;

        const assignDamageData = new AssignDamageData(targetActor as unknown as ActorLike, hit);
        if (ignoreArmour === 'true' || ignoreArmour === 'TRUE') {
            assignDamageData.ignoreArmour = true;
        }

        assignDamageData.update();
        await assignDamageData.finalize();
        await assignDamageData.performActionAndSendToChat();
    }

    async assignDamageTool(): Promise<void> {
        const sourceToken = DHTargetedActionManager.getSourceToken();
        const sourceActor = sourceToken?.actor as WH40KBaseActorDocument | undefined;
        if (sourceActor == null) return;

        const hitData = new Hit();
        const assignData = new AssignDamageData(sourceActor as unknown as ActorLike, hitData);
        prepareAssignDamageRoll(assignData as unknown as Record<string, unknown>);
    }

    getActionData(id: string | undefined): ActionData | null {
        if (id == null || id === '') return null;
        return this.storedRolls[id] ?? null;
    }

    storeActionData(actionData: ActionData): void {
        this.storedRolls[actionData.id] = actionData;
    }

    async sendItemVocalizeChat(data: Record<string, unknown>): Promise<void> {
        const html = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/item-vocalize-chat.hbs', data);
        const chatData: Record<string, unknown> = {
            user: game.user.id,
            content: html,
            rollMode: game.settings.get('core', 'rollMode'),
        };
        applyRollModeWhispers(chatData);
        await ChatMessage.create(chatData);
    }
}

export const DHBasicActionManager = new BasicActionManager();
