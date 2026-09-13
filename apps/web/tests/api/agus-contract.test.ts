import { describe, expect, it } from "vitest";

import { parseAgusRequest, validateInterpretation } from "../../src/lib/server/agus/contracts";

describe("AGUS request and interpretation contracts", () => {
  it("accepts selected-stop context and bounded Indonesian input", async () => {
    const request = new Request("http://localhost/api/agus", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Kuliner apa yang bisa dijangkau dalam 10 menit?", context: { selected_stop_id: "6a92c77152d86e03b51db962", selected_minutes: 10 } }),
    });
    await expect(parseAgusRequest(request)).resolves.toEqual({
      message: "Kuliner apa yang bisa dijangkau dalam 10 menit?",
      context: { selectedStopId: "6a92c77152d86e03b51db962", selectedMinutes: 10 },
    });
  });

  it("allows only the four P0 intents plus non-action unsupported outcomes", () => {
    expect(validateInterpretation({ interpretation: "filter_food_category", minutes: 5, category_l2: " minuman " })).toEqual({
      interpretation: "filter_food_category", minutes: 5, categoryL2: "MINUMAN",
    });
    expect(validateInterpretation({ interpretation: "unrelated" })).toEqual({ interpretation: "unrelated" });
    expect(() => validateInterpretation({ interpretation: "merchant_detail", merchant_id: "009e8a6b-2213-5674-a8e5-0e615bf94818" })).toThrow();
  });

  it("rejects unsupported request fields and non-P0 minute values", async () => {
    const request = new Request("http://localhost/api/agus", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "halo", context: { selected_stop_id: null, selected_minutes: 15 }, merchant_id: "x" }),
    });
    await expect(parseAgusRequest(request)).rejects.toMatchObject({ code: "AGUS_VALIDATION_ERROR" });
  });
});
