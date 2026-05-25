import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detect } from "../dist/agent/component-detect.js";

async function probe(name, seedFiles, pkg) {
  const root = mkdtempSync(join(tmpdir(), `wisp-detect-${name}-`));
  writeFileSync(join(root, "package.json"), JSON.stringify(pkg, null, 2));
  for (const [path, content] of Object.entries(seedFiles)) {
    const full = join(root, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  const res = await detect({ projectRoot: root, quick: true });
  console.log(`[${name}]`, "primary=" + res.primaryLib, "conf=" + res.confidence.toFixed(3));
  rmSync(root, { recursive: true, force: true });
}

await probe("mui",
  { "src/Page.tsx": `import { Button } from "@mui/material/Button"; export const X = () => null;` },
  { name: "x", dependencies: { "@mui/material": "5.0.0" } });
await probe("chakra",
  { "src/Page.tsx": `import { Box } from "@chakra-ui/react"; export const X = () => null;` },
  { name: "x", dependencies: { "@chakra-ui/react": "2.0.0" } });
await probe("tailwind",
  {
    "src/tailwind.config.js": "module.exports = {};",
    "src/Page.tsx": `export const X = () => <div className="bg-blue-500 text-lg p-4 m-2 flex grid">x</div>;`,
  },
  { name: "x", devDependencies: { tailwindcss: "3.4.0" } });
await probe("radix",
  { "src/Popover.tsx": `import * as P from "@radix-ui/react-popover";` },
  { name: "x", dependencies: { "@radix-ui/react-dialog": "1.0.0" } });
