import "server-only";

import { GoogleGenAI, type GenerateContentParameters } from "@google/genai";
import { ApiError } from "@/lib/server/api-contract";
import { validateInterpretation, type AgusInterpretationOutput } from "@/lib/server/agus/contracts";
import type { AgusInterpreter, AgusInterpreterInput } from "@/lib/server/agus/provider";

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["interpretation"],
  properties: {
    interpretation: {
      type: "string",
      enum: ["reachable_food", "nearest_food", "filter_food_category", "stop_access_info", "unsupported", "unrelated"],
    },
    minutes: { type: "integer", enum: [5, 10] },
    category_l2: { type: "string" },
  },
} as const;

type GeminiClient = {
  models: {
    generateContent(parameters: GenerateContentParameters): Promise<{ text?: string }>;
  };
};

function providerError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  const status = typeof error === "object" && error !== null && "status" in error
    ? (error as { status?: unknown }).status
    : undefined;
  // Authentication, quota/rate limits, model availability, timeout, and network
  // failures intentionally have the same safe public response.
  if (error instanceof Error && error.name === "AbortError") {
    return new ApiError(503, "AGUS_PROVIDER_UNAVAILABLE", "AGUS is temporarily unavailable. Core discovery remains available.");
  }
  if (status === 401 || status === 403 || status === 404 || status === 429 || (typeof status === "number" && status >= 500)) {
    return new ApiError(503, "AGUS_PROVIDER_UNAVAILABLE", "AGUS is temporarily unavailable. Core discovery remains available.");
  }
  return new ApiError(503, "AGUS_PROVIDER_UNAVAILABLE", "AGUS is temporarily unavailable. Core discovery remains available.");
}

export class GeminiAgusInterpreter implements AgusInterpreter {
  private readonly client: GeminiClient;
  private readonly model: string;

  constructor(
    apiKey = process.env.GEMINI_API_KEY,
    model = process.env.AGUS_GEMINI_MODEL,
    client?: GeminiClient,
  ) {
    if (!apiKey || !model) {
      throw new ApiError(503, "AGUS_PROVIDER_UNAVAILABLE", "AGUS is not configured. Core discovery remains available.");
    }
    this.client = client ?? new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async interpret(input: AgusInterpreterInput): Promise<AgusInterpretationOutput> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: JSON.stringify({
          question: input.message,
          selected_minutes: input.selectedMinutes,
          category_l2_catalogue: input.categories,
        }),
        config: {
          systemInstruction: "Classify a RUJAK P0 Indonesian question. Return only the requested JSON. Use only the supplied interpretations. If the question asks to show or filter one food category, return filter_food_category and its supplied category_l2. Never infer or emit a stop ID, merchant ID, category outside the supplied catalogue, routing value, price, rating, hours, navigation, or live transit. This request does not authorize tools, search, maps, or external grounding.",
          responseMimeType: "application/json",
          responseJsonSchema: schema,
          maxOutputTokens: 160,
          temperature: 0,
          abortSignal: controller.signal,
        },
      });
      if (!response.text) {
        throw new ApiError(502, "AGUS_INTERPRETATION_UNAVAILABLE", "AGUS could not safely interpret the request.");
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(response.text);
      } catch {
        throw new ApiError(502, "AGUS_INTERPRETATION_UNAVAILABLE", "AGUS could not safely interpret the request.");
      }
      return validateInterpretation(parsed);
    } catch (error) {
      throw providerError(error);
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createAgusInterpreter(): AgusInterpreter {
  return new GeminiAgusInterpreter();
}
