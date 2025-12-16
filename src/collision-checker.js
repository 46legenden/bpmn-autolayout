/**
 * Collision Checker
 * 
 * Checks for collisions after all positions have been assigned
 */

/**
 * Check all positions for collisions and report them
 * @param {Map} positions - Map of elementId -> {lane, layer, row}
 * @param {Map} flows - Map of flows (for context)
 * @returns {Array} - Array of collision objects
 */
export function checkAllCollisions(positions, flows) {
  const collisions = [];
  const positionMap = new Map(); // key: "lane:layer:row" -> [elementIds]
  
  // Build position map
  for (const [elementId, pos] of positions) {
    const key = `${pos.lane}:${pos.layer}:${pos.row}`;
    if (!positionMap.has(key)) {
      positionMap.set(key, []);
    }
    positionMap.get(key).push(elementId);
  }
  
  // Find collisions (positions with multiple elements)
  for (const [key, elementIds] of positionMap) {
    if (elementIds.length > 1) {
      const [lane, layer, row] = key.split(':');
      collisions.push({
        lane,
        layer: parseInt(layer),
        row: parseInt(row),
        elements: elementIds
      });
    }
  }
  
  // Report collisions
  if (collisions.length > 0) {
    console.error('\n❌ ========== COLLISIONS DETECTED ==========');
    for (const collision of collisions) {
      console.error(`\n  Position: lane=${collision.lane}, layer=${collision.layer}, row=${collision.row}`);
      console.error(`  Elements: ${collision.elements.join(', ')}`);
      
      // Try to find which flows led to these elements
      for (const elementId of collision.elements) {
        const incomingFlows = [];
        for (const [flowId, flow] of flows) {
          if (flow.targetRef === elementId) {
            incomingFlows.push(`${flowId} (${flow.sourceRef} -> ${elementId})`);
          }
        }
        if (incomingFlows.length > 0) {
          console.error(`    ${elementId} incoming flows: ${incomingFlows.join(', ')}`);
        }
      }
    }
    console.error('\n❌ ==========================================\n');
  }
  
  return collisions;
}
