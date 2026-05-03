/**
 * Origin Chart Layout Utility
 *
 * Computes layout and guided availability for origin paths.
 *
 * Connectivity is driven by the most recent confirmed selection:
 * - Take all positions of the last selection.
 * - Allowed positions are that set plus/minus 1 (clamped to 0-8).
 * - An origin is valid if ANY of its positions intersect those allowed positions.
 *
 * Multi-position origins use their full positions array (not just primary).
 * Direction only determines which prior selection is considered "most recent".
 */

/**
 * Direction constants for path navigation
 */
export const DIRECTION = {
    FORWARD: 'forward',
    BACKWARD: 'backward',
};

type Direction = (typeof DIRECTION)[keyof typeof DIRECTION];

type OriginLike = {
    id?: string;
    _id?: string;
    uuid?: string;
    name: string;
    img?: string;
    _sourceUuid?: string;
    system?: {
        step?: string;
        pathPositions?: number[];
        allPositions?: number[];
        positions?: number[];
        primaryPosition?: number;
        identifier?: string;
        xpCost?: number;
        isAdvancedOrigin?: boolean;
        hasChoices?: boolean;
        requirements?: {
            previousSteps?: string[];
            excludedSteps?: string[];
        };
    };
};

type OriginSelectionMap = Map<string, OriginLike>;

type OriginCard = {
    origin: OriginLike;
    id: string;
    uuid?: string;
    name: string;
    img?: string;
    position: number;
    gridColumn: number;
    gridRow: number;
    isSelected: boolean;
    isSelectable: boolean;
    isValidNext: boolean;
    isDisabled: boolean;
    isMultiPosition: boolean;
    allPositions: number[];
    xpCost: number;
    isAdvanced: boolean;
    hasChoices: boolean;
};

type StepLayout = {
    stepKey: string;
    stepIndex: number;
    stepLabel: string;
    cards: OriginCard[];
    maxPosition: number;
    hasSelection: boolean;
};

type ChartLayout = {
    steps: StepLayout[];
    maxColumns: number;
};

export class OriginChartLayout {
    /**
     * Compute layout data for all origins grouped by step.
     * @param {Array<Item>} allOrigins - All origin items from compendium
     * @param {Map<string, Item>} currentSelections - Currently selected origins
     * @param {boolean} guidedMode - Whether to enforce requirements
     * @param {string} direction - Direction of navigation ("forward" or "backward")
     * @param {string[]} stepKeys - Ordered step keys for this game system (required)
     * @returns {Object} Layout data organized by step
     */
    static computeFullChart(
        allOrigins: OriginLike[],
        currentSelections: OriginSelectionMap,
        guidedMode = true,
        direction: Direction = DIRECTION.FORWARD,
        stepKeys: string[],
    ): ChartLayout {
        const layout: ChartLayout = {
            steps: [],
            maxColumns: 0,
        };

        // Group origins by step
        const stepGroups = this._groupByStep(allOrigins);

        const stepOrder = stepKeys;

        // Compute layout for each step (always in forward order for consistent indexing)
        for (const [stepIndex, stepKey] of stepOrder.entries()) {
            const origins = stepGroups[stepKey] || [];
            const stepLayout = this._computeStepLayout(origins, stepIndex, stepKey, currentSelections, guidedMode, direction, stepOrder);

            layout.steps.push(stepLayout);
            layout.maxColumns = Math.max(layout.maxColumns, stepLayout.maxPosition + 1);
        }

        return layout;
    }

    /**
     * Group origins by step.
     * @param {Array<Item>} origins
     * @returns {Object}
     * @private
     */
    static _groupByStep(origins: OriginLike[]): Record<string, OriginLike[]> {
        const groups: Record<string, OriginLike[]> = {};

        for (const origin of origins) {
            const step = origin.system?.step;
            if (!step) continue;

            if (!groups[step]) groups[step] = [];
            groups[step].push(origin);
        }

        // Sort each group by primary position
        for (const step in groups) {
            groups[step]?.sort((a: OriginLike, b: OriginLike) => {
                const posA = a.system?.primaryPosition || 4;
                const posB = b.system?.primaryPosition || 4;
                return posA - posB;
            });
        }

        return groups;
    }

    /**
     * Get the normalized positions array for an origin or selection.
     * @param {Item|object|null} origin
     * @returns {number[]}
     * @private
     */
    static _getPositions(origin: OriginLike | null | undefined): number[] {
        const positions = origin?.system?.pathPositions ?? origin?.system?.allPositions ?? origin?.system?.positions;

        if (Array.isArray(positions) && positions.length > 0) {
            return [...positions].sort((a: number, b: number) => a - b);
        }

        return [4];
    }

    /**
     * Resolve the active path positions for a selection.
     * @param {Item|object} origin
     * @param {Item|object|null} lastSelection
     * @returns {number[]}
     */
    static resolvePathPositions(origin: OriginLike, lastSelection: OriginLike | null): number[] {
        const originPositions = this._getPositions(origin);

        if (!lastSelection) {
            return originPositions;
        }

        const allowedPositions = this._getAllowedPositions(lastSelection);
        if (!allowedPositions) return originPositions;
        const resolved = originPositions.filter((position) => allowedPositions.has(position));

        return resolved.length > 0 ? resolved : originPositions;
    }

    /**
     * Compute layout for a single step.
     *
     * Connectivity Rule: Only the most recent confirmed selection matters.
     * - Allowed positions = last selection positions +/- 1 (clamped to 0-8)
     * - An origin is valid if ANY of its positions intersect allowed positions
     *
     * @param {Array<Item>} origins - Origins in this step
     * @param {number} stepIndex - Step index (0-5)
     * @param {Map<string, Item>} currentSelections - Current selections
     * @param {boolean} guidedMode - Guided mode flag
     * @param {string} direction - Direction of navigation (affects which selection is "last")
     * @returns {Object}
     * @private
     */
    static _computeStepLayout(
        origins: OriginLike[],
        stepIndex: number,
        stepKey: string,
        currentSelections: OriginSelectionMap,
        guidedMode: boolean,
        direction: Direction = DIRECTION.FORWARD,
        stepOrder: string[],
    ): StepLayout {
        const selectedOrigin = currentSelections.get(stepKey);

        const lastSelection = this._getLastSelection(stepIndex, currentSelections, direction, stepOrder);
        const allowedPositions = this._getAllowedPositions(lastSelection);

        const cards: OriginCard[] = [];
        let maxPosition = 0;
        const seenOrigins = new Set();

        for (const origin of origins) {
            const originId = origin.id || origin._id || origin.uuid || origin.name;
            if (seenOrigins.has(originId)) continue;
            seenOrigins.add(originId);

            const positions = this._getPositions(origin);
            const position = origin.system?.primaryPosition || 4;
            maxPosition = Math.max(maxPosition, position);

            const selectedIds = new Set(
                [selectedOrigin?.id, selectedOrigin?._id, selectedOrigin?.uuid, selectedOrigin?._sourceUuid, selectedOrigin?.system?.identifier].filter(
                    Boolean,
                ),
            );
            const isSelected =
                selectedIds.has(originId) ||
                (origin.uuid ? selectedIds.has(origin.uuid) : false) ||
                (origin.system?.identifier ? selectedIds.has(origin.system.identifier) : false);
            const isSelectable = this._isSelectable(origin, lastSelection, allowedPositions, guidedMode);
            const isValidNext = this._isPositionAllowed(origin, allowedPositions);

            cards.push({
                origin: origin,
                id: originId,
                uuid: origin.uuid,
                name: origin.name,
                img: origin.img,
                position: position,
                gridColumn: position + 1,
                gridRow: stepIndex + 1,

                isSelected: isSelected,
                isSelectable: isSelectable,
                isValidNext: isValidNext,
                isDisabled: guidedMode && !isSelectable,

                isMultiPosition: positions.length > 1,
                allPositions: positions,

                xpCost: origin.system?.xpCost || 0,
                isAdvanced: origin.system?.isAdvancedOrigin || false,
                hasChoices: origin.system?.hasChoices || false,
            });
        }

        return {
            stepKey: stepKey,
            stepIndex: stepIndex,
            stepLabel: this._getStepLabel(stepKey),
            cards: cards,
            maxPosition: maxPosition,
            hasSelection: !!selectedOrigin,
        };
    }

    /**
     * Calculate allowed positions based on a prior selection.
     * Rule: each position connects to [pos-1, pos, pos+1] (clamped to 0-8).
     * @param {Item|null} lastSelection
     * @returns {Set<number>}
     * @private
     */
    static _getAllowedPositions(lastSelection: OriginLike | null): Set<number> | null {
        if (!lastSelection) return null;

        const allowed = new Set<number>();
        const positions = this._getPositions(lastSelection);

        for (const pos of positions) {
            if (pos > 0) allowed.add(pos - 1);
            allowed.add(pos);
            if (pos < 8) allowed.add(pos + 1);
        }

        return allowed;
    }

    /**
     * Determine if an origin is selectable.
     * Checks requirements and positional connectivity.
     *
     * @param {Item} origin - The origin to check
     * @param {Item|null} lastSelection - The last confirmed selection
     * @param {Set<number>|null} allowedPositions - Allowed positions from last selection
     * @param {boolean} guidedMode - Whether guided mode is enabled
     * @returns {boolean}
     * @private
     */
    static _isSelectable(origin: OriginLike, lastSelection: OriginLike | null, allowedPositions: Set<number> | null, guidedMode: boolean): boolean {
        if (!guidedMode) return true;
        if (!lastSelection) return true;

        const requirements = origin.system?.requirements;
        const lastId = lastSelection.system?.identifier;

        if (lastId && (requirements?.previousSteps?.length ?? 0) > 0) {
            if (!requirements?.previousSteps?.includes(lastId)) {
                return false;
            }
        }

        if (lastId && (requirements?.excludedSteps?.length ?? 0) > 0) {
            if (requirements?.excludedSteps?.includes(lastId)) {
                return false;
            }
        }

        return this._isPositionAllowed(origin, allowedPositions);
    }

    /**
     * Check if an origin matches the allowed position set.
     * @param {Item} origin
     * @param {Set<number>|null} allowedPositions
     * @returns {boolean}
     * @private
     */
    static _isPositionAllowed(origin: OriginLike, allowedPositions: Set<number> | null): boolean {
        if (!allowedPositions) return true;

        const originPositions = this._getPositions(origin);
        for (const pos of originPositions) {
            if (allowedPositions.has(pos)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Resolve the most recent confirmed selection relative to a step.
     * @param {number} stepIndex
     * @param {Map<string, Item>} currentSelections
     * @param {string} direction
     * @returns {Item|null}
     * @private
     */
    static _getLastSelection(stepIndex: number, currentSelections: OriginSelectionMap, direction: Direction, stepOrder: string[]): OriginLike | null {
        if (direction === DIRECTION.FORWARD) {
            for (let i = stepIndex - 1; i >= 0; i--) {
                const prevStepKey = stepOrder[i];
                if (prevStepKey && currentSelections.has(prevStepKey)) {
                    return currentSelections.get(prevStepKey) ?? null;
                }
            }
            return null;
        }

        for (let i = stepIndex + 1; i < stepOrder.length; i++) {
            const nextStepKey = stepOrder[i];
            if (nextStepKey && currentSelections.has(nextStepKey)) {
                return currentSelections.get(nextStepKey) ?? null;
            }
        }

        return null;
    }

    /**
     * Get localized step label.
     * @param {string} stepKey
     * @returns {string}
     * @private
     */
    static _getStepLabel(stepKey: string): string {
        const key = `WH40K.OriginPath.${stepKey.charAt(0).toUpperCase() + stepKey.slice(1)}`;
        return game.i18n.localize(key);
    }
}
