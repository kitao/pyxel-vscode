import { cp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const upstream = "vendor/pyxel";
const runtime = "dist/webview/runtime";
const pyodide = JSON.parse(await readFile("node_modules/pyodide/package.json", "utf8"));
const loader = await readFile(path.join(upstream, "pyxel.js"), "utf8");
const wheels = (await readdir(upstream)).filter((name) => name.endsWith(".whl"));
if (wheels.length !== 1) throw new Error("Bundle exactly one official Pyxel wheel.");
const [wheel] = wheels;
if (!loader.includes(`"${wheel}"`) ||
    !loader.includes(`const PYODIDE_VERSION = "${pyodide.version}";`)) {
  throw new Error("The Pyxel loader, wheel and installed Pyodide versions must match.");
}

// Pyxel finds its own assets beside pyxel.js. Point its Pyodide bootstrap at
// the adjacent distribution too. Keep the checked-in upstream loader intact.
const hosted = "`https://kitao.dev/pyxel/pyodide/v${PYODIDE_VERSION}/pyodide.js`";
const bundled = "new URL(`pyodide/v${PYODIDE_VERSION}/pyodide.js`, document.currentScript.src).href";
if (!loader.includes(hosted)) throw new Error("Review the Pyodide URL in the updated loader.");

await rm(runtime, { recursive: true, force: true });
await cp(upstream, runtime, { recursive: true });
await writeFile(path.join(runtime, "pyxel.js"), loader.replace(hosted, bundled));
const pyodideDir = path.join(runtime, "pyodide", `v${pyodide.version}`);
await cp("vendor/pyodide", pyodideDir, { recursive: true });
for (const name of ["pyodide.js", "pyodide.asm.mjs", "pyodide.asm.wasm", "pyodide-lock.json", "python_stdlib.zip"]) {
  await cp(path.join("node_modules/pyodide", name), path.join(pyodideDir, name));
}

console.log(`Bundled ${wheel} with Pyodide ${pyodide.version}.`);
