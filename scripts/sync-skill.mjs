// Vendor the pyxel Agent Skill from a tagged pyxel-skill release so the
// extension can contribute it through `contributes.chatSkills`:
//
//   npm run sync-skill -- 1.4.0
import { realpathSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SKILL_FILE = "SKILL.md";
const REFERENCE_LINK = /\]\((references\/[^)\s]+\.md)\)/g;

export async function syncSkill({
  version,
  destination = join(REPO_ROOT, "skills", "pyxel"),
  fetchText = fetchTextFromWeb,
}) {
  const base = `https://cdn.jsdelivr.net/gh/kitao/pyxel-skill@v${version}`;
  const skill = await fetchText(`${base}/${SKILL_FILE}`);
  const references = [...new Set([...skill.matchAll(REFERENCE_LINK)].map((m) => m[1]))];
  const texts = await Promise.all(references.map((file) => fetchText(`${base}/${file}`)));

  // Every download succeeded, so the vendored copy can be replaced whole.
  const files = new Map([[SKILL_FILE, skill], ...references.map((file, i) => [file, texts[i]])]);
  await rm(destination, { recursive: true, force: true });
  for (const [file, text] of files) {
    const target = join(destination, file);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, text);
  }
  return [...files.keys()];
}

async function fetchTextFromWeb(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.text();
}

function isEntryPoint() {
  try {
    return realpathSync(process.argv[1] ?? "") === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  const version = process.argv[2];
  if (!version) {
    console.error("usage: npm run sync-skill -- <pyxel-skill version>");
    process.exit(2);
  }
  const files = await syncSkill({ version });
  console.log(`Vendored pyxel skill ${version}: ${files.join(", ")}`);
}
