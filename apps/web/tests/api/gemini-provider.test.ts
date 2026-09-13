import { describe, expect, it, vi } from "vitest";
import type { GenerateContentParameters } from "@google/genai";

vi.mock("server-only", () => ({}));

import { GeminiAgusInterpreter } from "../../src/lib/server/agus/gemini-provider";

const input = {
  message: "Kuliner apa yang bisa dijangkau?",
  selectedStopId: "6a92c77152d86e03b51db962",
  selectedMinutes: 5 as const,
  categories: ["MINUMAN", "RESTORAN"],
};

function interpreterFor(text: string) {
  const generateContent = vi.fn().mockResolvedValue({ text });
  return {
    interpreter: new GeminiAgusInterpreter("test-key", "gemini-test", { models: { generateContent } }),
    generateContent,
  };
}

describe("Gemini AGUS interpreter", () => {
  it("accepts every bounded interpretation and sends structured-output configuration without tools", async () => {
    for (const interpretation of ["reachable_food", "nearest_food", "filter_food_category", "stop_access_info", "unsupported", "unrelated"]) {
      const { interpreter, generateContent } = interpreterFor(JSON.stringify({
        interpretation,
        ...(interpretation === "filter_food_category" ? { category_l2: "minuman" } : {}),
      }));
      await expect(interpreter.interpret(input)).resolves.toMatchObject({ interpretation });
      expect(generateContent).toHaveBeenCalledWith(expect.objectContaining({
        model: "gemini-test",
        config: expect.objectContaining({
          responseMimeType: "application/json",
          maxOutputTokens: 160,
          temperature: 0,
          responseJsonSchema: expect.any(Object),
        }),
      }));
      const request = generateContent.mock.calls[0][0];
      expect(request).not.toHaveProperty("tools");
      expect(request.contents).not.toContain(input.selectedStopId);
    }
  });

  it("rejects missing provider configuration without exposing configuration details", () => {
    let missingKeyError: unknown;
    let missingModelError: unknown;
    try { new GeminiAgusInterpreter(undefined, "gemini-test"); } catch (error) { missingKeyError = error; }
    try { new GeminiAgusInterpreter("test-key", undefined); } catch (error) { missingModelError = error; }
    expect(missingKeyError).toMatchObject({ code: "AGUS_PROVIDER_UNAVAILABLE" });
    expect(missingModelError).toMatchObject({ code: "AGUS_PROVIDER_UNAVAILABLE" });
  });

  it.each([
    ["empty output", ""],
    ["malformed JSON", "not-json"],
    ["schema-invalid output", JSON.stringify({ interpretation: "merchant_detail", merchant_id: "forbidden" })],
  ])("fails safely on %s", async (_label, text) => {
    const { interpreter } = interpreterFor(text);
    await expect(interpreter.interpret(input)).rejects.toMatchObject({ code: "AGUS_INTERPRETATION_UNAVAILABLE" });
  });

  it.each([401, 403, 404, 429, 500])("maps provider status %s to the public availability fallback", async (status) => {
    const generateContent = vi.fn().mockRejectedValue({ status });
    const interpreter = new GeminiAgusInterpreter("test-key", "gemini-test", { models: { generateContent } });
    await expect(interpreter.interpret(input)).rejects.toMatchObject({ code: "AGUS_PROVIDER_UNAVAILABLE", status: 503 });
  });

  it("aborts a slow provider request and returns the public availability fallback", async () => {
    vi.useFakeTimers();
    const generateContent = vi.fn((parameters: GenerateContentParameters) => new Promise<{ text?: string }>((_, reject) => {
      const signal = parameters.config?.abortSignal;
      if (!signal) throw new Error("Expected an abort signal.");
      signal.addEventListener("abort", () => reject(Object.assign(new Error("timed out"), { name: "AbortError" })));
    }));
    const interpreter = new GeminiAgusInterpreter("test-key", "gemini-test", { models: { generateContent } });
    const result = interpreter.interpret(input);
    const assertion = expect(result).rejects.toMatchObject({ code: "AGUS_PROVIDER_UNAVAILABLE", status: 503 });
    await vi.advanceTimersByTimeAsync(8_000);
    await assertion;
    vi.useRealTimers();
  });
});
