// Fuentes de Excalidraw servidas desde la app en /excalidraw/fonts/ (la
// extensión las busca ahí, ver src/extensions/excalidraw/assets.ts) para
// no pedirlas a un CDN desde el webview. Sin Xiaolai (la fuente china,
// 12 MB): el resto son ~480 KB. En JS y aparte de vite.config.ts porque
// el proyecto no tiene los tipos de Node.
import { cpSync, createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { join, normalize, sep } from "node:path";

const FONTS = "node_modules/@excalidraw/excalidraw/dist/prod/fonts";
const SKIPPED = new Set(["Xiaolai"]);

/** @returns {import("vite").Plugin} */
export function excalidrawFonts() {
  return {
    name: "excalidraw-fonts",
    configureServer(server) {
      server.middlewares.use("/excalidraw/fonts", (req, res, next) => {
        const rel = normalize(decodeURIComponent((req.url ?? "").split("?")[0])).replace(/^[/\\]+/, "");
        const file = join(FONTS, rel);
        if (rel.startsWith("..") || SKIPPED.has(rel.split(sep)[0]) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader("Content-Type", "font/woff2");
        createReadStream(file).pipe(res);
      });
    },
    writeBundle(options) {
      const out = join(options.dir ?? "dist", "excalidraw", "fonts");
      for (const family of readdirSync(FONTS)) {
        if (!SKIPPED.has(family)) cpSync(join(FONTS, family), join(out, family), { recursive: true });
      }
    },
  };
}
