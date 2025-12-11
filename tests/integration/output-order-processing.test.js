import { describe, test, expect } from 'vitest';
import { layoutBPMN } from '../../src/index.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Integration: Order Processing BPMN Layout', () => {
  test('should produce compact layout with gateway layer optimization', () => {
    // Read input BPMN file (without layout)
    const inputPath = join(__dirname, '../../test-data/real-world/input-order-processing.bpmn');
    const inputXml = readFileSync(inputPath, 'utf-8');

    // Read expected output (reference with correct layout including gateway optimization)
    const expectedPath = join(__dirname, '../../test-data/real-world/output-order-processing-layouted.bpmn');
    const expectedXml = readFileSync(expectedPath, 'utf-8');

    console.log('\n=== ORDER PROCESSING LAYOUT TEST ===');
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
    
    if (normalizedActual === normalizedExpected) {
      console.log('  ✅ Output matches expected reference exactly!');
    } else {
      console.log('  ❌ Output differs from expected reference!');
      console.log('\nExpected length:', normalizedExpected.length);
      console.log('Actual length:', normalizedActual.length);
      
      // Find first difference
      for (let i = 0; i < Math.min(normalizedExpected.length, normalizedActual.length); i++) {
        if (normalizedExpected[i] !== normalizedActual[i]) {
          const contextStart = Math.max(0, i - 50);
          const contextEnd = Math.min(normalizedExpected.length, i + 50);
          console.log('\nFirst difference at position', i);
          console.log('Expected:', normalizedExpected.substring(contextStart, contextEnd));
          console.log('Actual:', normalizedActual.substring(contextStart, contextEnd));
          break;
        }
      }
    }
    
    // Assert exact match
    expect(normalizedActual).toBe(normalizedExpected);
    
    console.log('\n✅ Test passed: Layout output is exactly as expected!');
    console.log('✅ Gateway layer optimization working correctly!');
  });
});
