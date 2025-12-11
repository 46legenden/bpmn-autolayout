import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const diagramName = process.argv[2] || 'output-simple-loop.bpmn';
const outputName = process.argv[3] || 'screenshot.png';

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  
  // Navigate to viewer
  await page.goto(`http://localhost:8080/index.html?diagram=${diagramName}`, {
    waitUntil: 'networkidle0'
  });
  
  // Wait for BPMN diagram to load
  await page.waitForTimeout(2000);
  
  // Take screenshot
  await page.screenshot({ 
    path: join(__dirname, 'viewer', outputName),
    fullPage: false
  });
  
  console.log(`✅ Screenshot saved to viewer/${outputName}`);
  
  await browser.close();
})();
