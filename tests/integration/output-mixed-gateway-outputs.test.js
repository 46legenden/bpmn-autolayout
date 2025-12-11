import { describe, test, expect } from 'vitest';
import { layoutBPMN } from '../../src/index.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Integration: Mixed Gateway Outputs BPMN Layout', () => {
  test('should produce vertically aligned labels for gateway with multiple outputs', () => {
    // Read input BPMN file (without layout)
    const inputPath = join(__dirname, '../../test-data/real-world/input-mixed-gateway-outputs.bpmn');
    const inputXml = readFileSync(inputPath, 'utf-8');

    // Read expected output (reference with correct layout including aligned labels)
    const expectedPath = join(__dirname, '../../test-data/real-world/output-mixed-gateway-outputs-layouted.bpmn');
    const expectedXml = readFileSync(expectedPath, 'utf-8');

    console.log('\n=== MIXED GATEWAY OUTPUTS LAYOUT TEST ===');
    console.log('Input file (without layout):', inputPath);
    console.log('Expected output file (with layout):', expectedPath);

    // Apply layout
    const result = layoutBPMN(inputXml, {
      laneOrientation: 'horizontal'
    });

    console.log('\nLayout result:');
    console.log('  Success:', result.success);

    // Verify success
    expect(result.success).toBe(true);
    expect(result.bpmnXml).toBeDefined();
    expect(result.errors).toBeUndefined();

    // Exact comparison with expected output
    const actualXml = result.bpmnXml;
    
    console.log('\nComparing output with expected reference...');
    
    // Normalize whitespace for comparison (to avoid issues with line endings)
    const normalizeXml = (xml) => {
      return xml
        .trim()
        .replace(/\r\n/g, '\n')  // Normalize line endings
        .replace(/>\s+</g, '><')  // Remove whitespace between tags
        .replace(/\s+/g, ' ');    // Normalize multiple spaces to single space
    };
    const normalizedActual = normalizeXml(actualXml);
    const normalizedExpected = normalizeXml(expectedXml);
    
    // Additional checks for label alignment
    console.log('\nVerifying label alignment...');
    
    // Extract label x-positions for gateway outputs
    const labelXPositions = [];
    const labelMatches = actualXml.matchAll(/bpmnElement="f_(approved|revision|escalate|request_info|archive)"[\s\S]*?<dc:Bounds x="([^"]+)"/g);
    
    for (const match of labelMatches) {
      const flowName = match[1];
      const xPos = parseFloat(match[2]);
      labelXPositions.push({ flowName, xPos });
      console.log(`  Label "${flowName}": x=${xPos}`);
    }
    
    // Verify all labels have the same x-position
    if (labelXPositions.length > 0) {
      const firstX = labelXPositions[0].xPos;
      const allAligned = labelXPositions.every(label => label.xPos === firstX);
      
      if (allAligned) {
        console.log(`  ✓ All ${labelXPositions.length} labels aligned at x=${firstX}`);
      } else {
        console.log('  ✗ Labels have different x-positions!');
      }
      
      expect(allAligned).toBe(true);
    }
    
    // Verify BPMN compliance - all tasks should have outgoing flows or be end events
    console.log('\nVerifying BPMN compliance...');
    
    const tasksWithoutOutgoing = actualXml.match(/<bpmn:task[^>]*>(?:(?!<bpmn:outgoing>).)*?<\/bpmn:task>/gs);
    const incompleteTasksCount = tasksWithoutOutgoing ? tasksWithoutOutgoing.length : 0;
    
    console.log(`  Tasks without outgoing flows: ${incompleteTasksCount}`);
    expect(incompleteTasksCount).toBe(0);
    
    // Count end events
    const endEvents = actualXml.match(/<bpmn:endEvent/g);
    const endEventCount = endEvents ? endEvents.length : 0;
    console.log(`  End events: ${endEventCount}`);
    expect(endEventCount).toBeGreaterThanOrEqual(3); // Should have at least 3 end events
    
    console.log('\n✓ All checks passed!');
    
    // Assert exact match
    expect(normalizedActual).toBe(normalizedExpected);
    
    console.log('\n✅ Test passed: Layout output is exactly as expected');
  });
});
