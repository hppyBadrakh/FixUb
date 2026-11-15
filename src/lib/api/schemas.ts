// Constants shared by Zod schemas on the server and by forms on the client.
// No server imports here: this file is bundled for the browser too.
import type { IconKey } from "@/lib/types";

export const ICON_KEYS = [
  "road",
  "footprints",
  "lightbulb",
  "trash",
  "droplets",
  "landmark",
  "trees",
  "signpost",
  "zap",
  "bus",
  "ellipsis",
] as const satisfies readonly IconKey[];
