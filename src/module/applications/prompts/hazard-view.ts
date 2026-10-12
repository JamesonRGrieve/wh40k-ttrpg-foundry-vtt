/**
 * @file Pure view-model for the GM environmental-hazard dialog (#118).
 *
 * Turns the dialog's inputs (hazard kind, metres fallen, activity) and the
 * selected tokens' actors into one row per subject, resolved against that
 * subject's own game line through `rules/hazards.ts`. A LEAF: no Foundry
 * globals, so the dialog, its story and the unit tests share one derivation.
 */

import type { GameSystemId } from '../../config/game-systems/types.ts';
import { type BreathUnit, getFallingDamageFormula, resolveSuffocation, type SuffocationEndgame } from '../../rules/hazards.ts';

export const HAZARD_KINDS = ['falling', 'suffocation'] as const;
export type HazardKind = (typeof HAZARD_KINDS)[number];

export function isHazardKind(value: string): value is HazardKind {
    return (HAZARD_KINDS as readonly string[]).includes(value);
}

/** The hazard the GM is resolving. */
export interface HazardInput {
    kind: HazardKind;
    /** Distance fallen (falling only). */
    metres: number;
    /** Strenuous activity rather than conserving oxygen (suffocation only). */
    strenuous: boolean;
}

/** One actor the hazard befalls. */
export interface HazardSubject {
    uuid: string;
    name: string;
    img: string;
    line: GameSystemId;
    toughnessBonus: number;
}

export interface HazardSubjectView extends HazardSubject {
    /** False when the subject's line has no modelled rule (Imperium Maledictum). */
    supported: boolean;
    /** Falling: the damage formula; `''` when the fall deals no damage. */
    formula: string;
    /** Suffocation: minutes / rounds of held breath. */
    allotmentCount: number;
    allotmentUnit: BreathUnit;
    /** Suffocation: strenuous activity was requested but the line prints no such allotment. */
    strenuousUnsupported: boolean;
    endgame: SuffocationEndgame | '';
    roundsUntilDeath: number;
}

/** Resolve the hazard against one subject's line. */
export function buildHazardSubjectView(subject: HazardSubject, input: HazardInput): HazardSubjectView {
    const suffocation = resolveSuffocation({ toughnessBonus: subject.toughnessBonus, strenuous: input.strenuous, line: subject.line });
    const formula = getFallingDamageFormula(input.metres, subject.line);
    return {
        ...subject,
        supported: suffocation !== null,
        formula: input.kind === 'falling' ? formula : '',
        allotmentCount: suffocation?.allotment.count ?? 0,
        allotmentUnit: suffocation?.allotment.unit ?? 'minute',
        strenuousUnsupported: input.kind === 'suffocation' && (suffocation?.allotment.strenuousUnsupported ?? false),
        endgame: suffocation?.endgame ?? '',
        roundsUntilDeath: suffocation?.roundsUntilDeath ?? 0,
    };
}

/** True when at least one subject has something to resolve for the chosen hazard. */
export function canResolveHazard(views: readonly HazardSubjectView[], kind: HazardKind): boolean {
    return views.some((view) => view.supported && (kind === 'suffocation' || view.formula !== ''));
}
