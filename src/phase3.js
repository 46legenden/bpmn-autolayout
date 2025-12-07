/**
 * Phase 3: Coordinate Calculation
 * 
 * This phase handles:
 * - Converting logical positions (lane, layer, row) to pixel coordinates (x, y)
 * - Calculating waypoint pixel coordinates
 * - Back-flow routing with Manhattan pathfinding
 * - Generating BPMN DI (Diagram Interchange) XML
 */

// Layout constants
const LAYER_SPACING = 150;  // Horizontal distance between layers
const LANE_SPACING = 100;   // Vertical distance between lanes  
const ROW_SPACING = 80;     // Vertical offset for multiple rows
const ELEMENT_WIDTH = 100;
const ELEMENT_HEIGHT = 80;

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
 * @param {Object} directions - Direction mappings from Phase 2
 * @returns {Map} - Map of elementId → {x, y, width, height}
 */
export function calculateElementCoordinates(positions, lanes, directions) {
  const coordinates = new Map();
  const normalized = normalizeRows(positions, lanes);
  
  // Get lane indices
  const laneIds = Array.from(lanes.keys());
  
  for (const [elementId, pos] of normalized) {
    const laneIndex = laneIds.indexOf(pos.lane);
    
    let x, y;
    
    if (directions.laneOrientation === 'horizontal') {
      // Horizontal: lanes go down, process goes right
      x = pos.layer * LAYER_SPACING;
      y = laneIndex * LANE_SPACING + pos.normalizedRow * ROW_SPACING;
    } else {
      // Vertical: lanes go right, process goes down
      x = laneIndex * LANE_SPACING + pos.normalizedRow * ROW_SPACING;
      y = pos.layer * LAYER_SPACING;
    }
    
    coordinates.set(elementId, {
      x,
      y,
      width: ELEMENT_WIDTH,
      height: ELEMENT_HEIGHT
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
export function calculateWaypointCoordinate(waypoint, lanes, directions) {
  const laneIds = Array.from(lanes.keys());
  const laneIndex = laneIds.indexOf(waypoint.lane);
  
  let x, y;
  
  if (directions.laneOrientation === 'horizontal') {
    x = waypoint.layer * LAYER_SPACING;
    y = laneIndex * LANE_SPACING + waypoint.row * ROW_SPACING;
  } else {
    x = laneIndex * LANE_SPACING + waypoint.row * ROW_SPACING;
    y = waypoint.layer * LAYER_SPACING;
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
export function calculateFlowWaypoints(flowInfo, coordinates, lanes, directions) {
  const pixelWaypoints = [];
  
  // Start point
  const sourceCoord = coordinates.get(flowInfo.sourceId);
  const startPoint = calculateConnectionPoint(sourceCoord, flowInfo.source.exitSide);
  
  // Waypoints
  for (const waypoint of flowInfo.waypoints) {
    const wpCoord = calculateWaypointCoordinate(waypoint, lanes, directions);
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
  
  // Step 2: Move to "between-rows" zone (pixel offset, not row + 0.5)
  const BACK_BAND_OFFSET = ROW_SPACING / 2; // Between rows
  const betweenRowsPoint = {
    x: exitPoint.x,
    y: exitPoint.y + BACK_BAND_OFFSET
  };
  waypoints.push(betweenRowsPoint);
  
  // Step 3: Move LEFT in "between-layers" zone
  const LAYER_OFFSET = LAYER_SPACING / 2; // Between layers
  let targetX;
  
  if (targetEntrySide === directions.oppAlongLane) {
    // Enter from LEFT: go to before target layer
    targetX = targetCoord.x - LAYER_OFFSET;
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
export function phase3(phase2Result, lanes, directions) {
  const { positions, flowInfos } = phase2Result;
  
  // Calculate element coordinates
  const coordinates = calculateElementCoordinates(positions, lanes, directions);
  
  // Calculate flow waypoints
  const flowWaypoints = new Map();
  
  for (const [flowId, flowInfo] of flowInfos) {
    if (flowInfo.isBackFlow) {
      // Route back-flows with Manhattan pathfinding
      const waypoints = routeBackFlow(flowInfo, coordinates, positions, lanes, directions, flowInfos);
      flowWaypoints.set(flowId, waypoints);
    } else {
      // Normal flows: convert logical waypoints to pixel
      const waypoints = calculateFlowWaypoints(flowInfo, coordinates, lanes, directions);
      flowWaypoints.set(flowId, waypoints);
    }
  }
  
  return {
    coordinates,
    flowWaypoints
  };
}

/**
 * Generate BPMN DI (Diagram Interchange) XML for elements
 * @param {Map} elements - Element map from Phase 1
 * @param {Map} coordinates - Element coordinates
 * @returns {string} - BPMN DI XML string
 */
export function generateElementDI(elements, coordinates) {
  let xml = '';
  
  for (const [elementId, element] of elements) {
    const coord = coordinates.get(elementId);
    if (!coord) continue;
    
    xml += `    <bpmndi:BPMNShape bpmnElement="${elementId}">\n`;
    xml += `      <dc:Bounds x="${coord.x}" y="${coord.y}" width="${coord.width}" height="${coord.height}"/>\n`;
    xml += `    </bpmndi:BPMNShape>\n`;
  }
  
  return xml;
}

/**
 * Generate BPMN DI XML for flows
 * @param {Map} flows - Flow map from Phase 1
 * @param {Map} flowWaypoints - Flow waypoints (pixel coordinates)
 * @returns {string} - BPMN DI XML string
 */
export function generateFlowDI(flows, flowWaypoints) {
  let xml = '';
  
  for (const [flowId, flow] of flows) {
    const waypoints = flowWaypoints.get(flowId);
    if (!waypoints || waypoints.length === 0) continue;
    
    xml += `    <bpmndi:BPMNEdge bpmnElement="${flowId}">\n`;
    
    for (const waypoint of waypoints) {
      xml += `      <di:waypoint x="${waypoint.x}" y="${waypoint.y}"/>\n`;
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
 * @param {Map} coordinates - Element coordinates
 * @param {Map} flowWaypoints - Flow waypoints
 * @returns {string} - BPMN XML with DI
 */
export function injectBPMNDI(bpmnXml, elements, flows, coordinates, flowWaypoints) {
  // Generate DI XML
  const elementDI = generateElementDI(elements, coordinates);
  const flowDI = generateFlowDI(flows, flowWaypoints);
  
  // Check if DI already exists
  if (bpmnXml.includes('<bpmndi:BPMNDiagram')) {
    // Replace existing DI
    const diStart = bpmnXml.indexOf('<bpmndi:BPMNDiagram');
    const diEnd = bpmnXml.indexOf('</bpmndi:BPMNDiagram>') + '</bpmndi:BPMNDiagram>'.length;
    
    const newDI = `  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane bpmnElement="Process_1">
${elementDI}${flowDI}    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>`;
    
    return bpmnXml.substring(0, diStart) + newDI + bpmnXml.substring(diEnd);
  } else {
    // Add new DI before closing </definitions>
    const definitionsEnd = bpmnXml.lastIndexOf('</bpmn:definitions>');
    
    const newDI = `  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane bpmnElement="Process_1">
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
