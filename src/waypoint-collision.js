/**
 * Waypoint-based collision detection for flow routing
 */

/**
 * Check if a horizontal segment overlaps with existing flow segments
 * @param {number} y - Y coordinate of the horizontal segment
 * @param {number} x1 - Start X coordinate
 * @param {number} x2 - End X coordinate
 * @param {Map} flowWaypoints - Map of flowId -> waypoints array
 * @param {string} excludeFlowId - Flow ID to exclude from check
 * @returns {boolean} - True if there's an overlap
 */
export function hasHorizontalOverlap(y, x1, x2, flowWaypoints, excludeFlowId) {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const tolerance = 1; // Allow 1px tolerance
  
  for (const [flowId, waypoints] of flowWaypoints) {
    if (flowId === excludeFlowId) continue;
    
    // Check each segment of the existing flow
    for (let i = 0; i < waypoints.length - 1; i++) {
      const p1 = waypoints[i];
      const p2 = waypoints[i + 1];
      
      // Check if this is a horizontal segment at the same Y
      if (Math.abs(p1.y - p2.y) < tolerance && Math.abs(p1.y - y) < tolerance) {
        // Both horizontal at same Y - check X overlap
        const segMinX = Math.min(p1.x, p2.x);
        const segMaxX = Math.max(p1.x, p2.x);
        
        // Check for overlap
        if (!(maxX < segMinX || minX > segMaxX)) {
          return true; // Overlap detected
        }
      }
    }
  }
  
  return false;
}

/**
 * Check if a vertical segment overlaps with existing flow segments
 * @param {number} x - X coordinate of the vertical segment
 * @param {number} y1 - Start Y coordinate
 * @param {number} y2 - End Y coordinate
 * @param {Map} flowWaypoints - Map of flowId -> waypoints array
 * @param {string} excludeFlowId - Flow ID to exclude from check
 * @returns {boolean} - True if there's an overlap
 */
export function hasVerticalOverlap(x, y1, y2, flowWaypoints, excludeFlowId) {
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  const tolerance = 1;
  
  for (const [flowId, waypoints] of flowWaypoints) {
    if (flowId === excludeFlowId) continue;
    
    // Check each segment of the existing flow
    for (let i = 0; i < waypoints.length - 1; i++) {
      const p1 = waypoints[i];
      const p2 = waypoints[i + 1];
      
      // Check if this is a vertical segment at the same X
      if (Math.abs(p1.x - p2.x) < tolerance && Math.abs(p1.x - x) < tolerance) {
        // Both vertical at same X - check Y overlap
        const segMinY = Math.min(p1.y, p2.y);
        const segMaxY = Math.max(p1.y, p2.y);
        
        // Check for overlap
        if (!(maxY < segMinY || minY > segMaxY)) {
          return true; // Overlap detected
        }
      }
    }
  }
  
  return false;
}

/**
 * Check if waypoints would cause collision with existing flows
 * @param {Array} waypoints - Proposed waypoints
 * @param {Map} flowWaypoints - Existing flow waypoints
 * @param {string} flowId - Current flow ID
 * @returns {boolean} - True if collision detected
 */
export function hasWaypointCollision(waypoints, flowWaypoints, flowId) {
  for (let i = 0; i < waypoints.length - 1; i++) {
    const p1 = waypoints[i];
    const p2 = waypoints[i + 1];
    
    // Check if horizontal segment
    if (Math.abs(p1.y - p2.y) < 1) {
      if (hasHorizontalOverlap(p1.y, p1.x, p2.x, flowWaypoints, flowId)) {
        return true;
      }
    }
    
    // Check if vertical segment
    if (Math.abs(p1.x - p2.x) < 1) {
      if (hasVerticalOverlap(p1.x, p1.y, p2.y, flowWaypoints, flowId)) {
        return true;
      }
    }
  }
  
  return false;
}
