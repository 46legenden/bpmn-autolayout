/**
 * BPMN Auto-Layout Tool
 * 
 * Main entry point that integrates all three phases:
 * - Phase 1: Parsing, Validation, Pre-Processing
 * - Phase 2: Position Assignment, Flow Information
 * - Phase 3: Pixel Coordinates, BPMN DI Generation
 */

import { parseXML, validateBPMN, preProcess, detectBackEdges, phase1 } from './phase1.js';
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
    
    // Use phase1 to get graph, backEdges, and backFlows
    const phase1Result = phase1(bpmnXml, config);
    if (!phase1Result.success) {
      return {
        success: false,
        errors: phase1Result.errors || ['Phase 1 failed']
      };
    }
    
    const { graph: processedGraph, backEdges, backFlows } = phase1Result;
    const { elements, flows, lanes, pools } = processedGraph;
    
    // ===== PHASE 2: Position Assignment + Flow Information =====
    
    // Apply configuration (determine abstract directions)
    const directions = applyConfig(config);
    
    // Run Phase 2: Position assignment and flow information
    const phase2Result = phase2(elements, flows, lanes, directions, backEdges, backFlows, pools);
    
    // Debug: Check if all elements are positioned
    if (elements.size !== phase2Result.positions.size) {
      console.error(`\n⚠️  WARNING: Not all elements positioned!`);
      console.error(`   Total elements: ${elements.size}`);
      console.error(`   Positioned: ${phase2Result.positions.size}`);
      console.error(`   Missing: ${elements.size - phase2Result.positions.size}`);
      const missing = [];
      for (const [id] of elements) {
        if (!phase2Result.positions.has(id)) {
          missing.push(id);
        }
      }
      console.error(`   Missing elements: ${missing.join(', ')}\n`);
    }
    
    // ===== PHASE 3: Pixel Coordinates + BPMN DI =====
    
    const { coordinates, flowWaypoints, laneBounds, poolBounds } = phase3(phase2Result, elements, lanes, directions, pools, flows);
    
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
