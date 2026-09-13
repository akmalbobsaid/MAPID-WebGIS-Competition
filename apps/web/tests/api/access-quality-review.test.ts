import { describe, expect, it } from "vitest";

import { requireAllAccessQualityApproved, validateAccessQualityRow } from "../../../../scripts/database/import-p0.mjs";

const stopId = "6a92c77152d86e03b51db962";
const base = {
  analysis_version: "p0-central-v1",
  stop_id: stopId,
  description_raw: "Observasi halte.",
  approved_shelter: "Ada atap",
  approved_seating: "",
  approved_pedestrian_condition: "",
  approved_cleanliness: "",
  approved_traffic_condition: "",
  reviewed_by: "reviewer",
  reviewed_at: "2026-09-13T10:00:00.000Z",
  review_notes: "Ditinjau terhadap bukti survei.",
};

describe("PHASE-07 access-quality review validation", () => {
  it("accepts an approved human-reviewed row while preserving nullable unknown fields", () => {
    const row = validateAccessQualityRow({ ...base, review_status: "approved" }, new Set([stopId]), "p0-central-v1", new Set());
    expect(row).toMatchObject({ review_status: "approved", approved_shelter: "Ada atap", approved_seating: null, reviewed_by: "reviewer" });
  });

  it("rejects incomplete approval and uncontrolled unsafe field text", () => {
    expect(() => validateAccessQualityRow({ ...base, review_status: "approved", reviewed_by: "" }, new Set([stopId]), "p0-central-v1", new Set())).toThrow();
    expect(() => validateAccessQualityRow({ ...base, review_status: "approved", approved_cleanliness: "x\nunsafe" }, new Set([stopId]), "p0-central-v1", new Set())).toThrow();
  });

  it("makes 9/9 human approval a PASS gate", () => {
    const reviewed = Array.from({ length: 9 }, (_, index) => ({ review_status: "approved", reviewed_by: `reviewer-${index}`, reviewed_at: "2026-09-13T10:00:00.000Z" }));
    expect(() => requireAllAccessQualityApproved(reviewed)).not.toThrow();
    expect(() => requireAllAccessQualityApproved([...reviewed.slice(0, 8), { review_status: "pending", reviewed_by: null, reviewed_at: null }])).toThrow();
  });
});
