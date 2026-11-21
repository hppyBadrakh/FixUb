"use client";

// Photos on the server (Cloudflare R2), for the camera flow and anything that shows a photo.
//
//   const photo = await uploadPhoto(blob);          // blob: what <Camera onCapture> gives you
//   draft.photoIds.push(photo.id);                  // then: createReport({ …, photoIds })
//   <img src={photoUrl(id)} alt="…" />
import { fetchApi } from "./hooks";
import type { UploadedPhoto } from "./types";

/** Where a stored photo is served from. Works in `<img src>`; hidden photos answer 404. */
export const photoUrl = (id: string) => `/api/v1/photos/${id}`;

/**
 * Uploads one JPEG (at most 4 MB) and returns its id. Throws an ApiError: `signed_out`,
 * `rate_limited`, `invalid_input` (not a JPEG, or too large), `not_configured` (no storage).
 */
export function uploadPhoto(blob: Blob): Promise<UploadedPhoto> {
  return fetchApi<UploadedPhoto>("/api/v1/photos", {
    method: "POST",
    headers: { "Content-Type": "image/jpeg" },
    body: blob,
  });
}
