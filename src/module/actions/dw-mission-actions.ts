/**
 * Deathwatch Mission framework action handlers (#169 — core.md
 * §"MISSIONS" / §"REWARDS").
 *
 * Three `data-action` handlers wired through `CharacterSheet`'s
 * `DEFAULT_OPTIONS.actions`:
 *
 *   - `dwToggleObjective`     — cycle the objective lifecycle status
 *                                pending → complete → failed → pending.
 *   - `dwToggleComplication`  — flip the GM-trigger flag for a single
 *                                complication entry.
 *   - `dwCompleteMission`     — call `computeMissionRewards`, apply the
 *                                Renown / XP / Cohesion deltas, clear
 *                                `activeMission`, post the reward card.
 *
 * Reward application:
 *   - Renown is added via `awardRenown` (engine clamps).
 *   - XP is added directly to `system.experience.total` (and `available`
 *     if present); the awarded total is non-negative per the engine.
 *   - Cohesion recovery is added to `system.cohesionCurrent` clamped by
 *     `system.cohesionMax` (matches the `dw-cohesion` engine's per-tick
 *     clamp shape).
 *
 * The handler reaches the data through `this.actor.system` only — no
 * direct DataModel imports. This stays consistent with the other DW
 * action modules and keeps the data → applications dependency direction
 * intact.
 */

import type { DwActiveMissionData, DwMissionComplicationData, DwMissionObjectiveData } from '../data/actor/mixins/dw-mission-template.ts';
import { t } from '../i18n/t.ts';
import { postChatCard } from '../rolls/roll-helpers.ts';
import { computeMissionRewards, type DwMission, type MissionObjective, type MissionRewardResult, type ObjectiveStatus } from '../rules/dw-mission.ts';
import { awardRenown } from '../rules/dw-renown.ts';
import type { I18nKey } from '../types/i18n-keys';

/* -------------------------------------------- */
/*  Host shape                                  */
/* -------------------------------------------- */

/**
 * Minimal actor shape the action handlers depend on. The sheet binds
 * `this` to the host; we keep the type narrow so the action module
 * never reaches into framework surfaces it does not own.
 */
export interface DwMissionActionHost {
    readonly actor: {
        readonly id: string;
        readonly name: string;
        readonly system: {
            activeMission: DwActiveMissionData | null;
            renown: number;
            cohesionCurrent: number;
            cohesionMax: number;
            experience?: { total?: number; available?: number };
        };
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Document.update() signature accepts arbitrary diff records and returns the resolved Document or undefined
        update: (data: Record<string, unknown>) => Promise<unknown>;
    };
    // eslint-disable-next-line no-restricted-syntax -- boundary: ui.notifications.notify() forwards arbitrary options to Foundry's notification API
    _notify: (type: 'info' | 'warning' | 'error', message: string, options?: Record<string, unknown>) => void;
}

const CHAT_TEMPLATE = 'systems/wh40k-rpg/templates/chat/dw-mission-reward-chat.hbs';

const RATING_LABEL_KEYS = {
    standard: 'WH40K.DW.Mission.Rating.Standard',
    extended: 'WH40K.DW.Mission.Rating.Extended',
    priority: 'WH40K.DW.Mission.Rating.Priority',
    critical: 'WH40K.DW.Mission.Rating.Critical',
} as const satisfies Record<DwActiveMissionData['rating'], I18nKey>;

/* -------------------------------------------- */
/*  Internal helpers                            */
/* -------------------------------------------- */

const STATUS_CYCLE: Record<ObjectiveStatus, ObjectiveStatus> = {
    pending: 'complete',
    complete: 'failed',
    failed: 'pending',
};

// eslint-disable-next-line no-restricted-syntax -- boundary: catch-clause exception payload is intrinsically unknown; narrowed on the next line via `instanceof Error`
function reportFailure(host: DwMissionActionHost, label: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    host._notify('error', `${label}: ${message}`, { duration: 5000 });
    console.error(`${label} error:`, error);
}

/**
 * Locate the target id stored on the clicked element. Foundry's static-
 * action dispatcher passes the action element as `target`; the panel
 * template puts the objective/complication id on a `data-*-id` attribute.
 */
function readDatasetId(target: HTMLElement, key: 'objectiveId' | 'complicationId'): string | null {
    const direct = target.dataset[key];
    if (typeof direct === 'string' && direct.length > 0) return direct;
    // Fall back to the nearest ancestor that carries the dataset (handles
    // click bubbling through inline <i>/<span> children inside the button).
    const ancestor = target.closest<HTMLElement>(`[data-${key === 'objectiveId' ? 'objective-id' : 'complication-id'}]`);
    const fromAncestor = ancestor?.dataset[key];
    return typeof fromAncestor === 'string' && fromAncestor.length > 0 ? fromAncestor : null;
}

function toEngineMission(active: DwActiveMissionData): DwMission {
    const objectives: MissionObjective[] = active.objectives.map((objective) => ({
        id: objective.id,
        description: objective.description,
        renownReward: objective.renownReward,
        xpReward: objective.xpReward,
        status: objective.status,
    }));
    return {
        id: active.id,
        name: active.name,
        rating: active.rating,
        objectives,
        complications: active.complications.map((complication) => ({
            id: complication.id,
            description: complication.description,
            renownPenalty: complication.renownPenalty,
        })),
    };
}

interface ChatObjectiveCtx {
    id: string;
    description: string;
    renown: number;
    xp: number;
}

interface ChatComplicationCtx {
    id: string;
    description: string;
    renownPenalty: number;
}

interface ChatCardContext {
    gameSystem: 'dw';
    mission: {
        id: string;
        name: string;
        rating: DwActiveMissionData['rating'];
        ratingLabel: string;
    };
    reward: {
        totalRenown: number;
        totalXp: number;
        cohesionRecovered: number;
        perObjective: ChatObjectiveCtx[];
        complicationsTriggered: ChatComplicationCtx[];
    };
}

async function postMissionRewardChat(host: DwMissionActionHost, ctx: ChatCardContext): Promise<void> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: renderTemplate signature requires AnyObject; the ChatCardContext interface is structurally compatible
    const html = await foundry.applications.handlebars.renderTemplate(CHAT_TEMPLATE, ctx as unknown as Record<string, unknown>);
    await postChatCard(html, { speaker: { alias: host.actor.name } });
}

/* -------------------------------------------- */
/*  Action: Toggle objective status             */
/* -------------------------------------------- */

/**
 * Cycle a single objective's status through pending → complete → failed
 * → pending. No-op if the active mission is null or the objective id is
 * not present in the list.
 */
export async function dwToggleObjective(this: DwMissionActionHost, _event: Event, target: HTMLElement): Promise<void> {
    try {
        const active = this.actor.system.activeMission;
        if (active === null) {
            this._notify('warning', t('WH40K.DW.Mission.None'));
            return;
        }
        const objectiveId = readDatasetId(target, 'objectiveId');
        if (objectiveId === null) return;

        const found = active.objectives.some((o) => o.id === objectiveId);
        if (!found) return;
        const nextObjectives: DwMissionObjectiveData[] = active.objectives.map((objective) => {
            if (objective.id !== objectiveId) return objective;
            return { ...objective, status: STATUS_CYCLE[objective.status] };
        });

        await this.actor.update({ 'system.activeMission.objectives': nextObjectives });
    } catch (error: unknown) {
        reportFailure(this, t('WH40K.DW.Mission.Objective.Toggle'), error);
    }
}

/* -------------------------------------------- */
/*  Action: Toggle complication                 */
/* -------------------------------------------- */

/**
 * Flip the GM-trigger flag for a single complication.
 */
export async function dwToggleComplication(this: DwMissionActionHost, _event: Event, target: HTMLElement): Promise<void> {
    try {
        const active = this.actor.system.activeMission;
        if (active === null) {
            this._notify('warning', t('WH40K.DW.Mission.None'));
            return;
        }
        const complicationId = readDatasetId(target, 'complicationId');
        if (complicationId === null) return;

        const found = active.complications.some((c) => c.id === complicationId);
        if (!found) return;
        const nextComplications: DwMissionComplicationData[] = active.complications.map((complication) => {
            if (complication.id !== complicationId) return complication;
            return { ...complication, triggered: !complication.triggered };
        });

        await this.actor.update({ 'system.activeMission.complications': nextComplications });
    } catch (error: unknown) {
        reportFailure(this, t('WH40K.DW.Mission.Complication.Toggle'), error);
    }
}

/* -------------------------------------------- */
/*  Action: Complete mission (payout)           */
/* -------------------------------------------- */

/**
 * Settle the active mission: compute rewards via the pure engine, apply
 * Renown / XP / Cohesion deltas, post the chat card, and clear
 * `activeMission` back to `null`. No-op if no mission is active.
 */
export async function dwCompleteMission(this: DwMissionActionHost, _event: Event, _target: HTMLElement): Promise<void> {
    try {
        const active = this.actor.system.activeMission;
        if (active === null) {
            this._notify('warning', t('WH40K.DW.Mission.None'));
            return;
        }

        const triggeredIds: string[] = active.complications.filter((complication) => complication.triggered).map((complication) => complication.id);

        const engineMission = toEngineMission(active);
        const reward: MissionRewardResult = computeMissionRewards(engineMission, triggeredIds);

        const currentRenown = this.actor.system.renown;
        const nextRenown = awardRenown(currentRenown, reward.totalRenown);

        const cohesionMax = this.actor.system.cohesionMax;
        const nextCohesion =
            cohesionMax > 0 ? Math.min(cohesionMax, this.actor.system.cohesionCurrent + reward.cohesionRecovered) : this.actor.system.cohesionCurrent;

        // eslint-disable-next-line no-restricted-syntax -- boundary: assembled diff payload for Foundry Document.update(); keys use dotted system paths
        const updates: Record<string, unknown> = {
            'system.activeMission': null,
            'system.renown': nextRenown,
            'system.cohesionCurrent': nextCohesion,
        };

        if (reward.totalXp > 0) {
            const experience = this.actor.system.experience;
            const currentTotal = typeof experience?.total === 'number' ? experience.total : 0;
            // `available` is derived from total − spent at prepare time (#240), so bumping
            // `total` is sufficient; an explicit `available` write would just be overwritten.
            updates['system.experience.total'] = currentTotal + reward.totalXp;
        }

        await this.actor.update(updates);

        // Build description-rich chat context (the engine returns per-objective
        // ids only; pair them with the descriptions from the persisted record).
        const descriptionById = new Map<string, string>(active.objectives.map((objective) => [objective.id, objective.description]));
        const perObjective: ChatObjectiveCtx[] = reward.perObjective.map((entry) => ({
            id: entry.id,
            description: descriptionById.get(entry.id) ?? entry.id,
            renown: entry.renown,
            xp: entry.xp,
        }));
        const complicationsTriggered: ChatComplicationCtx[] = reward.complicationsTriggered.map((complication) => ({
            id: complication.id,
            description: complication.description,
            renownPenalty: complication.renownPenalty,
        }));

        await postMissionRewardChat(this, {
            gameSystem: 'dw',
            mission: {
                id: active.id,
                name: active.name,
                rating: active.rating,
                ratingLabel: t(RATING_LABEL_KEYS[active.rating]),
            },
            reward: {
                totalRenown: reward.totalRenown,
                totalXp: reward.totalXp,
                cohesionRecovered: reward.cohesionRecovered,
                perObjective,
                complicationsTriggered,
            },
        });
    } catch (error: unknown) {
        reportFailure(this, t('WH40K.DW.Mission.Complete.Title'), error);
    }
}
