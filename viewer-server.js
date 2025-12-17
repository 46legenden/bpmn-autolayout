import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { layoutBPMN } from './src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 8007;

// Serve static files
app.use(express.static('public'));

// API endpoint to get and layout BPMN
app.get('/api/bpmn/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const bpmnPath = path.join(__dirname, 'test-data', filename);
    
    if (!fs.existsSync(bpmnPath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const bpmnXml = fs.readFileSync(bpmnPath, 'utf-8');
    const result = layoutBPMN(bpmnXml, { hideXorMergeGateways: true });
    
    if (!result.success) {
      throw new Error(result.errors ? result.errors.join(', ') : 'Layout failed');
    }
    
    const layoutedXml = result.bpmnXml;
    
    res.type('application/xml');
    res.send(layoutedXml);
  } catch (error) {
    console.error('Error processing BPMN:', error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

// List available BPMN files
app.get('/api/files', (req, res) => {
  const examplesDir = path.join(__dirname, 'test-data');
  const files = fs.readdirSync(examplesDir)
    .filter(f => f.endsWith('.bpmn'))
    .sort();
  res.json(files);
});

// Main viewer page
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>BPMN Auto-Layout Viewer</title>
  <style>
    body {
      margin: 0;
      padding: 20px;
      font-family: Arial, sans-serif;
      background: #f5f5f5;
    }
    h1 {
      margin: 0 0 20px 0;
    }
    #controls {
      margin-bottom: 20px;
      background: white;
      padding: 15px;
      border-radius: 4px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    select, button {
      padding: 8px 12px;
      font-size: 14px;
      border: 1px solid #ccc;
      border-radius: 4px;
    }
    button {
      background: #4CAF50;
      color: white;
      border: none;
      cursor: pointer;
      margin-left: 10px;
    }
    button:hover {
      background: #45a049;
    }
    #canvas {
      background: white;
      border-radius: 4px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      height: calc(100vh - 180px);
      overflow: auto;
    }
    #error {
      color: red;
      margin-top: 10px;
      padding: 10px;
      background: #ffebee;
      border-radius: 4px;
      display: none;
    }
    #loading {
      margin-top: 10px;
      color: #666;
      display: none;
    }
  </style>
  <script src="https://unpkg.com/bpmn-js@17.2.1/dist/bpmn-navigated-viewer.production.min.js"></script>
</head>
<body>
  <h1>BPMN Auto-Layout Viewer</h1>
  
  <div id="controls">
    <select id="fileSelect">
      <option value="">Select a BPMN file...</option>
    </select>
    <button onclick="loadDiagram()">Load Diagram</button>
    <button onclick="downloadXML()">Download XML</button>
    <div id="loading">Loading...</div>
    <div id="error"></div>
  </div>
  
  <div id="canvas"></div>

  <script>
    let viewer;
    let currentXml = null;
    
    // Initialize viewer
    viewer = new BpmnJS({
      container: '#canvas',
      keyboard: {
        bindTo: document
      }
    });
    
    // Load file list
    fetch('/api/files')
      .then(r => r.json())
      .then(files => {
        const select = document.getElementById('fileSelect');
        files.forEach(file => {
          const option = document.createElement('option');
          option.value = file;
          option.textContent = file;
          select.appendChild(option);
        });
        
        // Auto-select colocation-cmdb-correct.bpmn if available
        if (files.includes('colocation-cmdb-correct.bpmn')) {
          select.value = 'colocation-cmdb-correct.bpmn';
          loadDiagram();
        }
      });
    
    function showError(msg) {
      const errorDiv = document.getElementById('error');
      errorDiv.textContent = msg;
      errorDiv.style.display = 'block';
    }
    
    function hideError() {
      document.getElementById('error').style.display = 'none';
    }
    
    function showLoading() {
      document.getElementById('loading').style.display = 'block';
    }
    
    function hideLoading() {
      document.getElementById('loading').style.display = 'none';
    }
    
    async function loadDiagram() {
      const filename = document.getElementById('fileSelect').value;
      if (!filename) {
        showError('Please select a file');
        return;
      }
      
      hideError();
      showLoading();
      
      try {
        const response = await fetch(\`/api/bpmn/\${filename}\`);
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to load diagram');
        }
        
        currentXml = await response.text();
        await viewer.importXML(currentXml);
        
        // Fit viewport
        const canvas = viewer.get('canvas');
        canvas.zoom('fit-viewport');
        
        hideLoading();
      } catch (error) {
        console.error('Error:', error);
        showError('Error: ' + error.message);
        hideLoading();
      }
    }
    
    function downloadXML() {
      if (!currentXml) {
        showError('No diagram loaded');
        return;
      }
      
      const filename = document.getElementById('fileSelect').value;
      const blob = new Blob([currentXml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename.replace('.bpmn', '-layouted.bpmn');
      a.click();
      URL.revokeObjectURL(url);
    }
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.id === 'fileSelect') {
        loadDiagram();
      }
    });
  </script>
</body>
</html>
  `);
});

app.listen(PORT, () => {
  console.log(`BPMN Viewer running on http://localhost:${PORT}`);
  console.log(`Use port ${PORT} to view diagrams`);
});
