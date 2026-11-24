/**
 * Leaving melee (#770).
 *
 * RAW (every line's Fleeing and Leaving Melee): a character engaged in melee who
 * takes a Movement action that leaves the engagement, other than Disengage, lets
 * each of those opponents immediately make a Standard Attack against him as a Free
 * Action. The system pauses the move: each foe left behind takes its free attack or
 * declines, and the move completes once every one has answered (or the GM lets the
 * mover go).
 *
 * Pure: which foes a move leaves behind, and the answers collected so far.
 */
import { type EngagementToken, engaged, engagedFoes } from './engagement.ts';

/** The foes a move leaves behind: engaged before it, no longer adjacent after it. */
export function foesLeftBehind(mover: EngagementToken, to: { x: number; y: number }, tokens: readonly EngagementToken[], gridSize: number): EngagementToken[] {
    const moved: EngagementToken = { ...mover, x: to.x, y: to.y };
    return engagedFoes(mover, tokens, gridSize).filter((foe) => !engaged(moved, foe, gridSize));
}

/** One foe's answer to the free attack. */
export type FreeAttackOutcome = 'pending' | 'attacked' | 'declined';

/** A paused move, as the leaving-melee card stores it. */
export interface LeaveMeleeState {
    readonly sceneId: string;
    readonly moverTokenId: string;
    /** The user whose move was paused; their client completes it. */
    readonly moverUserId: string;
    /** Where the mover was going. */
    readonly to: { readonly x: number; readonly y: number };
    readonly foes: ReadonlyArray<{ readonly tokenId: string; readonly name: string; readonly outcome: FreeAttackOutcome }>;
    /** Set once the move has been completed, so it isn't completed twice. */
    readonly completed: boolean;
}

/** Record one foe's answer; a foe already answered keeps its first answer. */
export function answerFreeAttack(state: LeaveMeleeState, foeTokenId: string, outcome: Exclude<FreeAttackOutcome, 'pending'>): LeaveMeleeState {
    return { ...state, foes: state.foes.map((foe) => (foe.tokenId === foeTokenId && foe.outcome === 'pending' ? { ...foe, outcome } : foe)) };
}

/** The GM lets the mover go: every foe still pending declines. */
export function releaseMover(state: LeaveMeleeState): LeaveMeleeState {
    return { ...state, foes: state.foes.map((foe) => (foe.outcome === 'pending' ? { ...foe, outcome: 'declined' as const } : foe)) };
}

/** Whether every foe has answered, so the move may complete. */
export function everyFoeAnswered(state: LeaveMeleeState): boolean {
    return state.foes.every((foe) => foe.outcome !== 'pending');
}
