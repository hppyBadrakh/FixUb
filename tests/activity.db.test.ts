// The activity feed read from the database (src/server/queries/activity.ts): what each action
// adds, who sees which events, and that nobody is identified.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as adminActivity } from "@/app/api/v1/admin/activity/route";
import { GET as staffActivity } from "@/app/api/v1/staff/activity/route";
import type { ActivityEvent } from "@/lib/types";
import type { ActionResult } from "@/server/action";
import { moderateReport, undoModeration } from "@/server/actions/moderation";
import { changeStatus, setPriority } from "@/server/actions/reports-admin";
import { flagReport, toggleMeToo } from "@/server/actions/reports-citizen";
import { as, hasDatabase, PERSONAS, signOutEveryone, type Persona } from "./helpers/personas";
import { cleanUpReports, makeReport } from "./helpers/reports";

type Handler = (request: Request) => Promise<Response>;

async function feed(persona: Persona, handler: Handler, query = "?limit=200"): Promise<ActivityEvent[]> {
  const res = await as(persona, () => handler(new Request(`http://localhost:3000/api/v1/activity${query}`)));
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: { events: ActivityEvent[] } }).data.events;
}

function ok<T extends object>(result: ActionResult<T>): T {
  expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
  return result as T & { ok: true };
}

describe.skipIf(!hasDatabase)("activity feed from the database", () => {
  let road: string;
  let light: string;

  beforeAll(async () => {
    road = await makeReport({ org: "org-road" });
    light = await makeReport({ org: "org-light" });
    ok(await as("citizen", () => toggleMeToo({ reportId: road })));
    ok(await as("citizen", () => flagReport({ reportId: road, reason: "spam", details: "" })));
    ok(await as("admin", () => setPriority({ reportId: road, priority: "high", note: "Дотоод тэмдэглэл" })));
    ok(await as("roadStaff", () => changeStatus({ reportId: road, to: "investigating", version: 1 })));
    ok(await as("admin", () => moderateReport({ reportId: road, action: "hide" })));
    const restored = ok(await as("admin", () => moderateReport({ reportId: road, action: "restore" })));
    ok(await as("admin", () => undoModeration(restored.undo))); // hidden again
    ok(await as("citizen", () => toggleMeToo({ reportId: light })));
  });
  afterAll(cleanUpReports);
  afterAll(signOutEveryone);

  it("admin: me too, flag, priority, status, hide, restore and Undo appear, newest first", async () => {
    const events = (await feed("admin", adminActivity)).filter((e) => e.reportId === road);
    expect(events.map((e) => e.type)).toEqual(["hidden", "restored", "hidden", "status", "prioritized", "flagged", "confirmed", "created"]);
    expect(events.map((e) => e.at)).toEqual([...events.map((e) => e.at)].sort((a, b) => b - a));

    const [undone, restored, hidden, status, prioritized] = events;
    expect(hidden.actorLabel?.en).toBe("FixUB team");
    expect(restored.actorLabel?.en).toBe("FixUB team");
    expect(undone.actorLabel?.en).toBe("FixUB team");
    // Like the public timeline: the organization, not the person.
    expect(status).toMatchObject({ to: "investigating", actorLabel: { en: "Road Maintenance (demo)" } });
    expect(prioritized.priority).toBe("high");
  });

  it("names nobody: no user ids, no internal note", async () => {
    const json = JSON.stringify(await feed("admin", adminActivity));
    for (const id of Object.values(PERSONAS)) if (id) expect(json).not.toContain(id);
    expect(json).not.toContain("Дотоод тэмдэглэл");
  });

  it("staff: their organization's events without flags, and nothing of another organization", async () => {
    const roadEvents = await feed("roadStaff", staffActivity);
    expect(roadEvents.filter((e) => e.reportId === road).map((e) => e.type)).toEqual([
      "hidden",
      "restored",
      "hidden",
      "status",
      "prioritized",
      "confirmed",
      "created",
    ]);
    expect(roadEvents.some((e) => e.type === "flagged")).toBe(false);
    expect(roadEvents.some((e) => e.reportId === light)).toBe(false);

    const lightEvents = await feed("lightStaff", staffActivity);
    expect(lightEvents.filter((e) => e.reportId === light).map((e) => e.type)).toEqual(["confirmed", "created"]);
    expect(lightEvents.some((e) => e.reportId === road)).toBe(false);
  });

  it("returns at most `limit` events", async () => {
    expect(await feed("admin", adminActivity, "?limit=3")).toHaveLength(3);
  });
});
