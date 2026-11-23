// `npm run dev`: starts `next dev`, then requests one page as soon as the server is ready.
//
// Why: with Next.js 16.4 + Turbopack, if a route handler (/api/...) is the first thing compiled
// after the dev server starts, every page then reloads forever ("[Fast Refresh] rebuilding" in
// the console) until the server is restarted. That happens easily once the app has an API: a
// browser tab left open from the previous run calls /api/v1/me before you load a page.
// Compiling any page first avoids it, so this script does that.
//
// Extra arguments are passed on:  npm run dev -- -p 3001
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");
const child = spawn(process.execPath, [nextBin, "dev", ...process.argv.slice(2)], {
  stdio: ["inherit", "pipe", "inherit"],
});

let url = null;
let warmed = false;
child.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  if (warmed) return;
  const text = chunk.toString();
  url ??= text.match(/Local:\s+(https?:\/\/\S+)/)?.[1] ?? null;
  if (url && /Ready in/.test(text)) {
    warmed = true;
    // /login is a small page. A failure here (e.g. the self-signed certificate of
    // --experimental-https) is harmless: opening any page yourself has the same effect.
    fetch(`${url}/login`).catch(() => {});
  }
});

child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
