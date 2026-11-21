// Photo upload: what the server accepts, who can attach a photo, and who can see it.
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { GET as servePhoto } from "@/app/api/v1/photos/[id]/route";
import { POST as upload } from "@/app/api/v1/photos/route";
import { reportImages, reports } from "@/db/schema";
import type { UploadedPhoto } from "@/lib/api/types";
import { withDb } from "@/server/db";
import { AppError } from "@/server/errors";
import { attachReportPhotos, PHOTO_MAX_BYTES, readJpegSize } from "@/server/photos";
import { as, hasDatabase, PERSONAS, signOutEveryone, type Persona } from "./helpers/personas";
import { bucketObjects, cleanUpPhotos, jpeg, publicPhoto, rememberPhoto, uploadedBy } from "./helpers/photos";

describe("readJpegSize", () => {
  it("reads the size from a JPEG's frame header", () => {
    expect(readJpegSize(jpeg(1600, 1200))).toEqual({ width: 1600, height: 1200 });
  });

  it("refuses everything that isn't a JPEG, whatever it is called", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
    const html = new TextEncoder().encode("<script>alert(1)</script>");
    const headerOnly = jpeg().slice(0, 20); // starts like a JPEG, but has no picture in it
    for (const bytes of [png, html, headerOnly, new Uint8Array()]) expect(readJpegSize(bytes)).toBeNull();
  });
});

type Body = { data?: UploadedPhoto; error?: { code: string; message: string } };

async function post(persona: Persona, body: BodyInit, headers: Record<string, string> = { "content-type": "image/jpeg" }) {
  const request = new Request("http://localhost:3000/api/v1/photos", { method: "POST", headers, body });
  const res = await as(persona, () => upload(request));
  const json = (await res.json()) as Body;
  if (json.data) rememberPhoto(json.data.id);
  return { status: res.status, ...json };
}

const get = (persona: Persona, id: string) =>
  as(persona, () => servePhoto(new Request(`http://localhost:3000/api/v1/photos/${id}`), { params: Promise.resolve({ id }) }));

async function refusalOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (err) {
    if (err instanceof AppError) return err.code;
    throw err;
  }
}

describe.skipIf(!hasDatabase)("photo upload", () => {
  afterAll(cleanUpPhotos);
  afterAll(signOutEveryone);

  it("stores a JPEG and serves the same bytes back to the uploader", async () => {
    const bytes = jpeg(1600, 1200, 500);
    const res = await post("citizen", bytes);
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ width: 1600, height: 1200, bytes: bytes.length });
    expect(res.data!.url).toBe(`/api/v1/photos/${res.data!.id}`);
    expect(bucketObjects.has(`photos/${res.data!.id}.jpg`)).toBe(true);

    const served = await get("citizen", res.data!.id);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/jpeg");
    expect(served.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(bytes);
  });

  it("refuses a file that isn't a JPEG, even when it says it is", async () => {
    const res = await post("citizen", new TextEncoder().encode("<html>not a photo</html>"));
    expect(res).toMatchObject({ status: 400, error: { code: "invalid_input", message: "The file is not a JPEG photo." } });
  });

  it("refuses another content type and an empty body", async () => {
    expect(await post("citizen", jpeg(), { "content-type": "image/png" })).toMatchObject({ status: 400 });
    expect(await post("citizen", new Uint8Array())).toMatchObject({ status: 400, error: { code: "photo_required" } });
  });

  it("refuses a photo over 4 MB and stores nothing", async () => {
    const before = bucketObjects.size;
    const res = await post("citizen", jpeg(1600, 1200, PHOTO_MAX_BYTES));
    expect(res).toMatchObject({ status: 400, error: { code: "invalid_input", message: "The photo is larger than 4 MB." } });
    expect(bucketObjects.size).toBe(before);
  });
});

describe.skipIf(!hasDatabase)("who can see a photo", () => {
  afterAll(cleanUpPhotos);
  afterAll(signOutEveryone);

  it("not attached to a report yet: only the uploader and admins", async () => {
    const id = await uploadedBy("citizen");
    expect((await get("citizen", id)).status).toBe(200);
    expect((await get("admin", id)).status).toBe(200);
    for (const other of ["signedOut", "otherCitizen", "roadStaff"] as const) {
      expect((await get(other, id)).status, other).toBe(404);
    }
  });

  it("on a visible report: everyone; once the report is hidden: only the uploader and admins", async () => {
    const { photoId, reportId } = await publicPhoto();
    expect((await get("signedOut", photoId)).status).toBe(200);
    expect((await get("otherCitizen", photoId)).status).toBe(200);

    const setVisibility = (visibility: "visible" | "hidden") =>
      withDb((db) => db.update(reports).set({ visibility }).where(eq(reports.id, reportId)));
    await setVisibility("hidden");
    try {
      expect((await get("signedOut", photoId)).status).toBe(404);
      expect((await get("otherCitizen", photoId)).status).toBe(404);
      expect((await get("citizen", photoId)).status).toBe(200);
      expect((await get("admin", photoId)).status).toBe(200);
    } finally {
      await setVisibility("visible");
    }
  });

  it("answers 404 for an id that doesn't exist or isn't an id at all", async () => {
    expect((await get("admin", "00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect((await get("admin", "../../etc/passwd")).status).toBe(404);
  });
});

describe.skipIf(!hasDatabase)("attaching photos to a report", () => {
  afterAll(cleanUpPhotos);

  const citizen = { id: PERSONAS.citizen };
  const attach = (actor: { id: string }, reportId: string, ids: string[]) =>
    // Rolled back every time: these checks must not leave photos on a seeded report.
    withDb((db) =>
      db.transaction(async (tx) => {
        await attachReportPhotos(tx, actor, reportId, ids);
        const rows = await tx.select().from(reportImages).where(eq(reportImages.reportId, reportId));
        tx.rollback();
        return rows;
      }),
    ).catch((err: unknown) => {
      if (err instanceof AppError) throw err;
      return null; // the deliberate rollback
    });

  it("refuses a photo someone else uploaded, one already used, a repeat and a made-up id", async () => {
    const { photoId: used, reportId } = await publicPhoto();
    const mine = await uploadedBy("citizen");
    const theirs = await uploadedBy("otherCitizen");

    expect(await refusalOf(attach(citizen, reportId, [theirs]))).toBe("invalid_input");
    expect(await refusalOf(attach(citizen, reportId, [used]))).toBe("invalid_input");
    expect(await refusalOf(attach(citizen, reportId, [mine, mine]))).toBe("invalid_input");
    expect(await refusalOf(attach(citizen, reportId, ["not-an-id"]))).toBe("invalid_input");
    expect(await refusalOf(attach(citizen, reportId, [mine, mine, mine, mine]))).toBe("too_many_photos");
  });
});
