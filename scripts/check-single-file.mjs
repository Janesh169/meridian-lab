// Fails the build if dist/index.html references any external script, stylesheet,
// font or image. The tablet copy must be one self-contained file.
import { readFileSync, statSync } from 'node:fs';
const html = readFileSync('dist/index.html', 'utf8');
const bad = [];
const re = /<(script|link|img|source|audio|video)\b[^>]*?\b(src|href)\s*=\s*["']([^"']+)["']/gi;
let m;
while ((m = re.exec(html))) {
  const url = m[3];
  if (url.startsWith('data:')) continue;
  // The manifest link is added at runtime only on HTTPS, so it's not in the static HTML.
  bad.push(`${m[1]} ${m[2]}=${url}`);
}
if (/@import\s+url\(\s*["']?http/i.test(html) || /url\(\s*["']?https?:/i.test(html)) bad.push('CSS url() to the network');
if (/fonts\.googleapis|cdn\.|unpkg|jsdelivr/i.test(html)) bad.push('CDN reference');
if (bad.length) {
  console.error('dist/index.html is not self-contained:\n  ' + bad.join('\n  '));
  process.exit(1);
}
const kb = (statSync('dist/index.html').size / 1024).toFixed(0);
console.log(`OK: dist/index.html is a single self-contained file (${kb} KB).`);
