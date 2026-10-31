// Uso: node upload.mjs <arquivo.mp4> <pathname> <clientToken>
// Sobe o mp4 direto pro Vercel Blob com o token de upload limitado que o app gerou
// (POST /api/videogen/worker/jobs/:id/upload-token) e imprime { "url": "..." }.
import { readFile } from "node:fs/promises";
import { put } from "@vercel/blob/client";

const [file, pathname, token] = process.argv.slice(2);
if (!file || !pathname || !token) {
  console.error("uso: node upload.mjs <arquivo> <pathname> <clientToken>");
  process.exit(2);
}
const body = await readFile(file);
const blob = await put(pathname, body, {
  access: "public",
  token,
  contentType: "video/mp4",
  multipart: body.length > 8 * 1024 * 1024,
});
console.log(JSON.stringify({ url: blob.url }));
