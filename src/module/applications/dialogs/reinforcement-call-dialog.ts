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
 * An RC may also print terms for its caller (the Thrice-Bound Daemonhost,
 * Enemies Beyond p. 38): a required skill rank, which blocks a caller without
 * it, and Corruption the caller gains, which is rolled on confirm and added to
 * their Corruption. That update queues any Malignancy Test the gain crosses
 * (`WH40KAcolyte._preUpdate`).
 *
 * The RC's terms are compendium data on the NPC (`system.reinforcement`). All
 * the math is the pure `rules/reinforcement.ts` through
 * `buildReinforcementCallView`.
 */

import type { GameSystemId } from '../../config/game-systems/types.ts';
import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import { t } from '../../i18n/t.ts';
import {
    actorSkillRank,
    buildReinforcementCallView,
    fixedAmount,
    requiredCallerRank,
    requiredSkillLabel,
    type ReinforcementCallView,
    type ReinforcementCandidate,
    type ReinforcementCallerTerms,
    type ReinforcementTerms,
} from './reinforcement-call-view.ts';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const CHAT_TEMPLATE = 'systems/wh40k-rpg/templates/chat/reinforcement-call-chat.hbs';

/** The NPC surface the dialog reads. */
interface ReinforcementActor {
    readonly uuid: string | null;
    readonly name: string;
    readonly system: {
        readonly isReinforcement: boolean;
        readonly reinforcement: ReinforcementTerms;
        /** A skill key's display label (the NPC data model's catalog lookup). */
        skillLabel: (skillKey: string) => string;
    };
}

/** A calling / contributing Acolyte: a DH2 character with an Influence score. */
interface InfluenceActor extends ReinforcementCandidate {
    readonly actor: WH40KBaseActor;
    /** Their Corruption points. */
    readonly corruption: number;
}

/** The character surface the call reads: line, Influence, Corruption and skill ranks. */
interface CallerSystem {
    gameSystem?: string;
    influence?: number;
    corruption?: number;
    skills?: Parameters<typeof actorSkillRank>[0];
}

// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 context is a free-form template payload; Record<string, unknown> is the correct base shape
interface ReinforcementCallContext extends Record<string, unknown> {
    rcName: string;
    view: ReinforcementCallView;
    peerFormula: boolean;
    peerApplied: boolean;
}

/**
 * The DH2 player characters who can call or contribute, with their Influence,
 * Corruption and rank in the skill the RC requires of its caller.
 */
function warbandCandidates(caller: ReinforcementCallerTerms): InfluenceActor[] {
    const out: InfluenceActor[] = [];
    for (const actor of game.actors.contents) {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Actor#system is the per-type DataModel union; influence + gameSystem live on character.ts only
        const sys = actor.system as unknown as CallerSystem;
        if (!actor.hasPlayerOwner || sys.gameSystem !== 'dh2' || typeof sys.influence !== 'number') continue;
        const skillRank = caller.skill === '' || sys.skills === undefined ? 0 : actorSkillRank(sys.skills, caller.skill, caller.specialization);
        out.push({ id: actor.id, name: actor.name, influence: sys.influence, skillRank, corruption: sys.corruption ?? 0, actor });
    }
    return out;
}

/** Roll (or read) a printed amount: a plain number, or a dice formula. Blank is 0. */
async function resolveAmount(amount: string): Promise<number> {
    const fixed = fixedAmount(amount);
    if (fixed !== null) return fixed;
    if (amount.trim() === '') return 0;
    const roll = await new Roll(amount).evaluate();
    return Math.max(0, Math.trunc(roll.total));
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
    readonly #candidates: InfluenceActor[];
    #callerId: string;
    #contributions: Record<string, number> = {};
    #peerApplied = false;
    #peerDiscount = 0;
    #gmAdjustment = 0;

    constructor(rc: ReinforcementActor) {
        super();
        this.#rc = rc;
        this.#candidates = warbandCandidates(rc.system.reinforcement.caller);
        const minimum = rc.system.reinforcement.influenceMinimum;
        const rank = requiredCallerRank(rc.system.reinforcement.caller) ?? 0;
        const eligible = minimum === null ? undefined : this.#candidates.find((c) => c.influence >= minimum && c.skillRank >= rank);
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
        const terms = this.#rc.system.reinforcement;
        return buildReinforcementCallView(
            terms,
            this.#candidates,
            {
                callerId: this.#callerId,
                contributions: this.#contributions,
                peerDiscount: this.#peerDiscount,
                gmAdjustment: this.#gmAdjustment,
            },
            // An NPC has no PC-style `skills` rows: the label comes from its skill catalog.
            requiredSkillLabel((skill) => this.#rc.system.skillLabel(skill), terms.caller),
        );
    }

    /** @override */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<ReinforcementCallContext> {
        const context = await super._prepareContext(options);
        return {
            ...context,
            rcName: this.#rc.name,
            view: this.#view(),
            peerFormula: fixedAmount(this.#rc.system.reinforcement.peerDiscount.amount) === null,
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
        this.#peerDiscount = await resolveAmount(this.#rc.system.reinforcement.peerDiscount.amount);
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

        // The caller's printed Corruption (Daemonhost: 1d5). Raising system.corruption
        // queues any Malignancy Test the gain crosses, in the same write.
        const corruptionFormula = this.#rc.system.reinforcement.caller.corruption.trim();
        const corruptionGained = await resolveAmount(corruptionFormula);
        if (corruptionGained > 0) await caller.actor.update({ 'system.corruption': caller.corruption + corruptionGained });

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
            corruptionGained,
            corruptionFormula,
        });
        // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create accepts a loose document-data shape
        await ChatMessage.create({ user: game.user.id, content, speaker: ChatMessage.getSpeaker({ actor: caller.actor }) });
        await this.close();
    }

    static async #onCancel(this: ReinforcementCallDialog): Promise<void> {
        await this.close();
    }
}
