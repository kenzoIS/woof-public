import { getBackendConnection } from "./backendConnection";
export interface RetailInventoryProduct {
  product_id: string;
  sku: string | null;
  product_name: string | null;
  category: string | null;
  unit_of_measure: string | null;
  location_id: string | null;
  quantity_on_hand: number | null;
  reserved_quantity: number | null;
  available_quantity: number | null;
  reorder_point: number | null;
  is_active: boolean | null;
  last_inventory_update: string | null;
}
export interface RetailInventorySnapshot {
  source: string;
  mode: "polling";
  status:
    | "not_configured"
    | "connecting"
    | "unavailable"
    | "near_realtime"
    | "reconnecting"
    | "stale";
  hasSnapshot: boolean;
  syncing: boolean;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  pollIntervalMs: number;
  staleAfterMs: number;
  revision: number;
  message: string | null;
  sourceWindow: {
    firstResponseAt: string | null;
    lastResponseAt: string | null;
    pages: number;
    pointInTime: false;
  };
  products: RetailInventoryProduct[];
  batchesSupported: false;
  limitations: string[];
}
export async function fetchRetailInventory(
  refresh = false,
): Promise<RetailInventorySnapshot> {
  const response = await fetch(
    `${getBackendConnection().apiUrl}/inventory${refresh ? "/refresh" : ""}`,
    {
      method: refresh ? "POST" : "GET",
      cache: "no-store",
      credentials: "include",
    },
  );
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "Your session expired. Sign in again to refresh inventory."
        : "Cannot reach the inventory service. Last-known stock is retained.",
    );
  return body;
}
