/**
 * Minimal shape of an actor system DataModel that declares its own initiative
 * formula. Opt-in per actor type: a DataModel that exposes a non-empty
 * `initiativeFormula` string overrides `CONFIG.Combat.initiative.formula` for
 * its combatants. Every DataModel that does NOT expose it (the character / NPC
 * / vehicle models across all seven lines) keeps the global formula, so this is
 * additive and homologation-safe.
 */
interface InitiativeFormulaProvider {
    readonly initiativeFormula?: string | undefined;
}

/**
 * Extended Combatant for WH40K RPG VTT.
 *
 * Foundry resolves a combatant's initiative dice expression through
 * `_getInitiativeFormula()`, which by default returns the single global
 * `CONFIG.Combat.initiative.formula` (`@initiative.base + @initiative.bonus` —
 * the characteristic-driven formula every FFG-line creature uses). Rogue
 * Trader voidcraft roll initiative as `1d10 + Detection Bonus` instead, which
 * that global formula cannot express.
 *
 * Rather than string-matching actor types here, this class asks the actor's own
 * system DataModel for a formula and falls back to the global one. The
 * per-type rule therefore lives with the per-type data (`VoidcraftData`), and
 * the combat tracker — including the RT strategic-round flow, which reads
 * `game.combats.active.round` — drives every actor type through one path.
 *
 * @extends Combatant
 */
export class WH40KCombatant<out SubType extends Combatant.SubType = Combatant.SubType> extends Combatant<SubType> {
    /**
     * Acquire the dice formula for this combatant, preferring a formula the
     * actor's system DataModel declares for itself.
     * @returns The initiative formula to roll for this combatant.
     */
    protected override _getInitiativeFormula(): string {
        const system = this.actor?.system as InitiativeFormulaProvider | undefined;
        const formula = system?.initiativeFormula;
        if (typeof formula === 'string' && formula.length > 0) return formula;
        return super._getInitiativeFormula();
    }
}
