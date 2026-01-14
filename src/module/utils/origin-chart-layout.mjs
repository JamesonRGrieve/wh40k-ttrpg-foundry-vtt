/**
 * Origin Chart Layout Utility
 *
 * Computes CSS Grid layout for the origin path chart visualization using
 * a simple ±1 connectivity rule for position-based navigation.
 * 
 * **Core Connectivity Rule**:
 * Position N connects to positions [N-1, N, N+1] (clamped to 0-8 range).
 * This rule is bidirectional - if A connects to B, then B connects to A.
 * 
 * **Multi-Position Origins**:
 * Some origins occupy multiple positions (e.g., [1, 5]). They connect
 * if ANY of their positions satisfy the ±1 rule with the last selection.
 * 
 * **Navigation Direction**:
 * - FORWARD: homeWorld → career (check selections at lower stepIndex)
 * - BACKWARD: career → homeWorld (check selections at higher stepIndex)
 * - Direction determines which selection is "last" for connectivity
 * - The ±1 rule itself is direction-independent
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
   * Compute layout for a single step.
   * 
   * Connectivity Rule: Only the LAST confirmed selection matters.
   * - Position N connects to positions [N-1, N, N+1] (clamped to 0-8)
   * - This rule is bidirectional and independent of navigation direction
   * - Direction only affects which selection to check (forward: lower index, backward: higher index)
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
    
    // Find the last confirmed selection based on navigation direction
    // FORWARD: search backward through array (lower indices)
    // BACKWARD: search forward through array (higher indices)
    let lastSelection = null;
    
    if (direction === DIRECTION.FORWARD) {
      // Search backward from current step
      for (let i = stepIndex - 1; i >= 0; i--) {
        const prevStepKey = this._getStepOrder()[i];
        if (currentSelections.has(prevStepKey)) {
          lastSelection = currentSelections.get(prevStepKey);
          break;
        }
      }
    } else {
      // BACKWARD: search forward from current step (higher indices were selected first)
      for (let i = stepIndex + 1; i < 6; i++) {
        const nextStepKey = this._getStepOrder()[i];
        if (currentSelections.has(nextStepKey)) {
          lastSelection = currentSelections.get(nextStepKey);
          break;
        }
      }
    }
    
    // Use lastSelection for connectivity checks
    const adjacentSelection = lastSelection;

    const cards = [];
    let maxPosition = 0;
    const seenOrigins = new Set(); // Track which origins we've already added

    for (const origin of origins) {
      // Skip if we've already added this origin (prevent duplicates)
      if (seenOrigins.has(origin.id)) continue;
      seenOrigins.add(origin.id);

      // Get all positions for this origin (single or multiple for multi-parent support)
      const positions = origin.system?.allPositions || [4];
      
      // Use the primary position for the card placement
      const position = origin.system?.primaryPosition || 4;
      maxPosition = Math.max(maxPosition, position);

      // Determine if this origin is selectable
      const isSelected = selectedOrigin?.id === origin.id;
      const isSelectable = this._isSelectable(origin, adjacentSelection, guidedMode);
      const isValidNext = this._canConnect(origin, adjacentSelection); // Same as connectivity check

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
        
        // Multi-position indicator
        isMultiPosition: positions.length > 1,
        allPositions: positions,

        // Metadata
        xpCost: origin.system?.xpCost || 0,
        isAdvanced: origin.system?.isAdvancedOrigin || false,
        hasChoices: origin.system?.hasChoices || false
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
   * Simple rule: position ±1 (with edge clamping to 0-8 range)
   * @param {number} position
   * @returns {Array<number>}
   * @private
   */
  static _calculateConnections(position) {
    const connections = [];
    
    // Add position - 1 (if valid)
    if (position > 0) connections.push(position - 1);
    
    // Add position itself
    connections.push(position);
    
    // Add position + 1 (if valid)
    if (position < 8) connections.push(position + 1);
    
    return connections;
  }

  /**
   * Determine if an origin is selectable.
   * Checks requirements and positional connectivity.
   * 
   * @param {Item} origin - The origin to check
   * @param {Item|null} lastSelection - The last confirmed selection
   * @param {boolean} guidedMode - Whether guided mode is enabled
   * @returns {boolean}
   * @private
   */
  static _isSelectable(origin, lastSelection, guidedMode) {
    if (!guidedMode) return true; // Free mode - everything selectable

    // First step is always selectable
    if (!lastSelection) return true;

    // Check requirements
    const requirements = origin.system?.requirements;

    // Check previousSteps requirement
    if (requirements?.previousSteps?.length > 0) {
      const lastId = lastSelection.system?.identifier;
      if (!requirements.previousSteps.includes(lastId)) {
        return false;
      }
    }

    // Check excludedSteps requirement
    if (requirements?.excludedSteps?.length > 0) {
      const lastId = lastSelection.system?.identifier;
      if (requirements.excludedSteps.includes(lastId)) {
        return false;
      }
    }

    // Check positional connectivity using ±1 rule
    return this._canConnect(origin, lastSelection);
  }

  /**
   * Check if two origins can connect based on the ±1 position rule.
   * 
   * Rule: Position N connects to [N-1, N, N+1] (clamped to 0-8 range)
   * This is bidirectional - if A connects to B, then B connects to A.
   * For multi-position origins, checks if ANY position pair can connect.
   * 
   * @param {Item} origin - The origin to check
   * @param {Item|null} lastSelection - The last confirmed selection
   * @returns {boolean}
   * @private
   */
  static _canConnect(origin, lastSelection) {
    if (!lastSelection) return true;

    const originPositions = origin.system?.allPositions || [4];
    const lastPositions = lastSelection.system?.allPositions || [4];

    // For each position the origin occupies, check if it can connect to any last selection position
    // Using ±1 rule: position N connects to [N-1, N, N+1]
    for (const originPos of originPositions) {
      const originConnectsTo = this._calculateConnections(originPos);
      
      for (const lastPos of lastPositions) {
        if (originConnectsTo.includes(lastPos)) {
          return true; // Found a valid connection
        }
      }
    }

    return false; // No valid connections found
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
          // Calculate connectsTo dynamically from fromCard's position
          const fromConnections = this._calculateConnections(fromCard.position);
          
          // Check if connection exists
          if (fromConnections.includes(toCard.position)) {
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
   * Uses ±1 connectivity rule:
   * - Each position connects to [pos-1, pos, pos+1] (bidirectional)
   * - Multi-position origins check if ANY of their positions can connect
   * 
   * @param {Item} currentSelection - The current selection
   * @param {Array<Item>} targetStepOrigins - Origins in the target step
   * @returns {Array<Item>}
   */
  static getValidNextOptions(currentSelection, targetStepOrigins) {
    if (!currentSelection) return targetStepOrigins;

    const validOptions = [];
    const currentPositions = currentSelection.system?.allPositions || [4];

    for (const origin of targetStepOrigins) {
      const originPositions = origin.system?.allPositions || [4];

      // Check if ANY combination of positions can connect using ±1 rule
      let isConnected = false;
      for (const currentPos of currentPositions) {
        const currentConnections = this._calculateConnections(currentPos);
        if (originPositions.some(pos => currentConnections.includes(pos))) {
          isConnected = true;
          break;
        }
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
