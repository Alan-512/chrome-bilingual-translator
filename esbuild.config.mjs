import { build, context } from "esbuild";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const watch = process.argv.includes("--watch");
const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(projectRoot, "dist");

const bundleEntries = [
  {
    entryPoints: [path.join(projectRoot, "src/background/index.ts")],
    outfile: path.join(distDir, "background.js"),
    platform: "browser",
    format: "esm"
  },
  {
    entryPoints: [path.join(projectRoot, "src/content/index.ts")],
    outfile: path.join(distDir, "content.js"),
    platform: "browser",
    format: "iife"
  },
  {
    entryPoints: [path.join(projectRoot, "src/options/index.ts")],
    outfile: path.join(distDir, "options.js"),
    platform: "browser",
    format: "iife"
  }
];

async function emitOptionsAssets() {
  await mkdir(distDir, { recursive: true });
  await cp(path.join(projectRoot, "src/options/options.css"), path.join(distDir, "options.css"));

  const html = await readFile(path.join(projectRoot, "src/options/options.html"), "utf8");
  const rewrittenHtml = html
    .replaceAll("./index.ts", "./options.js")
    .replaceAll("./options.css", "./options.css");

  await writeFile(path.join(distDir, "options.html"), rewrittenHtml, "utf8");
}

async function runBuild() {
  await mkdir(distDir, { recursive: true });

  for (const entry of bundleEntries) {
    await build({
      ...entry,
      bundle: true,
      sourcemap: true,
      target: "chrome120",
      tsconfig: path.join(projectRoot, "tsconfig.json"),
      logLevel: "info"
    });
  }

  await emitOptionsAssets();
}

if (watch) {
  const contexts = await Promise.all(
    bundleEntries.map((entry) =>
      context({
        ...entry,
        bundle: true,
        sourcemap: true,
        target: "chrome120",
        tsconfig: path.join(projectRoot, "tsconfig.json"),
        logLevel: "info"
      })
    )
  );

  await emitOptionsAssets();
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.log(`Watching ${contexts.length} bundles...`);
} else {
  runBuild().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
