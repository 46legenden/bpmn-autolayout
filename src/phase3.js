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
 * @param {Map} positions - Map of elementId → {lane, layer, row}
 * @param {Map} lanes - Lane map
 * @param {Map} laneBounds - Lane bounds from calculateLaneBounds
 * @param {Object} directions - Direction mappings from Phase 2
 * @returns {Map} - Map of elementId → {x, y, width, height}
 */
export function calculateElementCoordinates(elements, positions, laneBounds, directions) {
  const coordinates = new Map();
  // Extract lanes from laneBounds keys
  const lanes = new Map(Array.from(laneBounds.keys()).map(laneId => [laneId, {}]));
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
      const centerX = POOL_X_OFFSET + pos.layer * COLUMN_WIDTH + COLUMN_WIDTH / 2;
      x = centerX - width / 2;
      
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
    x = POOL_X_OFFSET + waypoint.layer * COLUMN_WIDTH + COLUMN_WIDTH / 2;
    
    // Y based on lane + row
    const laneBound = laneBounds.get(waypoint.lane);
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
export function calculateFlowWaypoints(flowInfo, coordinates, lanes, directions, laneBounds) {
  const pixelWaypoints = [];
  
  // Start point
  const sourceCoord = coordinates.get(flowInfo.sourceId);
  const startPoint = calculateConnectionPoint(sourceCoord, flowInfo.source.exitSide);
  
  // Waypoints
  for (const waypoint of flowInfo.waypoints) {
    const wpCoord = calculateWaypointCoordinate(waypoint, lanes, directions, laneBounds);
    pixelWaypoints.push(wpCoord);
  }
  
  // End point
  const targetCoord = coordinates.get(flowInfo.targetId);
  const endPoint = calculateConnectionPoint(targetCoord, flowInfo.target.entrySide);
  
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
  
  // Determine target's entry side (same as normal flows)
  const targetEntrySide = determineTargetEntrySide(flowInfo.targetId, flowInfos, directions);
  
  const waypoints = [];
  
  // Step 1: Exit DOWN from source
  const exitSide = directions.crossLane; // "down" for horizontal
  const exitPoint = calculateConnectionPoint(sourceCoord, exitSide);
  waypoints.push(exitPoint);
  
  // Step 2: Move to "between-rows" zone
  // Calculate Y as midpoint between current row bottom and next row top (or lane bottom)
  let betweenRowsY;
  
  // Find lane bounds to determine lane bottom
  const sourceLane = lanes.get(sourcePos.lane);
  const laneBottom = calculateLaneBottom(sourceLane, positions, coordinates);
  
  // Find if there's a next row in this lane
  const currentRow = sourcePos.normalizedRow;
  let nextRowTop = null;
  
  // Find elements in next row
  for (const [elId, pos] of positions) {
    if (pos.lane === sourcePos.lane && pos.normalizedRow === currentRow + 1) {
      const elCoord = coordinates.get(elId);
      if (elCoord) {
        if (nextRowTop === null || elCoord.y < nextRowTop) {
          nextRowTop = elCoord.y;
        }
      }
    }
  }
  
  if (nextRowTop !== null) {
    // Multiple rows: midpoint between current row bottom and next row top
    betweenRowsY = (exitPoint.y + nextRowTop) / 2;
  } else {
    // Single row: midpoint between current row bottom and lane bottom
    betweenRowsY = (exitPoint.y + laneBottom) / 2;
  }
  
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
  waypoints.push(alignPoint);
  
  // Step 5: Enter target from same side as normal flows
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
export function calculateLaneBounds(lanes, positions, directions) {
  const isHorizontal = directions.alongLane === 'right';
  
  // Normalize rows first
  const normalized = normalizeRows(positions, lanes);
  
  // Find max rows per lane
  const laneMaxRows = new Map();
  for (const [elementId, pos] of normalized) {
    const currentMax = laneMaxRows.get(pos.lane) || 0;
    laneMaxRows.set(pos.lane, Math.max(currentMax, pos.normalizedRow + 1));
  }
  
  const laneBounds = new Map();
  
  if (isHorizontal) {
    // Horizontal orientation: lanes stack vertically
    let currentY = LANE_TOP_OFFSET;
    
    for (const [laneId, lane] of lanes) {
      const maxRows = laneMaxRows.get(laneId) || 1;
      const laneHeight = LANE_BASE_HEIGHT + (maxRows - 1) * LANE_ROW_HEIGHT;
      
      laneBounds.set(laneId, {
        y: currentY,
        height: laneHeight,
        maxRows: maxRows
      });
      
      currentY += laneHeight;
    }
  } else {
    // Vertical orientation: lanes stack horizontally
    let currentX = LANE_LEFT_OFFSET;
    
    for (const [laneId, lane] of lanes) {
      const maxRows = laneMaxRows.get(laneId) || 1;
      const laneWidth = LANE_BASE_WIDTH + (maxRows - 1) * LANE_ROW_WIDTH;
      
      laneBounds.set(laneId, {
        x: currentX,
        width: laneWidth,
        maxRows: maxRows
      });
      
      currentX += laneWidth;
    }
  }
  
  return laneBounds;
}

export function phase3(phase2Result, elements, lanes, directions) {
  const { positions, flowInfos } = phase2Result;
  
  // Calculate lane bounds first (needed for element positioning)
  const laneBounds = calculateLaneBounds(lanes, positions, directions);
  
  // Calculate element coordinates (positioned within lanes)
  const coordinates = calculateElementCoordinates(elements, positions, laneBounds, directions);
  
  // Calculate flow waypoints
  const flowWaypoints = new Map();
  
  for (const [flowId, flowInfo] of flowInfos) {
    if (flowInfo.isBackFlow) {
      // Route back-flows with Manhattan pathfinding
      const waypoints = routeBackFlow(flowInfo, coordinates, positions, lanes, directions, flowInfos);
      flowWaypoints.set(flowId, waypoints);
    } else {
      // Normal flows: convert logical waypoints to pixel
      const waypoints = calculateFlowWaypoints(flowInfo, coordinates, lanes, directions, laneBounds);
      flowWaypoints.set(flowId, waypoints);
    }
  }
  
  return {
    coordinates,
    flowWaypoints,
    laneBounds
  };
}

/**
 * Generate BPMN DI (Diagram Interchange) XML for elements
 * @param {Map} elements - Element map from Phase 1
 * @param {Map} coordinates - Element coordinates
 * @returns {string} - BPMN DI XML string
 */
/**
 * Calculate pool bounds that encompass all lanes
 * @param {Map} laneBounds - Lane bounds
 * @param {Object} directions - Direction mappings
 * @returns {Object} - {x, y, width, height}
 */
export function calculatePoolBounds(laneBounds, coordinates, directions) {
  const isHorizontal = directions.alongLane === 'right';
  
  if (laneBounds.size === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  
  if (isHorizontal) {
    // Calculate width based on rightmost element (from old implementation)
    const maxX = Math.max(...Array.from(coordinates.values()).map(p => p.x + p.width));
    const poolWidth = maxX - POOL_X_OFFSET + 100;
    
    // Calculate height as sum of all lane heights
    let poolHeight = 0;
    for (const bounds of laneBounds.values()) {
      poolHeight += bounds.height;
    }
    
    return {
      x: POOL_X_OFFSET,
      y: LANE_TOP_OFFSET,
      width: poolWidth,
      height: poolHeight
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
  
  if (isHorizontal) {
    // Horizontal orientation (from old implementation)
    let laneY = LANE_TOP_OFFSET;
    
    for (const [laneId, lane] of lanes) {
      const bounds = laneBounds.get(laneId);
      if (!bounds) continue;
      
      shapes.push(
        `      <bpmndi:BPMNShape id="${laneId}_di" bpmnElement="${laneId}" isHorizontal="true">`,
        `        <dc:Bounds x="${POOL_X_OFFSET + 30}" y="${laneY}" width="${poolBounds.width - 30}" height="${bounds.height}" />`,
        `      </bpmndi:BPMNShape>`
      );
      
      laneY += bounds.height;
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
    const labelWidth = 80;  // Approximate width for gateway labels
    const labelHeight = 20;
    const horizontalGap = 2;  // Small gap from gateway center (closer)
    const verticalGap = 10;   // Larger gap from gateway center (further up)
    
    // Gateway center
    const gatewayCenterX = pos.x + pos.width / 2;
    const gatewayCenterY = pos.y + pos.height / 2;
    
    // Position: right edge of label box close to gateway center horizontally
    const labelRightEdge = gatewayCenterX - horizontalGap;
    const labelX = labelRightEdge - labelWidth;
    
    // Position: bottom edge of label box further from gateway center vertically
    const labelBottomEdge = gatewayCenterY - verticalGap;
    const labelY = labelBottomEdge - labelHeight;
    
    return {
      x: labelX,
      y: labelY,
      width: labelWidth,
      height: labelHeight
    };
  }
  
  // For non-gateway elements: check if incoming flow from below
  const incomingFlows = [];
  for (const [flowId, flow] of flows) {
    if (flow.targetRef === elementId) {
      incomingFlows.push(flowId);
    }
  }
  
  const hasIncomingFromBelow = incomingFlows.some(flowId => {
    const waypoints = flowWaypoints.get(flowId);
    if (!waypoints || waypoints.length < 2) return false;
    
    // Get the second-to-last waypoint (approach direction)
    const approachPoint = waypoints[waypoints.length - 2];
    const targetCenter = {
      x: pos.x + pos.width / 2,
      y: pos.y + pos.height / 2
    };
    
    // Check if approaching from BELOW (approachPoint.y > targetCenter.y)
    return approachPoint.y > targetCenter.y;
  });
  
  if (hasIncomingFromBelow) {
    // Arrow from below → Label ABOVE to avoid collision
    return {
      x: pos.x - 10,
      y: pos.y - 25,
      width: pos.width + 20,
      height: 20
    };
  } else {
    // Label BELOW (default)
    return {
      x: pos.x - 10,
      y: pos.y + pos.height + 5,
      width: pos.width + 20,
      height: 20
    };
  }
}

export function generateElementDI(elements, coordinates, flowWaypoints, flows) {
  let xml = '';
  
  for (const [elementId, element] of elements) {
    const coord = coordinates.get(elementId);
    if (!coord) continue;
    
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
function calculateEdgeLabelPosition(flow, waypoints, elements, coordinates, flows, flowInfo, flowInfos) {
  const sourceEl = elements.get(flow.sourceRef);
  
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
  const LABEL_WIDTH = 50;
  const LABEL_HEIGHT = 20;
  const LABEL_OFFSET = 5;  // Consistent offset from arrow waypoint
  
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
  
  // Check for multiple outputs on the SAME exitSide (for knick positioning)
  // Count how many flows from this gateway have the same exitSide
  let sameExitSideCount = 0;
  for (const [fId, f] of flows) {
    if (f.sourceRef === flow.sourceRef && fId !== flow.id) {
      const otherFlowInfo = flowInfos ? flowInfos.get(fId) : null;
      const otherExitSide = otherFlowInfo?.source?.exitSide;
      if (otherExitSide === exitSide) {
        sameExitSideCount++;
      }
    }
  }
  const hasMultipleSameExitSide = sameExitSideCount > 0 && waypoints.length >= 3;
  
  let labelX, labelY;
  
  if (exitSide === 'right') {
    // Right: label above arrow, same X as waypoint
    labelX = wp1.x + LABEL_OFFSET;
    labelY = wp1.y - LABEL_HEIGHT - LABEL_OFFSET;
    
  } else if (exitSide === 'down') {
    if (hasMultipleSameExitSide) {
      // Multiple outputs: label at knick (horizontal segment)
      const secondLastWp = waypoints[waypoints.length - 2];
      labelX = wp1.x + LABEL_OFFSET;  // Same X as right labels
      labelY = secondLastWp.y - LABEL_HEIGHT - LABEL_OFFSET;
    } else {
      // Single output: label right of arrow
      labelX = wp1.x + LABEL_OFFSET;  // Same X as right labels
      labelY = wp1.y + LABEL_OFFSET;
    }
    
  } else if (exitSide === 'left') {
    // Left: label above arrow, left of waypoint
    labelX = wp1.x - LABEL_WIDTH - LABEL_OFFSET;
    labelY = wp1.y - LABEL_HEIGHT - LABEL_OFFSET;
    
  } else if (exitSide === 'up') {
    // Up: label right of arrow
    labelX = wp1.x + LABEL_OFFSET;
    labelY = wp1.y - LABEL_HEIGHT - LABEL_OFFSET;
    
  } else {
    // Fallback
    labelX = wp1.x + LABEL_OFFSET;
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
 * Generate BPMN DI XML for flows
 * @param {Map} flows - Flow map from Phase 1
 * @param {Map} flowWaypoints - Flow waypoints (pixel coordinates)
 * @param {Map} elements - Element map
 * @param {Map} coordinates - Element coordinates
 * @param {Map} flowInfos - Flow infos from Phase 2 (contains exitSide)
 * @returns {string} - BPMN DI XML string
 */
export function generateFlowDI(flows, flowWaypoints, elements, coordinates, flowInfos) {
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
      const labelBounds = calculateEdgeLabelPosition(flow, waypoints, elements, coordinates, flows, flowInfo, flowInfos);
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
export function injectBPMNDI(bpmnXml, elements, flows, lanes, coordinates, flowWaypoints, laneBounds, directions, flowInfos) {
  // Extract pool ID from BPMN XML (participant element)
  const poolMatch = bpmnXml.match(/<bpmn:participant\s+id="([^"]+)"/);  
  const poolId = poolMatch ? poolMatch[1] : null;
  
  // Calculate pool bounds (needs coordinates for width calculation)
  const poolBounds = calculatePoolBounds(laneBounds, coordinates, directions);
  
  // Generate DI XML
  const poolDI = poolId ? generatePoolDI(poolId, poolBounds, directions) : '';
  const laneDI = generateLaneDI(lanes, laneBounds, poolBounds, directions);
  const elementDI = generateElementDI(elements, coordinates, flowWaypoints, flows);
  const flowDI = generateFlowDI(flows, flowWaypoints, elements, coordinates, flowInfos);
  
  // Check if DI already exists
  if (bpmnXml.includes('<bpmndi:BPMNDiagram')) {
    // Replace existing DI
    const diStart = bpmnXml.indexOf('<bpmndi:BPMNDiagram');
    const diEnd = bpmnXml.indexOf('</bpmndi:BPMNDiagram>') + '</bpmndi:BPMNDiagram>'.length;
    
    const newDI = `  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane bpmnElement="Process_1">
${poolDI ? poolDI + '\n' : ''}${laneDI}
${elementDI}${flowDI}    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>`;
    
    return bpmnXml.substring(0, diStart) + newDI + bpmnXml.substring(diEnd);
  } else {
    // Add new DI before closing </definitions>
    const definitionsEnd = bpmnXml.lastIndexOf('</bpmn:definitions>');
    
    const newDI = `  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane bpmnElement="Process_1">
${poolDI ? poolDI + '\n' : ''}${laneDI}
${elementDI}${flowDI}    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
`;
    
    return bpmnXml.substring(0, definitionsEnd) + newDI + bpmnXml.substring(definitionsEnd);
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
