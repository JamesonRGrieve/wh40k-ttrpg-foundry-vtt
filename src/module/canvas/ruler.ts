import { WH40KBaseActor } from '../documents/base-actor.ts';

/**
 * Custom Token Ruler for the WH40K RPG system.
 * Colors ruler segments based on movement speed budget (green/yellow/red).
 */
export default class TokenRulerWH40K extends foundry.canvas.placeables.tokens.TokenRuler {
    /** @inheritDoc */
    _getWaypointStyle(waypoint: Canvas.Ruler.Waypoint) {
        const style = super._getWaypointStyle(waypoint);
        return this.#getSpeedBasedStyle(waypoint, style);
    }

    /* -------------------------------------------- */

    /** @override */
    _getSegmentStyle(waypoint: Canvas.Ruler.Waypoint) {
        const style = super._getSegmentStyle(waypoint);
        return this.#getSpeedBasedStyle(waypoint, style);
    }

    /* -------------------------------------------- */

    /** @override */
    _getGridHighlightStyle(waypoint: Canvas.Ruler.Waypoint, offset: number) {
        const style = super._getGridHighlightStyle(waypoint, offset);
        return this.#getSpeedBasedStyle(waypoint, style);
    }

    /* -------------------------------------------- */

    /**
     * Modify segment or grid-highlighting style based on movement speed.
     * Colors: green (within budget), yellow (1-2x budget), red (over 2x).
     * @param {Canvas.Ruler.Waypoint} waypoint - The waypoint
     * @param {Record<string, unknown>} style - The default styling
     * @returns {Record<string, unknown>} The adjusted style
     */
    #getSpeedBasedStyle(waypoint: Canvas.Ruler.Waypoint, style: Record<string, unknown>) {
        // Only apply to the local user's movement
        if (!(game.user?.id && (this.token as any)?._plannedMovement) || (CONFIG as any).Token.movement.actions[waypoint.action]?.teleport) return style;

        // Get actor's movement speed for the current action
        const actor = this.token.actor as WH40KBaseActor | null;
        const movement = actor?.movement;
        if (!movement) return style;

        const speed = (movement as any)[waypoint.action] ?? 0;
        if (!speed) return style;

        // Color based on cost/speed ratio
        const { normal, double, triple } = (CONFIG as any).wh40k.tokenRulerColors;
        const increment = (waypoint.measurement.cost - 0.1) / speed;
        if (increment <= 1) style.color = normal ?? style.color;
        else if (increment <= 2) style.color = double ?? style.color;
        else style.color = triple ?? style.color;
        return style;
    }
}
