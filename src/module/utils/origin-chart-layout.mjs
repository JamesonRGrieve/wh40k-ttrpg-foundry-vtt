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

export class OriginChartLayout {
    /**
     * Compute layout data for all origins grouped by step.
     * @param {Array<Item>} allOrigins - All origin items from compendium
     * @param {Map<string, Item>} currentSelections - Currently selected origins
     * @param {boolean} guidedMode - Whether to enforce requirements
     * @param {string} direction - Direction of navigation ("forward" or "backward")
     * @returns {Object} Layout data organized by step
     */
    static computeFullChart(allOrigins, currentSelections, guidedMode = true, direction = DIRECTION.FORWARD) {
        const layout = {
            steps: [],
            connections: [],
            maxColumns: 0,
        };

        // Group origins by step
        const stepGroups = this._groupByStep(allOrigins);

        // Get step order based on direction
        const stepOrder = this._getStepOrder();

        // Compute layout for each step (always in forward order for consistent indexing)
        for (const [stepIndex, stepKey] of stepOrder.entries()) {
            const origins = stepGroups[stepKey] || [];
            const stepLayout = this._computeStepLayout(origins, stepIndex, currentSelections, guidedMode, direction);

            layout.steps.push(stepLayout);
            layout.maxColumns = Math.max(layout.maxColumns, stepLayout.maxPosition + 1);
        }

        // Compute connections between steps
        layout.connections = this._computeConnections(layout.steps, currentSelections);

        return layout;
    }

    /**
     * Get the ordered list of step keys.
     * @returns {Array<string>}
     * @private
     */
    static _getStepOrder() {
        return ["homeWorld", "birthright", "lureOfTheVoid", "trialsAndTravails", "motivation", "career"];
    }

    /**
     * Group origins by step.
     * @param {Array<Item>} origins
     * @returns {Object}
     * @private
     */
    static _groupByStep(origins) {
        const groups = {};

        for (const origin of origins) {
            const step = origin.system?.step;
            if (!step) continue;

            if (!groups[step]) groups[step] = [];
            groups[step].push(origin);
        }

        // Sort each group by primary position
        for (const step in groups) {
            groups[step].sort((a, b) => {
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
    static _getPositions(origin) {
        const positions = origin?.system?.pathPositions
            ?? origin?.system?.allPositions
            ?? origin?.system?.positions;

        if (Array.isArray(positions) && positions.length > 0) {
            return [...positions].sort((a, b) => a - b);
        }

        return [4];
    }

    /**
     * Resolve the active path positions for a selection.
     * @param {Item|object} origin
     * @param {Item|object|null} lastSelection
     * @returns {number[]}
     */
    static resolvePathPositions(origin, lastSelection) {
        const originPositions = this._getPositions(origin);

        if (!lastSelection) {
            return originPositions;
        }

        const allowedPositions = this._getAllowedPositions(lastSelection);
        const resolved = originPositions.filter(position => allowedPositions.has(position));

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
    static _computeStepLayout(origins, stepIndex, currentSelections, guidedMode, direction = DIRECTION.FORWARD) {
        const stepKey = this._getStepOrder()[stepIndex];
        const selectedOrigin = currentSelections.get(stepKey);

        const lastSelection = this._getLastSelection(stepIndex, currentSelections, direction);
        const allowedPositions = this._getAllowedPositions(lastSelection);

        const cards = [];
        let maxPosition = 0;
        const seenOrigins = new Set();

        for (const origin of origins) {
            if (seenOrigins.has(origin.id)) continue;
            seenOrigins.add(origin.id);

            const positions = this._getPositions(origin);
            const position = origin.system?.primaryPosition || 4;
            maxPosition = Math.max(maxPosition, position);

            const isSelected = selectedOrigin?.id === origin.id;
            const isSelectable = this._isSelectable(origin, lastSelection, allowedPositions, guidedMode);
            const isValidNext = this._isPositionAllowed(origin, allowedPositions);

            cards.push({
                origin: origin,
                id: origin.id,
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
    static _getAllowedPositions(lastSelection) {
        if (!lastSelection) return null;

        const allowed = new Set();
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
    static _isSelectable(origin, lastSelection, allowedPositions, guidedMode) {
        if (!guidedMode) return true;
        if (!lastSelection) return true;

        const requirements = origin.system?.requirements;
        const lastId = lastSelection.system?.identifier;

        if (requirements?.previousSteps?.length > 0) {
            if (!requirements.previousSteps.includes(lastId)) {
                return false;
            }
        }

        if (requirements?.excludedSteps?.length > 0) {
            if (requirements.excludedSteps.includes(lastId)) {
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
    static _isPositionAllowed(origin, allowedPositions) {
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
    static _getLastSelection(stepIndex, currentSelections, direction) {
        if (direction === DIRECTION.FORWARD) {
            for (let i = stepIndex - 1; i >= 0; i--) {
                const prevStepKey = this._getStepOrder()[i];
                if (currentSelections.has(prevStepKey)) {
                    return currentSelections.get(prevStepKey);
                }
            }
            return null;
        }

        for (let i = stepIndex + 1; i < 6; i++) {
            const nextStepKey = this._getStepOrder()[i];
            if (currentSelections.has(nextStepKey)) {
                return currentSelections.get(nextStepKey);
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
    static _getStepLabel(stepKey) {
        const key = `RT.OriginPath.${stepKey.charAt(0).toUpperCase() + stepKey.slice(1)}`;
        return game.i18n.localize(key);
    }

    /**
     * Compute connection paths between steps.
     * @param {Array} steps - Step layout data
     * @param {Map<string, Item>} currentSelections - Current selections
     * @returns {Array}
     * @private
     */
    static _computeConnections(steps, currentSelections) {
        const connections = [];

        for (let i = 0; i < steps.length - 1; i++) {
            const fromStep = steps[i];
            const toStep = steps[i + 1];

            for (const fromCard of fromStep.cards) {
                const showFromThis = fromCard.isSelected || !fromStep.hasSelection;
                if (!showFromThis) continue;

                const selectedOrigin = fromCard.isSelected
                    ? currentSelections.get(fromStep.stepKey)
                    : null;
                const originForPath = selectedOrigin ?? fromCard.origin;
                const allowedPositions = this._getAllowedPositions(originForPath);

                for (const toCard of toStep.cards) {
                    if (!this._isPositionAllowed(toCard.origin, allowedPositions)) {
                        continue;
                    }

                    connections.push({
                        id: `conn-${fromCard.id}-${toCard.id}`,
                        fromStep: fromStep.stepIndex,
                        toStep: toStep.stepIndex,
                        fromPosition: fromCard.position,
                        toPosition: toCard.position,
                        fromId: fromCard.id,
                        toId: toCard.id,
                        isActive: fromCard.isSelected,
                        isValid: fromCard.isSelected && toCard.isSelectable,
                        pathData: this._createSVGPath(fromCard.gridColumn, fromCard.gridRow, toCard.gridColumn, toCard.gridRow),
                    });
                }
            }
        }

        return connections;
    }

    /**
     * Create SVG path data for connection line.
     * @param {number} fromCol
     * @param {number} fromRow
     * @param {number} toCol
     * @param {number} toRow
     * @returns {string}
     * @private
     */
    static _createSVGPath(fromCol, fromRow, toCol, toRow) {
        const cardWidth = 150;
        const cardHeight = 200;
        const xGap = 20;
        const yGap = 40;

        const x1 = (fromCol - 1) * (cardWidth + xGap) + cardWidth / 2;
        const y1 = (fromRow - 1) * (cardHeight + yGap) + cardHeight;

        const x2 = (toCol - 1) * (cardWidth + xGap) + cardWidth / 2;
        const y2 = (toRow - 1) * (cardHeight + yGap);

        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;

        return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
    }

    /**
     * Get valid next options for a given selection.
     * Used for highlighting in guided mode.
     *
     * @param {Item} currentSelection - The current selection
     * @param {Array<Item>} targetStepOrigins - Origins in the target step
     * @returns {Array<Item>}
     */
    static getValidNextOptions(currentSelection, targetStepOrigins) {
        if (!currentSelection) return targetStepOrigins;

        const validOptions = [];
        const allowedPositions = this._getAllowedPositions(currentSelection);

        for (const origin of targetStepOrigins) {
            if (!this._isPositionAllowed(origin, allowedPositions)) {
                continue;
            }

            const requirements = origin.system?.requirements;
            const currentId = currentSelection.system?.identifier;

            if (requirements?.previousSteps?.length > 0) {
                if (!requirements.previousSteps.includes(currentId)) continue;
            }

            if (requirements?.excludedSteps?.length > 0) {
                if (requirements.excludedSteps.includes(currentId)) continue;
            }

            validOptions.push(origin);
        }

        return validOptions;
    }

    /**
     * Calculate chart dimensions for CSS.
     * @param {number} maxColumns
     * @param {number} numRows
     * @returns {Object}
     */
    static calculateChartDimensions(maxColumns, numRows) {
        const cardWidth = 150;
        const cardHeight = 200;
        const xGap = 20;
        const yGap = 40;

        return {
            width: maxColumns * (cardWidth + xGap),
            height: numRows * (cardHeight + yGap),
            cardWidth: cardWidth,
            cardHeight: cardHeight,
            columnGap: xGap,
            rowGap: yGap,
        };
    }
}
