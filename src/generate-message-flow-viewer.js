import fs from 'fs';

const bpmnXml = fs.readFileSync('./viewer/message-flow-test-output.bpmn', 'utf-8');

const escapedXml = bpmnXml
  .replace(/\\/g, '\\\\')
  .replace(/`/g, '\\`')
  .replace(/\$/g, '\\$');

const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Message Flow Test</title>
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
    <h1>📨 Message Flow Collision Detection Test</h1>
    <span class="info">✅ Message Flows with Waypoints!</span>
  </div>
  <div id="canvas"></div>
  
  <script src="https://unpkg.com/bpmn-js@17.11.1/dist/bpmn-navigated-viewer.production.min.js"></script>
  <script>
    const bpmnXML = \`${escapedXml}\`;
    const viewer = new BpmnJS({ container: '#canvas' });
    viewer.importXML(bpmnXML).then(() => {
      viewer.get('canvas').zoom('fit-viewport');
      console.log('✅ Message Flow diagram loaded!');
    }).catch(err => {
      console.error('❌ Error:', err);
    });
  </script>
</body>
</html>`;

fs.writeFileSync('public/message-flow-view.html', html);
console.log('✅ Generated public/message-flow-view.html');
