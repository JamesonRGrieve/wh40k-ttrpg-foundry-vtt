/**
 * @file RightStuffDialog — surfaces the Ace role's "Right Stuff" Fate
 * spend (without.md L948-L980, #100): choose Operate or Survival, spend
 * one Fate, auto-succeed with DoS = Agility bonus.
 *
 * The dialog is a thin UI shell over `spendRightStuff()` in
 * `src/module/rules/ace-role.ts`. Eligibility (Ace role + ≥1 Fate +
 * non-IM game system) is checked before opening and re-checked in
 * `_prepareContext` so the button disables if state changes mid-render.
 * Skill choice is bound to `RIGHT_STUFF.applicableSkills` from
 * `xenos-features.ts` — the dialog never invents the skill list.
 *
 * Sister to `medicae-mechadendrite-dialog.ts`; identical scaffolding
 * shape (ApplicationV2Mixin + static action handlers + thin template).
 */

import {
    actorHasFatePoints,
    actorIsAce,
    canSpendRightStuff,
    getAgilityBonus,
    isRightStuffSkill,
    spendRightStuff,
    type RightStuffSkill,
} from '../../rules/ace-role.ts';
import { RIGHT_STUFF } from '../../rules/xenos-features.ts';
import type { WH40KBaseActorDocument } from '../../types/global.d.ts';
import type { ApplicationV2Ctor } from '../api/application-types.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';

const { ApplicationV2 } = foundry.applications.api;

type ActionHandler = (this: RightStuffDialog, event: Event, target: HTMLElement) => Promise<void>;

interface SkillChoice {
    key: RightStuffSkill;
    labelKey: string;
}

const SKILL_CHOICES: ReadonlyArray<SkillChoice> = Object.freeze(
    RIGHT_STUFF.applicableSkills.map((key) => ({
        key,
        labelKey: `WH40K.RightStuff.Skill.${key}`,
    })),
);

// eslint-disable-next-line no-restricted-syntax -- boundary: Handlebars context is an open bag; Record<string, unknown> matches the mixin's return type
interface RightStuffContext extends Record<string, unknown> {
    actorName: string;
    isAce: boolean;
    hasFate: boolean;
    eligible: boolean;
    agilityBonus: number;
    fateValue: number;
    skills: ReadonlyArray<SkillChoice>;
    selectedSkill: RightStuffSkill;
    gameSystem: string;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 global lacks the typed constructor Mixin needs; cast through unknown is the established pattern (matches MedicaeMechadendriteDialog)
export default class RightStuffDialog extends ApplicationV2Mixin(ApplicationV2 as unknown as ApplicationV2Ctor) {
    declare actor: WH40KBaseActorDocument | null;
    #selectedSkill: RightStuffSkill;

    constructor(options: ApplicationV2Config.DefaultOptions & { actor?: WH40KBaseActorDocument; skill?: RightStuffSkill } = {}) {
        super(options);
        const o = options as { actor?: WH40KBaseActorDocument; skill?: RightStuffSkill };
        this.actor = o.actor ?? null;
        this.#selectedSkill = o.skill ?? RIGHT_STUFF.applicableSkills[0];
    }

    /** @override */
    static override DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        tag: 'form',
        classes: ['wh40k-rpg', 'dialog', 'right-stuff-dialog', 'standard-form'],
        actions: {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            selectSkill: RightStuffDialog.#onSelectSkill,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            spendRightStuff: RightStuffDialog.#onSpend,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            cancel: RightStuffDialog.#onCancel,
        },
        position: { width: 480 },
        window: {
            title: 'WH40K.RightStuff.DialogTitle',
            resizable: false,
        },
    };

    /** @override */
    static override PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/right-stuff-dialog.hbs',
            classes: [],
            scrollable: [],
        },
    };

    /** @inheritDoc */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<RightStuffContext> {
        const context = (await super._prepareContext(options)) as RightStuffContext;
        const actor = this.actor;
        const isAce = actor !== null && actorIsAce(actor);
        const hasFate = actor !== null && actorHasFatePoints(actor);
        const eligible = actor !== null && canSpendRightStuff(actor);
        const gameSystem = (actor?.system as { gameSystem?: string } | undefined)?.gameSystem ?? '';
        const fate = (actor?.system as { fate?: { value?: number } } | undefined)?.fate;
        return {
            ...context,
            actorName: actor?.name ?? '',
            isAce,
            hasFate,
            eligible,
            agilityBonus: actor === null ? 0 : getAgilityBonus(actor),
            fateValue: fate?.value ?? 0,
            skills: SKILL_CHOICES,
            selectedSkill: this.#selectedSkill,
            gameSystem,
        };
    }

    static async #onSelectSkill(this: RightStuffDialog, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const key = target.dataset['skill'];
        if (key !== undefined && isRightStuffSkill(key)) {
            this.#selectedSkill = key;
            await this.render({ force: false });
        }
    }

    static async #onSpend(this: RightStuffDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        if (this.actor === null || !canSpendRightStuff(this.actor)) {
            await this.close();
            return;
        }
        await spendRightStuff(this.actor, this.#selectedSkill);
        await this.close();
    }

    static async #onCancel(this: RightStuffDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        await this.close();
    }
}

/** Convenience opener; sheets / chat-card buttons hook into this. */
export function openRightStuffDialog(opts: { actor?: WH40KBaseActorDocument; skill?: RightStuffSkill } = {}): void {
    const dialog = new RightStuffDialog(opts);
    void dialog.render({ force: true });
}
