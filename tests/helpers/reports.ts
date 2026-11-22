// Report fixtures. Tests never change the seeded reports: they work on reports made here, which
// cleanUpReports() deletes again (with everything that hangs off them).
import { and, eq, inArray, like } from "drizzle-orm";
import { auditEvents, categories, organizations, rateLimitBuckets, reports, reportStatusEvents, subcategories } from "@/db/schema";
import type { ReportStatus } from "@/lib/types";
import { withDb } from "@/server/db";
import { PERSONAS, type Persona } from "./personas";
import { uploadedBy } from "./photos";

/** Sükhbaatar Square: inside the service area. */
export const PLACE = { lng: 106.9177, lat: 47.9186 } as const;

const made = new Set<string>();
/** Reports a test created through the real action are deleted by cleanUpReports() too. */
export const rememberReport = (id: string) => void made.add(id);

export interface FixtureOptions {
  reporter?: Exclude<Persona, "signedOut">;
  status?: Exclude<ReportStatus, "closed">;
  /** Slug of the organization it is assigned to, e.g. "org-road". */
  org?: string;
  hidden?: boolean;
}

/** Inserts a report directly (no action involved) and returns its id. */
export async function makeReport({ reporter = "otherCitizen", status = "reported", org, hidden = false }: FixtureOptions = {}): Promise<string> {
  const id = await withDb(async (db) => {
    const [sub] = await db
      .select({ id: subcategories.id, categoryId: subcategories.categoryId })
      .from(subcategories)
      .innerJoin(categories, eq(categories.id, subcategories.categoryId))
      .where(and(eq(categories.slug, "roads"), eq(subcategories.slug, "pothole")));
    const [organization] = org ? await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, org)) : [];
    if (!sub || (org && !organization)) throw new Error("The seed data is missing. Run npm run db:seed.");

    const now = new Date();
    const [report] = await db
      .insert(reports)
      .values({
        ref: `FX-00-${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`,
        reporterId: PERSONAS[reporter],
        clientRequestId: crypto.randomUUID(),
        categoryId: sub.categoryId,
        subcategoryId: sub.id,
        description: "Тестийн мэдээлэл: замд том нүх гарсан байна.",
        location: { x: PLACE.lng, y: PLACE.lat },
        addressHint: "Тест",
        district: "sukhbaatar",
        status,
        visibility: hidden ? "hidden" : "visible",
        assignedOrganizationId: organization?.id ?? null,
        resolvedAt: status === "resolved" ? now : null,
      })
      .returning({ id: reports.id });
    await db.insert(reportStatusEvents).values({ reportId: report.id, fromStatus: null, toStatus: "reported", actorId: PERSONAS[reporter], actorKind: "citizen" });
    if (status !== "reported") {
      await db.insert(reportStatusEvents).values({ reportId: report.id, fromStatus: "reported", toStatus: status, actorKind: "admin" });
    }
    return report.id;
  });
  made.add(id);
  return id;
}

/** A valid input for createReport, with a photo this persona uploaded. */
export async function newReportInput(persona: Persona) {
  return {
    category: "roads",
    subcategory: "pothole",
    description: "Тестийн мэдээлэл: замд том нүх гарсан байна.",
    ...PLACE,
    addressHint: "Тест",
    district: "sukhbaatar",
    photoIds: [await uploadedBy(persona === "signedOut" ? "citizen" : persona)],
    clientRequestId: crypto.randomUUID(),
  };
}

/** Deletes the reports the tests made, their audit trail, and the personas' write counters. */
export async function cleanUpReports(): Promise<void> {
  await withDb(async (db) => {
    const ids = [...made];
    if (ids.length) {
      await db.delete(auditEvents).where(and(eq(auditEvents.targetType, "report"), inArray(auditEvents.targetId, ids)));
      // Duplicates point at other reports: unlink first so the order of deletion doesn't matter.
      await db.update(reports).set({ status: "reported", closureReason: null, duplicateOfId: null, resolvedAt: null }).where(inArray(reports.id, ids));
      await db.delete(reports).where(inArray(reports.id, ids));
    }
    await db.delete(rateLimitBuckets).where(like(rateLimitBuckets.key, "%:user:u-%"));
  });
  made.clear();
}
