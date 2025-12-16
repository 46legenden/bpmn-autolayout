/**
 * Row Assignment
 * 
 * Assigns rows to elements in the same lane/layer to prevent collisions
 */

/**
 * Assign rows to elements to prevent collisions
 * Elements in the same lane and layer get different rows
 * @param {Map} positions - Map of elementId -> {lane, layer, row}
 * @param {Map} flows - Map of flows
 */
export function assignRows(positions, flows) {
  // Group elements by lane and layer
  const groups = new Map(); // key: "lane:layer" -> [elementIds]
  
  for (const [elementId, pos] of positions) {
    const key = `${pos.lane}:${pos.layer}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(elementId);
  }
  
  // For each group with multiple elements, assign different rows
  for (const [key, elementIds] of groups) {
    if (elementIds.length <= 1) continue; // No collision possible
    
    // Sort elements by their dependencies (topological sort within group)
    const sorted = sortElementsByDependencies(elementIds, flows, positions);
    
    // Assign rows
    for (let i = 0; i < sorted.length; i++) {
      const elementId = sorted[i];
      const pos = positions.get(elementId);
      pos.row = i; // Assign row based on sorted order
    }
  }
}

/**
 * Sort elements by their dependencies (simple topological sort)
 * @param {Array} elementIds - Element IDs to sort
 * @param {Map} flows - Map of flows
 * @param {Map} positions - Map of positions
 * @returns {Array} - Sorted element IDs
 */
function sortElementsByDependencies(elementIds, flows, positions) {
  // Build dependency graph (within this group only)
  const dependencies = new Map(); // elementId -> [dependent elementIds]
  const inDegree = new Map(); // elementId -> number of dependencies
  
  for (const elementId of elementIds) {
    dependencies.set(elementId, []);
    inDegree.set(elementId, 0);
  }
  
  // Count dependencies from flows
  for (const [flowId, flow] of flows) {
    const sourceId = flow.sourceRef;
    const targetId = flow.targetRef;
    
    // Only consider flows within this group
    if (elementIds.includes(sourceId) && elementIds.includes(targetId)) {
      dependencies.get(sourceId).push(targetId);
      inDegree.set(targetId, inDegree.get(targetId) + 1);
    }
  }
  
  // Topological sort (Kahn's algorithm)
  const sorted = [];
  const queue = [];
  
  // Start with elements that have no dependencies
  for (const [elementId, degree] of inDegree) {
    if (degree === 0) {
      queue.push(elementId);
    }
  }
  
  while (queue.length > 0) {
    const elementId = queue.shift();
    sorted.push(elementId);
    
    // Reduce in-degree of dependents
    for (const dependent of dependencies.get(elementId)) {
      inDegree.set(dependent, inDegree.get(dependent) - 1);
      if (inDegree.get(dependent) === 0) {
        queue.push(dependent);
      }
    }
  }
  
  // If there are remaining elements (cycles or disconnected), add them
  for (const elementId of elementIds) {
    if (!sorted.includes(elementId)) {
      sorted.push(elementId);
    }
  }
  
  return sorted;
}
