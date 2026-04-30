import { WH40KBaseActor } from '../documents/base-actor.ts';

type StyleWithColor = { color?: PIXI.ColorSource };

/**
 * Custom Token Ruler for the WH40K RPG system.
 * Colors ruler segments based on movement speed budget (green/yellow/red).
 */
export default class TokenRulerWH40K extends foundry.canvas.placeables.tokens.TokenRuler {
    /** @inheritDoc */
    _getWaypointStyle(waypoint: foundry.canvas.placeables.tokens.TokenRuler.Waypoint) {
        const style = super._getWaypointStyle(waypoint);
        return this.#getSpeedBasedStyle(waypoint, style);
    }

    /* -------------------------------------------- */

    /** @override */
    _getSegmentStyle(waypoint: foundry.canvas.placeables.tokens.TokenRuler.Waypoint) {
        const style = super._getSegmentStyle(waypoint);
        return this.#getSpeedBasedStyle(waypoint, style);
    }

    /* -------------------------------------------- */

    /** @override */
    _getGridHighlightStyle(waypoint: foundry.canvas.placeables.tokens.TokenRuler.Waypoint, offset: foundry.grid.BaseGrid.Offset3D) {
        const style = super._getGridHighlightStyle(waypoint, offset);
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
        const token = this.token as any;
        if (!(game.user?.id && token?._plannedMovement) || (CONFIG as any).Token.movement.actions[waypoint.action as string]?.teleport) return style;

        // Get actor's movement speed for the current action
        const actor = this.token.actor as WH40KBaseActor | null;
        const movement = actor?.movement;
        if (!movement) return style;

        const speed = (movement as any)[waypoint.action as string] ?? 0;
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
