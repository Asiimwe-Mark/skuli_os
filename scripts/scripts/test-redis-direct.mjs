import { Redis } from "@upstash/redis";
const r = new Redis({ url: "https://legible-turkey-88303.upstash.io", token: "gQAAAAAAAVjvAAIgcDFjZDNiODk2ZWU3YzY0NmYwYjJjMDY3NzIyOTNkYzJhZg" });
async function main() {
  await r.set("skuli:cache:test:hello", { value: "x", insertedAt: 1, staleAt: 9999999999 }, { ex: 60 });
  const got = await r.get("skuli:cache:test:hello");
  console.log("got:", JSON.stringify(got));
  const scan = await r.scan(0, { match: "skuli:cache:test:*", count: 100 });
  console.log("scan:", JSON.stringify(scan));
  const keys = scan[1];
  if (keys.length > 0) {
    const del = await r.del(...keys);
    console.log("del:", del);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
