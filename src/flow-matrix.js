/**
 * Flow Reservation Matrix Helper Functions
 * 
 * Tracks which positions are occupied by cross-lane flows
 * to prevent elements from being placed where flows pass through
 */

/**
 * Get lane index from lane ID
 * @param {string} laneId - Lane ID
 * @param {Map} lanes - Lane map
 * @returns {number} - Lane index
 */
function getLaneIndex(laneId, lanes) {
  const laneIds = Array.from(lanes.keys());
  return laneIds.indexOf(laneId);
}

/**
 * Get or create matrix cell for a specific lane and layer
 * @param {Map} matrix - The matrix
 * @param {string} laneId - Lane ID
 * @param {number} layer - Layer number
 * @returns {Object} - Cell object
 */
export function getMatrixCell(matrix, laneId, layer) {
  if (!matrix.has(laneId)) {
    matrix.set(laneId, new Map());
  }
  
  const laneMatrix = matrix.get(laneId);
  if (!laneMatrix.has(layer)) {
    laneMatrix.set(layer, {
      elements: [],
      hasFlow: false  // Simple: Is there ANY flow at this position?
    });
  }
  
  return laneMatrix.get(layer);
}

/**
 * Mark a cross-lane flow in the matrix (reserves space in intermediate lanes)
 * @param {Map} matrix - The matrix
 * @param {Map} lanes - Lane map
 * @param {string} sourceLane - Source lane ID
 * @param {string} targetLane - Target lane ID
 * @param {number} layer - Layer where the flow passes through
 */
export function markCrossLaneFlow(matrix, lanes, sourceLane, targetLane, layer) {
  const sourceLaneIndex = getLaneIndex(sourceLane, lanes);
  const targetLaneIndex = getLaneIndex(targetLane, lanes);
  
  if (sourceLaneIndex === targetLaneIndex) {
    return; // Not a cross-lane flow
  }
  
  const minLaneIndex = Math.min(sourceLaneIndex, targetLaneIndex);
  const maxLaneIndex = Math.max(sourceLaneIndex, targetLaneIndex);
  const laneIds = Array.from(lanes.keys());
  
  // Mark all intermediate lanes (not including source and target)
  for (let i = minLaneIndex + 1; i < maxLaneIndex; i++) {
    const intermediateLaneId = laneIds[i];
    const cell = getMatrixCell(matrix, intermediateLaneId, layer);
    cell.hasFlow = true;
  }
}

/**
 * Check if a position is occupied by a flow
 * @param {Map} matrix - The matrix
 * @param {string} laneId - Lane ID
 * @param {number} layer - Layer number
 * @returns {boolean} - True if occupied by any flow
 */
export function isPositionOccupiedByFlow(matrix, laneId, layer) {
  if (!matrix.has(laneId)) {
    return false;
  }
  
  const laneMatrix = matrix.get(laneId);
  if (!laneMatrix.has(layer)) {
    return false;
  }
  
  const cell = laneMatrix.get(layer);
  return cell.hasFlow === true;
}

/**
 * Mark an element in the matrix
 * @param {Map} matrix - The matrix
 * @param {string} laneId - Lane ID
 * @param {number} layer - Layer number
 * @param {string} elementId - Element ID
 */
export function markElement(matrix, laneId, layer, elementId) {
  const cell = getMatrixCell(matrix, laneId, layer);
  if (!cell.elements.includes(elementId)) {
    cell.elements.push(elementId);
  }
}

/**
 * Find next free layer at or after proposed layer
 * Checks both flow occupation and element occupation
 * @param {Map} matrix - The matrix
 * @param {Map} positions - Positions map
 * @param {string} laneId - Lane ID
 * @param {number} proposedLayer - Proposed layer
 * @param {number} row - Row number (optional, if specified only checks this specific row)
 * @param {string} excludeElementId - Element ID to exclude from check (optional)
 * @returns {number} - Next free layer
 */
export function findFreeLayer(matrix, positions, laneId, proposedLayer, row = null, excludeElementId = null) {
  let layer = proposedLayer;
  let maxIterations = 100; // Safety limit
  
  while (maxIterations-- > 0) {
    // Check if flow occupies this position
    if (isPositionOccupiedByFlow(matrix, laneId, layer)) {
      layer++;
      continue;
    }
    
    // Check if any element occupies this position
    let hasElement = false;
    for (const [elementId, pos] of positions) {
      if (elementId === excludeElementId) continue;
      if (pos.lane === laneId && pos.layer === layer) {
        // If row is specified, only check that specific row
        if (row !== null && pos.row !== row) {
          continue; // Different row, not a collision
        }
        hasElement = true;
        break;
      }
    }
    
    if (hasElement) {
      layer++;
      continue;
    }
    
    // Position is free!
    return layer;
  }
  
  // Safety fallback
  return proposedLayer;
}
