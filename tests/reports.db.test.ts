// The report loop on the server: what each action changes, and what each kind of viewer then sees.
import { afterAll, describe, expect, it } from "vitest";
import { GET as adminReports } from "@/app/api/v1/admin/reports/route";
import { GET as notificationsRoute } from "@/app/api/v1/notifications/route";
import { GET as servePhoto } from "@/app/api/v1/photos/[id]/route";
import { GET as listReports } from "@/app/api/v1/reports/route";
import { GET as staffReports } from "@/app/api/v1/staff/reports/route";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { CONSENT_VERSION } from "@/lib/meta";
import type { AppNotification, NotificationsResponse } from "@/lib/api/types";
import type { Report, StatusTimelineEvent } from "@/lib/types";
import { acceptTerms, markNotificationsRead } from "@/server/actions/account";
import { withDb } from "@/server/db";
import type { ActionResult } from "@/server/action";
import { moderateReport, undoModeration } from "@/server/actions/moderation";
import { assignReport, changeStatus, setPriority } from "@/server/actions/reports-admin";
import { createReport, flagReport, setVerdict, toggleMeToo } from "@/server/actions/reports-citizen";
import { as, hasDatabase, PERSONAS, signOutEveryone, type Persona } from "./helpers/personas";
import { cleanUpPhotos, uploadedBy } from "./helpers/photos";
import { cleanUpReports, makeReport, newReportInput, PLACE, rememberReport } from "./helpers/reports";

type Handler = (request: Request) => Promise<Response>;

/** The reports an endpoint gives this persona. */
async function read(persona: Persona, handler: Handler | (() => Promise<Response>), query = ""): Promise<Report[]> {
  const res = await as(persona, () => (handler as Handler)(new Request(`http://localhost:3000/api/v1/reports${query}`)));
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: { reports: Report[] } }).data.reports;
}
const find = async (persona: Persona, handler: Parameters<typeof read>[1], id: string, query = "") =>
  (await read(persona, handler, query)).find((r) => r.id === id);

/** What the bell shows this persona about one report. */
async function bell(persona: Persona, reportId?: string): Promise<{ unread: number; about: AppNotification[] }> {
  const res = await as(persona, () => notificationsRoute());
  expect(res.status).toBe(200);
  const { notifications, unread } = ((await res.json()) as { data: NotificationsResponse }).data;
  return { unread, about: notifications.filter((n) => n.reportId === reportId) };
}

function ok<T extends object>(result: ActionResult<T>): T {
  expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
  return result as T & { ok: true };
}

async function create(persona: Exclude<Persona, "signedOut">, change: object = {}) {
  const input = { ...(await newReportInput(persona)), ...change };
  const result = await as(persona, () => createReport(input));
  if (result.ok) rememberReport(result.report.id);
  return { input, result };
}

describe.skipIf(!hasDatabase)("creating a report", () => {
  afterAll(cleanUpReports);
  afterAll(cleanUpPhotos);
  afterAll(signOutEveryone);

  it("a double submit creates one report", async () => {
    const { input, result } = await create("citizen");
    const first = ok(result).report;
    expect(first.ref).toMatch(/^FX-\d{2}-\d{5,}$/);
    const again = ok(await as("citizen", () => createReport(input))).report;
    expect(again).toEqual(first);
    // Two taps at the very same moment, with the demo form's non-UUID key.
    const twins = await create("citizen", { clientRequestId: "req" + Date.now().toString(36) });
    const [a, b] = await Promise.all([1, 2].map(() => as("citizen", () => createReport(twins.input))));
    expect(ok(a).report.id).toBe(ok(b).report.id);
  });

  it("starts as reported, without a priority, and never says who reported it", async () => {
    const { result } = await create("citizen");
    const id = ok(result).report.id;

    const asVisitor = await find("signedOut", listReports, id);
    expect(asVisitor).toMatchObject({ status: "reported", priority: null, reporterId: null, visibility: "visible", version: 1, ...PLACE });
    expect(asVisitor!.photoIds).toHaveLength(1);
    expect(asVisitor!.timeline).toMatchObject([{ type: "status", from: null, to: "reported", actorKind: "citizen" }]);
    expect(JSON.stringify(asVisitor)).not.toContain(PERSONAS.citizen);

    expect((await find("citizen", listReports, id))!.reporterId).toBe(PERSONAS.citizen);
    expect(await find("citizen", listReports, id, "?mine=1")).toBeDefined();
    expect(await find("otherCitizen", listReports, id, "?mine=1")).toBeUndefined();
  });

  it("asks for the notice to be accepted once, before a first report", async () => {
    await withDb((db) => db.update(users).set({ consentedAt: null, consentVersion: null }).where(eq(users.id, PERSONAS.otherCitizen)));
    try {
      expect((await create("otherCitizen")).result).toMatchObject({ ok: false, error: "consent_required" });
      expect(await as("otherCitizen", () => acceptTerms({ version: "an-old-text" }))).toMatchObject({ ok: false, error: "invalid_input" });
      expect(await as("otherCitizen", () => acceptTerms({ version: CONSENT_VERSION }))).toMatchObject({ ok: true });
      ok((await create("otherCitizen")).result);
    } finally {
      await withDb((db) => db.update(users).set({ consentedAt: new Date(), consentVersion: CONSENT_VERSION }).where(eq(users.id, PERSONAS.otherCitizen)));
    }
  });

  it("refuses a point outside the service area and a description that is too short", async () => {
    expect((await create("citizen", { lng: 2.35, lat: 48.85 })).result).toMatchObject({ ok: false, error: "invalid_input", fieldErrors: { lng: ["out_of_area"] } });
    expect((await create("citizen", { description: "богино" })).result).toMatchObject({ ok: false, error: "invalid_input" });
    expect((await create("citizen", { photoIds: [] })).result).toMatchObject({ ok: false, fieldErrors: { photoIds: ["photo_required"] } });
  });

  it("is found by the map viewport it lies in, and not by another one", async () => {
    const id = await makeReport();
    const near = `?bbox=${PLACE.lng - 0.001},${PLACE.lat - 0.001},${PLACE.lng + 0.001},${PLACE.lat + 0.001}`;
    expect(await find("signedOut", listReports, id, near)).toBeDefined();
    expect(await find("signedOut", listReports, id, "?bbox=106.70,47.80,106.75,47.85")).toBeUndefined();
    expect(await find("signedOut", listReports, id, `${near}&status=resolved`)).toBeUndefined();
    expect(await find("signedOut", listReports, id, `${near}&status=reported&category=roads`)).toBeDefined();
  });
});

describe.skipIf(!hasDatabase)("the full loop: report → priority → assign → resolve → confirm", () => {
  afterAll(cleanUpReports);
  afterAll(cleanUpPhotos);
  afterAll(signOutEveryone);

  let id: string;

  it("citizen reports; admin sets the priority and assigns it", async () => {
    id = ok((await create("citizen")).result).report.id;
    expect(await find("roadStaff", staffReports, id)).toBeUndefined();
    ok(await as("otherCitizen", () => toggleMeToo({ reportId: id }))); // someone else sees the same problem

    ok(await as("admin", () => setPriority({ reportId: id, priority: "high", note: "Сургуулийн ойролцоо" })));
    ok(await as("admin", () => assignReport({ reportId: id, organizationId: "org-road", unitId: "unit-road-a" })));

    const forAdmin = await find("admin", adminReports, id);
    expect(forAdmin).toMatchObject({ priority: "high", organizationId: "org-road", unitId: "unit-road-a", version: 2 });
    expect(forAdmin!.priorityDecision).toMatchObject({ by: "Х. Бадрах", note: "Сургуулийн ойролцоо" });
    expect(forAdmin!.timeline.at(-1)).toMatchObject({ type: "assigned", organizationId: "org-road", unitId: "unit-road-a" });
  });

  it("the priority is public, the note is only for the admin and the assigned staff", async () => {
    const forVisitor = await find("signedOut", listReports, id);
    expect(forVisitor).toMatchObject({ priority: "high", organizationId: "org-road" });
    expect(forVisitor!.priorityDecision).toBeUndefined();
    expect(JSON.stringify(forVisitor)).not.toContain("Сургуулийн ойролцоо");

    expect((await find("roadStaff", staffReports, id))!.priorityDecision?.note).toBe("Сургуулийн ойролцоо");
    expect(await find("lightStaff", staffReports, id)).toBeUndefined();
  });

  it("gets a response target from its priority, shown to staff and admins only", async () => {
    const forStaff = (await find("roadStaff", staffReports, id))!;
    // High priority: 7 days after the decision.
    expect(forStaff.dueAt).toBe(forStaff.priorityDecision!.at + 7 * 864e5);
    expect((await find("admin", adminReports, id))!.dueAt).toBe(forStaff.dueAt);
    expect((await find("citizen", listReports, id))!.dueAt).toBeUndefined();
  });

  it("staff work on it and resolve it with a completion photo", async () => {
    ok(await as("roadStaff", () => changeStatus({ reportId: id, to: "in_progress", version: 2, note: "Баг гарлаа" })));
    const photoId = await uploadedBy("roadStaff");
    ok(await as("roadStaff", () => changeStatus({ reportId: id, to: "resolved", version: 3, note: "Нүхийг нөхлөө", photoId })));

    const report = (await find("signedOut", listReports, id))!;
    expect(report).toMatchObject({ status: "resolved", version: 4 });
    const last = report.timeline.at(-1) as StatusTimelineEvent;
    // The public timeline names the organization, never the person.
    expect(last).toMatchObject({ from: "in_progress", to: "resolved", note: "Нүхийг нөхлөө", photoId, actorKind: "org_staff" });
    expect(last.actorLabel.en).toBe("Road Maintenance (demo)");
    expect(JSON.stringify(report)).not.toContain("Бат-Эрдэнэ");
  });

  it("two people saving at once: the second one gets a conflict", async () => {
    const other = await makeReport({ org: "org-road" });
    const [a, b] = await Promise.all([
      as("roadStaff", () => changeStatus({ reportId: other, to: "investigating", version: 1 })),
      as("roadStaff", () => changeStatus({ reportId: other, to: "in_progress", version: 1 })),
    ]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect(a.ok ? b : a).toMatchObject({ error: "conflict" });
  });

  it("the citizen confirms it is fixed; others see the count but not who", async () => {
    ok(await as("citizen", () => setVerdict({ reportId: id, verdict: "fixed" })));
    ok(await as("otherCitizen", () => setVerdict({ reportId: id, verdict: "not_fixed" })));
    ok(await as("otherCitizen", () => setVerdict({ reportId: id, verdict: "fixed" }))); // changed their mind

    expect((await find("citizen", listReports, id))!.feedback).toEqual(
      expect.arrayContaining([{ userId: PERSONAS.citizen, verdict: "fixed" }, { userId: "", verdict: "fixed" }]),
    );
    expect((await find("signedOut", listReports, id))!.feedback).toEqual([{ userId: "", verdict: "fixed" }, { userId: "", verdict: "fixed" }]);

    ok(await as("otherCitizen", () => setVerdict({ reportId: id, verdict: null })));
    expect((await find("signedOut", listReports, id))!.feedback).toHaveLength(1);
  });

  it("only the people a report concerns may answer", async () => {
    expect(await as("roadStaff", () => setVerdict({ reportId: id, verdict: "fixed" }))).toMatchObject({ ok: false, error: "forbidden" });
    expect((await find("signedOut", listReports, id))!.feedback).toHaveLength(1);
  });

  it("when “still broken” overtakes “fixed”, the report is disputed and the manager and admin are told", async () => {
    expect((await find("signedOut", listReports, id))!.disputedAt).toBeUndefined();
    ok(await as("citizen", () => setVerdict({ reportId: id, verdict: "not_fixed" })));

    const report = (await find("signedOut", listReports, id))!;
    expect(report.status).toBe("resolved"); // the official status is the staff's to change
    expect(report.disputedAt).toBeTypeOf("number");
    expect((await bell("roadManager", id)).about.map((n) => n.type)).toContain("report.disputed");
    expect((await bell("admin", id)).about.map((n) => n.type)).toContain("report.disputed");
    expect((await bell("lightStaff", id)).about).toEqual([]);

    // Told once per resolution, not on every further answer.
    ok(await as("otherCitizen", () => setVerdict({ reportId: id, verdict: "not_fixed" })));
    expect((await bell("roadManager", id)).about.filter((n) => n.type === "report.disputed")).toHaveLength(1);
  });

  it("reopening needs the manager and a note, and starts a fresh round of answers", async () => {
    // Staff see the report but can't make the manager's move: the lifecycle answers as if it wasn't theirs.
    expect(await as("roadStaff", () => changeStatus({ reportId: id, to: "investigating", version: 4, note: "Дахин шалгая" }))).toMatchObject({ ok: false });
    ok(await as("roadManager", () => changeStatus({ reportId: id, to: "investigating", version: 4, note: "Дахин эвдэрсэн" })));
    ok(await as("roadStaff", () => changeStatus({ reportId: id, to: "resolved", version: 5 })));
    const again = (await find("citizen", listReports, id))!;
    expect(again.feedback).toEqual([]);
    expect(again.disputedAt).toBeUndefined();
  });

  it("everyone involved was told what happened, and nobody about their own actions", async () => {
    const reporter = await bell("citizen", id);
    expect(reporter.about.every((n) => n.ownReport)).toBe(true);
    expect(reporter.about.map((n) => `${n.type}${n.data.to ? `:${n.data.to as string}` : ""}`).reverse()).toEqual([
      "report.reviewed",
      "report.assigned",
      "report.status:in_progress",
      "report.status:resolved",
      "report.status:investigating",
      "report.status:resolved",
    ]);
    expect(JSON.stringify(reporter.about)).not.toMatch(/Бадрах|Бат-Эрдэнэ|Оюунчимэг/);

    // Staff: the assignment. Their own status changes are not news to them.
    const staff = await bell("roadStaff", id);
    expect(staff.about.map((n) => n.type)).toEqual(["report.assigned"]);
    expect(staff.about[0].ownReport).toBe(false);
    // "Me too": asked each time it is resolved.
    expect((await bell("otherCitizen", id)).about.map((n) => `${n.type}:${n.data.to as string}`)).toEqual(["report.status:resolved", "report.status:resolved"]);
    expect((await bell("admin", id)).about.map((n) => n.type)).toEqual(["report.disputed"]);

    expect(reporter.unread).toBeGreaterThanOrEqual(6);
    ok(await as("citizen", () => markNotificationsRead({})));
    expect((await bell("citizen", id)).unread).toBe(0);
    expect((await bell("otherCitizen", id)).unread).toBeGreaterThan(0);
  });
});

describe.skipIf(!hasDatabase)("me too", () => {
  afterAll(cleanUpReports);
  afterAll(signOutEveryone);

  it("counts one per person and can be taken back", async () => {
    const id = await makeReport();
    expect(ok(await as("citizen", () => toggleMeToo({ reportId: id })))).toMatchObject({ confirmed: true });
    ok(await as("roadStaff", () => toggleMeToo({ reportId: id })));

    expect((await find("citizen", listReports, id))!.confirmations).toEqual([PERSONAS.citizen, ""]);
    expect((await find("signedOut", listReports, id))!.confirmations).toEqual(["", ""]);

    expect(ok(await as("citizen", () => toggleMeToo({ reportId: id })))).toMatchObject({ confirmed: false });
    expect((await find("citizen", listReports, id))!.confirmations).toEqual([""]);
  });
});

describe.skipIf(!hasDatabase)("flags and moderation", () => {
  afterAll(cleanUpReports);
  afterAll(signOutEveryone);

  it("the third flag hides the report; an admin restores it and can undo that", async () => {
    const id = await makeReport();
    const flag = (persona: Persona) => as(persona, () => flagReport({ reportId: id, reason: "spam", details: "Зар сурталчилгаа" }));
    expect(ok(await flag("citizen"))).toEqual({ ok: true, autoHidden: false });
    expect(ok(await flag("roadStaff")).autoHidden).toBe(false);
    expect(await find("signedOut", listReports, id)).toBeDefined();
    expect(ok(await flag("lightStaff")).autoHidden).toBe(true);

    // Gone for the public, still there for its reporter and the admin, who alone sees the flags.
    expect(await find("signedOut", listReports, id)).toBeUndefined();
    expect(await find("otherCitizen", listReports, id, "?mine=1")).toMatchObject({ visibility: "hidden", flags: [] });
    const flagged = (await find("admin", adminReports, id))!;
    expect(flagged.flags.map((f) => f.status)).toEqual(["open", "open", "open"]);
    expect(flagged.flags[0]).toMatchObject({ reason: "spam", details: "Зар сурталчилгаа", userId: "" });

    const restored = ok(await as("admin", () => moderateReport({ reportId: id, action: "restore" })));
    expect(restored.undo).toMatchObject({ visibility: "hidden" });
    expect(restored.undo.flagIds).toHaveLength(3);
    expect(await find("signedOut", listReports, id)).toBeDefined();
    expect((await find("admin", adminReports, id))!.flags.map((f) => f.status)).toEqual(["dismissed", "dismissed", "dismissed"]);

    ok(await as("admin", () => undoModeration(restored.undo)));
    expect(await find("signedOut", listReports, id)).toBeUndefined();
    expect((await find("admin", adminReports, id))!.flags.map((f) => f.status)).toEqual(["open", "open", "open"]);
  });
});

describe.skipIf(!hasDatabase)("queue filters and sorting", () => {
  afterAll(cleanUpReports);
  afterAll(signOutEveryone);

  it("filters the admin queue by priority, organization and status", async () => {
    const pending = await makeReport();
    const assigned = await makeReport({ org: "org-road", status: "in_progress" });

    const waiting = await read("admin", adminReports, "?priority=pending&organizationId=none");
    expect(waiting.some((r) => r.id === pending)).toBe(true);
    expect(waiting.some((r) => r.id === assigned)).toBe(false);
    expect(waiting.every((r) => r.priority === null && !r.organizationId)).toBe(true);

    const road = await read("admin", adminReports, "?organizationId=org-road&status=in_progress");
    expect(road.some((r) => r.id === assigned)).toBe(true);
    expect(road.every((r) => r.organizationId === "org-road" && r.status === "in_progress")).toBe(true);

    expect(await read("admin", adminReports, "?category=roads&limit=2")).toHaveLength(2);
  });

  it("sorts by priority by default: critical first, pending review last, oldest first within one", async () => {
    const urgent = await makeReport();
    ok(await as("admin", () => setPriority({ reportId: urgent, priority: "critical", note: "" })));
    const pending = await makeReport();

    const queue = await read("admin", adminReports);
    const rank = { critical: 0, high: 1, medium: 2, low: 3 } as const;
    const ranks = queue.map((r) => (r.priority ? rank[r.priority] : 4));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(queue.findIndex((r) => r.id === urgent)).toBeLessThan(queue.findIndex((r) => r.id === pending));

    const newest = await read("admin", adminReports, "?sort=newest");
    expect(newest[0].createdAt).toBeGreaterThanOrEqual(newest.at(-1)!.createdAt);
  });

  it("a staff queue stays inside its own organization, whatever the filter says", async () => {
    const theirs = await makeReport({ org: "org-light" });
    const ours = await makeReport({ org: "org-road" });
    const queue = await read("roadStaff", staffReports, "?organizationId=org-light");
    expect(queue.some((r) => r.id === ours)).toBe(true);
    expect(queue.some((r) => r.id === theirs)).toBe(false);
    expect(queue.every((r) => r.organizationId === "org-road")).toBe(true);
  });
});

describe.skipIf(!hasDatabase)("REVIEW_BEFORE_PUBLIC: a report is public only after an admin reviewed it", () => {
  const before = process.env.REVIEW_BEFORE_PUBLIC;
  afterAll(() => {
    if (before === undefined) delete process.env.REVIEW_BEFORE_PUBLIC;
    else process.env.REVIEW_BEFORE_PUBLIC = before;
  });
  afterAll(cleanUpReports);
  afterAll(cleanUpPhotos);
  afterAll(signOutEveryone);

  it("is seen only by its reporter and the admins until it has a priority", async () => {
    process.env.REVIEW_BEFORE_PUBLIC = "true";
    const { input, result } = await create("citizen");
    const id = ok(result).report.id;
    const photo = (persona: Persona) =>
      as(persona, () => servePhoto(new Request("http://localhost:3000/"), { params: Promise.resolve({ id: input.photoIds[0] }) })).then((r) => r.status);

    expect(await find("signedOut", listReports, id)).toBeUndefined();
    expect(await find("otherCitizen", listReports, id)).toBeUndefined();
    expect(await photo("signedOut")).toBe(404);
    expect(await as("otherCitizen", () => toggleMeToo({ reportId: id }))).toMatchObject({ ok: false, error: "not_found" });
    expect(await as("otherCitizen", () => flagReport({ reportId: id, reason: "spam", details: "" }))).toMatchObject({ ok: false, error: "not_found" });

    expect(await find("citizen", listReports, id, "?mine=1")).toMatchObject({ priority: null, visibility: "visible" });
    expect(await photo("citizen")).toBe(200);
    expect(await find("admin", adminReports, id)).toBeDefined();

    ok(await as("admin", () => setPriority({ reportId: id, priority: "low", note: "" })));
    expect(await find("signedOut", listReports, id)).toMatchObject({ priority: "low" });
    expect(await photo("signedOut")).toBe(200);
    expect((await bell("citizen", id)).about.map((n) => n.type)).toEqual(["report.reviewed"]);
  });

  it("without the switch a new report is public at once", async () => {
    delete process.env.REVIEW_BEFORE_PUBLIC;
    const id = ok((await create("citizen")).result).report.id;
    expect(await find("signedOut", listReports, id)).toMatchObject({ priority: null });
  });
});
