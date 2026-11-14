import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadOutlookRelaySettings,
  sendOutlookPreviewMail,
} from "./lib/outlook-relay.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(await readFile(path.join(root, "runtime-config.json"), "utf8"));
const settings = await loadOutlookRelaySettings(config.outlookRelay || {}, root);
const result = await sendOutlookPreviewMail(settings, process.argv[2]);
console.log(`OUTLOOK_PREVIEW_SENT=${result.orderNo}`);
