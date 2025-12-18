import fs from 'fs';

const bpmnXml = fs.readFileSync('viewer/colocation-cmdb-correct-output.bpmn', 'utf-8');

// Escape backticks and backslashes for template literal
const escapedXml = bpmnXml
  .replace(/\\/g, '\\\\')
  .replace(/`/g, '\\`')
  .replace(/\$/g, '\\$');

const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>BPMN Auto-Layout Result</title>
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
    <h1>🎯 BPMN Auto-Layout Viewer (Inline)</h1>
    <span class="info">✅ Embedded BPMN - No Cache Issues!</span>
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

fs.writeFileSync('public/view.html', html);
console.log('✅ Generated public/view.html with embedded BPMN');
