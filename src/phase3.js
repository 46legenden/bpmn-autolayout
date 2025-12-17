/**
 * Phase 3: Coordinate Calculation
 * 
 * This phase handles:
 * - Converting logical positions (lane, layer, row) to pixel coordinates (x, y)
 * - Calculating waypoint pixel coordinates
 * - Back-flow routing with Manhattan pathfinding
 * - Generating BPMN DI (Diagram Interchange) XML
 */

// Layout constants (from old implementation)
const COLUMN_WIDTH = 200;
const LANE_BASE_HEIGHT = 180;  // Increased for more padding (was 150)
const LANE_ROW_HEIGHT = 140;    // Increased for more padding (was 120)
const LANE_TOP_OFFSET = 80;
const POOL_X_OFFSET = 150;     // Left offset for pool

// Element size constants (BPMN standard sizes)
const ELEMENT_WIDTH = 100;
const ELEMENT_HEIGHT = 80;
const GATEWAY_SIZE = 50;
const START_END_SIZE = 36;     // Events are circular

// Back-flow corridor offset from lane boundary
// Calculated dynamically based on lane height and element height
// Task is centered: taskTopOffset = (LANE_BASE_HEIGHT - ELEMENT_HEIGHT) / 2
// Corridor is midway between lane boundary and task: CORRIDOR_OFFSET = taskTopOffset / 2
const CORRIDOR_OFFSET = ((LANE_BASE_HEIGHT - ELEMENT_HEIGHT) / 2) / 2;

// Vertical orientation constants (when needed)
const LANE_BASE_WIDTH = 150;
const LANE_ROW_WIDTH = 120;
const LANE_LEFT_OFFSET = 80;

/**
 * Normalize rows within each lane (convert negative rows to positive indices)
 * @param {Map} positions - Map of elementId → {lane, layer, row}
 * @param {Map} lanes - Lane map
 * @returns {Map} - Map of elementId → {lane, layer, normalizedRow}
 */
export function normalizeRows(positions, lanes) {
  const normalized = new Map();
  
  // Group elements by lane
  const laneElements = new Map();
  for (const [elementId, pos] of positions) {
    if (!laneElements.has(pos.lane)) {
      laneElements.set(pos.lane, []);
    }
    laneElements.get(pos.lane).push({ elementId, ...pos });
  }
  
  // Normalize rows for each lane
  for (const [laneId, elements] of laneElements) {
    const minRow = Math.min(...elements.map(e => e.row));
    
    for (const element of elements) {
      normalized.set(element.elementId, {
        lane: element.lane,
        layer: element.layer,
        normalizedRow: element.row - minRow
      });
    }
  }
  
  return normalized;
}

/**
 * Calculate pixel coordinates for elements
 * @param {Map} elements - Element map from Phase 1
 * @param {Map} positions - Logical positions from Phase 2
 * @param {Map} laneBounds - Lane bounds
 * @param {Object} directions - Direction mappings from Phase 2
 * @param {Map} lanes - Lane map (for checking nesting)
 * @returns {Map} - Map of elementId → {x, y, width, height}
 */
export function calculateElementCoordinates(elements, positions, laneBounds, directions, lanes) {
  const coordinates = new Map();
  const normalized = normalizeRows(positions, lanes);
  const isHorizontal = directions.alongLane === 'right';
  
  for (const [elementId, element] of elements) {
    const pos = normalized.get(elementId);
    if (!pos) continue;
    
    const laneBound = laneBounds.get(pos.lane);
    if (!laneBound) continue;
    
    // Element dimensions based on BPMN type (from old implementation)
    let width, height;
    
    if (element.type === 'startEvent' || element.type === 'endEvent' ||
        element.type === 'intermediateThrowEvent' || element.type === 'intermediateCatchEvent') {
      width = height = START_END_SIZE;
    } else if (element.type && element.type.includes('Gateway')) {
      width = height = GATEWAY_SIZE;
    } else {
      width = ELEMENT_WIDTH;
      height = ELEMENT_HEIGHT;
    }
    
    let x, y;
    
    if (isHorizontal) {
      // Horizontal orientation: lanes stack vertically, process flows horizontally
      // X: Based on layer (column), centered in column
      // Calculate base X offset based on lane hierarchy
      // Use elementStartX for aligned columns, fallback to x for backward compatibility
      const laneX = laneBound.elementStartX || laneBound.x || POOL_X_OFFSET;
      
      // Columns fill the entire lane width (no extra margins)
      // Column center = lane start + (layer * COLUMN_WIDTH) + COLUMN_WIDTH/2
      const columnCenterX = laneX + pos.layer * COLUMN_WIDTH + COLUMN_WIDTH / 2;
      x = columnCenterX - width / 2;
      
      // Y: Based on row within lane, with even padding
      const referenceHeight = ELEMENT_HEIGHT;  // Use standard element height for spacing
      const paddingPerGap = (laneBound.height - laneBound.maxRows * referenceHeight) / (laneBound.maxRows + 1);
      const rowCenterY = laneBound.y + paddingPerGap + (pos.normalizedRow * (referenceHeight + paddingPerGap)) + referenceHeight / 2;
      y = rowCenterY - height / 2;
      
    } else {
      // Vertical orientation: lanes stack horizontally, process flows vertically
      // X: Based on row within lane, with even padding
      const referenceWidth = ELEMENT_WIDTH;  // Use standard element width for spacing
      const paddingPerGap = (laneBound.width - laneBound.maxRows * referenceWidth) / (laneBound.maxRows + 1);
      const rowCenterX = laneBound.x + paddingPerGap + (pos.normalizedRow * (referenceWidth + paddingPerGap)) + referenceWidth / 2;
      x = rowCenterX - width / 2;
      
      // Y: Based on layer (row in vertical), centered in row
      const centerY = POOL_X_OFFSET + pos.layer * COLUMN_WIDTH + COLUMN_WIDTH / 2;
      y = centerY - height / 2;
    }
    
    coordinates.set(elementId, {
      x,
      y,
      width,
      height
    });
  }
  
  return coordinates;
}

/**
 * Calculate pixel coordinates for a logical waypoint
 * @param {Object} waypoint - {lane, layer, row}
 * @param {Map} lanes - Lane map
 * @param {Object} directions - Direction mappings
 * @returns {Object} - {x, y}
 */
export function calculateWaypointCoordinate(waypoint, lanes, directions, laneBounds) {
  const isHorizontal = directions.alongLane === 'right';
  
  let x, y;
  
  if (isHorizontal) {
    // Horizontal orientation
    // X based on layer (column center)
    // Use lane's X position from laneBounds (same as elements)
    const laneBound = laneBounds.get(waypoint.lane);
    // Use EXACT same logic as elements (line 110)
    const laneX = laneBound?.elementStartX || laneBound?.x || POOL_X_OFFSET;
    
    // Column center = lane start + (layer * COLUMN_WIDTH) + COLUMN_WIDTH/2
    const columnCenterX = laneX + waypoint.layer * COLUMN_WIDTH + COLUMN_WIDTH / 2;
    x = columnCenterX;
    
    // Y based on lane + row
    if (laneBound) {
      // Use same logic as element positioning
      const referenceHeight = ELEMENT_HEIGHT;
      const paddingPerGap = (laneBound.height - laneBound.maxRows * referenceHeight) / (laneBound.maxRows + 1);
      y = laneBound.y + paddingPerGap + (waypoint.row * (referenceHeight + paddingPerGap)) + referenceHeight / 2;
    } else {
      // Fallback if lane bound not found
      y = LANE_TOP_OFFSET + waypoint.row * LANE_ROW_HEIGHT;
    }
  } else {
    // Vertical orientation
    const laneBound = laneBounds.get(waypoint.lane);
    if (laneBound) {
      const referenceWidth = ELEMENT_WIDTH;
      const paddingPerGap = (laneBound.width - laneBound.maxRows * referenceWidth) / (laneBound.maxRows + 1);
      x = laneBound.x + paddingPerGap + (waypoint.row * (referenceWidth + paddingPerGap)) + referenceWidth / 2;
    } else {
      x = LANE_LEFT_OFFSET + waypoint.row * LANE_ROW_WIDTH;
    }
    
    y = POOL_X_OFFSET + waypoint.layer * COLUMN_WIDTH + COLUMN_WIDTH / 2;
  }
  
  return { x, y };
}

/**
 * Calculate connection point on element based on side
 * @param {Object} coord - Element coordinates {x, y, width, height}
 * @param {string} side - "right", "left", "up", "down"
 * @returns {Object} - {x, y}
 */
export function calculateConnectionPoint(coord, side) {
  switch (side) {
    case 'right':
      return {
        x: coord.x + coord.width,
        y: coord.y + coord.height / 2
      };
    case 'left':
      return {
        x: coord.x,
        y: coord.y + coord.height / 2
      };
    case 'up':
      return {
        x: coord.x + coord.width / 2,
        y: coord.y
      };
    case 'down':
      return {
        x: coord.x + coord.width / 2,
        y: coord.y + coord.height
      };
    default:
      // Default to center
      return {
        x: coord.x + coord.width / 2,
        y: coord.y + coord.height / 2
      };
  }
}

/**
 * Calculate pixel waypoints for a flow
 * @param {Object} flowInfo - Flow information from Phase 2
 * @param {Map} coordinates - Element coordinates
 * @param {Map} lanes - Lane map
 * @param {Object} directions - Direction mappings
 * @returns {Array} - Array of {x, y} waypoints
 */
export function calculateFlowWaypoints(flowInfo, coordinates, lanes, directions, laneBounds, elements, flows) {
  const pixelWaypoints = [];
  
  // Start point
  const sourceCoord = coordinates.get(flowInfo.sourceId);
  const startPoint = calculateConnectionPoint(sourceCoord, flowInfo.source.exitSide);
  
  // End point
  const targetCoord = coordinates.get(flowInfo.targetId);
  const endPoint = calculateConnectionPoint(targetCoord, flowInfo.target.entrySide);
  
  // Message flows: direct line (no intermediate waypoints)
  if (flowInfo.isMessageFlow) {
    return [startPoint, endPoint];
  }
  
  // Normal flows: include intermediate waypoints
  for (const waypoint of flowInfo.waypoints) {
    const wpCoord = calculateWaypointCoordinate(waypoint, lanes, directions, laneBounds);
    pixelWaypoints.push(wpCoord);
  }
  
  return [startPoint, ...pixelWaypoints, endPoint];
}

/**
 * Determine target's entry side from existing flows
 * @param {string} targetId - Target element ID
 * @param {Map} flowInfos - All flow information
 * @param {Object} directions - Direction mappings
 * @returns {string} - Entry side ("left", "up", "down", "right")
 */
function determineTargetEntrySide(targetId, flowInfos, directions) {
  // Find first non-back-flow into target
  for (const [flowId, flowInfo] of flowInfos) {
    if (flowInfo.targetId === targetId && !flowInfo.isBackFlow) {
      return flowInfo.target.entrySide;
    }
  }
  
  // Default: enter from left (normal forward direction)
  return directions.oppAlongLane; // "left" for horizontal
}

/**
 * Helper: Calculate lane bottom Y coordinate
 * @param {Object} lane - Lane object
 * @param {Map} positions - Element positions
 * @param {Map} coordinates - Element coordinates
 * @returns {number} - Lane bottom Y coordinate
 */
function calculateLaneTop(lane, positions, coordinates, sourcePos) {
  // Calculate lane top from actual element coordinates
  // Find the topmost element in the target lane
  
  let minY = Infinity;
  
  for (const [elId, pos] of positions) {
    if (pos.lane === sourcePos.lane) {
      const coord = coordinates.get(elId);
      if (coord && coord.y < minY) {
        minY = coord.y;
      }
    }
  }
  
  if (minY === Infinity) {
    // Fallback: use LANE_TOP_OFFSET
    return LANE_TOP_OFFSET;
  }
  
  // Return the top of the topmost element
  return minY;
}

function calculateLaneBottom(lane, positions, coordinates) {
  // Find max rows in this lane
  let maxRow = 0;
  for (const [elId, pos] of positions) {
    if (pos.lane === lane.id && pos.normalizedRow > maxRow) {
      maxRow = pos.normalizedRow;
    }
  }
  
  // Calculate lane height
  const laneHeight = LANE_BASE_HEIGHT + maxRow * LANE_ROW_HEIGHT;
  
  // Lane top is at LANE_TOP_OFFSET (assuming first lane)
  // TODO: Handle multiple lanes properly
  const laneTop = LANE_TOP_OFFSET;
  
  return laneTop + laneHeight;
}

/**
 * Route back-flows using Manhattan pathfinding in "between-grid" space
 * @param {Object} flowInfo - Back-flow information
 * @param {Map} coordinates - Element coordinates
 * @param {Map} positions - Element positions
 * @param {Map} lanes - Lane map
 * @param {Object} directions - Direction mappings
 * @param {Map} flowInfos - All flow information (to find target entry side)
 * @returns {Array} - Array of {x, y} waypoints
 */
export function routeBackFlow(flowInfo, coordinates, positions, lanes, directions, flowInfos) {
  const sourceCoord = coordinates.get(flowInfo.sourceId);
  const targetCoord = coordinates.get(flowInfo.targetId);
  
  const sourcePos = positions.get(flowInfo.sourceId);
  const targetPos = positions.get(flowInfo.targetId);
  
  // Determine target's entry side
  // For backflows going left (backwards), always enter from TOP to use corridor
  const targetEntrySide = directions.oppCrossLane; // "up" - backflows come down from corridor above
  
  const waypoints = [];
  
  // Step 1: Determine best exit side based on free sides and target direction
  // Find which sides are already used by other flows from this source
  const usedSides = new Set();
  for (const [fId, fInfo] of flowInfos) {
    if (fInfo.sourceId === flowInfo.sourceId && fId !== flowInfo.flowId && !fInfo.isBackFlow) {
      if (fInfo.source && fInfo.source.exitSide) {
        usedSides.add(fInfo.source.exitSide);
      }
    }
  }
  
  // Determine target direction
  // For cross-lane flows, compare lane indices (vertical position)
  // For same-lane flows, compare rows
  const sourceLaneObj = lanes.get(sourcePos.lane);
  const targetLaneObj = lanes.get(targetPos.lane);
  
  let targetIsAbove, targetIsBelow;
  
  if (sourcePos.lane !== targetPos.lane) {
    // Cross-lane: compare lane indices (assuming lanes are ordered top-to-bottom)
    // Find lane indices by iterating lanes in order
    const laneOrder = Array.from(lanes.keys());
    const sourceIndex = laneOrder.indexOf(sourcePos.lane);
    const targetIndex = laneOrder.indexOf(targetPos.lane);
    
    targetIsAbove = targetIndex < sourceIndex;
    targetIsBelow = targetIndex > sourceIndex;
  } else {
    // Same lane: compare rows
    targetIsAbove = targetPos.row < sourcePos.row;
    targetIsBelow = targetPos.row > sourcePos.row;
  }
  
  const targetIsLeft = targetPos.layer < sourcePos.layer;
  
  // Choose best exit side for backflows
  let exitSide;
  
  // Strategy:
  // 1. Same lane: ALWAYS go UP (flows normally go down, so up is free)
  // 2. Cross-lane: Check if target is above or below
  //    - Target above → go UP
  //    - Target below → go DOWN
  // 3. Fallback: prefer UP (corridor above)
  
  if (sourcePos.lane === targetPos.lane) {
    // Same lane: ALWAYS go UP to avoid conflicts with normal downward flows
    if (!usedSides.has(directions.oppCrossLane)) {
      exitSide = directions.oppCrossLane; // up
    } else {
      // UP is blocked, try DOWN
      exitSide = directions.crossLane; // down
    }
  } else {
    // Cross-lane: choose based on target vertical position
    if (targetIsAbove && !usedSides.has(directions.oppCrossLane)) {
      // Target is above → go UP
      exitSide = directions.oppCrossLane; // up
    } else if (targetIsBelow && !usedSides.has(directions.crossLane)) {
      // Target is below → go DOWN
      exitSide = directions.crossLane; // down
    } else if (!usedSides.has(directions.oppCrossLane)) {
      // Fallback: prefer UP
      exitSide = directions.oppCrossLane; // up
    } else if (!usedSides.has(directions.crossLane)) {
      // Fallback: DOWN
      exitSide = directions.crossLane; // down
    } else if (!usedSides.has(directions.alongLane)) {
      // Last resort: RIGHT
      exitSide = directions.alongLane; // right
    } else {
      // All sides used, default to UP
      exitSide = directions.oppCrossLane;
    }
  }
  
  // Update flowInfo with calculated exitSide
  if (flowInfo.source) {
    flowInfo.source.exitSide = exitSide;
  }
  
  const exitPoint = calculateConnectionPoint(sourceCoord, exitSide);
  waypoints.push(exitPoint);
  
  // Step 2: Move to "between-rows/lanes" zone for horizontal corridor
  // For backflows, use TARGET lane top (not source) to avoid crossings
  let betweenRowsY;
  
  // Find target lane bounds (backflows go to target lane corridor)
  const targetLane = lanes.get(targetPos.lane);
  
  // Always use target lane top for backflow corridor (enter from top)
  // Corridor should be ABOVE the topmost element in target lane
  const targetLaneTop = calculateLaneTop(targetLane, positions, coordinates, targetPos);
  betweenRowsY = targetLaneTop - CORRIDOR_OFFSET;
  
  const betweenRowsPoint = {
    x: exitPoint.x,
    y: betweenRowsY
  };
  waypoints.push(betweenRowsPoint);
  
  // Step 3: Move LEFT in "between-layers" zone
  // Calculate corridor X as midpoint between layers
  let targetX;
  
  if (targetEntrySide === directions.oppAlongLane) {
    // Enter from LEFT: find previous layer and calculate midpoint
    // Find the element in the previous layer (layer = targetPos.layer - 1)
    const prevLayer = targetPos.layer - 1;
    let prevLayerRight = 0;
    
    // Find rightmost element in previous layer
    for (const [elId, pos] of positions) {
      if (pos.layer === prevLayer && pos.lane === targetPos.lane) {
        const elCoord = coordinates.get(elId);
        if (elCoord) {
          const elRight = elCoord.x + elCoord.width;
          if (elRight > prevLayerRight) {
            prevLayerRight = elRight;
          }
        }
      }
    }
    
    // Corridor X = midpoint between previous layer right and target layer left
    if (prevLayerRight > 0) {
      targetX = (prevLayerRight + targetCoord.x) / 2;
    } else {
      // Fallback: use fixed offset
      targetX = targetCoord.x - COLUMN_WIDTH / 2;
    }
  } else if (targetEntrySide === directions.crossLane) {
    // Enter from DOWN: align with target center
    targetX = targetCoord.x + targetCoord.width / 2;
  } else if (targetEntrySide === directions.oppCrossLane) {
    // Enter from UP: align with target center
    targetX = targetCoord.x + targetCoord.width / 2;
  } else {
    // Default: enter from left
    targetX = targetCoord.x - LAYER_OFFSET;
  }
  
  const betweenLayersPoint = {
    x: targetX,
    y: betweenRowsPoint.y
  };
  waypoints.push(betweenLayersPoint);
  
  // Step 4: Align vertically with target entry point
  const targetEntryPoint = calculateConnectionPoint(targetCoord, targetEntrySide);
  const alignPoint = {
    x: betweenLayersPoint.x,
    y: targetEntryPoint.y
  };
  
  // Only push alignPoint if it's different from targetEntryPoint
  if (alignPoint.x !== targetEntryPoint.x || alignPoint.y !== targetEntryPoint.y) {
    waypoints.push(alignPoint);
  }
  
  // Step 5: Enter target
  waypoints.push(targetEntryPoint);
  
  return waypoints;
}

/**
 * Main Phase 3 function
 * @param {Object} phase2Result - Result from Phase 2
 * @param {Map} lanes - Lane map
 * @param {Object} directions - Direction mappings
 * @returns {Object} - {coordinates, flowWaypoints}
 */
/**
 * Calculate lane bounds (x, y, width, height) for all lanes
 * @param {Map} lanes - Lane map
 * @param {Map} positions - Element positions
 * @param {Object} directions - Direction mappings
 * @returns {Map} - Map of laneId → {x, y, width, height, maxRows}
 */
export function calculateLaneBounds(lanes, positions, directions, pools = new Map()) {
  const isHorizontal = directions.alongLane === 'right';
  
  // Find maximum nesting level across all lanes
  function getLaneNestingLevel(laneId, lanes) {
    const lane = lanes.get(laneId);
    if (!lane || !lane.parentLane) return 0;
    return 1 + getLaneNestingLevel(lane.parentLane, lanes);
  }
  
  let maxNestingLevel = 0;
  for (const [laneId] of lanes) {
    maxNestingLevel = Math.max(maxNestingLevel, getLaneNestingLevel(laneId, lanes));
  }
  
  // Calculate fixed right edge for all lanes in the pool
  // This ensures all lanes end at the same X position
  const POOL_LABEL_WIDTH = 30;
  const PARENT_LANE_LABEL_WIDTH = 30;
  const CHILD_LANE_INDENT = 30;
  
  // Normalize rows first
  const normalized = normalizeRows(positions, lanes);
  
  // Find max rows per lane (only for leaf lanes that have elements)
  const laneMaxRows = new Map();
  // Find max layer across all elements (for width calculation)
  let maxLayer = 0;
  
  for (const [elementId, pos] of normalized) {
    const currentMax = laneMaxRows.get(pos.lane) || 0;
    laneMaxRows.set(pos.lane, Math.max(currentMax, pos.normalizedRow + 1));
    maxLayer = Math.max(maxLayer, pos.layer);
  }
  
  // Calculate fixed right edge for all lanes in the pool
  // Right edge = element start X + all columns
  const poolRightEdge = POOL_X_OFFSET + POOL_LABEL_WIDTH + 
                        (maxNestingLevel * PARENT_LANE_LABEL_WIDTH) + 
                        (maxLayer + 1) * COLUMN_WIDTH;
  
  const laneBounds = new Map();
  
  // Helper function to calculate bounds for a lane and its children recursively
  function calculateLaneBoundsRecursive(laneId, startY, startX) {
    const lane = lanes.get(laneId);
    if (!lane) return { height: 0, width: 0 };
    
    // If this lane has children, calculate their bounds first
    if (lane.childLanes && lane.childLanes.length > 0) {
      if (isHorizontal) {
        // Children stack vertically
        let childY = startY;
        let totalHeight = 0;
        
        for (const childId of lane.childLanes) {
          const childResult = calculateLaneBoundsRecursive(childId, childY, startX);
          childY += childResult.height;
          totalHeight += childResult.height;
        }
        
        // Parent lane bounds encompass all children
        // Calculate X position for parent lane
        const parentX = POOL_X_OFFSET + POOL_LABEL_WIDTH; // Parent starts right after pool label
        
        // Parent width: from parentX to poolRightEdge
        const parentWidth = poolRightEdge - parentX;
        
        laneBounds.set(laneId, {
          x: parentX,
          y: startY,
          width: parentWidth,
          height: totalHeight,
          maxRows: 0, // Parent lanes don't have their own rows
          isParent: true
        });
        
        return { height: totalHeight, width: 0 };
      } else {
        // Children stack horizontally
        let childX = startX;
        let totalWidth = 0;
        
        for (const childId of lane.childLanes) {
          const childResult = calculateLaneBoundsRecursive(childId, startY, childX);
          childX += childResult.width;
          totalWidth += childResult.width;
        }
        
        // Parent lane bounds encompass all children
        laneBounds.set(laneId, {
          x: startX,
          width: totalWidth,
          maxRows: 0,
          isParent: true
        });
        
        return { height: 0, width: totalWidth };
      }
    } else {
      // Leaf lane - has its own elements
      const maxRows = laneMaxRows.get(laneId) || 1;
      
      if (isHorizontal) {
        const laneHeight = LANE_BASE_HEIGHT + (maxRows - 1) * LANE_ROW_HEIGHT;
        
        // Determine lane's actual nesting level
        const laneNestingLevel = getLaneNestingLevel(laneId, lanes);
        
        // Lane X position:
        // - Top-level lane (no parent): POOL_X_OFFSET + POOL_LABEL_WIDTH
        // - Sublane (has parent): add PARENT_LANE_LABEL_WIDTH for each nesting level
        const laneX = POOL_X_OFFSET + POOL_LABEL_WIDTH + (laneNestingLevel * PARENT_LANE_LABEL_WIDTH);
        
        // Element start X: always aligned at max nesting level
        // This ensures all columns start at the same X position across all lanes
        const elementStartX = POOL_X_OFFSET + POOL_LABEL_WIDTH + (maxNestingLevel * PARENT_LANE_LABEL_WIDTH);
        
        // Width: from laneX to poolRightEdge
        // This ensures all lanes have the same right edge
        const laneWidth = poolRightEdge - laneX;
        
        laneBounds.set(laneId, {
          x: laneX,  // Lane shape position (for BPMN DI)
          elementStartX: elementStartX,  // Where elements/columns start (aligned)
          y: startY,
          width: laneWidth,
          height: laneHeight,
          maxRows: maxRows,
          isParent: false
        });
        return { height: laneHeight, width: 0 };
      } else {
        const laneWidth = LANE_BASE_WIDTH + (maxRows - 1) * LANE_ROW_WIDTH;
        laneBounds.set(laneId, {
          x: startX,
          width: laneWidth,
          maxRows: maxRows,
          isParent: false
        });
        return { height: 0, width: laneWidth };
      }
    }
  }
  
  // Process only top-level lanes (those without parents)
  if (isHorizontal) {
    const POOL_GAP = 50; // Gap between different pools
    let currentY = LANE_TOP_OFFSET;
    let lastPoolId = null;
    
    for (const [laneId, lane] of lanes) {
      if (!lane.parentLane) {
        // Check if this lane belongs to a different pool than the previous one
        const currentPoolId = lane.poolId;
        if (lastPoolId !== null && currentPoolId !== lastPoolId) {
          // Different pool → add gap
          currentY += POOL_GAP;
        }
        
        const result = calculateLaneBoundsRecursive(laneId, currentY, 0);
        currentY += result.height;
        lastPoolId = currentPoolId;
      }
    }
  } else {
    const POOL_GAP = 50; // Gap between different pools
    let currentX = LANE_LEFT_OFFSET;
    let lastPoolId = null;
    
    for (const [laneId, lane] of lanes) {
      if (!lane.parentLane) {
        // Check if this lane belongs to a different pool than the previous one
        const currentPoolId = lane.poolId;
        if (lastPoolId !== null && currentPoolId !== lastPoolId) {
          // Different pool → add gap
          currentX += POOL_GAP;
        }
        
        const result = calculateLaneBoundsRecursive(laneId, 0, currentX);
        currentX += result.width;
        lastPoolId = currentPoolId;
      }
    }
  }
  
  return laneBounds;
}

/**
 * Calculate pool bounds that encompass all lanes in each pool
 * @param {Map} pools - Pool map
 * @param {Map} laneBounds - Lane bounds
 * @param {Map} coordinates - Element coordinates
 * @param {Map} lanes - Lane map
 * @returns {Map} - poolId → {x, y, width, height}
 */
function calculatePoolBounds(pools, laneBounds, coordinates, lanes) {
  const poolBounds = new Map();
  
  for (const [poolId, pool] of pools) {
    if (pool.lanes.length === 0) continue;
    
    // Find min/max Y from laneBounds
    let minY = Infinity, maxY = -Infinity;
    
    for (const laneId of pool.lanes) {
      const bounds = laneBounds.get(laneId);
      if (!bounds) continue;
      
      minY = Math.min(minY, bounds.y || 0);
      maxY = Math.max(maxY, (bounds.y || 0) + (bounds.height || 0));
    }
    
    // Find max lane width (all lanes should have same width)
    let maxLaneWidth = 0;
    for (const laneId of pool.lanes) {
      const bounds = laneBounds.get(laneId);
      if (bounds && bounds.width) {
        maxLaneWidth = Math.max(maxLaneWidth, bounds.width);
      }
    }
    
    // Pool width = pool label + max parent lane width
    const POOL_LABEL_WIDTH = 30;
    const PARENT_LANE_LABEL_WIDTH = 30;
    
    poolBounds.set(poolId, {
      x: POOL_X_OFFSET,
      y: minY,
      width: POOL_LABEL_WIDTH + maxLaneWidth,
      height: maxY - minY
    });
  }
  
  return poolBounds;
}

import { checkFlowCollisions } from './flow-collision-detector.js';
import { checkColumnAlignment } from './column-alignment-checker.js';

/**
 * Merge flows for hidden XOR merge gateways
 * For each hidden merge gateway:
 * - Find incoming flows (targetRef = gateway)
 * - Find outgoing flow (sourceRef = gateway, should be exactly 1)
 * - Update incoming flows: targetRef = outgoing.targetRef
 * - Merge waypoints: incoming waypoints + gateway center + outgoing waypoints
 * - Delete outgoing flow
 * @param {Map} flows - Flow map (will be modified)
 * @param {Map} flowWaypoints - Flow waypoints map (will be modified)
 * @param {Map} elements - Element map
 * @param {Map} coordinates - Element coordinates
 */
function mergeFlowsForHiddenGateways(flows, flowWaypoints, elements, coordinates) {
  const gatewaysToProcess = [];
  
  // Find all hidden XOR merge gateways
  for (const [elementId, element] of elements) {
    if (isXorMergeGateway(element, flows)) {
      gatewaysToProcess.push(elementId);
    }
  }
  
  // Process each hidden merge gateway
  for (const gatewayId of gatewaysToProcess) {
    // Find incoming and outgoing flows
    const incomingFlows = [];
    let outgoingFlow = null;
    
    for (const [flowId, flow] of flows) {
      if (flow.targetRef === gatewayId) {
        incomingFlows.push({ flowId, flow });
      }
      if (flow.sourceRef === gatewayId) {
        outgoingFlow = { flowId, flow };
      }
    }
    
    // Validate: should have exactly 1 outgoing flow
    if (!outgoingFlow) {
      console.warn(`Hidden merge gateway ${gatewayId} has no outgoing flow!`);
      continue;
    }
    
    if (incomingFlows.length === 0) {
      console.warn(`Hidden merge gateway ${gatewayId} has no incoming flows!`);
      continue;
    }
    
    // Get gateway center coordinates
    const gatewayCoord = coordinates.get(gatewayId);
    if (!gatewayCoord) {
      console.warn(`Hidden merge gateway ${gatewayId} has no coordinates!`);
      continue;
    }
    
    const gatewayCenterX = gatewayCoord.x + gatewayCoord.width / 2;
    const gatewayCenterY = gatewayCoord.y + gatewayCoord.height / 2;
    
    // Get outgoing flow waypoints
    const outgoingWaypoints = flowWaypoints.get(outgoingFlow.flowId);
    if (!outgoingWaypoints || outgoingWaypoints.length === 0) {
      console.warn(`Outgoing flow ${outgoingFlow.flowId} has no waypoints!`);
      continue;
    }
    
    // Merge each incoming flow with the outgoing flow
    for (const { flowId, flow } of incomingFlows) {
      // Update targetRef to bypass gateway
      flow.targetRef = outgoingFlow.flow.targetRef;
      
      // Merge waypoints
      const incomingWaypoints = flowWaypoints.get(flowId);
      if (!incomingWaypoints || incomingWaypoints.length === 0) {
        console.warn(`Incoming flow ${flowId} has no waypoints!`);
        continue;
      }
      
      // Combine: incoming (except last) + gateway center + outgoing (except first)
      const mergedWaypoints = [
        ...incomingWaypoints.slice(0, -1),  // All except last (gateway entry)
        { x: gatewayCenterX, y: gatewayCenterY },  // Gateway center
        ...outgoingWaypoints.slice(1)  // All except first (gateway exit)
      ];
      
      flowWaypoints.set(flowId, mergedWaypoints);
    }
    
    // Delete outgoing flow (it's been merged into incoming flows)
    flows.delete(outgoingFlow.flowId);
    flowWaypoints.delete(outgoingFlow.flowId);
  }
}

export function phase3(phase2Result, elements, lanes, directions, pools = new Map(), flows = new Map()) {
  const { positions, flowInfos } = phase2Result;
  
  // Calculate lane bounds first (needed for element positioning)
  const laneBounds = calculateLaneBounds(lanes, positions, directions, pools);
  
  // Calculate element coordinates (positioned within lanes)
  const coordinates = calculateElementCoordinates(elements, positions, laneBounds, directions, lanes);
  
  // Debug: Check if all elements have coordinates
  if (elements.size !== coordinates.size) {
    console.error(`\n⚠️  WARNING: Not all elements have coordinates!`);
    console.error(`   Total elements: ${elements.size}`);
    console.error(`   Coordinates: ${coordinates.size}`);
    console.error(`   Missing: ${elements.size - coordinates.size}`);
    const missing = [];
    for (const [id] of elements) {
      if (!coordinates.has(id)) {
        missing.push(id);
      }
    }
    console.error(`   Missing coordinates: ${missing.join(', ')}\n`);
  }
  
  // Calculate flow waypoints
  const flowWaypoints = new Map();
  
  for (const [flowId, flowInfo] of flowInfos) {
    if (flowInfo.isBackFlow) {
      // Route back-flows with Manhattan pathfinding
      const waypoints = routeBackFlow(flowInfo, coordinates, positions, lanes, directions, flowInfos);
      flowWaypoints.set(flowId, waypoints);
    } else {
      // Normal flows: convert logical waypoints to pixel
      const waypoints = calculateFlowWaypoints(flowInfo, coordinates, lanes, directions, laneBounds, elements, flows);
      flowWaypoints.set(flowId, waypoints);
    }
  }
  
  // Merge flows for hidden XOR merge gateways
  if (directions && directions.hideXorMergeGateways) {
    mergeFlowsForHiddenGateways(flows, flowWaypoints, elements, coordinates);
  }
  
  // Calculate pool bounds (encompassing all lanes in each pool)
  const poolBounds = calculatePoolBounds(pools, laneBounds, coordinates, lanes);
  
  // Check for flow collisions (debugging)
  if (flows.size > 0) {
    checkFlowCollisions(flows, flowWaypoints, coordinates, flowInfos);
  }
  
  // Check for column alignment issues
  checkColumnAlignment(positions, coordinates, elements);
  
  return {
    coordinates,
    flowWaypoints,
    laneBounds,
    poolBounds
  };
}

/**
 * Generate BPMN DI (Diagram Interchange) XML for elements
 * @param {Map} elements - Element map from Phase 1
 * @param {Map} coordinates - Element coordinates
 * @returns {string} - BPMN DI XML string
 */
/**
 * Calculate single pool bounds that encompass all lanes (legacy function for single-pool layouts)
 * @param {Map} laneBounds - Lane bounds
 * @param {Map} coordinates - Element coordinates
 * @param {Object} directions - Direction mappings
 * @returns {Object} - {x, y, width, height}
 */
function calculateSinglePoolBounds(laneBounds, coordinates, directions) {
  const isHorizontal = directions.alongLane === 'right';
  
  if (laneBounds.size === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  
  if (isHorizontal) {
    // Calculate pool bounds from actual element positions
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    for (const coord of coordinates.values()) {
      if (coord.x < minX) minX = coord.x;
      if (coord.x + coord.width > maxX) maxX = coord.x + coord.width;
      if (coord.y < minY) minY = coord.y;
      if (coord.y + coord.height > maxY) maxY = coord.y + coord.height;
    }
    
    // Pool wraps all elements with margins
    const POOL_MARGIN_LEFT = 50;   // Margin inside pool
    const POOL_MARGIN_TOP = 30;    // Space for pool label
    const POOL_MARGIN_RIGHT = 50;  // Margin inside pool
    const POOL_MARGIN_BOTTOM = 50;
    
    // Pool starts at POOL_X_OFFSET (for lane labels)
    // Width extends from POOL_X_OFFSET to rightmost element + margin
    const poolWidth = (maxX - POOL_X_OFFSET) + POOL_MARGIN_RIGHT;
    
    return {
      x: POOL_X_OFFSET,
      y: minY - POOL_MARGIN_TOP,
      width: poolWidth,
      height: (maxY - minY) + POOL_MARGIN_TOP + POOL_MARGIN_BOTTOM
    };
  } else {
    // Vertical orientation (similar logic, swapped dimensions)
    const maxY = Math.max(...Array.from(coordinates.values()).map(p => p.y + p.height));
    const poolHeight = maxY - POOL_X_OFFSET + 100;
    
    let poolWidth = 0;
    for (const bounds of laneBounds.values()) {
      poolWidth += bounds.width;
    }
    
    return {
      x: LANE_LEFT_OFFSET,
      y: POOL_X_OFFSET,
      width: poolWidth,
      height: poolHeight
    };
  }
}

/**
 * Generate BPMN DI for pool shape
 * @param {string} poolId - Pool/Participant ID from BPMN XML
 * @param {Object} poolBounds - Pool bounds
 * @param {Object} directions - Direction mappings
 * @returns {string} - Pool DI XML
 */
export function generatePoolDI(poolId, poolBounds, directions) {
  const isHorizontal = directions.alongLane === 'right';
  
  return `      <bpmndi:BPMNShape id="${poolId}_di" bpmnElement="${poolId}" isHorizontal="${isHorizontal}">
        <dc:Bounds x="${poolBounds.x}" y="${poolBounds.y}" width="${poolBounds.width}" height="${poolBounds.height}" />
        <bpmndi:BPMNLabel />
      </bpmndi:BPMNShape>`;
}

/**
 * Generate BPMN DI for lane shapes
 * @param {Map} lanes - Lane map
 * @param {Map} laneBounds - Lane bounds
 * @param {Object} poolBounds - Pool bounds (for width calculation)
 * @param {Object} directions - Direction mappings
 * @returns {string} - Lane DI XML
 */
export function generateLaneDI(lanes, laneBounds, poolBounds, directions) {
  const shapes = [];
  const isHorizontal = directions.alongLane === 'right';
  
  const PARENT_LANE_LABEL_WIDTH = 30;  // Width for parent lane labels
  const CHILD_LANE_INDENT = 30;         // Additional indent for child lanes
  
  if (isHorizontal) {
    // Horizontal orientation - use actual lane positions
    for (const [laneId, lane] of lanes) {
      const bounds = laneBounds.get(laneId);
      if (!bounds) continue;
      
      // Get pool bounds for this lane (if poolBounds is a Map)
      const poolBound = poolBounds instanceof Map 
        ? poolBounds.get(lane.poolId) 
        : poolBounds;
      
      if (!poolBound) continue;
      
      // Use X from laneBounds (already calculated with correct offsets)
      const laneX = bounds.x || (poolBound.x + PARENT_LANE_LABEL_WIDTH);
      const laneWidth = bounds.width || (poolBound.width - PARENT_LANE_LABEL_WIDTH);
      
      shapes.push(
        `      <bpmndi:BPMNShape id="${laneId}_di" bpmnElement="${laneId}" isHorizontal="true">`,
        `        <dc:Bounds x="${laneX}" y="${bounds.y}" width="${laneWidth}" height="${bounds.height}" />`,
        `      </bpmndi:BPMNShape>`
      );
    }
  } else {
    // Vertical orientation
    let laneX = LANE_LEFT_OFFSET;
    
    for (const [laneId, lane] of lanes) {
      const bounds = laneBounds.get(laneId);
      if (!bounds) continue;
      
      shapes.push(
        `      <bpmndi:BPMNShape id="${laneId}_di" bpmnElement="${laneId}" isHorizontal="false">`,
        `        <dc:Bounds x="${laneX}" y="${POOL_X_OFFSET + 30}" width="${bounds.width}" height="${poolBounds.height - 30}" />`,
        `      </bpmndi:BPMNShape>`
      );
      
      laneX += bounds.width;
    }
  }
  
  return shapes.join('\n');
}

/**
 * Calculate element label position
 * @param {string} elementId - Element ID
 * @param {Map} coordinates - Element coordinates
 * @param {Map} flowWaypoints - Flow waypoints
 * @param {Map} flows - Flow map
 * @param {Map} elements - Element map (to check element type)
 * @returns {Object} - {x, y, width, height}
 */
function calculateElementLabelPosition(elementId, coordinates, flowWaypoints, flows, elements) {
  const pos = coordinates.get(elementId);
  const element = elements.get(elementId);
  
  // Special handling for gateways: always top-left
  if (element && element.type && element.type.includes('Gateway')) {
    const text = element.name || '';
    const words = text.split(/\s+/).filter(w => w.length > 0);
    
    // Determine if label will wrap to multiple lines
    let labelWidth;
    let labelHeight;
    
    if (words.length >= 2 && text.length > 15) {
      // Likely 2 lines (e.g., "Documents Complete?")
      labelWidth = 80;
      labelHeight = 40;  // 2 lines
    } else if (text.length > 12) {
      // Long single-word or phrase - wider label
      labelWidth = 100;
      labelHeight = 20;
    } else {
      // Short label - standard size
      labelWidth = 80;
      labelHeight = 20;
    }
    
    // Adjust gaps based on label type
    let horizontalGap;
    let verticalGap = 5;  // Standard vertical gap
    
    if (labelHeight > 20) {
      // Multi-line label - standard gap
      horizontalGap = 5;
    } else {
      // Single-line label - larger gap to move it further left
      horizontalGap = 10;
    }
    
    // Gateway center
    const gatewayCenterX = pos.x + pos.width / 2;
    const gatewayCenterY = pos.y + pos.height / 2;
    
    // Position label so its BOTTOM-RIGHT corner is near the gateway center
    // This places the label to the top-left of the gateway
    const labelRightEdge = gatewayCenterX - horizontalGap;
    const labelX = labelRightEdge - labelWidth;
    
    const labelBottomEdge = gatewayCenterY - verticalGap;
    const labelY = labelBottomEdge - labelHeight;
    
    return {
      x: labelX,
      y: labelY,
      width: labelWidth,
      height: labelHeight
    };
  }
  
  // For non-gateway elements: check all sides for occupied flows
  const elementCenter = {
    x: pos.x + pos.width / 2,
    y: pos.y + pos.height / 2
  };
  
  const occupiedSides = {
    top: false,
    bottom: false,
    left: false,
    right: false
  };
  
  // Check all flows (both incoming and outgoing)
  for (const [flowId, flow] of flows) {
    const isIncoming = flow.targetRef === elementId;
    const isOutgoing = flow.sourceRef === elementId;
    
    if (!isIncoming && !isOutgoing) continue;
    
    const waypoints = flowWaypoints.get(flowId);
    if (!waypoints || waypoints.length < 2) continue;
    
    // For incoming: check approach direction (second-to-last waypoint)
    // For outgoing: check exit direction (second waypoint)
    const checkPoint = isIncoming 
      ? waypoints[waypoints.length - 2] 
      : waypoints[1];
    
    // Determine which side the flow occupies
    const dx = checkPoint.x - elementCenter.x;
    const dy = checkPoint.y - elementCenter.y;
    
    // Use absolute values to determine primary direction
    if (Math.abs(dy) > Math.abs(dx)) {
      // Vertical direction dominates
      if (dy < 0) {
        occupiedSides.top = true;
      } else {
        occupiedSides.bottom = true;
      }
    } else {
      // Horizontal direction dominates
      if (dx < 0) {
        occupiedSides.left = true;
      } else {
        occupiedSides.right = true;
      }
    }
  }
  
  // Choose best available position (priority: bottom > top > right > left)
  const labelWidth = pos.width + 20;
  const labelHeight = 20;
  
  if (!occupiedSides.bottom) {
    // Label BELOW (default)
    return {
      x: pos.x - 10,
      y: pos.y + pos.height + 5,
      width: labelWidth,
      height: labelHeight
    };
  } else if (!occupiedSides.top) {
    // Label ABOVE
    return {
      x: pos.x - 10,
      y: pos.y - 25,
      width: labelWidth,
      height: labelHeight
    };
  } else if (!occupiedSides.right) {
    // Label RIGHT
    return {
      x: pos.x + pos.width + 5,
      y: pos.y + (pos.height - labelHeight) / 2,
      width: labelWidth,
      height: labelHeight
    };
  } else {
    // Label LEFT (fallback, should rarely happen)
    return {
      x: pos.x - labelWidth - 5,
      y: pos.y + (pos.height - labelHeight) / 2,
      width: labelWidth,
      height: labelHeight
    };
  }
}

/**
 * Check if element is an XOR merge gateway
 * @param {Object} element - Element object
 * @param {Map} flows - Flows map
 * @returns {boolean} - True if XOR merge gateway
 */
function isXorMergeGateway(element, flows) {
  // Must be an exclusive gateway
  if (element.type !== 'exclusiveGateway') return false;
  
  // Must have exactly 1 outgoing flow (merge)
  if (!element.outgoing || element.outgoing.length !== 1) return false;
  
  // Must have more than 1 incoming flow
  if (!element.incoming || element.incoming.length <= 1) return false;
  
  return true;
}

export function generateElementDI(elements, coordinates, flowWaypoints, flows, directions) {
  let xml = '';
  
  for (const [elementId, element] of elements) {
    const coord = coordinates.get(elementId);
    if (!coord) continue;
    
    // Skip rendering XOR merge gateways if hideXorMergeGateways is enabled
    if (directions.hideXorMergeGateways && isXorMergeGateway(element, flows)) {
      continue; // Don't render this gateway
    }
    
    // Calculate label position
    const labelBounds = calculateElementLabelPosition(elementId, coordinates, flowWaypoints, flows, elements);
    
    xml += `    <bpmndi:BPMNShape bpmnElement="${elementId}">\n`;
    xml += `      <dc:Bounds x="${coord.x}" y="${coord.y}" width="${coord.width}" height="${coord.height}"/>\n`;
    xml += `      <bpmndi:BPMNLabel>\n`;
    xml += `        <dc:Bounds x="${labelBounds.x}" y="${labelBounds.y}" width="${labelBounds.width}" height="${labelBounds.height}" />\n`;
    xml += `      </bpmndi:BPMNLabel>\n`;
    xml += `    </bpmndi:BPMNShape>\n`;
  }
  
  return xml;
}

/**
 * Calculate edge label position with unified rules
 * Uses consistent offset from gateway for all directions
 * @param {Object} flow - Flow object
 * @param {Array} waypoints - Flow waypoints
 * @param {Map} elements - Element map
 * @param {Map} coordinates - Element coordinates
 * @param {Map} flows - All flows (to check for multiple outputs on same side)
 * @param {Object} flowInfo - Flow info from Phase 2 (contains exitSide for this flow)
 * @param {Map} flowInfos - All flow infos (to check other flows' exitSides)
 * @returns {Object} - {x, y, width, height}
 */
function calculateEdgeLabelPosition(flow, waypoints, elements, coordinates, flows, flowInfo, flowInfos, flowWaypoints) {
  const sourceEl = elements.get(flow.sourceRef);
  
  // Check if this is a message flow
  if (flow.type === 'messageFlow') {
    // Message flow → position label at first waypoint (flow start)
    if (!waypoints || waypoints.length < 2) {
      return { x: 0, y: 0, width: 50, height: 20 };
    }
    
    const textLength = flow.name ? flow.name.length : 10;
    const LABEL_WIDTH = Math.max(50, textLength * 7 + 10);
    const LABEL_HEIGHT = 20;
    const LABEL_OFFSET = 5;
    
    // Use first waypoint (where arrow exits the source event)
    const wp1 = waypoints[0];
    const HORIZONTAL_OFFSET = 10; // Small offset to the right
    
    // Position label above first waypoint, left-aligned with offset
    return {
      x: wp1.x + HORIZONTAL_OFFSET,
      y: wp1.y - LABEL_HEIGHT - LABEL_OFFSET,
      width: LABEL_WIDTH,
      height: LABEL_HEIGHT
    };
  }
  
  // Check if source is a gateway (output flow from gateway)
  const isGatewaySource = sourceEl && sourceEl.type && sourceEl.type.includes('Gateway');
  
  if (!isGatewaySource || !waypoints || waypoints.length < 2) {
    // Not a gateway flow → use midpoint
    const sourcePos = coordinates.get(flow.sourceRef);
    const targetPos = coordinates.get(flow.targetRef);
    if (!sourcePos || !targetPos) {
      return { x: 0, y: 0, width: 30, height: 20 };
    }
    return {
      x: (sourcePos.x + targetPos.x) / 2,
      y: (sourcePos.y + targetPos.y) / 2,
      width: 30,
      height: 20
    };
  }
  
  // Gateway OUTPUT → unified positioning rules
  const LABEL_OFFSET = 0;  // No offset - labels directly at waypoint
  
  // Calculate dynamic label width based on text length
  // Approximate: 7 pixels per character + 10px padding
  const textLength = flow.name ? flow.name.length : 10;
  const LABEL_WIDTH = Math.max(50, textLength * 7 + 10);  // Minimum 50px
  
  // Set label height based on estimated width (wider labels might wrap to 2 lines)
  const LABEL_HEIGHT = LABEL_WIDTH > 120 ? 40 : 20;
  
  // Get first waypoint (arrow exit point)
  const wp1 = waypoints[0];
  
  // Get gateway bounds (for fallback)
  const gatewayCoord = coordinates.get(flow.sourceRef);
  if (!gatewayCoord) {
    return { x: 0, y: 0, width: LABEL_WIDTH, height: LABEL_HEIGHT };
  }
  
  // Determine exitSide
  let exitSide = null;
  if (flowInfo && flowInfo.source && flowInfo.source.exitSide) {
    exitSide = flowInfo.source.exitSide;
  } else {
    // Fallback: analyze waypoints
    const wp1 = waypoints[0];
    const wp2 = waypoints[1];
    const dx = wp2.x - wp1.x;
    const dy = wp2.y - wp1.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      exitSide = dx > 0 ? 'right' : 'left';
    } else {
      exitSide = dy > 0 ? 'down' : 'up';
    }
  }
  
  // Check if target is in different layer than gateway
  // If different layer → label at corridor (knick), if same layer → label near gateway
  const gatewayLayer = flowInfo?.source?.layer;
  const targetLayer = flowInfo?.target?.layer;
  const shouldUseCorridor = gatewayLayer !== undefined && targetLayer !== undefined && 
                            gatewayLayer !== targetLayer && waypoints.length >= 3;
  
  // Check if multiple cross-lane outputs from this gateway go in the same direction
  // If yes: use corridor positioning (at knick)
  // If no: use individual waypoint (near gateway)
  let crossLaneOutputsDown = 0;
  let crossLaneOutputsUp = 0;
  
  if (flowInfos && flowWaypoints) {
    const gatewayLane = flowInfo?.source?.lane;
    
    for (const [otherFlowId, otherFlowInfo] of flowInfos) {
      const otherFlow = flows.get(otherFlowId);
      if (otherFlow && otherFlow.sourceRef === flow.sourceRef) {
        const otherTargetLane = otherFlowInfo.target?.lane;
        
        // Check if this is a cross-lane flow
        if (gatewayLane && otherTargetLane && gatewayLane !== otherTargetLane) {
          // Determine direction based on exitSide
          const otherExitSide = otherFlowInfo.source?.exitSide;
          if (otherExitSide === 'down') {
            crossLaneOutputsDown++;
          } else if (otherExitSide === 'up') {
            crossLaneOutputsUp++;
          }
        }
      }
    }
  }
  
  // Check if multiple cross-lane outputs in same direction
  let hasConvergingOutputs = crossLaneOutputsDown >= 2 || crossLaneOutputsUp >= 2;
  
  // Determine label reference X
  let labelReferenceX;
  
  if (hasConvergingOutputs) {
    // Multiple outputs to same layer → use rightmost waypoint for vertical alignment
    let rightmostWpX = wp1.x;
    
    if (flowWaypoints) {
      for (const [otherFlowId, otherFlow] of flows) {
        if (otherFlow.sourceRef === flow.sourceRef) {
          const otherWaypoints = flowWaypoints.get(otherFlowId);
          if (otherWaypoints && otherWaypoints.length > 0) {
            const otherWp1X = otherWaypoints[0].x;
            if (otherWp1X > rightmostWpX) {
              rightmostWpX = otherWp1X;
            }
          }
        }
      }
    }
    
    labelReferenceX = rightmostWpX;
  } else {
    // Each output to different layer → use individual waypoint (near gateway)
    labelReferenceX = wp1.x;
  }
  
  let labelX, labelY;
  
  if (exitSide === 'right') {
    // Horizontal flow: always position label above to prevent collision with multi-line text
    if (shouldUseCorridor && hasConvergingOutputs) {
      // Multiple outputs converging: label at corridor (knick)
      const secondLastWp = waypoints[waypoints.length - 2];
      labelX = labelReferenceX + LABEL_OFFSET;
      labelY = secondLastWp.y - LABEL_HEIGHT - LABEL_OFFSET;
    } else {
      // Single output or no convergence: label near gateway
      labelX = labelReferenceX - 10;  // Closer to center
      labelY = wp1.y - LABEL_HEIGHT - LABEL_OFFSET;
    }
    
  } else if (exitSide === 'down') {
    if (shouldUseCorridor && hasConvergingOutputs) {
      // Multiple outputs converging: label at corridor (knick), below to prevent collision
      const secondLastWp = waypoints[waypoints.length - 2];
      labelX = wp1.x - 20;  // Shift left to align text properly
      labelY = secondLastWp.y + 10;   // More spacing below flow
      // Use fixed width for consistent rendering by bpmn.io
      const FIXED_CORRIDOR_WIDTH = 150;
      return {
        x: labelX,
        y: labelY,
        width: FIXED_CORRIDOR_WIDTH,
        height: LABEL_HEIGHT
      };
    } else {
      // Single output or no convergence: label near gateway
      labelX = wp1.x - 10;  // Closer to center
      labelY = wp1.y + 10;  // Further down
    }
    
  } else if (exitSide === 'left') {
    // Horizontal flow: always position label above to prevent collision with multi-line text
    if (shouldUseCorridor && hasConvergingOutputs) {
      // Multiple outputs converging: label at corridor (knick)
      const secondLastWp = waypoints[waypoints.length - 2];
      labelX = labelReferenceX - LABEL_WIDTH - LABEL_OFFSET;
      labelY = secondLastWp.y - LABEL_HEIGHT - LABEL_OFFSET;
    } else {
      // Single output or no convergence: label near gateway
      labelX = labelReferenceX - LABEL_WIDTH - LABEL_OFFSET;
      labelY = wp1.y - LABEL_HEIGHT - LABEL_OFFSET;
    }
    
  } else if (exitSide === 'up') {
    // Vertical flow up: position label above (on target side)
    labelX = labelReferenceX + LABEL_OFFSET;
    labelY = wp1.y - LABEL_HEIGHT - LABEL_OFFSET;
    
  } else {
    // Fallback
    labelX = labelReferenceX + LABEL_OFFSET;
    labelY = wp1.y - LABEL_HEIGHT - LABEL_OFFSET;
  }
  
  return {
    x: labelX,
    y: labelY,
    width: LABEL_WIDTH,
    height: LABEL_HEIGHT
  };
}

/**
 * Generate BPMN DI for flows (edges)
 * @param {Map} flows - Flow map
 * @param {Map} flowWaypoints - Flow waypoints
 * @param {Map} elements - Element map
 * @param {Map} coordinates - Element coordinates
 * @param {Map} flowInfos - Flow infos from Phase 2 (contains exitSide)
 * @returns {string} - BPMN DI XML string
 */
export function generateFlowDI(flows, flowWaypoints, elements, coordinates, flowInfos, directions) {
  let xml = '';
  
  for (const [flowId, flow] of flows) {
    const waypoints = flowWaypoints.get(flowId);
    if (!waypoints || waypoints.length === 0) continue;
    
    xml += `    <bpmndi:BPMNEdge bpmnElement="${flowId}">\n`;
    
    for (const waypoint of waypoints) {
      xml += `      <di:waypoint x="${waypoint.x}" y="${waypoint.y}"/>\n`;
    }
    
    // Add label if flow has a name
    if (flow.name) {
      const flowInfo = flowInfos ? flowInfos.get(flowId) : null;
      const labelBounds = calculateEdgeLabelPosition(flow, waypoints, elements, coordinates, flows, flowInfo, flowInfos, flowWaypoints);
      xml += `      <bpmndi:BPMNLabel>\n`;
      xml += `        <dc:Bounds x="${labelBounds.x}" y="${labelBounds.y}" width="${labelBounds.width}" height="${labelBounds.height}" />\n`;
      xml += `      </bpmndi:BPMNLabel>\n`;
    }
    
    xml += `    </bpmndi:BPMNEdge>\n`;
  }
  
  return xml;
}

/**
 * Inject BPMN DI into existing BPMN XML
 * @param {string} bpmnXml - Original BPMN XML
 * @param {Map} elements - Element map
 * @param {Map} flows - Flow map
 * @param {Map} lanes - Lane map
 * @param {Map} coordinates - Element coordinates
 * @param {Map} flowWaypoints - Flow waypoints
 * @param {Map} laneBounds - Lane bounds
 * @param {Map} flowInfos - Flow infos from Phase 2
 * @returns {string} - BPMN XML with DI
 */
/**
 * Remove deleted elements and flows from BPMN XML
 * (Elements/flows that were removed during pre-processing)
 * @param {string} bpmnXml - Original BPMN XML
 * @param {Map} elements - Processed elements map
 * @param {Map} flows - Processed flows map
 * @returns {string} - Cleaned BPMN XML
 */
function removeDeletedElementsFromXML(bpmnXml, elements, flows) {
  let cleanedXml = bpmnXml;
  
  // Find all element IDs in the XML
  const elementRegex = /<bpmn:(task|userTask|serviceTask|manualTask|sendTask|receiveTask|scriptTask|businessRuleTask|callActivity|exclusiveGateway|parallelGateway|inclusiveGateway|startEvent|endEvent|intermediateThrowEvent|intermediateCatchEvent|boundaryEvent)[^>]+id="([^"]+)"[^>]*(?:\/>|>[\s\S]*?<\/bpmn:\1>)/g;
  let match;
  const xmlElementIds = [];
  
  while (match = elementRegex.exec(bpmnXml)) {
    xmlElementIds.push({id: match[2], fullMatch: match[0]});
  }
  
  // Remove elements that are not in the processed elements map
  for (const {id, fullMatch} of xmlElementIds) {
    if (!elements.has(id)) {
      // Element was removed during pre-processing - remove from XML
      cleanedXml = cleanedXml.replace(fullMatch, '');
      
      // Also remove flowNodeRef from lane
      const flowNodeRefRegex = new RegExp(`\\s*<bpmn:flowNodeRef>${id}</bpmn:flowNodeRef>\\s*`, 'g');
      cleanedXml = cleanedXml.replace(flowNodeRefRegex, '\n');
    }
  }
  
  // Find all flow IDs in the XML
  const flowRegex = /<bpmn:sequenceFlow[^>]+id="([^"]+)"[^>]*(?:\/>|>[\s\S]*?<\/bpmn:sequenceFlow>)/g;
  const xmlFlowIds = [];
  
  while (match = flowRegex.exec(bpmnXml)) {
    xmlFlowIds.push({id: match[1], fullMatch: match[0]});
  }
  
  // Remove flows that are not in the processed flows map
  for (const {id, fullMatch} of xmlFlowIds) {
    if (!flows.has(id)) {
      // Flow was removed during pre-processing - remove from XML
      cleanedXml = cleanedXml.replace(fullMatch, '');
    }
  }
  
  // Update flow attributes (sourceRef, targetRef) to match processed flows
  // This is needed when flows are redirected (e.g., XOR merge gateway removal)
  for (const [flowId, flow] of flows) {
    const flowMatch = cleanedXml.match(new RegExp(`<bpmn:sequenceFlow[^>]+id="${flowId}"[^>]*(?:/>|>[\\s\\S]*?</bpmn:sequenceFlow>)`));
    if (flowMatch) {
      const originalFlow = flowMatch[0];
      // Update sourceRef and targetRef to match processed flow
      let updatedFlow = originalFlow
        .replace(/sourceRef="[^"]+"/, `sourceRef="${flow.sourceRef}"`)
        .replace(/targetRef="[^"]+"/, `targetRef="${flow.targetRef}"`);
      cleanedXml = cleanedXml.replace(originalFlow, updatedFlow);
    }
  }
  
  // Clean up empty lines and extra whitespace
  cleanedXml = cleanedXml.replace(/\n\s*\n/g, '\n');
  
  return cleanedXml;
}

export function injectBPMNDI(bpmnXml, elements, flows, lanes, coordinates, flowWaypoints, laneBounds, directions, flowInfos, pools = new Map(), poolBounds = new Map()) {
  // Fix collaboration/process order if needed (collaboration must come before process for pool labels to work)
  let reorderedXml = bpmnXml;
  const collaborationMatch = bpmnXml.match(/<bpmn:collaboration[\s\S]*?<\/bpmn:collaboration>/);  
  const processMatch = bpmnXml.match(/<bpmn:process[\s\S]*?<\/bpmn:process>/);
  
  if (collaborationMatch && processMatch) {
    const collaborationPos = bpmnXml.indexOf(collaborationMatch[0]);
    const processPos = bpmnXml.indexOf(processMatch[0]);
    
    // If process comes before collaboration, swap them
    if (processPos < collaborationPos) {
      // Extract both sections
      const collaborationOriginal = collaborationMatch[0];
      const process = processMatch[0];
      
      // Add id="Collaboration_1" if missing
      let collaboration = collaborationOriginal;
      if (!collaboration.match(/<bpmn:collaboration[^>]*\sid=/)) {
        collaboration = collaboration.replace('<bpmn:collaboration', '<bpmn:collaboration id="Collaboration_1"');
      }
      
      // Remove both from XML (use original for matching)
      reorderedXml = bpmnXml.replace(collaborationOriginal, '').replace(process, '');
      
      // Find the definitions tag and insert collaboration first, then process
      const definitionsEnd = reorderedXml.indexOf('<bpmn:process') !== -1 ? 
        reorderedXml.indexOf('<bpmn:process') : 
        reorderedXml.indexOf('</bpmn:definitions>');
      
      reorderedXml = reorderedXml.substring(0, definitionsEnd) + 
        '  ' + collaboration + '\n  ' + process + '\n' + 
        reorderedXml.substring(definitionsEnd);
    }
  }
  
  // Remove deleted elements/flows from XML first
  const cleanedXml = removeDeletedElementsFromXML(reorderedXml, elements, flows);
  
  // Generate DI XML for all pools
  let poolDI = '';
  for (const [poolId, pool] of pools) {
    const bounds = poolBounds.get(poolId);
    if (bounds) {
      poolDI += generatePoolDI(poolId, bounds, directions);
    }
  }
  const laneDI = generateLaneDI(lanes, laneBounds, poolBounds, directions);
  const elementDI = generateElementDI(elements, coordinates, flowWaypoints, flows, directions);
  const flowDI = generateFlowDI(flows, flowWaypoints, elements, coordinates, flowInfos, directions);
  
  // Check if DI already exists
  if (cleanedXml.includes('<bpmndi:BPMNDiagram')) {
    // Replace existing DI
    const diStart = cleanedXml.indexOf('<bpmndi:BPMNDiagram');
    const diEnd = cleanedXml.indexOf('</bpmndi:BPMNDiagram>') + '</bpmndi:BPMNDiagram>'.length;
    
    // If pools exist, BPMNPlane should reference Collaboration, not Process
    const planeElement = pools.size > 0 ? 'Collaboration_1' : 'Process_1';
    
    const newDI = `  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane bpmnElement="${planeElement}">
${poolDI ? poolDI + '\n' : ''}${laneDI}
${elementDI}${flowDI}    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>`;
    
    return cleanedXml.substring(0, diStart) + newDI + cleanedXml.substring(diEnd);
  } else {
    // Add new DI before closing </definitions>
    const definitionsEnd = cleanedXml.lastIndexOf('</bpmn:definitions>');
    
    // If pools exist, BPMNPlane should reference Collaboration, not Process
    const planeElement = pools.size > 0 ? 'Collaboration_1' : 'Process_1';
    
    const newDI = `  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane bpmnElement="${planeElement}">
${poolDI ? poolDI + '\n' : ''}${laneDI}
${elementDI}${flowDI}    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
`;
    
    return cleanedXml.substring(0, definitionsEnd) + newDI + cleanedXml.substring(definitionsEnd);
  }
}

/**
 * Main layout function - combines all phases
 * @param {string} bpmnXml - Input BPMN XML
 * @param {Object} config - Configuration
 * @returns {Object} - {success, bpmnXml, errors}
 */
export function layoutBPMN(bpmnXml, config = {}) {
  try {
    // TODO: Import and call Phase 1 and Phase 2
    // For now, this is a placeholder
    
    return {
      success: false,
      errors: ['layoutBPMN not yet fully implemented - requires Phase 1 and Phase 2 integration']
    };
  } catch (error) {
    return {
      success: false,
      errors: [error.message]
    };
  }
}
