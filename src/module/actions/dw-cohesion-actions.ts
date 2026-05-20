/**
 * Deathwatch Kill-team Cohesion action handlers (#162 — core.md
 * §"COHESION", p.9351).
 *
 * Three `data-action` handlers wired through `CharacterSheet`'s
 * `DEFAULT_OPTIONS.actions`:
 *
 *   - `dwCohesionRally`              — Free Action Command/Fellowship
 *                                       rally that negates this turn's
 *                                       Cohesion loss.
 *   - `dwCohesionRecoverObjective`   — +1 Cohesion on objective
 *                                       completion (RAW recovery).
 *   - `dwCohesionChallenge`          — d10 ≤ current Cohesion test.
 *
 * Each handler:
 *   1. Reads the current pool from `this.actor.system`.
 *   2. Calls the pure resolver in `~/module/rules/dw-cohesion`.
 *   3. Persists the new pool with `actor.update(...)`.
 *   4. Posts a chat card via `dw-cohesion-chat.hbs`.
 *
 * NO actor-shape assumptions beyond the four DataModel slots contributed
 * by `dw-cohesion-template.ts`. The handler `this` type matches the
 * static-action pattern used elsewhere in the character sheet: a
 * minimal shape that exposes `actor` (for `update` and chat speaker)
 * and a notify hook for failure messages.
 */
import { t } from '../i18n/t.ts';
import {
    recoverCohesion,
    cohesionChallenge,
    type CohesionChallengeResult,
    type CohesionRecoverySource,
    type RecoverCohesionResult,
} from '../rules/dw-cohesion.ts';
import type { I18nKey } from '../types/i18n-keys';

/**
 * Minimal `this` shape exposed by sheet static actions. CharacterSheet
 * is the production caller; the shape is duplicated here so the action
 * module doesn't need to reach back into the applications layer
 * (`sheets-must-not-import-data-models-directly` runs the other way,
 * but the reverse coupling is equally undesirable for a rules-driven
 * action handler).
 */
export interface DwCohesionActionHost {
    readonly actor: {
        readonly id: string;
        readonly name: string;
        readonly system: {
            cohesionMax: number;
            cohesionCurrent: number;
            cohesionLostThisTurn: number;
            rallied: boolean;
        };
        update: (data: Record<string, unknown>) => Promise<unknown>;
    };
    _notify: (type: 'info' | 'warning' | 'error', message: string, options?: Record<string, unknown>) => void;
}

const CHAT_TEMPLATE = 'systems/wh40k-rpg/templates/chat/dw-cohesion-chat.hbs';

/* -------------------------------------------- */
/*  Internal helpers                            */
/* -------------------------------------------- */

interface ChatCardContext {
    gameSystem: 'dw';
    headerKey: I18nKey;
    outcomeKey: I18nKey;
    rolled: number | null;
    cohesionBefore: number;
    cohesionAfter: number;
    cohesionMax: number;
    sourceKey: I18nKey | null;
}

async function postCohesionChat(host: DwCohesionActionHost, ctx: ChatCardContext): Promise<void> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: renderTemplate signature requires AnyObject; the ChatCardContext interface is structurally compatible
    const html = await foundry.applications.handlebars.renderTemplate(CHAT_TEMPLATE, ctx as unknown as Record<string, unknown>);
    // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create payload shape lives outside our shipped types
    const payload = { user: game.user?.id, content: html, speaker: { alias: host.actor.name } } as unknown as Parameters<typeof ChatMessage.create>[0];
    await ChatMessage.create(payload);
}

function reportFailure(host: DwCohesionActionHost, label: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    host._notify('error', `${label}: ${message}`, { duration: 5000 });
    console.error(`${label} error:`, error);
}

/* -------------------------------------------- */
/*  Action: Rally                               */
/* -------------------------------------------- */

/**
 * Squad-Leader rally (Free Action). RAW: a successful Challenging (+0)
 * Command (or Fellowship) test negates this turn's Cohesion loss. The
 * test itself is rolled outside this module (existing characteristic
 * roll plumbing); here we just persist the rallied flag so the
 * AssignDamageData horde branch sees `rallied === true` for the rest
 * of the turn.
 */
export async function dwCohesionRally(this: DwCohesionActionHost, _event: Event, _target: HTMLElement): Promise<void> {
    try {
        if (this.actor.system.rallied) {
            this._notify('info', t('WH40K.DW.Cohesion.Rally.Success'));
            return;
        }
        await this.actor.update({ 'system.rallied': true });
        await postCohesionChat(this, {
            gameSystem: 'dw',
            headerKey: 'WH40K.DW.Cohesion.Rally.Title',
            outcomeKey: 'WH40K.DW.Cohesion.Rally.Success',
            rolled: null,
            cohesionBefore: this.actor.system.cohesionCurrent,
            cohesionAfter: this.actor.system.cohesionCurrent,
            cohesionMax: this.actor.system.cohesionMax,
            sourceKey: null,
        });
    } catch (error: unknown) {
        reportFailure(this, t('WH40K.DW.Cohesion.Rally.Title'), error);
    }
}

/* -------------------------------------------- */
/*  Action: Recover (Objective)                 */
/* -------------------------------------------- */

/**
 * Recover +1 Cohesion via objective-completion. The recovery source is
 * fixed to `objective`; the Fate-point and GM-ruling sources are
 * separate affordances (out of scope for the panel's button row but
 * exposed at the module level for macros).
 */
export async function dwCohesionRecoverObjective(this: DwCohesionActionHost, _event: Event, _target: HTMLElement): Promise<void> {
    try {
        const result: RecoverCohesionResult = recoverCohesion(
            this.actor.system.cohesionCurrent,
            this.actor.system.cohesionMax,
            'objective' satisfies CohesionRecoverySource,
        );
        if (result.gained === 0) {
            this._notify('info', t('WH40K.DW.Cohesion.Recovered'));
            return;
        }
        await this.actor.update({ 'system.cohesionCurrent': result.newCohesion });
        await postCohesionChat(this, {
            gameSystem: 'dw',
            headerKey: 'WH40K.DW.Cohesion.Recovered',
            outcomeKey: 'WH40K.DW.Cohesion.Recovered',
            rolled: null,
            cohesionBefore: this.actor.system.cohesionCurrent,
            cohesionAfter: result.newCohesion,
            cohesionMax: this.actor.system.cohesionMax,
            sourceKey: 'WH40K.DW.Cohesion.Source.Objective',
        });
    } catch (error: unknown) {
        reportFailure(this, t('WH40K.DW.Cohesion.Recovered'), error);
    }
}

/* -------------------------------------------- */
/*  Action: Cohesion Challenge                  */
/* -------------------------------------------- */

/**
 * GM-prompted Cohesion Challenge: roll 1d10; success on ≤ current
 * Cohesion. Failure means the squad fragments for the scene (the
 * follow-on "fragments-for-the-scene" status is out of scope for this
 * round — chat-card text + future scene flag will resolve it).
 */
export async function dwCohesionChallenge(this: DwCohesionActionHost, _event: Event, _target: HTMLElement): Promise<void> {
    try {
        const result: CohesionChallengeResult = cohesionChallenge({
            currentCohesion: this.actor.system.cohesionCurrent,
            rng: (size) => Math.floor(Math.random() * size) + 1,
        });
        await postCohesionChat(this, {
            gameSystem: 'dw',
            headerKey: 'WH40K.DW.Cohesion.Challenge.Title',
            outcomeKey: result.success ? 'WH40K.DW.Cohesion.Challenge.Success' : 'WH40K.DW.Cohesion.Challenge.Failure',
            rolled: result.rolled,
            cohesionBefore: this.actor.system.cohesionCurrent,
            cohesionAfter: this.actor.system.cohesionCurrent,
            cohesionMax: this.actor.system.cohesionMax,
            sourceKey: null,
        });
    } catch (error: unknown) {
        reportFailure(this, t('WH40K.DW.Cohesion.Challenge.Title'), error);
    }
}
