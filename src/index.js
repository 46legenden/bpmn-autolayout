/**
 * BPMN Auto-Layout Tool
 * 
 * Main entry point that integrates all three phases:
 * - Phase 1: Parsing, Validation, Pre-Processing
 * - Phase 2: Position Assignment, Flow Information
 * - Phase 3: Pixel Coordinates, BPMN DI Generation
 */

import { parseXML, validateBPMN, preProcess, detectBackEdges } from './phase1.js';
import { applyConfig } from './phase2.js';
import { phase3, injectBPMNDI } from './phase3.js';

/**
 * Main layout function - applies auto-layout to BPMN XML
 * @param {string} bpmnXml - Input BPMN XML
 * @param {Object} config - Configuration options
 * @param {string} config.laneOrientation - "horizontal" (default) or "vertical"
 * @param {boolean} config.xorMergeGateways - Keep XOR merge gateways (default: false)
 * @returns {Object} - {success, bpmnXml?, errors?}
 */
export function layoutBPMN(bpmnXml, config = {}) {
  try {
    // ===== PHASE 1: Parsing, Validation, Pre-Processing =====
    
    // Parse BPMN XML
    const graph = parseXML(bpmnXml);
    
    if (!graph.success) {
      return {
        success: false,
        errors: graph.errors || ['Failed to parse BPMN XML']
      };
    }
    
    // Validate structure
    validateBPMN(graph);
    
    if (!graph.success) {
      return {
        success: false,
        errors: graph.errors || ['BPMN validation failed']
      };
    }
    
    // Pre-process (remove XOR merge gateways if configured)
    const processedGraph = preProcess(graph, config);
    
    // Detect back-edges (loops)
    const backEdges = detectBackEdges(processedGraph);
    
    const { elements, flows, lanes } = processedGraph;
    
    // ===== PHASE 2: Position Assignment + Flow Information =====
    
    // Apply configuration (determine abstract directions)
    const directions = applyConfig(config);
    
    // TODO: Implement Phase 2 position assignment
    // For now, this is a placeholder that needs to be implemented
    // We need to:
    // 1. Assign gateway lanes
    // 2. Initialize positions
    // 3. Process flows and assign positions
    // 4. Calculate flow information with waypoints
    
    // Placeholder: Simple position assignment for testing
    const positions = new Map();
    const flowInfos = new Map();
    
    // Simple layer-based positioning
    let layer = 0;
    for (const [elementId, element] of elements) {
      // Get lane for element
      let elementLane = null;
      for (const [laneId, lane] of lanes) {
        if (lane.elements && lane.elements.includes(elementId)) {
          elementLane = laneId;
          break;
        }
      }
      
      if (!elementLane) {
        // Use first lane as default
        elementLane = Array.from(lanes.keys())[0];
      }
      
      positions.set(elementId, {
        lane: elementLane,
        layer: layer++,
        row: 0
      });
    }
    
    // Simple flow info (no waypoints for now)
    for (const [flowId, flow] of flows) {
      const sourcePos = positions.get(flow.sourceRef);
      const targetPos = positions.get(flow.targetRef);
      
      if (!sourcePos || !targetPos) continue;
      
      // Check if back-flow
      const isBackFlow = sourcePos.layer > targetPos.layer;
      
      flowInfos.set(flowId, {
        flowId,
        sourceId: flow.sourceRef,
        targetId: flow.targetRef,
        isBackFlow,
        source: {
          lane: sourcePos.lane,
          layer: sourcePos.layer,
          row: sourcePos.row,
          exitSide: directions.alongLane // Simple: always right
        },
        target: {
          lane: targetPos.lane,
          layer: targetPos.layer,
          row: targetPos.row,
          entrySide: directions.oppAlongLane // Simple: always left
        },
        waypoints: []
      });
    }
    
    const phase2Result = {
      positions,
      flowInfos
    };
    
    // ===== PHASE 3: Pixel Coordinates + BPMN DI =====
    
    const { coordinates, flowWaypoints } = phase3(phase2Result, lanes, directions);
    
    // Generate BPMN XML with DI
    const outputXml = injectBPMNDI(bpmnXml, elements, flows, coordinates, flowWaypoints);
    
    return {
      success: true,
      bpmnXml: outputXml
    };
    
  } catch (error) {
    return {
      success: false,
      errors: [error.message]
    };
  }
}

/**
 * Export all phases for direct access
 */
export { parseXML, validateBPMN, preProcess, detectBackEdges } from './phase1.js';
export { applyConfig } from './phase2.js';
export { phase3, calculateElementCoordinates, routeBackFlow, generateElementDI, generateFlowDI, injectBPMNDI } from './phase3.js';
