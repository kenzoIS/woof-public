import { getBackendConnection } from "./backendConnection";
import type { SimConfig, SimInputs, SimRun, SimEvent } from "./simulationTypes";
const API = getBackendConnection().apiUrl;
async function call<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API}/simulation${path}`, {
    method: body ? "POST" : "GET",
    cache: "no-store",
    credentials: "include",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      Array.isArray(data.message)
        ? data.message.join(", ")
        : data.message || "Simulation request failed.",
    );
  return data as T;
}
export const loadSimulationInputs = (
  source: string,
  date: string,
  startDate?: string,
  endDate?: string,
) =>
  call<SimInputs>(
    `/inputs?${new URLSearchParams({ source, date, ...(startDate ? { startDate } : {}), ...(endDate ? { endDate } : {}) })}`,
  );
export const runSimulation = (
  inputs: SimInputs,
  baseline: SimConfig,
  whatIf: SimConfig,
) => call<SimRun>("/runs", { inputs, baseline, whatIf });
export interface SimulationHistory {
  _id: string;
  createdAt: string;
  createdBy: string;
  whatIf: {
    config: { name: string; date: string };
    metrics: { revenue: number; served: number };
  };
}
export const loadSimulationHistory = () => call<SimulationHistory[]>("/runs");
export const reopenSimulation = (id: string) =>
  call<SimRun>(`/runs/${encodeURIComponent(id)}`);

export const injectSimulationEvent = (
  id: string,
  minute: number,
  event: SimEvent,
) => call<SimRun>(`/runs/${encodeURIComponent(id)}/inject`, { minute, event });
