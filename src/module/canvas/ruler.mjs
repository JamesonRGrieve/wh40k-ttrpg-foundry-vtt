/**
 * Custom Token Ruler for the Rogue Trader system.
 * Colors ruler segments based on movement speed budget (green/yellow/red).
 */
export default class TokenRulerRT extends foundry.canvas.placeables.tokens.TokenRuler {

    /** @inheritDoc */
    _getWaypointStyle(waypoint) {
        const style = super._getWaypointStyle(waypoint);
        return this.#getSpeedBasedStyle(waypoint, style);
    }

    /* -------------------------------------------- */

    /** @override */
    _getSegmentStyle(waypoint) {
        const style = super._getSegmentStyle(waypoint);
        return this.#getSpeedBasedStyle(waypoint, style);
    }

    /* -------------------------------------------- */

    /** @override */
    _getGridHighlightStyle(waypoint, offset) {
        const style = super._getGridHighlightStyle(waypoint, offset);
        return this.#getSpeedBasedStyle(waypoint, style);
    }

    /* -------------------------------------------- */

    /**
     * Modify segment or grid-highlighting style based on movement speed.
     * Colors: green (within budget), yellow (1-2x budget), red (over 2x).
     * @param {TokenRulerWaypoint} waypoint - The waypoint
     * @param {object} style - The default styling
     * @returns {object} The adjusted style
     */
    #getSpeedBasedStyle(waypoint, style) {
        // Only apply to the local user's movement
        if (!(game.user.id in this.token._plannedMovement)
            || CONFIG.Token.movement.actions[waypoint.action]?.teleport) return style;

        // Get actor's movement speed for the current action
        const movement = this.token.actor?.system?.movement;
        if (!movement) return style;

        const speed = movement[waypoint.action] ?? 0;
        if (!speed) return style;

        // Color based on cost/speed ratio
        const { normal, double, triple } = CONFIG.rt.tokenRulerColors;
        const increment = (waypoint.measurement.cost - 0.1) / speed;
        if (increment <= 1) style.color = normal ?? style.color;
        else if (increment <= 2) style.color = double ?? style.color;
        else style.color = triple ?? style.color;
        return style;
    }
}
