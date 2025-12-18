import { layoutBPMN } from './src/index.js';
import fs from 'fs';

console.log('=== Testing Message Flow Advanced (Complex Multi-Pool) ===\n');

const bpmnXml = fs.readFileSync('./test-data/message-flow-advanced.bpmn', 'utf-8');

const result = layoutBPMN(bpmnXml, {
  hideXorMergeGateways: false
});

if (result.success) {
  // Save to viewer directory
  fs.writeFileSync('./viewer/message-flow-advanced-output.bpmn', result.bpmnXml);
  console.log('✅ Generated viewer/message-flow-advanced-output.bpmn');
  
  // Generate inline viewer HTML
  const escapedXml = result.bpmnXml
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Message Flow Advanced - BPMN Auto-Layout</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: Arial, sans-serif;
      display: flex;
      flex-direction: column;
      height: 100vh;
    }
    .header {
      background: #fff;
      border-bottom: 1px solid #ddd;
      padding: 15px 20px;
      display: flex;
      align-items: center;
      gap: 15px;
    }
    .header h1 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: #333;
    }
    .info {
      font-size: 12px;
      color: #666;
      margin-left: auto;
    }
    #canvas { 
      flex: 1;
      background: white;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🎯 Message Flow Advanced - Multi-Pool Test</h1>
    <span class="info">✅ Embedded BPMN - Refresh page to see updates!</span>
  </div>
  <div id="canvas"></div>
  
  <script src="https://unpkg.com/bpmn-js@17.11.1/dist/bpmn-navigated-viewer.production.min.js"></script>
  <script>
    const bpmnXML = \`${escapedXml}\`;
    const viewer = new BpmnJS({ container: '#canvas' });
    viewer.importXML(bpmnXML).then(() => {
      viewer.get('canvas').zoom('fit-viewport');
      console.log('✅ BPMN diagram loaded successfully!');
    }).catch(err => {
      console.error('❌ Error loading BPMN:', err);
    });
  </script>
</body>
</html>`;

  fs.writeFileSync('public/message-flow-advanced.html', html);
  console.log('✅ Generated public/message-flow-advanced.html with embedded BPMN');
  console.log('\n🌐 View at: http://localhost:8007/message-flow-advanced.html');
  
} else {
  console.log('❌ Layout failed:');
  console.log(result.errors);
}
