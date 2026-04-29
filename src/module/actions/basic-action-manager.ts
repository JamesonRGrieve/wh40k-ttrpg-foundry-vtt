import { ConfirmationDialog } from '../applications/dialogs/_module.ts';
import { prepareAssignDamageRoll } from '../applications/prompts/assign-damage-dialog.ts';
import { ActorLike, AssignDamageData } from '../rolls/assign-damage-data.ts';
import { Hit } from '../rolls/damage-data.ts';
import { uuid, applyRollModeWhispers } from '../rolls/roll-helpers.ts';
import { DHTargetedActionManager } from './targeted-action-manager.ts';
import { ActionData } from '../rolls/action-data.ts';
import type { WH40KBaseActorDocument } from '../types/global.d.ts';

export class BasicActionManager {
    // This is stored rolls for allowing re-rolls, ammo refund, etc.
    storedRolls: Record<string, ActionData> = {};

    initializeHooks(): void {
        // Add show/hide support for chat messages
        Hooks.on('renderChatMessageHTML', (message: ChatMessage, html: HTMLElement, context: Record<string, unknown>) => {
            game.wh40k.log('renderChatMessageHTML', { message, html, context });
            html.querySelectorAll('.roll-control__hide-control').forEach((el) =>
                el.addEventListener('click', async (ev: Event) => await this._toggleExpandChatMessage(ev)),
            );
            html.querySelectorAll('.roll-control__refund').forEach((el) => el.addEventListener('click', async (ev: Event) => await this._refundResources(ev)));
            html.querySelectorAll('.roll-control__fate-reroll').forEach((el) => el.addEventListener('click', async (ev: Event) => await this._fateReroll(ev)));
            html.querySelectorAll('.roll-control__assign-damage').forEach((el) =>
                el.addEventListener('click', async (ev: Event) => await this._assignDamage(ev)),
            );
            html.querySelectorAll('.roll-control__roll-damage').forEach((el) => el.addEventListener('click', async (ev: Event) => await this._rollDamage(ev)));
            html.querySelectorAll('.roll-control__apply-damage').forEach((el) =>
                el.addEventListener('click', async (ev: Event) => await this._applyDamage(ev)),
            );
        });

        // Initialize Scene Control Buttons
        // V14: controls is Record<string, SceneControl> keyed by control name, not an array
        Hooks.on('getSceneControlButtons', (controls: Record<string, SceneControl>) => {
            const bar = controls.tokens;
            if (!bar) return;
            const toolOrder = Object.keys(bar.tools).length;
            bar.tools.assignDamage = {
                name: 'Assign Damage',
                title: 'Assign Damage',
                icon: 'fas fa-shield',
                visible: true,
                onClick: async () => await this.assignDamageTool(),
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
        if (span) {
            span.classList.toggle('active');
        }
        const target = displayToggle.dataset.toggle;
        const targetEl = target ? document.getElementById(target) : null;
        if (targetEl) {
            targetEl.style.display = targetEl.style.display === 'none' ? '' : 'none';
        }
    }

    async _rollDamage(event: Event): Promise<void> {
        event.preventDefault();
        const btn = event.currentTarget as HTMLButtonElement;
        const rollId = btn.dataset.rollId;
        const actionData = this.getActionData(rollId);
        if (!actionData) {
            ui.notifications?.warn('Roll data no longer available. Cannot roll damage.');
            return;
        }

        // Disable button to prevent double-rolling
        btn.disabled = true;
        const statusSpan = btn.querySelector('span:last-child');
        if (statusSpan) statusSpan.textContent = 'Rolled';

        // Calculate hits (deferred from attack roll)
        await actionData.calculateHits();

        // Build template data
        const damageRolls = actionData.damageData?.hits.map((h: Hit) => h.damageRoll).filter((r: Roll | undefined) => r) as Roll[];
        const templateData = {
            weaponName: actionData.rollData.name,
            hits: actionData.damageData?.hits,
            targetActor: actionData.rollData.targetActor,
            psychicEffect: (actionData as any).psychicEffect || null,
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
        const rollId = div.dataset.rollId;
        const actionData = this.getActionData(rollId);

        if (!actionData) {
            ui.notifications?.warn(`Action data expired. Unable to perform action.`);
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
            ui.notifications?.info(`Resources refunded`);
        }
    }

    async _fateReroll(event: Event): Promise<void> {
        event.preventDefault();
        const div = event.currentTarget as HTMLElement;
        const rollId = div.dataset.rollId;
        const actionData = this.getActionData(rollId);

        if (!actionData) {
            ui.notifications?.warn(`Action data expired. Unable to perform action.`);
            return;
        }

        const sourceActor = actionData.rollData.sourceActor as WH40KBaseActorDocument | null;
        if ((sourceActor?.system as any)?.fate?.value <= 0) {
            ui.notifications?.warn(`Actor does not have enough fate points!`);
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

        const location = div.dataset.location;
        const totalDamage = div.dataset.totalDamage;
        const totalPenetration = div.dataset.totalPenetration;
        const totalFatigue = div.dataset.totalFatigue;
        const damageType = div.dataset.damageType;

        const hitData = new Hit();
        hitData.location = location ?? 'Body';
        (hitData as any).totalDamage = totalDamage;
        (hitData as any).totalPenetration = totalPenetration;
        (hitData as any).totalFatigue = totalFatigue;
        hitData.damageType = damageType ?? 'Impact';

        const targetUuid = div.dataset.targetUuid;

        let targetActor: WH40KBaseActorDocument | undefined;
        if (targetUuid) {
            const doc = await fromUuid(targetUuid);
            const actor = doc instanceof Actor ? doc : (doc as any)?.actor;
            targetActor = actor instanceof Actor ? (actor as WH40KBaseActorDocument) : undefined;
        } else {
            const targetedObjects = game.user.targets;
            if (targetedObjects && targetedObjects.size > 0) {
                const token = targetedObjects.values().next().value as Token;
                targetActor = token.actor as WH40KBaseActorDocument | undefined;
            }
        }
        if (!targetActor) {
            ui.notifications?.warn(`Cannot determine target actor to assign hit.`);
            return;
        }

        const assignData = new AssignDamageData(targetActor as unknown as ActorLike, hitData);
        await prepareAssignDamageRoll(assignData);
    }

    async _applyDamage(event: Event): Promise<void> {
        event.preventDefault();
        const div = event.currentTarget as HTMLElement;
        const targetUuid = div.dataset.uuid;
        const damageType = div.dataset.type;
        const ignoreArmour = div.dataset.ignoreArmour;
        const location = div.dataset.location;
        const damage = div.dataset.damage;
        const penetration = div.dataset.penetration;
        const fatigue = div.dataset.fatigue;

        if (!targetUuid) {
            ui.notifications?.warn(`Cannot determine target UUID to assign hit.`);
            return;
        }

        const actor = await fromUuid(targetUuid);
        const targetActor = actor instanceof Actor ? (actor as WH40KBaseActorDocument) : ((actor as any)?.actor as WH40KBaseActorDocument | undefined);

        if (!targetActor) {
            ui.notifications?.warn(`Cannot determine actor to assign hit.`);
            return;
        }
        for (const field of [damage, penetration, fatigue]) {
            if (field && isNaN(parseInt(field))) {
                ui.notifications?.warn(`Unable to determine damage/penetration/fatigue to assign.`);
                return;
            }
        }

        const assignDamageData = new AssignDamageData(targetActor as unknown as ActorLike, new Hit());
        if (ignoreArmour === 'true' || ignoreArmour === 'TRUE') {
            assignDamageData.ignoreArmour = true;
        }

        const hit = new Hit();
        if (location) hit.location = location;
        if (damage) hit.totalDamage = Number.parseInt(damage);
        if (penetration) hit.totalPenetration = Number.parseInt(penetration);
        if (fatigue) hit.totalFatigue = Number.parseInt(fatigue);
        if (damageType) hit.damageType = damageType;

        assignDamageData.hit = hit;

        await assignDamageData.update();
        await assignDamageData.finalize();
        await assignDamageData.performActionAndSendToChat();
    }

    async assignDamageTool(): Promise<void> {
        const sourceToken = DHTargetedActionManager.getSourceToken();
        const sourceActor = sourceToken?.actor as WH40KBaseActorDocument | undefined;
        if (!sourceActor) return;

        const hitData = new Hit();
        const assignData = new AssignDamageData(sourceActor, hitData);
        await prepareAssignDamageRoll(assignData);
    }

    getActionData(id: string | undefined): ActionData | null {
        if (!id) return null;
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
