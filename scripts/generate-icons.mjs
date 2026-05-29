import fs from "fs";
import path from "path";

const sizes = [192, 512];

const svgTemplate = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.15)}" fill="#0f1729"/>
  <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle"
    font-family="system-ui, -apple-system, sans-serif" font-weight="bold"
    font-size="${Math.round(size * 0.45)}" fill="#f59e0b">S</text>
</svg>`;

const iconsDir = path.join(process.cwd(), "public", "icons");
fs.mkdirSync(iconsDir, { recursive: true });

for (const size of sizes) {
  const svg = svgTemplate(size);
  const svgPath = path.join(iconsDir, `icon-${size}.svg`);
  fs.writeFileSync(svgPath, svg);
  console.log(`Created ${svgPath}`);
}

console.log("\nNote: SVG icons created as placeholders.");
console.log("For production, convert to PNG using a tool like sharp or use an online converter.");
