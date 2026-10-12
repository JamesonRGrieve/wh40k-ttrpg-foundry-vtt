/**
 * @file ReinforcementCallDialog — the GM calls a Reinforcement Character into
 * play (DH2 core pp. 294–295, #77).
 *
 * Opened from the RC's NPC sheet. The GM picks the calling Acolyte, who needs
 * Influence ≥ the RC's Influence Minimum. The GM records what the rest of the
 * warband contributes (at most half the cost, rounded up), applies the printed
 * Peer-talent discount if the caller has that talent, and sets any GM cost
 * adjustment. On confirm, everyone's Influence drops by what they paid, the
 * warband's Subtlety drops by the final cost, and a chat card records the call.
 *
 * The RC's terms are compendium data on the NPC (`system.reinforcement`). All
 * the math is the pure `rules/reinforcement.ts` through
 * `buildReinforcementCallView`.
 */

import type { GameSystemId } from '../../config/game-systems/types.ts';
import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import { t } from '../../i18n/t.ts';
import {
    buildReinforcementCallView,
    fixedPeerDiscount,
    type ReinforcementCallView,
    type ReinforcementCandidate,
    type ReinforcementTerms,
} from './reinforcement-call-view.ts';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const CHAT_TEMPLATE = 'systems/wh40k-rpg/templates/chat/reinforcement-call-chat.hbs';

/** The NPC surface the dialog reads. */
interface ReinforcementActor {
    readonly uuid: string | null;
    readonly name: string;
    readonly system: { readonly isReinforcement: boolean; readonly reinforcement: ReinforcementTerms };
}

/** A calling / contributing Acolyte: a DH2 character with an Influence score. */
interface InfluenceActor extends ReinforcementCandidate {
    readonly actor: WH40KBaseActor;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 context is a free-form template payload; Record<string, unknown> is the correct base shape
interface ReinforcementCallContext extends Record<string, unknown> {
    rcName: string;
    view: ReinforcementCallView;
    peerFormula: boolean;
    peerApplied: boolean;
}

/** The DH2 player characters who can call or contribute, with their Influence. */
function warbandCandidates(): InfluenceActor[] {
    const out: InfluenceActor[] = [];
    for (const actor of game.actors.contents) {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Actor#system is the per-type DataModel union; influence + gameSystem live on character.ts only
        const sys = actor.system as unknown as { gameSystem?: string; influence?: number };
        if (!actor.hasPlayerOwner || sys.gameSystem !== 'dh2' || typeof sys.influence !== 'number') continue;
        out.push({ id: actor.id, name: actor.name, influence: sys.influence, actor });
    }
    return out;
}

export default class ReinforcementCallDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    /** @override */
    static override DEFAULT_OPTIONS = {
        classes: ['wh40k-rpg', 'reinforcement-call-dialog'],
        tag: 'form',
        window: {
            title: 'WH40K.Reinforcement.DialogTitle',
            icon: 'fa-solid fa-people-arrows',
            minimizable: false,
            resizable: true,
            contentClasses: ['standard-form'],
        },
        position: {
            width: 520,
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry accepts 'auto' at runtime but types declare number
            height: 'auto' as unknown as number,
        },
        form: {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            handler: ReinforcementCallDialog.#onFormChange,
            submitOnChange: true,
            closeOnSubmit: false,
        },
        actions: {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            callReinforcement: ReinforcementCallDialog.#onCall,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            cancel: ReinforcementCallDialog.#onCancel,
        },
    };

    /** @override */
    static PARTS = {
        content: {
            template: 'systems/wh40k-rpg/templates/dialogs/reinforcement-call.hbs',
        },
    };

    readonly #rc: ReinforcementActor;
    readonly #candidates: InfluenceActor[] = warbandCandidates();
    #callerId: string;
    #contributions: Record<string, number> = {};
    #peerApplied = false;
    #peerDiscount = 0;
    #gmAdjustment = 0;

    constructor(rc: ReinforcementActor) {
        super();
        this.#rc = rc;
        const minimum = rc.system.reinforcement.influenceMinimum;
        const eligible = minimum === null ? undefined : this.#candidates.find((c) => c.influence >= minimum);
        this.#callerId = (eligible ?? this.#candidates.at(0))?.id ?? '';
    }

    /** @override */
    get title(): string {
        return game.i18n.format('WH40K.Reinforcement.DialogTitleFor', { name: this.#rc.name });
    }

    /** Open the call dialog (GM only) for a DH2 Reinforcement Character. */
    static open(rc: ReinforcementActor, line: GameSystemId | null): ReinforcementCallDialog | null {
        if (line !== 'dh2' || !rc.system.isReinforcement) return null;
        if (!game.user.isGM) {
            ui.notifications.warn(t('WH40K.Reinforcement.GmOnly'));
            return null;
        }
        const dialog = new ReinforcementCallDialog(rc);
        void dialog.render(true);
        return dialog;
    }

    #view(): ReinforcementCallView {
        return buildReinforcementCallView(this.#rc.system.reinforcement, this.#candidates, {
            callerId: this.#callerId,
            contributions: this.#contributions,
            peerDiscount: this.#peerDiscount,
            gmAdjustment: this.#gmAdjustment,
        });
    }

    /** @override */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<ReinforcementCallContext> {
        const context = await super._prepareContext(options);
        return {
            ...context,
            rcName: this.#rc.name,
            view: this.#view(),
            peerFormula: fixedPeerDiscount(this.#rc.system.reinforcement.peerDiscount.amount) === null,
            peerApplied: this.#peerApplied,
        };
    }

    /** Roll (or read) the printed Peer discount when it is switched on. */
    async #resolvePeerDiscount(applied: boolean): Promise<void> {
        if (applied === this.#peerApplied) return;
        this.#peerApplied = applied;
        if (!applied) {
            this.#peerDiscount = 0;
            return;
        }
        const amount = this.#rc.system.reinforcement.peerDiscount.amount;
        const fixed = fixedPeerDiscount(amount);
        if (fixed !== null) {
            this.#peerDiscount = fixed;
            return;
        }
        const roll = await new Roll(amount).evaluate();
        this.#peerDiscount = Math.max(0, Math.trunc(roll.total));
    }

    static async #onFormChange(this: ReinforcementCallDialog, _event: Event, _form: HTMLFormElement, formData: FormDataExtended): Promise<void> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: FormDataExtended.object is Foundry's untyped flat form payload
        const data = formData.object as Record<string, string | number | boolean | null>;
        const caller = data['callerId'];
        if (typeof caller === 'string') this.#callerId = caller;
        const adjustment = Number(data['gmAdjustment']);
        this.#gmAdjustment = Number.isFinite(adjustment) ? Math.trunc(adjustment) : 0;
        const contributions: Record<string, number> = {};
        for (const candidate of this.#candidates) {
            const amount = Number(data[`contribution.${candidate.id}`]);
            contributions[candidate.id] = Number.isFinite(amount) ? Math.max(0, Math.trunc(amount)) : 0;
        }
        this.#contributions = contributions;
        await this.#resolvePeerDiscount(data['peerApplied'] === true);
        await this.render();
    }

    static async #onCall(this: ReinforcementCallDialog): Promise<void> {
        const view = this.#view();
        const result = view.result;
        if (result?.ok !== true) return;
        const plan = result.plan;
        const caller = this.#candidates.find((c) => c.id === this.#callerId);
        if (caller === undefined) return;
        const payments = [{ candidate: caller, amount: plan.callerPays }];
        for (const contribution of plan.contributions) {
            const candidate = this.#candidates.find((c) => c.id === contribution.id);
            if (candidate !== undefined) payments.push({ candidate, amount: contribution.amount });
        }
        for (const { candidate, amount } of payments) {
            // eslint-disable-next-line no-await-in-loop -- sequential Influence spends, one actor at a time
            await candidate.actor.update({ 'system.influence': Math.max(0, candidate.influence - amount) });
        }
        // Attribute the loss to the RC; an unsaved actor has no UUID, so it counts as a GM adjustment.
        await caller.actor.applySubtlety(-plan.subtletyLoss, this.#rc.uuid ?? 'manual');

        const content = await foundry.applications.handlebars.renderTemplate(CHAT_TEMPLATE, {
            gameSystem: 'dh2',
            rcName: this.#rc.name,
            callerName: caller.name,
            baseCost: view.baseCost,
            peer: view.peer,
            peerDiscount: view.peerDiscount,
            gmAdjustment: view.gmAdjustment,
            finalCost: plan.finalCost,
            payments: payments.map(({ candidate, amount }) => ({ name: candidate.name, amount })),
            subtletyLoss: plan.subtletyLoss,
        });
        // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create accepts a loose document-data shape
        await ChatMessage.create({ user: game.user.id, content, speaker: ChatMessage.getSpeaker({ actor: caller.actor }) });
        await this.close();
    }

    static async #onCancel(this: ReinforcementCallDialog): Promise<void> {
        await this.close();
    }
}
