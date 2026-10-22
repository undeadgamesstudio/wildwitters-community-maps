// Checks every map folder under maps/ and rebuilds index.json (run: node scripts/validate.mjs [--write]).
// Without --write it only checks that index.json is up to date.
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const MAX_MAP = 2 * 1024 * 1024;
const MAX_PICTURE = 2 * 1024 * 1024;
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const mapsDir = join(root, "maps");
const errors = [];
const entries = [];

const fail = (slug, text) => errors.push(`${slug}: ${text}`);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

for (const slug of existsSync(mapsDir) ? readdirSync(mapsDir) : []) {
  const dir = join(mapsDir, slug);
  if (!statSync(dir).isDirectory()) continue;
  if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(slug)) fail(slug, "folder name must be lower case letters, digits and dashes");
  const mapPath = join(dir, "map.json");
  const metaPath = join(dir, "meta.json");
  if (!existsSync(mapPath)) { fail(slug, "map.json missing"); continue; }
  if (!existsSync(metaPath)) { fail(slug, "meta.json missing"); continue; }
  if (!existsSync(join(dir, "preview.png"))) fail(slug, "preview.png missing");
  if (statSync(mapPath).size > MAX_MAP) fail(slug, "map.json is larger than 2 MB");
  let map, meta;
  try { map = JSON.parse(readFileSync(mapPath, "utf8")); } catch { fail(slug, "map.json is not valid JSON"); continue; }
  try { meta = JSON.parse(readFileSync(metaPath, "utf8")); } catch { fail(slug, "meta.json is not valid JSON"); continue; }
  for (const key of ["title", "description", "author", "submitted", "rightsVersion"]) {
    if (typeof meta[key] !== "string" || !meta[key].trim()) fail(slug, `meta.json: ${key} missing`);
  }
  if (!Array.isArray(map.tiles) || !map.tiles.every((t) => t && [t.x, t.y, t.logical, t.display, t.flipped].every(isNum))) fail(slug, "map.json: tiles are not valid");
  if (!Array.isArray(map.pawns) || !map.pawns.every((p) => p && [p.x, p.y, p.cls, p.team].every(isNum))) fail(slug, "map.json: pawns are not valid");
  if (Array.isArray(map.tiles)) {
    const count = (l) => map.tiles.filter((t) => t.logical === l).length;
    const seats = [4, 5, 6, 7].filter((l) => count(l) > 0);
    if (seats.length < 2) fail(slug, "needs at least two bases");
    if (seats.some((l) => count(l) !== 7)) fail(slug, "every base must have seven tiles");
    if (count(3) === 0) fail(slug, "needs a capture point");
    if (![8, 9].every((l) => count(l) > 0)) fail(slug, "every player needs a spawn tile");
  }
  if (map.customBg?.layers?.length > 24) fail(slug, "more than 24 layers");
  const assets = join(dir, "assets");
  if (existsSync(assets)) {
    for (const f of readdirSync(assets)) if (statSync(join(assets, f)).size > MAX_PICTURE) fail(slug, `assets/${f} is larger than 2 MB`);
  }
  const width = Math.max(0, ...(map.tiles ?? []).map((t) => t.x + 1));
  const height = Math.max(0, ...(map.tiles ?? []).map((t) => t.y + 1));
  entries.push({
    slug,
    title: meta.title,
    description: meta.description,
    author: meta.author,
    submitted: meta.submitted,
    players: map.tiles?.some((t) => t.logical === 6 || t.logical === 7) ? 4 : 2,
    width,
    height,
    featured: meta.featured === true,
    tags: Array.isArray(meta.tags) ? meta.tags : [],
  });
}

entries.sort((a, b) => b.submitted.localeCompare(a.submitted) || a.slug.localeCompare(b.slug));
const next = JSON.stringify({ version: 1, maps: entries }, null, 2) + "\n";
const indexPath = join(root, "index.json");
if (process.argv.includes("--write")) writeFileSync(indexPath, next);
else if (!existsSync(indexPath) || readFileSync(indexPath, "utf8") !== next) errors.push("index.json is out of date: run node scripts/validate.mjs --write");

if (errors.length) {
  console.error(errors.map((e) => `- ${e}`).join("\n"));
  process.exit(1);
}
console.log(`ok: ${entries.length} map(s)`);
