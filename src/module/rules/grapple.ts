/**
 * Grapple state machine (#120 — core.md L10155-10180).
 *
 * Grappling is a multi-step engagement started by a successful unarmed Charge or
 * Standard Attack and then fought round by round with the Grapple action. Each
 * combatant is in one of three states: `none` (not in a grapple), `grappling`
 * (the controller) or `controlled` (the grappled target). Each side has its own
 * options. In DH2 (core pp. 221–222) the controller has Damage, Throw Down, Push,
 * Ready, Stand and Use Item, and the target has Break Free, Slip Free and Take
 * Control. Each line prints its own lists; they live on the line's game-system
 * config (`grappleRules`).
 *
 * The opposed options resolve through the RAW Opposed-test ladder (p. 24) with the
 * grapple's Size edge (p. 222). The helpers here are pure: they take pre-rolled
 * `1d100` values and the targets and return a `GrappleResolution`. The character
 * sheet's grapple panel prompts the rolls and posts the chat cards.
 */

import type { I18nKey } from '../types/i18n-keys';
import { degreesOfFailure, degreesOfSuccess, isD100Success } from './_dice.ts';
import { type OpposedSide, resolveOpposed } from './opposed.ts';

/** Re-exported from the shared dice primitives for callers/tests importing it from this module. */
export { degreesOfSuccess };

/** Three legal states for a combatant with respect to a grapple. */
export type GrappleState = 'none' | 'grappling' | 'controlled';

/** The actor flag (under the system scope) a combatant's grapple state is stored in. */
export const GRAPPLE_FLAG = 'grapple';

const GRAPPLE_STATES: ReadonlySet<string> = new Set<GrappleState>(['none', 'grappling', 'controlled']);

// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry actor flags are an untyped JSON bag; narrowed field by field below
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

/**
 * A combatant's grapple state, read from its flags — the single reader for the
 * value the grapple controller writes at `flags[SYSTEM_ID][GRAPPLE_FLAG].state`.
 * Anything absent or unrecognised reads as `none`.
 * @param {object | undefined} flags  The actor's `flags` bag.
 * @param {string} scope  The system flag scope (`SYSTEM_ID`).
 * @returns {GrappleState}  The grapple state.
 */
export function readGrappleState(flags: object | undefined, scope: string): GrappleState {
    const scoped = isRecord(flags) ? flags[scope] : undefined;
    const grapple = isRecord(scoped) ? scoped[GRAPPLE_FLAG] : undefined;
    const state = isRecord(grapple) ? grapple['state'] : undefined;
    return typeof state === 'string' && GRAPPLE_STATES.has(state) ? (state as GrappleState) : 'none';
}

/**
 * The other participant of a grapple, as recorded on a combatant's grapple flag
 * (`flags[SYSTEM_ID][GRAPPLE_FLAG].opponentUuid`), or null when none is recorded.
 * Every grapple action is an Opposed Strength test against that participant
 * (DH2 core p. 221–222: "an Opposed Strength test with the Grappled opponent",
 * "against the controller of the Grapple").
 */
export function readGrappleOpponentUuid(flags: object | undefined, scope: string): string | null {
    const scoped = isRecord(flags) ? flags[scope] : undefined;
    const grapple = isRecord(scoped) ? scoped[GRAPPLE_FLAG] : undefined;
    const uuid = isRecord(grapple) ? grapple['opponentUuid'] : undefined;
    return typeof uuid === 'string' && uuid !== '' ? uuid : null;
}

/**
 * The attack actions a grapple attempt is made with. In every line a character
 * may grapple instead of dealing unarmed damage, as a melee Charge or Standard
 * Attack. The target may use a Reaction to avoid it
 * (DH1: an Agility Test; the others: Dodge or Parry — the shared evasion window
 * makes that per line); a hit starts a grapple the attacker controls.
 *
 * The table's own Grapple action is not one of them: it is only for a character
 * already in a grapple.
 */
export const GRAPPLE_START_ACTIONS: readonly string[] = ['Standard Attack', 'Charge'];

/**
 * Whether an attack may be a grapple attempt: an unarmed attack (the weapon's
 * content-declared `unarmed` flag) made with a Standard Attack or a Charge. No
 * line prints a weapon that may grapple, so an armed attack never can.
 */
export function canAttemptGrapple(action: string, weaponIsUnarmed: boolean): boolean {
    return weaponIsUnarmed && GRAPPLE_START_ACTIONS.includes(action);
}

/** The chat-message flag carrying grapple flag writes for the active GM to apply. */
export const GRAPPLE_UPDATE_FLAG = 'grappleUpdate';

/** One combatant's grapple flag, as the active GM writes it. */
export interface GrappleFlagWrite {
    /** The combatant's actor UUID. */
    uuid: string;
    state: GrappleState;
    /** The other participant's actor UUID; null when the grapple is over. */
    opponentUuid: string | null;
    /** Whether the controller has thrown the target down (Throw Down Opponent) and it has not stood since. */
    thrownDown: boolean;
}

/**
 * A grapple with `controllerUuid` in control and `targetUuid` held, each recording
 * the other: a successful grapple attempt, a Take Control (roles swapped), or a
 * change of the thrown-down mark.
 */
export function grappleStartWrites(controllerUuid: string, targetUuid: string, thrownDown = false): GrappleFlagWrite[] {
    return [
        { uuid: controllerUuid, state: 'grappling', opponentUuid: targetUuid, thrownDown },
        { uuid: targetUuid, state: 'controlled', opponentUuid: controllerUuid, thrownDown },
    ];
}

/** The grapple is over for both participants (a successful Break Free or Slip Free). */
export function grappleEndWrites(oneUuid: string, otherUuid: string): GrappleFlagWrite[] {
    return [
        { uuid: oneUuid, state: 'none', opponentUuid: null, thrownDown: false },
        { uuid: otherUuid, state: 'none', opponentUuid: null, thrownDown: false },
    ];
}

/** The flag value a write stores at `flags[SYSTEM_ID][GRAPPLE_FLAG]`. */
export function grappleFlagValue(write: GrappleFlagWrite): { state: GrappleState; opponentUuid: string | null; thrownDown: boolean } {
    return { state: write.state, opponentUuid: write.opponentUuid, thrownDown: write.thrownDown };
}

/** Whether a combatant's grapple has its target thrown down (`flags[SYSTEM_ID][GRAPPLE_FLAG].thrownDown`). */
export function readGrappleThrownDown(flags: object | undefined, scope: string): boolean {
    const scoped = isRecord(flags) ? flags[scope] : undefined;
    const grapple = isRecord(scoped) ? scoped[GRAPPLE_FLAG] : undefined;
    return isRecord(grapple) && grapple['thrownDown'] === true;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: a chat-message flag is an untyped JSON bag; validated entry by entry below
export function readGrappleWrites(value: unknown): GrappleFlagWrite[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry): GrappleFlagWrite[] => {
        if (!isRecord(entry)) return [];
        const { uuid, state, opponentUuid, thrownDown } = entry;
        if (typeof uuid !== 'string' || uuid === '' || typeof state !== 'string' || !GRAPPLE_STATES.has(state)) return [];
        if (opponentUuid !== null && typeof opponentUuid !== 'string') return [];
        return [{ uuid, state: state as GrappleState, opponentUuid, thrownDown: thrownDown === true }];
    });
}

/** The two sides of a grapple: the one controlling it, and the one held in it. */
export type GrappleRole = 'controller' | 'target';

/**
 * Every grapple option a line prints. What an option does when it succeeds is a
 * mechanic, and lives here. Which options a line offers, and how each is tested,
 * is that line's printed rule (`grappleRules` on its game-system config).
 */
export type GrappleOptionId =
    | 'damage-opponent'
    | 'throw-down-opponent'
    | 'push-opponent'
    | 'ready'
    | 'stand'
    | 'use-item'
    | 'break-free'
    | 'slip-free'
    | 'take-control';

/** The option a grapple test resolved (echoed on the result card). */
export type GrappleAction = GrappleOptionId;

/**
 * How a grapple option is tested.
 * - `opposed-strength`: an Opposed Strength test against the other participant.
 * - `skill`: a plain skill test (DH2 Slip Free: "a Challenging (+0) Acrobatics test").
 * - `opposed-skill`: the actor's skill opposed by the other's Strength (DH1 Escape Grapple: "a Contortionist Test opposed by the grappler's Strength Test").
 * - `declare`: no test (Ready, Use Item).
 */
type GrappleTest =
    | { readonly kind: 'opposed-strength' }
    | { readonly kind: 'skill'; readonly skill: string; readonly modifier: number }
    | { readonly kind: 'opposed-skill'; readonly skill: string }
    | { readonly kind: 'declare' };

/** One option a line prints, for the role that may take it. */
export interface GrappleOptionRule {
    readonly id: GrappleOptionId;
    readonly role: GrappleRole;
    readonly test: GrappleTest;
}

/** A line's printed grapple rules (the Grapple action's option lists). */
export interface GrappleRules {
    /** Every option, controller's and target's, in the order the book prints them. */
    readonly options: readonly GrappleOptionRule[];
    /**
     * The bonus the controller gains on every further Opposed test of the grapple
     * once Throw Down Opponent has put the opponent Prone (DH2 core p. 221: "+10";
     * OW core: "+10"); 0 for a line that prints none.
     */
    readonly thrownDownBonus: number;
    /** What a won Damage Opponent deals with the controller's unarmed hit. */
    readonly damage: GrappleDamageRule;
    /** How far a won Push Opponent moves the opponent; null for a line that prints no Push Opponent. */
    readonly push: GrapplePushRule | null;
}

/**
 * A won Damage Opponent: the controller's unarmed hit, through the normal damage
 * path. In DH2, RT, BC, DW and OW it is unarmed damage (1d5−3 + SB) to the Body
 * and one level of Fatigue; DH1 deals the same but names no location.
 */
export interface GrappleDamageRule {
    /** The hit-location id the hit lands on; null when the line names none, so it lands where the controller's test roll puts it, like every attack. */
    readonly location: string | null;
    /** Levels of Fatigue the hit adds. */
    readonly fatigue: number;
}

/**
 * A won Push Opponent moves the opponent one metre in a chosen direction plus a
 * metre per degree of success, never past the controller's Half Move (DH2, RT,
 * BC, DW and OW).
 */
export interface GrapplePushRule {
    readonly baseMetres: number;
    readonly metresPerDegree: number;
    /** Whether the push is capped at the controller's Half Move. */
    readonly capAtHalfMove: boolean;
}

/** How far a push goes, and how it was reached (the card prints each part). */
export interface GrapplePushDistance {
    readonly baseMetres: number;
    readonly degrees: number;
    /** Metres the degrees add. */
    readonly fromDegrees: number;
    /** Base plus the degrees, before the cap. */
    readonly uncapped: number;
    /** The controller's Half Move, when the line caps the push at it; null otherwise. */
    readonly halfMove: number | null;
    /** Whether the cap cut the push short. */
    readonly capped: boolean;
    readonly metres: number;
}

/** The push distance for the controller's degrees of success on the won test. */
export function grapplePushDistance(rule: GrapplePushRule, degrees: number, halfMove: number): GrapplePushDistance {
    const fromDegrees = Math.max(0, degrees) * rule.metresPerDegree;
    const uncapped = rule.baseMetres + fromDegrees;
    const cap = rule.capAtHalfMove ? Math.max(0, halfMove) : null;
    const capped = cap !== null && uncapped > cap;
    return { baseMetres: rule.baseMetres, degrees: Math.max(0, degrees), fromDegrees, uncapped, halfMove: cap, capped, metres: capped ? cap : uncapped };
}

/** The eight directions a push may go, clockwise from north (the top of the scene). */
export const GRAPPLE_PUSH_DIRECTIONS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;
export type GrapplePushDirection = (typeof GRAPPLE_PUSH_DIRECTIONS)[number];

const DIRECTION_STEPS: Readonly<Record<GrapplePushDirection, { dx: number; dy: number }>> = {
    n: { dx: 0, dy: -1 },
    ne: { dx: 1, dy: -1 },
    e: { dx: 1, dy: 0 },
    se: { dx: 1, dy: 1 },
    s: { dx: 0, dy: 1 },
    sw: { dx: -1, dy: 1 },
    w: { dx: -1, dy: 0 },
    nw: { dx: -1, dy: -1 },
};

/** Whether a value names one of the push directions. */
export function isGrapplePushDirection(value: string): value is GrapplePushDirection {
    return (GRAPPLE_PUSH_DIRECTIONS as readonly string[]).includes(value);
}

/**
 * The token offset, in pixels, of a push of `metres` in `direction` on a square
 * grid of `size` pixels per `distance` metres. The push moves whole squares,
 * rounded down so it never goes further than the distance allows, and a diagonal
 * step counts as one square, as the scene's own measurement does by default. The
 * GM can still adjust the token afterwards.
 */
export function grapplePushOffset(
    direction: GrapplePushDirection,
    metres: number,
    grid: { size: number; distance: number },
): { x: number; y: number; squares: number } {
    const squares = grid.distance > 0 ? Math.floor(metres / grid.distance) : 0;
    const step = DIRECTION_STEPS[direction];
    return { x: step.dx * squares * grid.size, y: step.dy * squares * grid.size, squares };
}

/** The langpack label of each grapple option (the panel buttons and the result card share them). */
export const GRAPPLE_ACTION_LABEL_KEYS: Readonly<Record<GrappleOptionId, I18nKey>> = {
    'damage-opponent': 'WH40K.Grapple.DamageOpponent',
    'throw-down-opponent': 'WH40K.Grapple.ThrowDownOpponent',
    'push-opponent': 'WH40K.Grapple.PushOpponent',
    'ready': 'WH40K.Grapple.Ready',
    'stand': 'WH40K.Grapple.Stand',
    'use-item': 'WH40K.Grapple.UseItem',
    'break-free': 'WH40K.Grapple.BreakFree',
    'slip-free': 'WH40K.Grapple.SlipFree',
    'take-control': 'WH40K.Grapple.TakeControl',
};

/** The langpack text stating what each option does when it succeeds (the result card's effect line). */
export const GRAPPLE_EFFECT_KEYS: Readonly<Record<GrappleOptionId, I18nKey>> = {
    'damage-opponent': 'WH40K.Grapple.Effect.DamageOpponent',
    'throw-down-opponent': 'WH40K.Grapple.Effect.ThrowDownOpponent',
    'push-opponent': 'WH40K.Grapple.Effect.PushOpponent',
    'ready': 'WH40K.Grapple.Effect.Ready',
    'stand': 'WH40K.Grapple.Effect.Stand',
    'use-item': 'WH40K.Grapple.Effect.UseItem',
    'break-free': 'WH40K.Grapple.Effect.BreakFree',
    'slip-free': 'WH40K.Grapple.Effect.SlipFree',
    'take-control': 'WH40K.Grapple.Effect.TakeControl',
};

/** The Font Awesome icon each option's panel button shows. */
const GRAPPLE_OPTION_ICONS: Readonly<Record<GrappleOptionId, string>> = {
    'damage-opponent': 'fa-fist-raised',
    'throw-down-opponent': 'fa-person-falling',
    'push-opponent': 'fa-people-pulling',
    'ready': 'fa-hand-holding',
    'stand': 'fa-person-arrow-up-from-line',
    'use-item': 'fa-hand-sparkles',
    'break-free': 'fa-handcuffs',
    'slip-free': 'fa-person-running',
    'take-control': 'fa-arrows-rotate',
};

/** The role a combatant's grapple state gives it, or null outside a grapple. */
export function grappleRoleOf(state: GrappleState): GrappleRole | null {
    if (state === 'grappling') return 'controller';
    if (state === 'controlled') return 'target';
    return null;
}

/** The options a line offers one role, in the book's order. */
export function grappleOptionsFor(rules: GrappleRules, role: GrappleRole): GrappleOptionRule[] {
    return rules.options.filter((option) => option.role === role);
}

/** One option button on the grapple panel. */
interface GrapplePanelOption {
    id: GrappleOptionId;
    role: GrappleRole;
    labelKey: string;
    icon: string;
    /** How the option is tested (`opposed-strength`, `skill`, `opposed-skill`, `declare`). */
    testKind: GrappleTest['kind'];
    /** The skill key a skill-tested option rolls ('' otherwise). */
    skill: string;
    /** That skill's display name ('' otherwise). */
    skillLabel: string;
    /** The langpack text naming the test ("Opposed Strength", "{skill} test", …). */
    testHintKey: string;
}

const TEST_HINT_KEYS: Readonly<Record<GrappleTest['kind'], string>> = {
    'opposed-strength': 'WH40K.Grapple.Test.OpposedStrength',
    'skill': 'WH40K.Grapple.Test.Skill',
    'opposed-skill': 'WH40K.Grapple.Test.OpposedSkill',
    'declare': 'WH40K.Grapple.Test.Declare',
};

/** One role's group of options on the grapple panel. */
export interface GrapplePanelSection {
    role: GrappleRole;
    /** Whether this is the sheet actor's own role (the GM also sees the other one, and acts for the opponent there). */
    own: boolean;
    titleKey: string;
    options: GrapplePanelOption[];
}

const SECTION_TITLE_KEYS: Readonly<Record<GrappleRole, string>> = {
    controller: 'WH40K.Grapple.ControllerOptions',
    target: 'WH40K.Grapple.TargetOptions',
};

/**
 * The option groups the grapple panel shows (#120): a combatant sees only its own
 * role's options; the GM sees both, its own role first. No line rules, or no
 * grapple, shows nothing.
 */
export function grapplePanelSections(
    rules: GrappleRules | null,
    state: GrappleState,
    isGM: boolean,
    skillLabel: (skill: string) => string = (skill) => skill,
): GrapplePanelSection[] {
    const own = grappleRoleOf(state);
    if (rules === null || own === null) return [];
    const roles: GrappleRole[] = isGM ? [own, own === 'controller' ? 'target' : 'controller'] : [own];
    return roles.map((role) => ({
        role,
        own: role === own,
        titleKey: SECTION_TITLE_KEYS[role],
        options: grappleOptionsFor(rules, role).map((option) => {
            const skill = option.test.kind === 'skill' || option.test.kind === 'opposed-skill' ? option.test.skill : '';
            return {
                id: option.id,
                role,
                labelKey: GRAPPLE_ACTION_LABEL_KEYS[option.id],
                icon: GRAPPLE_OPTION_ICONS[option.id],
                testKind: option.test.kind,
                skill,
                skillLabel: skill === '' ? '' : skillLabel(skill),
                testHintKey: TEST_HINT_KEYS[option.test.kind],
            };
        }),
    }));
}

/** A modifier on one side of a grapple test, with its source (#120: shown as a row on the card). */
export interface GrappleModifier {
    readonly key: string;
    readonly labelKey: I18nKey;
    readonly value: number;
    /** The option it comes from, as a langpack key. */
    readonly sourceKey: I18nKey;
}

/**
 * The modifiers on one side of a grapple test. The controller of a grapple whose
 * opponent it has thrown down gains the line's bonus "to all further Opposed tests
 * made during this Grapple" (DH2 core p. 221), whichever side acts.
 */
export function grappleSideModifiers(role: GrappleRole, thrownDown: boolean, rules: GrappleRules): GrappleModifier[] {
    if (role !== 'controller' || !thrownDown || rules.thrownDownBonus === 0) return [];
    return [
        {
            key: 'grapple-thrown-down',
            labelKey: 'WH40K.Grapple.Modifier.ThrownDown',
            value: rules.thrownDownBonus,
            sourceKey: GRAPPLE_ACTION_LABEL_KEYS['throw-down-opponent'],
        },
    ];
}

/**
 * The grapple flag writes a won option makes, or null when it changes no state:
 * - Break Free and Slip Free end the grapple for both.
 * - Take Control swaps the roles: "he becomes the controller of the Grapple and his
 *   opponent becomes the Grappled target".
 * - Throw Down, in a line with a thrown-down bonus, marks the opponent thrown down.
 * - Stand puts both back on their feet, which ends that bonus.
 * Damage, Push, Ready and Use Item change no grapple state: Damage posts its hit,
 * Push offers the GM the token move, and Ready and Use Item name their item.
 */
export function grappleOptionWrites(
    id: GrappleOptionId,
    won: boolean,
    actor: { uuid: string; role: GrappleRole },
    opponentUuid: string,
    thrownDown: boolean,
    rules: GrappleRules,
): GrappleFlagWrite[] | null {
    if (!won) return null;
    if (id === 'break-free' || id === 'slip-free') return grappleEndWrites(actor.uuid, opponentUuid);
    if (id === 'take-control') return grappleStartWrites(actor.uuid, opponentUuid);
    const controllerUuid = actor.role === 'controller' ? actor.uuid : opponentUuid;
    const targetUuid = actor.role === 'controller' ? opponentUuid : actor.uuid;
    if (id === 'throw-down-opponent' && rules.thrownDownBonus > 0) return grappleStartWrites(controllerUuid, targetUuid, true);
    if (id === 'stand' && thrownDown) return grappleStartWrites(controllerUuid, targetUuid, false);
    return null;
}

/** Input shape of an opposed grapple test. */
export interface OpposedStrengthInput {
    /** Acting combatant's d100 roll (1-100). */
    actorRoll: number;
    /** Acting combatant's target: its Strength total (or skill, for an opposed-skill option), modifiers included. */
    actorStrength: number;
    /** Opponent's d100 roll (1-100). */
    opponentRoll: number;
    /** Opponent's target: its Strength total, modifiers included. */
    opponentStrength: number;
    /** Acting combatant's Size (the Size trait value, 4 = Average). Optional: equal sizes add nothing. */
    actorSize?: number;
    /** Opponent's Size. */
    opponentSize?: number;
    /** Acting combatant's characteristic bonus for the tie-break (default: its target's tens). */
    actorBonus?: number;
    /** Opponent's characteristic bonus for the tie-break (default: its target's tens). */
    opponentBonus?: number;
}

/** How the opposed test came out for the acting combatant. */
type GrappleOutcome = 'won' | 'lost' | 'stalemate';

/** Resolution payload returned by every grapple action helper. */
export interface GrappleResolution {
    /** True when the acting combatant wins the opposed test. */
    success: boolean;
    /** Won, lost, or a stalemate (both failed, or a dead heat): nothing happens. */
    outcome: GrappleOutcome;
    /** Degrees of success for the actor (0 when actor failed their roll), Size edge included. */
    actorDoS: number;
    /** Degrees of failure for the actor (0 when the actor passed). */
    actorDoF: number;
    /** Degrees of success for the opponent (0 when opponent failed their roll), Size edge included. */
    opponentDoS: number;
    /** Degrees of failure for the opponent (0 when the opponent passed). */
    opponentDoF: number;
    /** Extra degrees of success the larger combatant scored for its Size (signed: + actor, − opponent). */
    sizeEdge: number;
    /** Net DoS (actorDoS − opponentDoS) for downstream effects like damage scaling. */
    netDoS: number;
    /** The action that was resolved (echoed for chat-card / log convenience). */
    action: GrappleAction;
}

/**
 * An opposed grapple test (every opposed option), by the RAW Opposed-test ladder (DH2 core
 * p. 24, `rules/opposed.ts`): a success beats a failure; both succeeding, more
 * degrees of success wins; then the higher Strength bonus; then the lower roll.
 * Both failing is a stalemate — "nothing happens" — so the acting side does
 * not get its way (the GM may call for a re-roll instead).
 *
 * Grappling size differences (DH2 core p. 222): the larger combatant scores one
 * extra degree of success on a successful test for each point its Size exceeds
 * the other's.
 */
export function resolveGrappleOpposed(input: OpposedStrengthInput, action: GrappleAction): GrappleResolution {
    const sizeEdge = (input.actorSize ?? 0) - (input.opponentSize ?? 0);
    const side = (roll: number, target: number, edge: number, bonus: number | undefined): OpposedSide & { dos: number; dof: number } => {
        const success = isD100Success(roll, target);
        return {
            success,
            dos: success ? Math.max(1, degreesOfSuccess(roll, target)) + Math.max(0, edge) : 0,
            dof: success ? 0 : Math.max(1, degreesOfFailure(roll, target)),
            charBonus: bonus ?? Math.floor(target / 10),
            roll,
        };
    };
    const actor = side(input.actorRoll, input.actorStrength, sizeEdge, input.actorBonus);
    const opponent = side(input.opponentRoll, input.opponentStrength, -sizeEdge, input.opponentBonus);
    const { winner } = resolveOpposed(actor, opponent);
    const outcome: GrappleOutcome = winner === 'initiator' ? 'won' : winner === 'target' ? 'lost' : 'stalemate';
    return {
        success: outcome === 'won',
        outcome,
        actorDoS: actor.dos,
        actorDoF: actor.dof,
        opponentDoS: opponent.dos,
        opponentDoF: opponent.dof,
        sizeEdge,
        netDoS: actor.dos - opponent.dos,
        action,
    };
}

/** What a grapple test reads off a participant actor. */
export interface GrappleParticipant {
    name: string;
    /** The actor's UUID — what the other participant's grapple flag records. */
    uuid: string;
    system: {
        characteristics?: { strength?: { total?: number } };
        size?: number;
        // eslint-disable-next-line no-restricted-syntax -- boundary: the actor's skill map is keyed by skill slug
        skills?: Record<string, { current?: number } | undefined>;
        movement?: { half?: number };
    };
}

/** A participant's Half Move in metres (the cap on a push, #665); 0 when the actor type has no movement. */
export function grappleHalfMove(participant: GrappleParticipant): number {
    return participant.system.movement?.half ?? 0;
}

/**
 * The push a won Push Opponent offers the GM: its distance, as the card prints
 * it, and who moves (the card's button carries it to `actions/grapple-controls`).
 */
export interface GrapplePushCard extends GrapplePushDistance {
    readonly controllerUuid: string;
    readonly targetUuid: string;
    readonly targetName: string;
}

/** The item a Ready or Use Item names (#665). */
export interface GrappleItemChoice {
    readonly uuid: string;
    readonly name: string;
}

/** The push a won Push Opponent offers, or null for any other option, a lost test, or a line with no push. */
export function grapplePushCard(
    option: GrappleOptionId,
    won: boolean,
    rules: GrappleRules,
    degrees: number,
    controller: GrappleParticipant,
    target: GrappleParticipant,
): GrapplePushCard | null {
    if (option !== 'push-opponent' || !won || rules.push === null) return null;
    return {
        ...grapplePushDistance(rules.push, degrees, grappleHalfMove(controller)),
        controllerUuid: controller.uuid,
        targetUuid: target.uuid,
        targetName: target.name,
    };
}

/**
 * View an actor as a grapple participant. Actor system data is a union over every
 * actor type; the grapple reads only the optional Strength total and Size, which
 * an actor type without them (a vehicle) leaves undefined.
 */
export function asGrappleParticipant(actor: { name: string; uuid: string | null; system: object }): GrappleParticipant {
    // An unsaved actor has no UUID; it cannot be recorded as anyone's opponent.
    return { name: actor.name, uuid: actor.uuid ?? '', system: actor.system };
}

/** A participant's Strength total — the target of its side of every grapple test. */
export function grappleStrength(participant: GrappleParticipant): number {
    return participant.system.characteristics?.strength?.total ?? 0;
}

/** A participant's Size (the Size-trait scale); 0 when the actor type has none, so it adds no edge. */
export function grappleSize(participant: GrappleParticipant): number {
    const { size } = participant.system;
    return size ?? 0;
}

/** A participant's skill total (its `current`); 0 when the actor has no such skill. */
export function grappleSkill(participant: GrappleParticipant, skill: string): number {
    return participant.system.skills?.[skill]?.current ?? 0;
}

/** A modifier row on the card: label and source already localised. */
export interface GrappleCardModifier {
    label: string;
    value: number;
    source: string;
}

/** One side's test, as the caller rolled it. */
export interface GrappleCardSideInput {
    name: string;
    /** The characteristic or skill total, before modifiers. */
    base: number;
    /** What the base is ("Strength", "Contortionist"), localised. */
    baseLabel: string;
    modifiers: readonly GrappleCardModifier[];
    roll: number;
}

/** One combatant's half of the grapple result card. */
interface GrappleCardSide extends GrappleCardSideInput {
    /** The target the roll was made against: the base plus every modifier. */
    target: number;
    success: boolean;
    dos: number;
    dof: number;
    /** Extra DoS this side scored for being larger (0 when none). */
    sizeEdge: number;
}

/** Context of `chat/grapple-opposed-chat.hbs`. */
export interface GrappleCardContext {
    actionLabelKey: string;
    outcome: GrappleOutcome;
    actor: GrappleCardSide;
    opponent: GrappleCardSide;
    /** The winner's name; empty on a stalemate. */
    winnerName: string;
    /** What the option does, stated when the acting side won ('' otherwise). */
    effectKey: string;
}

/** A side's target: its base plus every modifier. */
export function grappleSideTarget(side: Pick<GrappleCardSideInput, 'base' | 'modifiers'>): number {
    return side.base + side.modifiers.reduce((total, modifier) => total + modifier.value, 0);
}

/** Shape the result card from a resolved grapple action: both sides' full test with its modifiers, and who won. */
export function buildGrappleCard(resolution: GrappleResolution, actor: GrappleCardSideInput, opponent: GrappleCardSideInput): GrappleCardContext {
    return {
        actionLabelKey: GRAPPLE_ACTION_LABEL_KEYS[resolution.action],
        outcome: resolution.outcome,
        actor: {
            ...actor,
            target: grappleSideTarget(actor),
            success: resolution.actorDoS > 0,
            dos: resolution.actorDoS,
            dof: resolution.actorDoF,
            sizeEdge: resolution.actorDoS > 0 ? Math.max(0, resolution.sizeEdge) : 0,
        },
        opponent: {
            ...opponent,
            target: grappleSideTarget(opponent),
            success: resolution.opponentDoS > 0,
            dos: resolution.opponentDoS,
            dof: resolution.opponentDoF,
            sizeEdge: resolution.opponentDoS > 0 ? Math.max(0, -resolution.sizeEdge) : 0,
        },
        winnerName: resolution.outcome === 'won' ? actor.name : resolution.outcome === 'lost' ? opponent.name : '',
        effectKey: resolution.outcome === 'won' ? GRAPPLE_EFFECT_KEYS[resolution.action] : '',
    };
}
