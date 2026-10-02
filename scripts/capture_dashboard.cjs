const { chromium } = require('/home/octavio_morales/omnifood-ni/node_modules/.pnpm/@playwright+test@1.63.0/node_modules/@playwright/test');
const path = require('path');
const fs = require('fs');

async function run() {
  const outputDir = path.resolve(__dirname, '../docs/nhilos/manuals/images');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--host-resolver-rules=MAP soho.localhost 127.0.0.1'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  console.log('1. Navigating to Login...');
  await page.goto('http://soho.localhost:5173');
  await page.waitForLoadState('networkidle');

  console.log('Filling login form...');
  await page.fill('input[type="email"], input[name="email"]', 'admin@soho.com');
  await page.fill('input[type="password"], input[name="password"]', 'C0ntr4sen4');
  await page.click('button[type="submit"]');

  await page.waitForTimeout(3000);
  await page.waitForLoadState('networkidle');

  // Dashboard Overview
  console.log('2. Dashboard with date range...');
  await page.goto('http://soho.localhost:5173/?startDate=2026-10-01&endDate=2026-10-02');
  await page.waitForTimeout(2500);
  await page.waitForLoadState('networkidle');
  console.log('Capturing dsh_02_kpis_ventas.png...');
  await page.screenshot({ path: path.join(outputDir, 'dsh_02_kpis_ventas.png') });

  // Ventas
  console.log('3. Navigating to Ventas (/sales)...');
  await page.goto('http://soho.localhost:5173/sales?startDate=2026-10-01&endDate=2026-10-02');
  await page.waitForTimeout(2500);
  await page.waitForLoadState('networkidle');
  console.log('Capturing dsh_03_historial_comprobantes.png...');
  await page.screenshot({ path: path.join(outputDir, 'dsh_03_historial_comprobantes.png') });

  // Productos
  console.log('4. Navigating to Productos (/products)...');
  await page.goto('http://soho.localhost:5173/products');
  await page.waitForTimeout(2500);
  await page.waitForLoadState('networkidle');
  console.log('Capturing dsh_04_catalogo_productos.png...');
  await page.screenshot({ path: path.join(outputDir, 'dsh_04_catalogo_productos.png') });

  // Sesiones de caja (/cash)
  console.log('5. Navigating to Sesiones de caja (/cash)...');
  await page.goto('http://soho.localhost:5173/cash');
  await page.waitForTimeout(2500);
  await page.waitForLoadState('networkidle');
  console.log('Capturing dsh_05_sesiones_caja.png...');
  await page.screenshot({ path: path.join(outputDir, 'dsh_05_sesiones_caja.png') });

  // Fiscal (/fiscal)
  console.log('6. Navigating to Fiscal (/fiscal)...');
  await page.goto('http://soho.localhost:5173/fiscal');
  await page.waitForTimeout(2500);
  await page.waitForLoadState('networkidle');
  console.log('Capturing dsh_06_fiscal.png...');
  await page.screenshot({ path: path.join(outputDir, 'dsh_06_fiscal.png') });

  await browser.close();
  console.log('ALL DASHBOARD SCREENSHOTS CAPTURED SUCCESSFULLY!');
}

run().catch(err => {
  console.error('Error during capture:', err);
  process.exit(1);
});
