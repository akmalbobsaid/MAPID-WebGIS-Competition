import "server-only";

import type { AgusInterpretationOutput } from "@/lib/server/agus/contracts";

export type AgusInterpreterInput = {
  message: string;
  selectedStopId: string;
  selectedMinutes: 5 | 10;
  categories: string[];
};

export interface AgusInterpreter {
  interpret(input: AgusInterpreterInput): Promise<AgusInterpretationOutput>;
}
