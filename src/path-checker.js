/**
 * Path Checker Helper Functions
 * 
 * Checks if a direct path between source and target is clear of elements
 */

/**
 * Check if direct vertical path is clear (for back-flows going up or down)
 * @param {string} sourceId - Source element ID
 * @param {string} targetId - Target element ID
 * @param {Object} sourcePos - Source position {lane, layer, row}
 * @param {Object} targetPos - Target position {lane, layer, row}
 * @param {Map} positions - All element positions
 * @param {Map} coordinates - All element coordinates
 * @param {string} direction - "up" or "down"
 * @returns {boolean} - True if path is clear
 */
export function isVerticalPathClear(sourceId, targetId, sourcePos, targetPos, positions, coordinates, direction) {
  const sourceLane = sourcePos.lane;
  const sourceLayer = sourcePos.layer;
  
  // Check if any elements are in the way between source and target
  // We check elements in the same LAYER (column) regardless of lane
  for (const [elementId, pos] of positions) {
    // Skip if not in same layer (column)
    if (pos.layer !== sourceLayer) continue;
    
    // Get element coordinates to check Y position
    const elementCoord = coordinates.get(elementId);
    if (!elementCoord) continue;
    
    const sourceCoord = coordinates.get(sourceId);
    const targetCoord = coordinates.get(targetId);
    if (!sourceCoord || !targetCoord) continue;
    
    // For cross-lane flows, we need to check Y coordinates, not rows
    // Because rows are lane-specific
    if (direction === "up") {
      // Going up: check if element Y is between target and source
      if (elementCoord.y < sourceCoord.y && elementCoord.y + elementCoord.height > targetCoord.y) {
        return false; // Element in the way
      }
    } else if (direction === "down") {
      // Going down: check if element Y is between source and target
      if (elementCoord.y > sourceCoord.y && elementCoord.y < targetCoord.y + targetCoord.height) {
        return false; // Element in the way
      }
    }
  }
  
  return true; // Path is clear
}

/**
 * Check if a specific exit side is available (not already used by other flows)
 * @param {string} sourceId - Source element ID
 * @param {string} exitSide - Exit side to check ("up", "down", "left", "right")
 * @param {Map} flowInfos - All flow information
 * @param {string} currentFlowId - Current flow ID (to exclude from check)
 * @returns {boolean} - True if exit side is available
 */
export function isExitSideAvailable(sourceId, exitSide, flowInfos, currentFlowId) {
  for (const [flowId, flowInfo] of flowInfos) {
    // Skip current flow
    if (flowId === currentFlowId) continue;
    
    // Skip back-flows (they don't block exits)
    if (flowInfo.isBackFlow) continue;
    
    // Check if this flow uses the same source and exit side
    if (flowInfo.sourceId === sourceId && flowInfo.source && flowInfo.source.exitSide === exitSide) {
      return false; // Exit side is already used
    }
  }
  
  return true; // Exit side is available
}

/**
 * Determine if target is above or below source
 * @param {Object} sourcePos - Source position {lane, layer, row}
 * @param {Object} targetPos - Target position {lane, layer, row}
 * @param {Map} lanes - Lane map
 * @returns {string} - "above", "below", or "same"
 */
export function getTargetVerticalPosition(sourcePos, targetPos, lanes) {
  if (sourcePos.lane !== targetPos.lane) {
    // Cross-lane: compare lane indices
    const laneOrder = Array.from(lanes.keys());
    const sourceIndex = laneOrder.indexOf(sourcePos.lane);
    const targetIndex = laneOrder.indexOf(targetPos.lane);
    
    if (targetIndex < sourceIndex) return "above";
    if (targetIndex > sourceIndex) return "below";
    return "same";
  } else {
    // Same lane: compare rows
    if (targetPos.row < sourcePos.row) return "above";
    if (targetPos.row > sourcePos.row) return "below";
    return "same";
  }
}
