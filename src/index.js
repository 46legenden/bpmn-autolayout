/**
 * BPMN Auto-Layout Tool
 * 
 * Main entry point that integrates all three phases:
 * - Phase 1: Parsing, Validation, Pre-Processing
 * - Phase 2: Position Assignment, Flow Information
 * - Phase 3: Pixel Coordinates, BPMN DI Generation
 */

import { parseXML, validateBPMN, preProcess, detectBackEdges } from './phase1.js';
import { applyConfig, phase2 } from './phase2.js';
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
    
    const { elements, flows, lanes, pools } = processedGraph;
    
    // ===== PHASE 2: Position Assignment + Flow Information =====
    
    // Apply configuration (determine abstract directions)
    const directions = applyConfig(config);
    
    // Run Phase 2: Position assignment and flow information
    const phase2Result = phase2(elements, flows, lanes, directions, backEdges, pools);
    
    // ===== PHASE 3: Pixel Coordinates + BPMN DI =====
    
    const { coordinates, flowWaypoints, laneBounds, poolBounds } = phase3(phase2Result, elements, lanes, directions, pools);
    
    // Generate BPMN XML with DI
    const outputXml = injectBPMNDI(bpmnXml, elements, flows, lanes, coordinates, flowWaypoints, laneBounds, directions, phase2Result.flowInfos, pools, poolBounds);
    
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
export { applyConfig, phase2 } from './phase2.js';
export { phase3, calculateElementCoordinates, routeBackFlow, generateElementDI, generateFlowDI, injectBPMNDI } from './phase3.js';
