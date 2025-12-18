import { layoutBPMN } from './src/index.js';
import fs from 'fs';

const inputFile = './test-data/datacenter-provisioning.bpmn';
const outputFile = './viewer/datacenter-provisioning-output.bpmn';
const htmlFile = './public/datacenter-provisioning.html';

console.log('🏢 Testing Datacenter Provisioning Scenario...\n');

// Read input BPMN
const bpmnXml = fs.readFileSync(inputFile, 'utf8');

// Run layout
const result = layoutBPMN(bpmnXml, {
  hideXorMergeGateways: false
});

if (!result.success) {
  console.error('❌ Layout failed:', result.errors);
  process.exit(1);
}

const outputBpmn = result.bpmnXml;

// Write output BPMN
fs.writeFileSync(outputFile, outputBpmn);
console.log(`✅ Generated ${outputFile}`);

// Generate HTML viewer
const escapedXml = outputBpmn
  .replace(/\\/g, '\\\\')
  .replace(/`/g, '\\`')
  .replace(/\$/g, '\\$');

const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <title>Datacenter Provisioning - BPMN Auto-Layout</title>
  <link rel="stylesheet" href="https://unpkg.com/bpmn-js@17.11.1/dist/assets/bpmn-js.css">
  <link rel="stylesheet" href="https://unpkg.com/bpmn-js@17.11.1/dist/assets/diagram-js.css">
  <link rel="stylesheet" href="https://unpkg.com/bpmn-js@17.11.1/dist/assets/bpmn-font/css/bpmn-embedded.css">
  <style>
    body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
    h1 { color: #333; }
    #canvas { border: 1px solid #ccc; height: 90vh; }
    .info { background: #e8f5e9; padding: 10px; margin-bottom: 10px; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>🏢 Datacenter Provisioning - Multi-Pool Test</h1>
  <div class="info">
    ✅ Embedded BPMN - Refresh page to see updates!
  </div>
  <div id="canvas"></div>
  
  <script src="https://unpkg.com/bpmn-js@17.11.1/dist/bpmn-viewer.development.js"></script>
  <script>
    const bpmnXML = \`${escapedXml}\`;
    
    const viewer = new BpmnJS({
      container: '#canvas'
    });
    
    viewer.importXML(bpmnXML).then(() => {
      const canvas = viewer.get('canvas');
      canvas.zoom('fit-viewport');
    }).catch(err => {
      console.error('Error rendering BPMN:', err);
    });
  </script>
</body>
</html>`;

fs.writeFileSync(htmlFile, htmlContent);
console.log(`✅ Generated ${htmlFile} with embedded BPMN`);
console.log(`🌐 View at: http://localhost:8007/datacenter-provisioning.html`);
