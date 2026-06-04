import { ConfirmationDialog } from '../applications/dialogs/_module.ts';
import { prepareAssignDamageRoll } from '../applications/prompts/assign-damage-dialog.ts';
import type { ActionData } from '../rolls/action-data.ts';
import { AssignDamageData, type ActorLike } from '../rolls/assign-damage-data.ts';
import { Hit } from '../rolls/damage-data.ts';
import { uuid, postChatCard } from '../rolls/roll-helpers.ts';
import { ASSASSINS_STRIKE_TEST } from '../rules/assassins-strike.ts';
import { weaponHasQuality } from '../rules/weapon-quality-effects.ts';
import type { WH40KBaseActorDocument } from '../types/global.d.ts';
import { WH40KSettings } from '../wh40k-rpg-settings.ts';
import { DHTargetedActionManager } from './targeted-action-manager.ts';

type CanvasToken = foundry.canvas.placeables.Token;

/**
 * Structural narrowing of WH40KBaseActor with the `rollSkill` method that
 * system-specific subclasses (Acolyte, Npc) define but the base type does
 * not surface. Foundry-side method shape; declared here so the cast at the
 * Foundry boundary stays localised.
 */
type WithRollSkill = WH40KBaseActorDocument & {
    // eslint-disable-next-line no-restricted-syntax -- boundary: rollSkill options object is forwarded to Foundry's roll dispatcher
    rollSkill?: (skill: string, spec?: string, opts?: Record<string, unknown>) => Promise<void>;
};

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
            html.querySelectorAll('.roll-control__hide-control').forEach((el) => {
                el.addEventListener('click', (ev: Event) => {
                    this._toggleExpandChatMessage(ev);
                });
            });
            html.querySelectorAll('.roll-control__refund').forEach((el) => {
                el.addEventListener('click', (ev: Event) => {
                    void this._refundResources(ev);
                });
            });
            html.querySelectorAll('.roll-control__fate-reroll').forEach((el) => {
                el.addEventListener('click', (ev: Event) => {
                    void this._fateReroll(ev);
                });
            });
            html.querySelectorAll('.roll-control__fate-add-dos').forEach((el) => {
                el.addEventListener('click', (ev: Event) => {
                    void this._fateAddDoS(ev);
                });
            });
            html.querySelectorAll('.roll-control__assign-damage').forEach((el) => {
                el.addEventListener('click', (ev: Event) => {
                    void this._assignDamage(ev);
                });
            });
            html.querySelectorAll('.roll-control__roll-damage').forEach((el) => {
                el.addEventListener('click', (ev: Event) => {
                    void this._rollDamage(ev);
                });
            });
            html.querySelectorAll('.roll-control__apply-damage').forEach((el) => {
                el.addEventListener('click', (ev: Event) => {
                    void this._applyDamage(ev);
                });
            });
            html.querySelectorAll('.roll-control__replace-damage-die').forEach((el) => {
                el.addEventListener('click', (ev: Event) => {
                    void this._replaceDamageDieWithDoS(ev);
                });
            });
            html.querySelectorAll('.roll-control__assassins-strike').forEach((el) => {
                el.addEventListener('click', (ev: Event) => {
                    void this._assassinsStrike(ev);
                });
            });
            html.querySelectorAll('.roll-control__horde-break-test').forEach((el) => {
                el.addEventListener('click', (ev: Event) => {
                    void this._hordeBreakTest(ev);
                });
            });
        });

        // Initialize Scene Control Buttons
        // V14: controls is Record<string, SceneControl> keyed by control name, not an array
        Hooks.on('getSceneControlButtons', (controls: Record<string, foundry.applications.ui.SceneControls.Control>) => {
            const bar = controls['tokens'];
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard; controls['tokens'] may be undefined at runtime
            if (bar === undefined) return;
            const toolOrder = Object.keys(bar.tools).length;
            bar.tools['assignDamage'] = {
                name: 'Assign Damage',
                title: 'Assign Damage',
                icon: 'fas fa-shield',
                visible: true,
                onChange: () => {
                    this.assignDamageTool();
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
        // eslint-disable-next-line no-restricted-syntax -- boundary: hardcoded fallback; i18n key migration tracked separately
        const actionData = this.#resolveStoredAction(btn, 'Roll data no longer available. Cannot roll damage.');
        if (actionData == null) return;

        // Disable button to prevent double-rolling
        btn.disabled = true;
        const statusSpan = btn.querySelector('span:last-child');
        if (statusSpan != null) statusSpan.textContent = 'Rolled';

        // Calculate hits (deferred from attack roll). Idempotent: if hits were
        // already produced (e.g. auto-roll-damage front-ran this), don't append
        // a second set of hits — re-post the existing damage card instead.
        if ((actionData.damageData?.hits.length ?? 0) === 0) {
            await actionData.calculateHits();
        }

        // Propagate attack DoS to each hit so the chat card can offer the
        // "replace damage die with DoS" action (#129 — DH2 core L10398-10414).
        const attackDoS = actionData.rollData.dos;
        for (const hit of actionData.damageData?.hits ?? []) {
            hit.dos = attackDoS;
        }

        await this._postDamageCard(actionData);
    }

    /**
     * Render `damage-roll-chat.hbs` for an existing ActionData and post it
     * to the chat log. Extracted so the "replace damage die with DoS"
     * action (#129) can re-emit the card after mutating a Hit's dice.
     */
    async _postDamageCard(actionData: ActionData): Promise<void> {
        const damageRolls = actionData.damageData?.hits.map((h: Hit) => h.damageRoll).filter((r: Roll | undefined): r is Roll => r != null);

        // Tag each hit with whether the source weapon carries the Explosive
        // quality so the chat-card assign-damage button can propagate it
        // through to AssignDamageData (DW horde branch: +1 Magnitude per
        // Explosive hit per RAW). `weaponHasQuality` walks effectiveSpecial
        // / special / embedded attackSpecial items — the existing helper
        // is the single point of truth for quality detection (no string
        // literal name match anywhere else in src/).
        const weapon = actionData.rollData.weapon ?? actionData.rollData.power;
        // eslint-disable-next-line no-restricted-syntax -- boundary: actionData.rollData.weapon is a typed WH40KItemDocument; weaponHasQuality accepts a duck-typed QualityItem
        const explosive = weaponHasQuality(weapon as Parameters<typeof weaponHasQuality>[0], 'explosive');
        for (const hit of actionData.damageData?.hits ?? []) {
            hit.isExplosive = explosive;
        }

        // Auto-calculate effective damage vs the current target (#247): when the attack
        // resolved against a target, surface the post-armour/TB damage on the card up
        // front. The manual "Assign Damage" button below still performs the application.
        const damageTarget = actionData.rollData.targetActor;
        let targetName: string | null = null;
        let autoApplied = false;
        if (damageTarget != null) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: targetActor is an opaque Foundry Actor; AssignDamageData consumes the untyped ActorLike system shape and .name is the document name
            const targetLike = damageTarget as unknown as ActorLike & { name?: string };
            targetName = targetLike.name ?? null;
            // Auto-apply (#248) runs only on a GM client: applying damage updates the
            // target actor, so it must happen once on a client with permission. The card
            // HTML is generated here, so a GM-rolled attack bakes in autoApplied=true (and
            // hides the manual button) for everyone; player-rolled attacks fall back to the
            // manual "Assign Damage" button.
            const autoApply = WH40KSettings.isAutoApplyDamageEnabled() && game.user.isGM;
            // Process hits as a sequential promise chain (not a for-await loop): each
            // auto-apply writes the target's wounds, so they must run one at a time to
            // avoid racing actor.update.
            await (actionData.damageData?.hits ?? []).reduce<Promise<void>>(async (previous, hit) => {
                await previous;
                const assign = new AssignDamageData(targetLike, hit);
                assign.update();
                const preview = assign.previewReducedDamage();
                hit.hasEffective = true;
                hit.effectiveDamage = preview.effective;
                hit.effectiveArmour = preview.armour;
                hit.effectiveTb = preview.toughnessBonus;
                hit.effectiveAbsorbed = preview.absorbed;
                if (autoApply) {
                    // finalize() applies wounds + rolls critical damage; performAction…()
                    // writes the wound/critical update and posts the assign-damage card
                    // (incl. the critical-injury status item).
                    await assign.finalize();
                    await assign.performActionAndSendToChat();
                    autoApplied = true;
                }
            }, Promise.resolve());
        }

        const templateData = {
            weaponName: actionData.rollData.name,
            hits: actionData.damageData?.hits,
            targetActor: actionData.rollData.targetActor,
            targetName,
            autoApplied,
            rollId: actionData.id,
            // The replacement option is offered while the original ActionData is still
            // resident in `storedRolls` — once it expires (page reload, etc.) the
            // button is omitted from re-rendered cards.
            canReplaceDie: true,
            // eslint-disable-next-line no-restricted-syntax -- boundary: psychicEffect is a system extension not declared in ActionData type
            psychicEffect: (actionData as unknown as { psychicEffect?: unknown }).psychicEffect ?? null,
        };

        const template = 'systems/wh40k-rpg/templates/chat/damage-roll-chat.hbs';
        const html = await foundry.applications.handlebars.renderTemplate(template, templateData);
        await postChatCard(html, { rolls: damageRolls });
    }

    /**
     * Handle the chat-card "Replace die with DoS" button (#129 — DH2 core
     * L10398-10414). Looks up the original ActionData by `data-roll-id`,
     * mutates the targeted Hit's lowest active damage die to the attack's
     * DoS, then re-emits the damage chat card with the updated total. A
     * short announcement card narrates the swap.
     */
    async _replaceDamageDieWithDoS(event: Event): Promise<void> {
        event.preventDefault();
        const btn = event.currentTarget as HTMLButtonElement;
        const hitIndexRaw = btn.dataset['hitIndex'];
        const dosRaw = btn.dataset['dos'];

        const actionData = this.#resolveStoredAction(btn, game.i18n.localize('WH40K.FateActionExpired'));
        if (actionData == null) return;

        const hitIndex = hitIndexRaw !== undefined && hitIndexRaw !== '' ? Number.parseInt(hitIndexRaw, 10) : 0;
        const dos = dosRaw !== undefined && dosRaw !== '' ? Number.parseInt(dosRaw, 10) : actionData.rollData.dos;
        const hit = actionData.damageData?.hits[hitIndex];
        if (hit === undefined || dos <= 0) {
            ui.notifications.warn(game.i18n.localize('WH40K.FateAddDoSNotSuccess'));
            return;
        }

        // Capture pre-replacement totals for the announcement.
        const before = hit.totalDamage;
        const replaced = hit.replaceDamageDieWithDoS(dos);
        if (!replaced) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: dev-only fallback; replacement only fails when the Roll has no dice terms
            ui.notifications.warn('No damage die available to replace.');
            return;
        }

        // Disable the button so the player cannot double-spend on the same Hit.
        btn.disabled = true;

        // Re-emit the damage card with the updated hit totals.
        await this._postDamageCard(actionData);

        // Short announcement of what was swapped — keeps the audit trail in chat.
        // `delta = total_after - total_before = dos - previous_die`, so
        // `previous_die = dos - delta`.
        const delta = hit.totalDamage - before;
        const announcement = game.i18n.format('WH40K.DamageDieReplacement.ReplacedDieMessage', {
            weapon: actionData.rollData.name,
            previous: String(dos - delta),
            dos: String(dos),
            total: String(hit.totalDamage),
        });
        await postChatCard(
            `<div class="wh40k-rpg tw-font-ui tw-px-3 tw-py-2 tw-rounded-md tw-border tw-border-[var(--wh40k-card-gold)] tw-bg-amber-500/20 tw-text-[var(--wh40k-card-text)] tw-text-[0.85rem]">${announcement}</div>`,
        );
    }

    /**
     * Handle the chat-card "Assassin's Strike" button (#149 — DH2 errata
     * L75). Looks up the stored ActionData by `data-roll-id` so the
     * Acrobatics test is dispatched against the same actor that just
     * resolved the melee attack, then opens the unified roll dialog for
     * a Challenging (+0) Acrobatics Test. On success, the GM narrates
     * the Half Move (Agility-bonus metres) as a Free Action per the
     * errata — the dispatch posts a short announcement so the audit
     * trail stays in chat.
     */
    async _assassinsStrike(event: Event): Promise<void> {
        event.preventDefault();
        const btn = event.currentTarget as HTMLButtonElement;
        const actionData = this.#resolveStoredAction(btn, game.i18n.localize('WH40K.FateActionExpired'));
        if (actionData == null) return;

        const sourceActor: WithRollSkill | null = actionData.rollData.sourceActor;
        if (sourceActor == null) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: hardcoded fallback; i18n key migration tracked separately
            ui.notifications.warn("No source actor found for Assassin's Strike dispatch.");
            return;
        }

        // Disable the button so the action cannot be double-dispatched.
        btn.disabled = true;

        // Open the Acrobatics test dialog at Challenging (+0). The unified
        // roll dialog reads the modifier from the dispatch options when the
        // caller surfaces a difficulty band; passing the locked constants
        // here ensures the chat-card path matches the errata wording.
        try {
            await sourceActor.rollSkill?.(ASSASSINS_STRIKE_TEST.skill, undefined, {
                difficulty: ASSASSINS_STRIKE_TEST.difficulty,
                modifier: ASSASSINS_STRIKE_TEST.modifier,
                flavor: game.i18n.localize('WH40K.AssassinsStrike.TestTitle'),
            });
        } catch {
            // eslint-disable-next-line no-restricted-syntax -- boundary: dev-only fallback when the actor's rollSkill API throws (e.g., missing skill on legacy data)
            ui.notifications.warn("Unable to dispatch Acrobatics test for Assassin's Strike.");
            btn.disabled = false;
            return;
        }

        // Short announcement keeps the audit trail in chat so the GM can
        // narrate the Half Move (Agility-bonus metres) immediately after.
        const announcement = game.i18n.localize('WH40K.AssassinsStrike.SuccessChatLine');
        await postChatCard(
            `<div class="wh40k-rpg tw-font-ui tw-px-3 tw-py-2 tw-rounded-md tw-border tw-border-gray-700 tw-bg-gray-800/60 tw-text-gray-100 tw-text-[0.85rem]">${announcement}</div>`,
        );
    }

    /**
     * Chat-card "Willpower test to hold" button (#166 — DW Horde RAW).
     * Resolves the target horde from the dataset UUID, then dispatches a
     * Willpower characteristic test with the resolver-supplied modifier
     * (0 for a normal hold test, -10 when Magnitude has dropped below
     * 50%). Auto-break / Fearless / "no test required" cases do not emit
     * a button — the resolver short-circuits to the label-only render.
     */
    async _hordeBreakTest(event: Event): Promise<void> {
        event.preventDefault();
        const btn = event.currentTarget as HTMLButtonElement;
        const targetUuid = btn.dataset['targetUuid'];
        const modifierRaw = btn.dataset['willpowerModifier'];

        if (targetUuid == null || targetUuid === '') {
            ui.notifications.warn(game.i18n.localize('WH40K.DW.Horde.Break.NoTest'));
            return;
        }

        const doc = await fromUuid(targetUuid);
        // eslint-disable-next-line no-restricted-syntax -- boundary: fromUuid result may be a TokenDocument with .actor; the field is opaque on the base Document type
        const resolved = doc instanceof Actor ? doc : (doc as { actor?: Actor | null } | null)?.actor;
        if (!(resolved instanceof Actor)) return;
        // eslint-disable-next-line no-restricted-syntax -- boundary: rollCharacteristic comes from system-specific Actor subclasses not surfaced on the base Actor type
        const actor = resolved as unknown as WH40KBaseActorDocument & { rollCharacteristic?: (key: string, flavor?: string) => void | Promise<void> };

        const modifier = modifierRaw !== undefined && modifierRaw !== '' ? Number.parseInt(modifierRaw, 10) : 0;
        const flavorKey = modifier < 0 ? 'WH40K.DW.Horde.Break.TestPenalised' : 'WH40K.DW.Horde.Break.TestNormal';
        btn.disabled = true;
        try {
            await Promise.resolve(actor.rollCharacteristic('willpower', game.i18n.localize(flavorKey)));
        } catch {
            btn.disabled = false;
        }
    }

    async _refundResources(event: Event): Promise<void> {
        event.preventDefault();
        const div = event.currentTarget as HTMLElement;
        // eslint-disable-next-line no-restricted-syntax -- boundary: hardcoded fallback; i18n key migration tracked separately
        const actionData = this.#resolveStoredAction(div, `Action data expired. Unable to perform action.`);
        if (actionData == null) return;

        const confirmed = await ConfirmationDialog.confirm({
            title: 'Confirm Refund',
            content: 'Are you sure you would like to refund ammo, fate, etc for this action?',
            confirmLabel: 'Refund',
            cancelLabel: 'Cancel',
        });

        if (confirmed) {
            await actionData.refundResources();
            // eslint-disable-next-line no-restricted-syntax -- boundary: hardcoded fallback; i18n key migration tracked separately
            ui.notifications.info(`Resources refunded`);
        }
    }

    async _fateReroll(event: Event): Promise<void> {
        event.preventDefault();
        const div = event.currentTarget as HTMLElement;
        const actionData = this.#resolveStoredAction(div, game.i18n.localize('WH40K.FateActionExpired'));
        if (actionData == null) return;

        if (!WH40KSettings.isMultipleFateBurnAllowed() && (actionData.fateUses.reroll || actionData.fateUses.addDoS)) {
            ui.notifications.warn(game.i18n.localize('WH40K.FateAlreadySpent'));
            return;
        }

        const sourceActor = actionData.rollData.sourceActor;
        const sourceFate = (sourceActor?.system as { fate?: { value?: number } } | undefined)?.fate?.value ?? 0;
        if (sourceFate <= 0) {
            ui.notifications.warn(game.i18n.localize('WH40K.FateInsufficient'));
            return;
        }

        const confirmed = await ConfirmationDialog.confirm({
            title: game.i18n.localize('WH40K.FateRerollConfirmTitle'),
            content: game.i18n.localize('WH40K.FateRerollConfirmContent'),
            confirmLabel: game.i18n.localize('WH40K.FateReroll'),
            cancelLabel: game.i18n.localize('WH40K.Cancel'),
        });

        if (confirmed) {
            // Generate new ID for action data
            actionData.id = uuid();
            // Use a FP
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- spendFate is a system extension; may not exist on all WH40KBaseActorDocument subtypes
            await sourceActor?.spendFate?.();
            actionData.fateUses.reroll = true;
            // Refund Initial Resources
            await actionData.refundResources();
            // Reset (preserves fateUses by design — single-spend lockout survives the reroll)
            actionData.reset();
            // Run it back
            await actionData.performActionAndSendToChat();
        }
    }

    async _fateAddDoS(event: Event): Promise<void> {
        event.preventDefault();
        const btn = event.currentTarget as HTMLElement;
        const actionData = this.#resolveStoredAction(btn, game.i18n.localize('WH40K.FateActionExpired'));
        if (actionData == null) return;

        if (!actionData.rollData.success) {
            ui.notifications.warn(game.i18n.localize('WH40K.FateAddDoSNotSuccess'));
            return;
        }

        if (!WH40KSettings.isMultipleFateBurnAllowed() && (actionData.fateUses.reroll || actionData.fateUses.addDoS)) {
            ui.notifications.warn(game.i18n.localize('WH40K.FateAlreadySpent'));
            return;
        }

        const sourceActor = actionData.rollData.sourceActor;
        const sourceFate = (sourceActor?.system as { fate?: { value?: number } } | undefined)?.fate?.value ?? 0;
        if (sourceFate <= 0) {
            ui.notifications.warn(game.i18n.localize('WH40K.FateInsufficient'));
            return;
        }

        const confirmed = await ConfirmationDialog.confirm({
            title: game.i18n.localize('WH40K.FateAddDoSConfirmTitle'),
            content: game.i18n.localize('WH40K.FateAddDoSConfirmContent'),
            confirmLabel: game.i18n.localize('WH40K.FateAddDoS'),
            cancelLabel: game.i18n.localize('WH40K.Cancel'),
        });
        if (!confirmed) return;

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- spendFate is a system extension; may not exist on all WH40KBaseActorDocument subtypes
        await sourceActor?.spendFate?.();
        actionData.fateUses.addDoS = true;
        actionData.rollData.dos += 1;

        // eslint-disable-next-line no-restricted-syntax -- boundary: programmatic actor-name fallback, not a player-facing label
        const actorName = sourceActor?.name ?? 'Actor';
        const announcement = game.i18n.format('WH40K.FateAddDoSChat', {
            name: actorName,
            dos: String(actionData.rollData.dos),
        });
        await postChatCard(
            `<div class="wh40k-rpg tw-font-ui tw-px-3 tw-py-2 tw-rounded-md tw-border tw-border-[var(--wh40k-powers-border)] tw-bg-[var(--wh40k-powers-bg)] tw-text-[var(--wh40k-powers-secondary)] tw-text-[0.85rem]">${announcement}</div>`,
        );
    }

    async _assignDamage(event: Event): Promise<void> {
        event.preventDefault();
        const div = event.currentTarget as HTMLElement;

        const location = div.dataset['location'];
        const totalDamage = div.dataset['totalDamage'];
        const totalPenetration = div.dataset['totalPenetration'];
        const totalFatigue = div.dataset['totalFatigue'];
        const damageType = div.dataset['damageType'];
        const isExplosive = div.dataset['isExplosive'];

        const hitData = new Hit();
        hitData.location = location ?? 'Body';
        // dataset values are strings; the AssignDamageData consumer parses them.
        /* eslint-disable no-restricted-syntax -- boundary: Hit fields are typed as number but dataset values are strings; cast through unknown is necessary */
        const hitWritable = hitData as unknown as { totalDamage: unknown; totalPenetration: unknown; totalFatigue: unknown };
        /* eslint-enable no-restricted-syntax */
        hitWritable.totalDamage = totalDamage;
        hitWritable.totalPenetration = totalPenetration;
        hitWritable.totalFatigue = totalFatigue;
        hitData.damageType = damageType ?? 'Impact';
        // Handlebars renders booleans as "true"/"false" strings on dataset
        // attributes; coerce explicitly so the DW horde branch reads a real
        // boolean for `magnitudeLossForHit(damage, isExplosive)`.
        hitData.isExplosive = isExplosive === 'true';

        const targetUuid = div.dataset['targetUuid'];

        let targetActor: WH40KBaseActorDocument | undefined;
        if (targetUuid != null && targetUuid !== '') {
            const doc = await fromUuid(targetUuid);
            // eslint-disable-next-line no-restricted-syntax -- boundary: fromUuid result may be a TokenDocument with .actor; no typed accessor in fvtt-types
            const actor = doc instanceof Actor ? doc : (doc as unknown as { actor?: unknown } | null)?.actor;
            // eslint-disable-next-line no-restricted-syntax -- boundary: actor is instanceof-narrowed from unknown; cast through unknown is necessary
            targetActor = actor instanceof Actor ? (actor as unknown as WH40KBaseActorDocument) : undefined;
        } else {
            const targetedObjects = game.user.targets;
            if (targetedObjects.size > 0) {
                const token = targetedObjects.values().next().value as CanvasToken;
                targetActor = token.actor as WH40KBaseActorDocument | undefined;
            }
        }
        if (targetActor == null) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: hardcoded fallback; i18n key migration tracked separately
            ui.notifications.warn(`Cannot determine target actor to assign hit.`);
            return;
        }

        /* eslint-disable no-restricted-syntax -- boundary: AssignDamageData/prepareAssignDamageRoll use untyped system internals; cast through unknown is necessary */
        const assignData = new AssignDamageData(targetActor as unknown as ActorLike, hitData);
        prepareAssignDamageRoll(assignData as unknown as Record<string, unknown>);
        /* eslint-enable no-restricted-syntax */
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
            // eslint-disable-next-line no-restricted-syntax -- boundary: hardcoded fallback; i18n key migration tracked separately
            ui.notifications.warn(`Cannot determine target UUID to assign hit.`);
            return;
        }

        const actor = await fromUuid(targetUuid);
        /* eslint-disable no-restricted-syntax -- boundary: fromUuid result may be a TokenDocument with .actor; cast through unknown is necessary */
        const targetActor =
            actor instanceof Actor
                ? (actor as unknown as WH40KBaseActorDocument)
                : ((actor as unknown as { actor?: unknown } | null)?.actor as WH40KBaseActorDocument | undefined);
        /* eslint-enable no-restricted-syntax */

        if (targetActor == null) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: hardcoded fallback; i18n key migration tracked separately
            ui.notifications.warn(`Cannot determine actor to assign hit.`);
            return;
        }
        for (const field of [damage, penetration, fatigue]) {
            if (field != null && field !== '' && Number.isNaN(parseInt(field, 10))) {
                // eslint-disable-next-line no-restricted-syntax -- boundary: hardcoded fallback; i18n key migration tracked separately
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
        // Handlebars renders booleans as "true"/"false" strings on dataset.
        hit.isExplosive = div.dataset['isExplosive'] === 'true';

        // eslint-disable-next-line no-restricted-syntax -- boundary: AssignDamageData accepts untyped system ActorLike; cast through unknown is necessary
        const assignDamageData = new AssignDamageData(targetActor as unknown as ActorLike, hit);
        if (ignoreArmour === 'true' || ignoreArmour === 'TRUE') {
            assignDamageData.ignoreArmour = true;
        }

        assignDamageData.update();
        await assignDamageData.finalize();
        await assignDamageData.performActionAndSendToChat();
    }

    assignDamageTool(): void {
        const sourceToken = DHTargetedActionManager.getSourceToken();
        const sourceActor = sourceToken?.actor as WH40KBaseActorDocument | undefined;
        if (sourceActor == null) return;

        const hitData = new Hit();
        /* eslint-disable no-restricted-syntax -- boundary: AssignDamageData/prepareAssignDamageRoll use untyped system internals; cast through unknown is necessary */
        const assignData = new AssignDamageData(sourceActor as unknown as ActorLike, hitData);
        prepareAssignDamageRoll(assignData as unknown as Record<string, unknown>);
        /* eslint-enable no-restricted-syntax */
    }

    getActionData(id: string | undefined): ActionData | null {
        if (id == null || id === '') return null;
        return this.storedRolls[id] ?? null;
    }

    /**
     * Resolve the stored ActionData for a clicked control's `data-roll-id`, warning
     * with `expiredMessage` and returning null when the roll has expired. Collapses
     * the `dataset.rollId → getActionData → warn` idiom repeated across the chat
     * action handlers (#278). Callers keep their own early `return` on null.
     */
    #resolveStoredAction(element: HTMLElement, expiredMessage: string): ActionData | null {
        const actionData = this.getActionData(element.dataset['rollId']);
        if (actionData == null) {
            ui.notifications.warn(expiredMessage);
        }
        return actionData;
    }

    storeActionData(actionData: ActionData): void {
        this.storedRolls[actionData.id] = actionData;
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: caller-supplied vocalize payload is untyped; Record<string, unknown> is the correct boundary type
    async sendItemVocalizeChat(data: Record<string, unknown>): Promise<void> {
        const html = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/item-vocalize-chat.hbs', data);
        await postChatCard(html);
    }
}

export const DHBasicActionManager = new BasicActionManager();
