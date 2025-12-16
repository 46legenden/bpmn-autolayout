/**
 * Collision Detection Helper
 * 
 * Tracks element positions and detects collisions when setting positions
 */

/**
 * Check if a position is already occupied and report collision
 * @param {string} elementId - Element being positioned
 * @param {string} lane - Lane ID
 * @param {number} layer - Layer number
 * @param {number} row - Row number
 * @param {Map} positions - Current positions map
 * @param {Map} matrix - Matrix tracking elements per lane/layer
 * @param {string} source - Source of this positioning (for debugging)
 * @returns {boolean} - True if collision detected
 */
export function detectCollision(elementId, lane, layer, row, positions, matrix, source = 'unknown') {
  // Check if any other element is at this exact position
  let collision = false;
  const collidingElements = [];
  
  for (const [otherId, otherPos] of positions) {
    if (otherId !== elementId && 
        otherPos.lane === lane && 
        otherPos.layer === layer && 
        otherPos.row === row) {
      collision = true;
      collidingElements.push(otherId);
    }
  }
  
  if (collision) {
    console.error(`❌ COLLISION DETECTED:`);
    console.error(`   Element: ${elementId}`);
    console.error(`   Position: lane=${lane}, layer=${layer}, row=${row}`);
    console.error(`   Collides with: ${collidingElements.join(', ')}`);
    console.error(`   Source: ${source}`);
    console.error('');
  }
  
  return collision;
}

/**
 * Set element position with collision detection
 * @param {string} elementId - Element ID
 * @param {string} lane - Lane ID
 * @param {number} layer - Layer number
 * @param {number} row - Row number
 * @param {Map} positions - Positions map
 * @param {Map} matrix - Matrix
 * @param {string} source - Source of positioning (for debugging)
 */
export function setPositionWithDetection(elementId, lane, layer, row, positions, matrix, source = 'unknown') {
  // Detect collision before setting
  const hasCollision = detectCollision(elementId, lane, layer, row, positions, matrix, source);
  
  // Set position anyway (for now, to see what happens)
  positions.set(elementId, { lane, layer, row });
  
  // Update matrix
  const laneMatrix = matrix.get(lane);
  if (laneMatrix) {
    if (!laneMatrix.has(layer)) {
      laneMatrix.set(layer, { elements: [], flowAlongLane: null, flowCrossLane: null });
    }
    const cell = laneMatrix.get(layer);
    if (!cell.elements.includes(elementId)) {
      cell.elements.push(elementId);
    }
  }
  
  return !hasCollision; // Return true if successful (no collision)
}
