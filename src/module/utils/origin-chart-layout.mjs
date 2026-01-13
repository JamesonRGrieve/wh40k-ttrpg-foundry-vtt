/**
 * Origin Chart Layout Utility
 *
 * Computes CSS Grid layout for the origin path chart visualization.
 * Uses stepIndex and position from origin path items to create
 * a visual branching chart showing valid navigation paths.
 * 
 * Supports bidirectional navigation (forward: homeWorld->career, backward: career->homeWorld)
 */

/**
 * Direction constants for path navigation
 */
export const DIRECTION = {
  FORWARD: "forward",
  BACKWARD: "backward"
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
      maxColumns: 0
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
    return [
      "homeWorld",
      "birthright",
      "lureOfTheVoid",
      "trialsAndTravails",
      "motivation",
      "career"
    ];
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

    // Sort each group by position
    for (const step in groups) {
      groups[step].sort((a, b) => {
        const posA = a.system?.position || 0;
        const posB = b.system?.position || 0;
        return posA - posB;
      });
    }

    return groups;
  }

  /**
   * Compute layout for a single step.
   * 
   * Navigation Direction Logic:
   * - FORWARD (homeWorld → career): stepIndex 0-5 in that order
   *   - When at step N, check against selection at step N-1 (already selected)
   *   - Previous selection's connectsTo must include current origin's position
   * 
   * - BACKWARD (career → homeWorld): stepIndex 5-0 in reverse order
   *   - When at step N, check against selection at step N+1 (already selected in backward nav)
   *   - Current origin's connectsTo must include next step's position
   * 
   * @param {Array<Item>} origins - Origins in this step
   * @param {number} stepIndex - Step index (0-5)
   * @param {Map<string, Item>} currentSelections - Current selections
   * @param {boolean} guidedMode - Guided mode flag
   * @param {string} direction - Direction of navigation
   * @returns {Object}
   * @private
   */
  static _computeStepLayout(origins, stepIndex, currentSelections, guidedMode, direction = DIRECTION.FORWARD) {
    const stepKey = this._getStepOrder()[stepIndex];
    const selectedOrigin = currentSelections.get(stepKey);
    
    // For connectivity checking, we need to look at the adjacent step in navigation order
    // Forward: previous in array = stepIndex - 1 (e.g., homeWorld before birthright)
    // Backward: next in array = stepIndex + 1 (e.g., motivation after career in backward nav)
    let adjacentStep = null;
    let adjacentSelection = null;
    
    if (direction === DIRECTION.FORWARD) {
      // Forward: look at the previous step in the step array
      adjacentStep = stepIndex > 0 ? this._getStepOrder()[stepIndex - 1] : null;
    } else {
      // Backward: look at the next step in the step array (the one selected earlier in backward nav)
      adjacentStep = stepIndex < 5 ? this._getStepOrder()[stepIndex + 1] : null;
    }
    adjacentSelection = adjacentStep ? currentSelections.get(adjacentStep) : null;

    const cards = [];
    let maxPosition = 0;

    for (const origin of origins) {
      const position = origin.system?.position || 0;
      maxPosition = Math.max(maxPosition, position);

      // Determine if this origin is selectable
      const isSelected = selectedOrigin?.id === origin.id;
      const isSelectable = this._isSelectable(origin, adjacentSelection, guidedMode, direction);
      const isValidNext = this._isValidNext(origin, adjacentSelection, direction);

      cards.push({
        origin: origin,
        id: origin.id,
        uuid: origin.uuid,
        name: origin.name,
        img: origin.img,
        position: position,
        gridColumn: position + 1, // CSS Grid is 1-indexed
        gridRow: stepIndex + 1,

        // State flags
        isSelected: isSelected,
        isSelectable: isSelectable,
        isValidNext: isValidNext,
        isDisabled: guidedMode && !isSelectable,

        // Metadata
        xpCost: origin.system?.xpCost || 0,
        isAdvanced: origin.system?.isAdvancedOrigin || false,
        hasChoices: origin.system?.hasChoices || false,

        // Navigation
        connectsTo: origin.system?.navigation?.connectsTo || this._calculateConnections(position),
        isEdgeLeft: position === 0,
        isEdgeRight: position >= 7
      });
    }

    return {
      stepKey: stepKey,
      stepIndex: stepIndex,
      stepLabel: this._getStepLabel(stepKey),
      cards: cards,
      maxPosition: maxPosition,
      hasSelection: !!selectedOrigin
    };
  }

  /**
   * Calculate which positions this origin connects to in the next step.
   * @param {number} position
   * @returns {Array<number>}
   * @private
   */
  static _calculateConnections(position) {
    // Rule from the book: connects to position-1, position, position+1
    // Edge cases: edges have only 2 connections
    if (position === 0) {
      return [0, 1];
    } else if (position >= 7) {
      return [position - 1, position];
    } else {
      return [position - 1, position, position + 1];
    }
  }

  /**
   * Determine if an origin is selectable.
   * @param {Item} origin
   * @param {Item|null} adjacentSelection - The selection from the adjacent step (based on direction)
   * @param {boolean} guidedMode
   * @param {string} direction - Direction of navigation
   * @returns {boolean}
   * @private
   */
  static _isSelectable(origin, adjacentSelection, guidedMode, direction = DIRECTION.FORWARD) {
    if (!guidedMode) return true; // Free mode - everything selectable

    // First step (in navigation direction) is always selectable
    if (!adjacentSelection) return true;

    // Check requirements
    const requirements = origin.system?.requirements;

    // Check previousSteps requirement
    if (requirements?.previousSteps?.length > 0) {
      const adjacentId = adjacentSelection.system?.identifier;
      if (!requirements.previousSteps.includes(adjacentId)) {
        return false;
      }
    }

    // Check excludedSteps requirement
    if (requirements?.excludedSteps?.length > 0) {
      const adjacentId = adjacentSelection.system?.identifier;
      if (requirements.excludedSteps.includes(adjacentId)) {
        return false;
      }
    }

    // Check position connectivity
    return this._isValidNext(origin, adjacentSelection, direction);
  }

  /**
   * Check if origin is valid based on position connectivity.
   * 
   * Connectivity Rules:
   * - FORWARD navigation: Check if the PREVIOUS selection's connectsTo includes THIS origin's position
   *   Example: If Birthright (pos 3) was selected, it can connect to homeWorld at positions 2, 3, or 4
   * 
   * - BACKWARD navigation: Check if THIS origin's connectsTo includes the NEXT selection's position
   *   Example: If selecting Motivation (pos 4), check if it can connect to already-selected Career (pos 3)
   * 
   * @param {Item} origin - The origin being checked for validity
   * @param {Item|null} adjacentSelection - The adjacent selection (previous in forward, next in backward)
   * @param {string} direction - Navigation direction
   * @returns {boolean}
   * @private
   */
  static _isValidNext(origin, adjacentSelection, direction = DIRECTION.FORWARD) {
    if (!adjacentSelection) return true;

    const originPos = origin.system?.position || 0;
    const adjacentPos = adjacentSelection.system?.position || 0;
    
    if (direction === DIRECTION.FORWARD) {
      // Forward: check if the adjacent (previous) selection's connectsTo includes this origin's position
      const adjacentConnections = adjacentSelection.system?.navigation?.connectsTo ||
                                  this._calculateConnections(adjacentPos);
      return adjacentConnections.includes(originPos);
    } else {
      // Backward: check if THIS origin's connectsTo includes the adjacent (next step) position
      const originConnections = origin.system?.navigation?.connectsTo ||
                                this._calculateConnections(originPos);
      return originConnections.includes(adjacentPos);
    }
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
        // Only show connections from selected card or in preview mode
        const showFromThis = fromCard.isSelected || !fromStep.hasSelection;

        if (!showFromThis) continue;

        for (const toCard of toStep.cards) {
          // Check if connection exists
          if (fromCard.connectsTo.includes(toCard.position)) {
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
              pathData: this._createSVGPath(
                fromCard.gridColumn,
                fromCard.gridRow,
                toCard.gridColumn,
                toCard.gridRow
              )
            });
          }
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
    // Calculate pixel positions (approximate - will be adjusted by CSS)
    const cardWidth = 150;
    const cardHeight = 200;
    const xGap = 20;
    const yGap = 40;

    // Start at bottom center of from-card
    const x1 = (fromCol - 1) * (cardWidth + xGap) + cardWidth / 2;
    const y1 = (fromRow - 1) * (cardHeight + yGap) + cardHeight;

    // End at top center of to-card
    const x2 = (toCol - 1) * (cardWidth + xGap) + cardWidth / 2;
    const y2 = (toRow - 1) * (cardHeight + yGap);

    // Create quadratic bezier curve
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;

    return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
  }

  /**
   * Get valid next options for a given selection.
   * Used for highlighting in guided mode.
   * 
   * Navigation Direction Logic:
   * - FORWARD: Current selection's connectsTo determines valid next positions
   * - BACKWARD: Target origin's connectsTo must include current selection's position
   * 
   * @param {Item} currentSelection - The current selection in navigation order
   * @param {Array<Item>} targetStepOrigins - Origins in the target step
   * @param {string} direction - Direction of navigation
   * @returns {Array<Item>}
   */
  static getValidNextOptions(currentSelection, targetStepOrigins, direction = DIRECTION.FORWARD) {
    if (!currentSelection) return targetStepOrigins;

    const validOptions = [];
    const currentPos = currentSelection.system?.position || 0;
    const currentConnections = currentSelection.system?.navigation?.connectsTo ||
                               this._calculateConnections(currentPos);

    for (const origin of targetStepOrigins) {
      const originPos = origin.system?.position || 0;
      const originConnections = origin.system?.navigation?.connectsTo ||
                                this._calculateConnections(originPos);

      // Check position connectivity based on direction
      let isConnected = false;
      if (direction === DIRECTION.FORWARD) {
        // Forward: current selection's connectsTo includes target origin's position
        isConnected = currentConnections.includes(originPos);
      } else {
        // Backward: target origin's connectsTo includes current selection's position
        isConnected = originConnections.includes(currentPos);
      }
      
      if (!isConnected) continue;

      // Check requirements (previousSteps/excludedSteps)
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
      rowGap: yGap
    };
  }
}
