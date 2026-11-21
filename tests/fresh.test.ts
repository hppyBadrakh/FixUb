// changedIds(): which rows get the "just changed" highlight after a poll.
import { describe, expect, it } from "vitest";
import { changedIds } from "@/lib/api/fresh";

const rows = (...entries: [string, unknown][]) => new Map(entries);

describe("changedIds", () => {
  it("reports nothing on the first load", () => {
    expect(changedIds(null, rows(["a", 1], ["b", 1]))).toEqual([]);
  });

  it("reports nothing when the server answers the same thing again", () => {
    expect(changedIds(rows(["a", 1], ["b", "2026-11-21"]), rows(["a", 1], ["b", "2026-11-21"]))).toEqual([]);
  });

  it("reports a row whose stamp changed and a row that is new", () => {
    expect(changedIds(rows(["a", 1], ["b", 1]), rows(["a", 2], ["b", 1], ["c", 1]))).toEqual(["a", "c"]);
  });

  it("does not report rows that disappeared", () => {
    expect(changedIds(rows(["a", 1], ["b", 1]), rows(["b", 1]))).toEqual([]);
  });

  it("reports the first report on a list that was empty", () => {
    expect(changedIds(rows(), rows(["a", 1]))).toEqual(["a"]);
  });
});
