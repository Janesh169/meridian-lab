// Renders public/icon.svg to the PNG sizes the web manifest lists. Run once with
// `node scripts/make-icons.cjs` (needs Playwright); the PNGs are committed.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const svg = fs.readFileSync(path.join(__dirname, '../public/icon.svg'), 'utf8');
  const b = await chromium.launch();
  for (const size of [192, 512]) {
    const p = await b.newPage({ viewport: { width: size, height: size } });
    await p.setContent(`<html><body style="margin:0;background:#070b12">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await p.screenshot({ path: path.join(__dirname, `../public/icon-${size}.png`) });
  }
  await b.close();
})();
