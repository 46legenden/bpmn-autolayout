console.log('=== BPMN Viewer App Starting ===');
console.log('BpmnJS available:', typeof BpmnJS !== 'undefined');

const container = document.getElementById('canvas');
let viewer = null;

async function loadDiagram() {
  try {
    console.log('[1] Creating viewer instance...');
    viewer = new BpmnJS({ container: container });
    console.log('[2] Viewer created successfully');
    
    const timestamp = Date.now();
    console.log('[3] Fetching BPMN file with timestamp:', timestamp);
    
    const response = await fetch(`colocation-cmdb-correct-output.bpmn?t=${timestamp}`);
    console.log('[4] Response status:', response.status, response.ok ? 'OK' : 'FAILED');
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const bpmnXML = await response.text();
    console.log('[5] BPMN XML loaded, length:', bpmnXML.length);
    console.log('[6] First 100 chars:', bpmnXML.substring(0, 100));
    
    console.log('[7] Importing XML into viewer...');
    await viewer.importXML(bpmnXML);
    console.log('[8] Import successful!');
    
    const canvas = viewer.get('canvas');
    canvas.zoom('fit-viewport');
    console.log('[9] ✅ Diagram loaded and zoomed!');
    
  } catch (error) {
    console.error('[ERROR]', error);
    container.innerHTML = `
      <div class="error">
        <div>❌ Error: ${error.message}</div>
      </div>
    `;
  }
}

function reloadDiagram() {
  console.log('=== RELOAD REQUESTED ===');
  container.innerHTML = '<div class="loading">Reloading...</div>';
  viewer = null;
  loadDiagram();
}

// Wait for DOM and BpmnJS to be ready
window.addEventListener('DOMContentLoaded', () => {
  console.log('DOM Content Loaded');
  
  // Check if BpmnJS is loaded
  const checkAndLoad = () => {
    if (typeof BpmnJS !== 'undefined') {
      console.log('BpmnJS is ready, starting load...');
      loadDiagram();
    } else {
      console.log('BpmnJS not ready yet, waiting...');
      setTimeout(checkAndLoad, 100);
    }
  };
  
  checkAndLoad();
});
