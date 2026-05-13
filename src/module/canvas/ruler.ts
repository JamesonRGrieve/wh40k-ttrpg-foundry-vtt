type StyleWithColor = { color?: PIXI.ColorSource | undefined };

// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry internal _plannedMovement has no shipped type; only used in null checks
type RulerToken = { _plannedMovement?: unknown };
type WH40KConfig = {
    Token: { movement: { actions: Record<string, { teleport?: boolean } | undefined> } };
    wh40k: { tokenRulerColors: { normal?: PIXI.ColorSource; double?: PIXI.ColorSource; triple?: PIXI.ColorSource } };
};

/**
 * Custom Token Ruler for the WH40K RPG system.
 * Colors ruler segments based on movement speed budget (green/yellow/red).
 */
export default class TokenRulerWH40K extends foundry.canvas.placeables.tokens.TokenRuler {
    /** @inheritDoc */
    override _getWaypointStyle(waypoint: foundry.canvas.placeables.tokens.TokenRuler.Waypoint): foundry.canvas.interaction.Ruler.WaypointStyle {
        const style = super._getWaypointStyle(waypoint);
        return this.#getSpeedBasedStyle(waypoint, style);
    }

    /* -------------------------------------------- */

    /** @override */
    override _getSegmentStyle(waypoint: foundry.canvas.placeables.tokens.TokenRuler.Waypoint): foundry.canvas.interaction.Ruler.SegmentStyle {
        const style = super._getSegmentStyle(waypoint);
        return this.#getSpeedBasedStyle(waypoint, style);
    }

    /* -------------------------------------------- */

    /** @override */
    override _getGridHighlightStyle(waypoint: foundry.canvas.placeables.tokens.TokenRuler.Waypoint, offset: foundry.grid.BaseGrid.Offset3D): StyleWithColor {
        const style = super._getGridHighlightStyle(waypoint, offset) as StyleWithColor;
        return this.#getSpeedBasedStyle(waypoint, style);
    }

    /* -------------------------------------------- */

    /**
     * Modify segment or grid-highlighting style based on movement speed.
     * Colors: green (within budget), yellow (1-2x budget), red (over 2x).
     * @param {foundry.canvas.placeables.tokens.TokenRuler.Waypoint} waypoint - The waypoint
     * @param {T} style - The default styling
     * @returns {T} The adjusted style
     */
    #getSpeedBasedStyle<T extends StyleWithColor>(waypoint: foundry.canvas.placeables.tokens.TokenRuler.Waypoint, style: T): T {
        // Only apply to the local user's movement
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Token class internals not in shipped types
        const token = this.token as unknown as RulerToken;
        // eslint-disable-next-line no-restricted-syntax -- boundary: CONFIG is untyped in Foundry; Record<string,any> is documented exception
        const config = CONFIG as unknown as WH40KConfig;
        const action = waypoint.action;
        if (
            !(game.user.id && token._plannedMovement !== null && token._plannedMovement !== undefined) ||
            config.Token.movement.actions[action]?.teleport === true
        )
            return style;

        // Get actor's movement speed for the current action
        const actor = this.token.actor;
        const movement = actor?.movement as Record<string, number> | undefined;
        if (!movement) return style;

        const speed = movement[action] ?? 0;
        if (speed === 0) return style;

        // Color based on cost/speed ratio
        const { normal, double, triple } = config.wh40k.tokenRulerColors;
        const increment = (waypoint.measurement.cost - 0.1) / speed;
        if (increment <= 1) style.color = normal ?? style.color;
        else if (increment <= 2) style.color = double ?? style.color;
        else style.color = triple ?? style.color;
        return style;
    }
}
