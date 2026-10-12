/**
 * @file HazardDialog — GM-only dialog that resolves an environmental hazard
 * (Falling, Suffocation) for the selected tokens' actors (#118).
 *
 * Each subject resolves against its OWN game line through `rules/hazards.ts`
 * (the view-model lives in `hazard-view.ts`):
 *
 * - **Falling** rolls the line's damage formula, picks a random hit location and
 *   posts a card whose apply button routes the hit through the standard
 *   damage-assignment path (armour ignored, the struck location's Toughness
 *   Bonus still applies). The rolled total is hoverable: die + fall bonus.
 * - **Suffocation** applies the line's Suffocating condition (Path C, when the
 *   line's condition catalog declares one) and posts the breath allotment, the
 *   per-interval Toughness test and what follows once the breath runs out.
 *
 * Opened from the WH40K scene-control group (`hooks-manager.ts`).
 */

import { t } from '../../i18n/t.ts';
import { emitChatFromTemplate, roll1d100 } from '../../rolls/roll-helpers.ts';
import { createConditionEffect } from '../../rules/active-effects.ts';
import { bearerLine, conditionEffectData } from '../../rules/condition-registry.ts';
import {
    FALLING_DAMAGE_TYPE,
    fallingRuleKind,
    getFallingDamageBonus,
    SUFFOCATION_ENDGAME_DAMAGE,
    SUFFOCATION_FATIGUE_PER_FAILURE,
} from '../../rules/hazards.ts';
import { DEFAULT_HIT_LOCATION, getHitLocationForRoll, hitLocationLabel } from '../../rules/hit-locations.ts';
import type { WH40KBaseActorDocument } from '../../types/global.d.ts';
import type { ApplicationV2Ctor } from '../api/application-types.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';
import { prepareModifierTooltipData } from '../components/wh40k-tooltip.ts';
import {
    buildHazardSubjectView,
    canResolveHazard,
    HAZARD_KINDS,
    type HazardKind,
    type HazardSubject,
    type HazardSubjectView,
    isHazardKind,
} from './hazard-view.ts';

const { ApplicationV2 } = foundry.applications.api;

const FALLING_CHAT_TEMPLATE = 'systems/wh40k-rpg/templates/chat/hazard-falling-chat.hbs';
const SUFFOCATION_CHAT_TEMPLATE = 'systems/wh40k-rpg/templates/chat/hazard-suffocation-chat.hbs';

/** Status id of the condition a suffocating subject gains (Path C). */
const SUFFOCATING_CONDITION = 'suffocating';

/** Opening fall height; the GM edits it per fall. */
const DEFAULT_FALL_METRES = 3;

const KIND_LABEL_KEYS = {
    falling: 'WH40K.Hazard.Falling.Title',
    suffocation: 'WH40K.Hazard.Suffocation.Title',
} as const satisfies Record<HazardKind, string>;

// eslint-disable-next-line no-restricted-syntax -- boundary: Handlebars context is an open bag; Record<string, unknown> matches the mixin's return type
interface HazardContext extends Record<string, unknown> {
    kinds: Array<{ value: HazardKind; labelKey: string; selected: boolean }>;
    isFalling: boolean;
    metres: number;
    strenuous: boolean;
    subjects: HazardSubjectView[];
    cannotResolve: boolean;
}

interface SelectedActor {
    actor: WH40KBaseActorDocument;
    uuid: string;
}

/** The actors behind the GM's currently controlled tokens, de-duplicated by uuid. */
function selectedActors(): SelectedActor[] {
    const actors = new Map<string, SelectedActor>();
    for (const token of canvas.tokens?.controlled ?? []) {
        const actor = token.actor;
        const uuid = actor?.uuid ?? null;
        if (actor !== null && uuid !== null) actors.set(uuid, { actor, uuid });
    }
    return [...actors.values()];
}

function toSubject({ actor, uuid }: SelectedActor): HazardSubject {
    const toughness = actor.getCharacteristicFuzzy('toughness');
    return {
        uuid,
        name: actor.name,
        img: actor.img ?? '',
        line: bearerLine(actor),
        toughnessBonus: toughness?.effectiveBonus ?? toughness?.bonus ?? 0,
    };
}

/** Roll a fall for one subject and post its card. */
async function resolveFall(actor: WH40KBaseActorDocument, view: HazardSubjectView, metres: number): Promise<void> {
    const bonus = getFallingDamageBonus(metres, view.line);
    if (bonus === null) return;
    const roll = new Roll(view.formula, {});
    await roll.evaluate();
    const damage = roll.total ?? 0;
    const location = getHitLocationForRoll((await roll1d100()).total ?? 0) ?? DEFAULT_HIT_LOCATION;
    const bonusLabel =
        fallingRuleKind(view.line) === 'table' ? t('WH40K.Hazard.Falling.TableBonus', { metres }) : t('WH40K.Hazard.Falling.MetreBonus', { metres });
    const tooltipData = prepareModifierTooltipData(t('WH40K.Hazard.Falling.Damage'), [
        { name: t('WH40K.Hazard.Falling.Die'), value: damage - bonus },
        { name: bonusLabel, value: bonus },
    ]);
    await emitChatFromTemplate(FALLING_CHAT_TEMPLATE, {
        actor,
        gameSystem: view.line,
        metres,
        formula: view.formula,
        damage,
        damageType: FALLING_DAMAGE_TYPE,
        location,
        locationLabel: hitLocationLabel(location),
        tooltipData,
    });
}

/** Apply the line's Suffocating condition (when it has one) and post the subject's card. */
async function resolveSuffocationFor(actor: WH40KBaseActorDocument, view: HazardSubjectView): Promise<void> {
    let appliedCondition = '';
    const condition = conditionEffectData(SUFFOCATING_CONDITION, view.line);
    if (condition !== null && !actor.statuses.has(SUFFOCATING_CONDITION)) {
        const created = await createConditionEffect(actor, SUFFOCATING_CONDITION);
        if (created !== null) appliedCondition = condition.name;
    }
    await emitChatFromTemplate(SUFFOCATION_CHAT_TEMPLATE, {
        actor,
        gameSystem: view.line,
        toughnessBonus: view.toughnessBonus,
        allotmentCount: view.allotmentCount,
        isRounds: view.allotmentUnit === 'round',
        strenuousUnsupported: view.strenuousUnsupported,
        diesAfterTbRounds: view.endgame === 'diesAfterTbRounds',
        roundsUntilDeath: view.roundsUntilDeath,
        endgameDamage: SUFFOCATION_ENDGAME_DAMAGE,
        fatigue: SUFFOCATION_FATIGUE_PER_FAILURE,
        appliedCondition,
    });
}

// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 global lacks the typed constructor Mixin needs; cast through unknown is the established pattern
export default class HazardDialog extends ApplicationV2Mixin(ApplicationV2 as unknown as ApplicationV2Ctor) {
    declare kind: HazardKind;
    declare metres: number;
    declare strenuous: boolean;

    constructor(options: ApplicationV2Config.DefaultOptions = {}) {
        super(options);
        this.kind = 'falling';
        this.metres = DEFAULT_FALL_METRES;
        this.strenuous = false;
    }

    /** @override */
    static override DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        tag: 'form',
        classes: ['wh40k-rpg', 'dialog', 'hazard-dialog', 'standard-form'],
        actions: {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            resolve: HazardDialog.#onResolve,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            cancel: HazardDialog.#onCancel,
        },
        form: {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            handler: HazardDialog.#onFormChange,
            submitOnChange: true,
            closeOnSubmit: false,
        },
        position: { width: 460 },
        window: {
            title: 'WH40K.Hazard.DialogTitle',
            resizable: false,
        },
    };

    /** @override */
    static override PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/hazard-dialog.hbs',
            classes: [],
            scrollable: [],
        },
    };

    /** The selected subjects resolved against the current inputs. */
    #subjectViews(): Array<{ actor: WH40KBaseActorDocument; view: HazardSubjectView }> {
        const input = { kind: this.kind, metres: this.metres, strenuous: this.strenuous };
        return selectedActors().map((selected) => ({ actor: selected.actor, view: buildHazardSubjectView(toSubject(selected), input) }));
    }

    /** @inheritDoc */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<HazardContext> {
        const context = (await super._prepareContext(options)) as HazardContext;
        const subjects = this.#subjectViews().map((entry) => entry.view);
        return {
            ...context,
            kinds: HAZARD_KINDS.map((value) => ({ value, labelKey: KIND_LABEL_KEYS[value], selected: value === this.kind })),
            isFalling: this.kind === 'falling',
            metres: this.metres,
            strenuous: this.strenuous,
            subjects,
            cannotResolve: !canResolveHazard(subjects, this.kind),
        };
    }

    static async #onFormChange(this: HazardDialog, _event: Event, _form: HTMLFormElement, formData: FormDataExtended): Promise<void> {
        const data = formData.object;
        const kind = data['kind'];
        if (typeof kind === 'string' && isHazardKind(kind)) this.kind = kind;
        const metres = Number(data['metres']);
        if (Number.isFinite(metres)) this.metres = Math.max(0, Math.trunc(metres));
        if (this.kind === 'suffocation') this.strenuous = data['strenuous'] === true;
        await this.render();
    }

    static async #onResolve(this: HazardDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        for (const { actor, view } of this.#subjectViews()) {
            if (!view.supported) continue;
            // eslint-disable-next-line no-await-in-loop -- sequential: one card per subject, posted in selection order
            await (this.kind === 'falling' ? resolveFall(actor, view, this.metres) : resolveSuffocationFor(actor, view));
        }
        await this.close();
    }

    static async #onCancel(this: HazardDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        await this.close();
    }
}

/** Open the hazard dialog (GM only). */
export function openHazardDialog(): void {
    if (!game.user.isGM) {
        ui.notifications.warn(t('WH40K.Hazard.GmOnly'));
        return;
    }
    void new HazardDialog().render({ force: true });
}
