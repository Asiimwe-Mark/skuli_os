import sharp from "sharp";
import fs from "fs";
import path from "path";

const iconsDir = path.join(process.cwd(), "public", "icons");
fs.mkdirSync(iconsDir, { recursive: true });

const sizes = [192, 512];

for (const size of sizes) {
  const padding = Math.round(size * 0.15);
  const fontSize = Math.round(size * 0.45);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${Math.round(size * 0.1)}" fill="#0f1729"/>
    <text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle"
      font-family="system-ui, -apple-system, sans-serif" font-weight="bold"
      font-size="${fontSize}" fill="#f59e0b">S</text>
  </svg>`;

  const pngBuffer = await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toBuffer();

  const pngPath = path.join(iconsDir, `icon-${size}.png`);
  fs.writeFileSync(pngPath, pngBuffer);
  console.log(`Created ${pngPath} (${pngBuffer.length} bytes)`);
}

console.log("\nDone! PNG icons generated.");
