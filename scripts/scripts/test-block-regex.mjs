import fs from "node:fs";
import path from "node:path";
const dir = "C:/Users/Asiimwe Mark Amooti/Desktop/skulii-os/supabase/migrations";
const files = fs.readdirSync(dir).filter(f => f.endsWith(".sql")).sort();
let buf = "";
for (const f of files) buf += fs.readFileSync(path.join(dir, f), "utf8") + "\n";
// Find the INTENTIONALLY-UNUSED section
const idx = buf.indexOf("-- INTENTIONALLY-UNUSED");
console.log("Index:", idx);
console.log("Next 500 chars after marker:");
console.log(JSON.stringify(buf.slice(idx, idx + 500)));
