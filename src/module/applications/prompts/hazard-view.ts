/**
 * @file Pure view-model for the GM environmental-hazard dialog (#118, #604).
 *
 * Turns the dialog's inputs (hazard kind, metres fallen, activity, vacuum
 * exposure) and the selected tokens' actors into one row per subject, resolved
 * against that subject's own game line through `rules/hazards.ts` and
 * `rules/scene-environment.ts`. A LEAF: no Foundry globals, so the dialog, its
 * story and the unit tests share one derivation.
 */

import type { GameSystemId } from '../../config/game-systems/types.ts';
import { type BreathUnit, getFallingDamageFormula, resolveSuffocation, type SuffocationEndgame } from '../../rules/hazards.ts';
import { resolveVacuum, type VacuumExposure, type VacuumOutcome } from '../../rules/scene-environment.ts';

export const HAZARD_KINDS = ['falling', 'suffocation', 'vacuum'] as const;
export type HazardKind = (typeof HAZARD_KINDS)[number];

export function isHazardKind(value: string): value is HazardKind {
    return (HAZARD_KINDS as readonly string[]).includes(value);
}

/** How the subjects meet the vacuum (vacuum only). */
export interface VacuumInput {
    exposure: VacuumExposure;
    /** In the vacuum of space, where the cold also bites. */
    inSpace: boolean;
    /** An oxygen source spares the subject the suffocation. */
    oxygenSource: boolean;
}

/** The hazard the GM is resolving. */
export interface HazardInput {
    kind: HazardKind;
    /** Distance fallen (falling only). */
    metres: number;
    /** Strenuous activity rather than conserving oxygen (suffocation and vacuum). */
    strenuous: boolean;
    /** The exposure (vacuum only). */
    vacuum?: VacuumInput | undefined;
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
    /** Vacuum: the subject's exposure resolved against its line; null for the other hazards. */
    vacuum: VacuumOutcome | null;
}

/** Resolve the hazard against one subject's line. */
export function buildHazardSubjectView(subject: HazardSubject, input: HazardInput): HazardSubjectView {
    const suffocation = resolveSuffocation({ toughnessBonus: subject.toughnessBonus, strenuous: input.strenuous, line: subject.line });
    const formula = getFallingDamageFormula(input.metres, subject.line);
    const vacuum =
        input.kind === 'vacuum' && input.vacuum !== undefined
            ? resolveVacuum({ ...input.vacuum, toughnessBonus: subject.toughnessBonus, strenuous: input.strenuous, line: subject.line })
            : null;
    return {
        ...subject,
        supported: suffocation !== null,
        formula: input.kind === 'falling' ? formula : '',
        allotmentCount: suffocation?.allotment.count ?? 0,
        allotmentUnit: suffocation?.allotment.unit ?? 'minute',
        strenuousUnsupported: input.kind !== 'falling' && (suffocation?.allotment.strenuousUnsupported ?? false),
        endgame: suffocation?.endgame ?? '',
        roundsUntilDeath: suffocation?.roundsUntilDeath ?? 0,
        vacuum,
    };
}

/** True when at least one subject has something to resolve for the chosen hazard. */
export function canResolveHazard(views: readonly HazardSubjectView[], kind: HazardKind): boolean {
    return views.some((view) => {
        if (!view.supported) return false;
        if (kind === 'falling') return view.formula !== '';
        if (kind === 'vacuum') return view.vacuum !== null;
        return true;
    });
}
