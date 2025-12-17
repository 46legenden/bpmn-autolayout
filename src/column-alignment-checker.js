/**
 * Check if columns (layers) are properly aligned across all lanes
 * Elements in the same layer should have the same X position
 * @param {Map} positions - Element positions from Phase 2 (elementId → {lane, layer, row})
 * @param {Map} coordinates - Element coordinates from Phase 3 (elementId → {x, y, width, height})
 * @param {Map} elements - Element map (for element info)
 * @returns {boolean} - True if alignment issues found
 */
export function checkColumnAlignment(positions, coordinates, elements) {
  // Group elements by layer
  const layerElements = new Map();
  
  for (const [elementId, pos] of positions) {
    const coord = coordinates.get(elementId);
    if (!coord) continue;
    
    if (!layerElements.has(pos.layer)) {
      layerElements.set(pos.layer, []);
    }
    
    layerElements.get(pos.layer).push({
      elementId,
      lane: pos.lane,
      x: coord.x,
      centerX: coord.x + coord.width / 2
    });
  }
  
  // Check each layer for X alignment
  let hasIssues = false;
  const TOLERANCE = 1; // Allow 1px tolerance for floating point errors
  
  for (const [layer, elements] of layerElements) {
    if (elements.length < 2) continue; // Need at least 2 elements to compare
    
    // Group by centerX (should all be the same)
    const xGroups = new Map();
    
    for (const el of elements) {
      // Round to nearest pixel to handle floating point
      const roundedX = Math.round(el.centerX);
      
      if (!xGroups.has(roundedX)) {
        xGroups.set(roundedX, []);
      }
      xGroups.get(roundedX).push(el);
    }
    
    // If more than one X group, we have misalignment
    if (xGroups.size > 1) {
      hasIssues = true;
      
      console.error(`\n⚠️  COLUMN ALIGNMENT ISSUE`);
      console.error(`   Layer ${layer}: Elements have different X positions`);
      
      // Show each X group
      const sortedXs = Array.from(xGroups.keys()).sort((a, b) => a - b);
      for (const x of sortedXs) {
        const group = xGroups.get(x);
        const lanes = group.map(el => el.lane).join(', ');
        const ids = group.map(el => el.elementId).join(', ');
        console.error(`     X=${x}: ${group.length} elements in lanes [${lanes}]`);
        console.error(`       Elements: ${ids}`);
      }
      
      // Calculate max offset
      const minX = Math.min(...sortedXs);
      const maxX = Math.max(...sortedXs);
      const offset = maxX - minX;
      console.error(`     Maximum offset: ${offset}px`);
    }
  }
  
  if (hasIssues) {
    console.error(`\n⚠️  ===============================================\n`);
  }
  
  return hasIssues;
}
