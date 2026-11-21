// A18: the full loop on two "devices" (two browser contexts).
//
//   citizen reports with a photo → admin sets priority and assigns → staff resolves with a
//   completion photo → the citizen confirms it is fixed
//
// Each step is switched on (replace `test.fixme` with `test` and write the body) when the
// screens behind it read and write the database. Until then they work on per-browser demo
// data, where a second device can't see the first one's report, so the step can't pass.
import { test } from "@playwright/test";

test.describe.serial("full loop: report → priority → assign → resolve → confirm", () => {
  test.fixme("citizen submits a report with a photo", async () => {
    // Needs B05 createReport, B06 report flow on the database, B10 photo upload from the camera flow.
  });

  test.fixme("admin on another device sees it, sets the priority and assigns it", async () => {
    // Needs C05 setPriority, C06 assign, C07 review queue and workspace on the API.
  });

  test.fixme("staff of that organization resolves it with a completion photo", async () => {
    // Needs C08 changeStatus, C09 completion photo, C10 staff queue on the API.
  });

  test.fixme("the citizen sees it resolved within 15 s and confirms it is fixed", async () => {
    // Needs B08 report detail on the API (useLiveApi) and B12 fixed / still-broken.
  });
});
