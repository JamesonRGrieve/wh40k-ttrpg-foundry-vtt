/**
 * @file SancticPurityPrompt — Fate-spend dialog for negating a Psychic
 * Phenomena roll via the Emperor's Anathema talent and the Sanctic
 * Purity rider (#131 — beyond.md L877–937).
 *
 * The Phenomena dispatch path calls into this prompt when the actor
 * carries Emperor's Anathema (predicate in `sanctic-purity.ts`) and
 * has at least one Fate point available. The dialog asks whether to
 * spend a single Fate to negate the Phenomena outright. On confirm:
 *
 *   1. Decrement `actor.system.fate.value` by `SANCTIC_PURITY_FATE_COST`.
 *   2. Emit a "Phenomena Negated" chat card noting the spend.
 *   3. Resolve the supplied `onNegate` callback so the Phenomena
 *      dispatch can suppress the original outcome.
 *
 * Pattern reference: `daemonhost-binding-dialog.ts`. Surface only
 * owns the UI + chat-card emission and the Fate write-back; the
 * gating predicate and the constant Fate cost live in the rule
 * module so unit tests can pin them independently.
 */

import type { ApplicationV2Ctor } from '../api/application-types.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';
import { SANCTIC_PURITY_FATE_COST } from '../../rules/sanctic-purity.ts';
import type { WH40KBaseActor } from '../../documents/base-actor.ts';

const { ApplicationV2 } = foundry.applications.api;

/** Action handler bound with a `this` context, matching the Mixin's expectations. */
type ActionHandler = (this: SancticPurityPrompt, event: Event, target: HTMLElement) => Promise<void>;

/**
 * Minimal duck-type for an actor that owns a Fate pool — both the
 * DH2 character DataModel and the NPC DataModel satisfy this shape.
 * Kept narrow so the unit test and Storybook story can supply a
 * stub without standing up a full Foundry actor.
 */
interface ActorWithFate {
    name?: string;
    system?: { fate?: { value?: number } };
    update?: (data: { 'system.fate.value': number }) => Promise<unknown>;
}

/** Constructor options — `actor` is required at the call site. */
export interface SancticPurityPromptOptions extends ApplicationV2Config.DefaultOptions {
    actor?: WH40KBaseActor | ActorWithFate;
    /** Called when the player confirms the spend, after the Fate decrement + chat card. */
    onNegate?: () => void | Promise<void>;
    /** Called when the player declines the spend (the Phenomena roll proceeds). */
    onDecline?: () => void | Promise<void>;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: Handlebars context is an open bag; Record<string, unknown> matches the mixin's return type
interface SancticPurityContext extends Record<string, unknown> {
    actorName: string;
    fateAvailable: number;
    fateCost: number;
    canSpend: boolean;
}

/**
 * Dialog: confirm spending one Fate to negate a Psychic Phenomena
 * roll. The chat card is system-themed via `data-wh40k-system="dh2e"`.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 global lacks the typed constructor Mixin needs; cast through unknown is the established pattern
export default class SancticPurityPrompt extends ApplicationV2Mixin(ApplicationV2 as unknown as ApplicationV2Ctor) {
    /** Actor whose Fate pool funds the negation. */
    declare actor: ActorWithFate | null;
    /** Resolved on spend, after Fate is decremented + chat card emitted. */
    declare onNegate: (() => void | Promise<void>) | null;
    /** Resolved on decline so the Phenomena path proceeds untouched. */
    declare onDecline: (() => void | Promise<void>) | null;

    constructor(options: SancticPurityPromptOptions = {}) {
        super(options);
        this.actor = (options.actor as ActorWithFate | undefined) ?? null;
        this.onNegate = options.onNegate ?? null;
        this.onDecline = options.onDecline ?? null;
    }

    /* -------------------------------------------- */

    /** @override */
    static override DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        tag: 'form',
        classes: ['wh40k-rpg', 'dialog', 'sanctic-purity-prompt', 'standard-form'],
        actions: {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            spend: SancticPurityPrompt.#onSpend as ActionHandler,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            decline: SancticPurityPrompt.#onDecline as ActionHandler,
        },
        position: {
            width: 480,
        },
        window: {
            title: 'WH40K.SancticPurity.PromptTitle',
            resizable: false,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static override PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/sanctic-purity-prompt.hbs',
            classes: [],
            scrollable: [],
        },
    };

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<SancticPurityContext> {
        const context = (await super._prepareContext(options)) as SancticPurityContext;
        const fateAvailable = this.#readFate();
        return {
            ...context,
            actorName: this.actor?.name ?? '',
            fateAvailable,
            fateCost: SANCTIC_PURITY_FATE_COST,
            canSpend: fateAvailable >= SANCTIC_PURITY_FATE_COST,
        };
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    static async #onSpend(this: SancticPurityPrompt, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        const current = this.#readFate();
        if (current < SANCTIC_PURITY_FATE_COST) {
            await this.close();
            return;
        }

        // 1. Decrement Fate on the actor.
        if (this.actor?.update) {
            const next = current - SANCTIC_PURITY_FATE_COST;
            await this.actor.update({ 'system.fate.value': next });
        }

        // 2. Emit the "Phenomena Negated" chat card.
        await this.#emitChat(current);

        // 3. Notify the Phenomena dispatch that the outcome is suppressed.
        if (this.onNegate) await this.onNegate();

        await this.close();
    }

    /* -------------------------------------------- */

    static async #onDecline(this: SancticPurityPrompt, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        if (this.onDecline) await this.onDecline();
        await this.close();
    }

    /* -------------------------------------------- */

    /** Read the actor's current Fate value, coercing missing / non-numeric to 0. */
    #readFate(): number {
        const raw = this.actor?.system?.fate?.value;
        if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
        return Math.max(0, Math.trunc(raw));
    }

    /* -------------------------------------------- */

    async #emitChat(fateBefore: number): Promise<void> {
        const templateData = {
            actorName: this.actor?.name ?? '',
            fateCost: SANCTIC_PURITY_FATE_COST,
            fateBefore,
            fateAfter: Math.max(0, fateBefore - SANCTIC_PURITY_FATE_COST),
            gameSystem: 'dh2e',
        };
        const html = await foundry.applications.handlebars.renderTemplate(
            'systems/wh40k-rpg/templates/chat/sanctic-purity-negated-chat.hbs',
            templateData,
        );
        // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create payload shape lives outside our shipped types
        const payload = { user: game.user?.id, content: html } as unknown as Parameters<typeof ChatMessage.create>[0];
        await ChatMessage.create(payload);
    }
}

/* -------------------------------------------- */
/*  Helper                                      */
/* -------------------------------------------- */

/** Convenience opener for the prompt. */
export function openSancticPurityPrompt(options: SancticPurityPromptOptions = {}): void {
    const prompt = new SancticPurityPrompt(options);
    void prompt.render({ force: true });
}
