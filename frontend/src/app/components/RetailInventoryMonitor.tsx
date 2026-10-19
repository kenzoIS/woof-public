import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { Button } from "./ui/button";
import {
  fetchRetailInventory,
  type RetailInventoryProduct,
} from "../lib/inventoryApi";
const time = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("en-PH", {
        timeZone: "Asia/Manila",
        dateStyle: "medium",
        timeStyle: "medium",
      })
    : "No successful refresh yet";
const state = (product: RetailInventoryProduct) =>
  product.is_active === false
    ? "Inactive"
    : product.is_active === null
      ? "Activity unknown"
      : product.available_quantity === null
        ? "Stock unknown"
        : product.available_quantity === 0
          ? "Out of stock"
          : product.reorder_point !== null &&
              product.available_quantity <= product.reorder_point
            ? "At / below reorder level"
            : "In stock";
export function RetailInventoryMonitor() {
  const { data, error, mutate, isLoading } = useSWR(
    ["retail-inventory", "cookie-session"],
    () => fetchRetailInventory(),
    {
      refreshInterval: 10000,
      dedupingInterval: 1000,
      keepPreviousData: false,
      revalidateOnFocus: true,
    },
  );
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("name");
  const [ascending, setAscending] = useState(true);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const update = () => void mutate();
    window.addEventListener("woof:inventory", update);
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => {
      window.removeEventListener("woof:inventory", update);
      clearInterval(timer);
    };
  }, [mutate]);
  const rows = useMemo(
    () =>
      (data?.products || [])
        .filter((product) => {
          const matches =
            `${product.product_name || ""} ${product.sku || ""} ${product.product_id} ${product.category || ""}`
              .toLowerCase()
              .includes(query.toLowerCase().trim());
          return (
            matches &&
            (filter === "all" ||
              (filter === "active" && product.is_active === true) ||
              (filter === "inactive" && product.is_active === false) ||
              (filter === "empty" &&
                product.is_active === true &&
                product.available_quantity === 0) ||
              (filter === "unknown" && product.available_quantity === null))
          );
        })
        .sort((a, b) => {
          if (sort === "stock") {
            if (a.available_quantity === null)
              return b.available_quantity === null
                ? a.product_id.localeCompare(b.product_id)
                : 1;
            if (b.available_quantity === null) return -1;
            return (
              (a.available_quantity - b.available_quantity) *
                (ascending ? 1 : -1) || a.product_id.localeCompare(b.product_id)
            );
          }
          return (
            (a.product_name || a.product_id).localeCompare(
              b.product_name || b.product_id,
            ) * (ascending ? 1 : -1)
          );
        }),
    [data, filter, query, sort, ascending],
  );
  const pages = Math.max(1, Math.ceil(rows.length / 20));
  const currentPage = Math.min(page, pages - 1);
  const hasSnapshot = !!data?.hasSnapshot;
  const stale =
    hasSnapshot &&
    (data?.status === "stale" ||
      !!error ||
      (!!data?.lastSuccessAt &&
        now - Date.parse(data.lastSuccessAt) > data.staleAfterMs));
  const status = stale
    ? "Stale — last-known stock"
    : data?.status === "not_configured"
      ? "Not configured"
      : data?.status === "near_realtime"
        ? "Near-real-time · polling"
        : data?.status === "reconnecting"
          ? "Reconnecting — last-known stock"
          : error || data?.status === "unavailable"
            ? "Unavailable"
            : "Connecting";
  const healthy = !stale && data?.status === "near_realtime";
  const cooldown = data?.nextAttemptAt
    ? Math.max(0, Date.parse(data.nextAttemptAt) - now)
    : 0;
  const changeSort = (column: string) => {
    setAscending(sort === column ? !ascending : true);
    setSort(column);
    setPage(0);
  };
  async function refresh() {
    setRefreshing(true);
    setRefreshError("");
    try {
      await mutate(fetchRetailInventory(true), { revalidate: false });
    } catch (e) {
      setRefreshError(
        e instanceof Error
          ? e.message
          : "Inventory refresh failed. Last-known stock is retained.",
      );
    } finally {
      setRefreshing(false);
      setNow(Date.now());
    }
  }
  return (
    <section className="bg-white border border-[#FFD9EC] rounded-2xl md:rounded-3xl p-4 md:p-6 lg:p-8 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg md:text-xl font-bold text-[#223047]">
            Inventory Health Monitor
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Current PetHub Pet Shop stock, independent of sales date/channel
            filters. Available quantity already includes PetHub’s stored order
            deductions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${healthy ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}
            role="status"
          >
            {status}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={
              refreshing ||
              isLoading ||
              data?.status === "not_configured" ||
              cooldown > 0
            }
            onClick={() => void refresh()}
            title={
              cooldown > 0
                ? `Next source refresh in about ${Math.ceil(cooldown / 1000)} seconds`
                : "Request a source refresh"
            }
          >
            <RefreshCw
              className={`w-3.5 h-3.5 mr-1 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Last complete refresh: {time(data?.lastSuccessAt || null)} ·
        Asia/Manila.{" "}
        {data
          ? `Source polling: at least ${data.pollIntervalMs / 1000}s between complete scans; pagination and retries can take longer.`
          : "Loading connection status…"}
      </p>
      {(stale ||
        data?.status === "reconnecting" ||
        error ||
        refreshError ||
        data?.message) && (
        <div
          className="flex items-start gap-2 rounded-xl bg-amber-50 text-amber-900 p-3 text-sm"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            {data?.status === "not_configured"
              ? "PetHub inventory is not connected yet. Configure the matching inventory token on both backends, then restart WOOF’s backend."
              : refreshError ||
                (error
                  ? "The WOOF inventory service is unreachable. Displayed quantities are last-known values, not current stock."
                  : data?.message ||
                    "Stock may be outdated. Waiting for a successful refresh.")}
          </span>
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {[
          [
            "Products returned",
            hasSnapshot ? String(data!.products.length) : "—",
          ],
          [
            "Active products",
            hasSnapshot
              ? String(
                  data!.products.filter((product) => product.is_active === true)
                    .length,
                )
              : "—",
          ],
          [
            "Active, out of stock",
            hasSnapshot
              ? String(
                  data!.products.filter(
                    (product) =>
                      product.is_active === true &&
                      product.available_quantity === 0,
                  ).length,
                )
              : "—",
          ],
          [
            "Unknown stock",
            hasSnapshot
              ? String(
                  data!.products.filter(
                    (product) => product.available_quantity === null,
                  ).length,
                )
              : "—",
          ],
        ].map(([label, value]) => (
          <div className="rounded-xl bg-[#FFF7FB] p-3" key={label}>
            <p className="text-xs text-slate-500">{label}</p>
            <p className="text-xl font-bold text-[#223047] mt-1">{value}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          aria-label="Search PetHub inventory"
          className="border border-[#FFD9EC] rounded-lg px-3 py-2 text-sm flex-1 min-w-40"
          placeholder="Search product, ID, category or SKU"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
        <select
          aria-label="Filter PetHub inventory"
          className="border border-[#FFD9EC] rounded-lg px-3 py-2 text-sm"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(0);
          }}
        >
          <option value="all">All products</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="empty">Active, out of stock</option>
          <option value="unknown">Unknown stock</option>
        </select>
      </div>
      {!hasSnapshot ? (
        <p className="rounded-xl bg-[#FFF7FB] p-4 text-sm text-slate-500">
          {isLoading || data?.status === "connecting"
            ? "Waiting for the first complete PetHub inventory refresh…"
            : "No verified inventory snapshot is available. Stock is not assumed to be zero."}
        </p>
      ) : !rows.length ? (
        <p className="p-4 text-sm text-slate-500">
          {data!.products.length
            ? "No products match these filters."
            : "PetHub returned no retail products in the last complete refresh."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="py-3">
                  <button onClick={() => changeSort("name")}>
                    Product {sort === "name" ? (ascending ? "↑" : "↓") : "↕"}
                  </button>
                </th>
                <th>
                  <button onClick={() => changeSort("stock")}>
                    Available stock{" "}
                    {sort === "stock" ? (ascending ? "↑" : "↓") : "↕"}
                  </button>
                </th>
                <th>Reorder level</th>
                <th>Status</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .slice(currentPage * 20, currentPage * 20 + 20)
                .map((product) => (
                  <InventoryRow
                    key={product.product_id}
                    product={product}
                    open={expanded === product.product_id}
                    toggle={() =>
                      setExpanded(
                        expanded === product.product_id
                          ? null
                          : product.product_id,
                      )
                    }
                  />
                ))}
            </tbody>
          </table>
        </div>
      )}
      {hasSnapshot && (
        <div className="flex justify-between items-center gap-2 text-xs text-slate-500">
          <span>
            {rows.length} matching products · Page {currentPage + 1} / {pages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= pages - 1}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
      <p className="text-xs text-slate-500">
        Expiry/spoilage risk is unavailable: PetHub retail has no batch expiry
        records. Velocity and stockout estimates are unavailable without a
        verified product-to-sales mapping. A missing reorder level is not
        replaced with an assumed threshold.
      </p>
      {hasSnapshot && (
        <details className="text-xs text-slate-500">
          <summary className="cursor-pointer">
            Source and refresh details
          </summary>
          <p className="mt-2">
            PetHub response window: {time(data!.sourceWindow.firstResponseAt)} →{" "}
            {time(data!.sourceWindow.lastResponseAt)} ·{" "}
            {data!.sourceWindow.pages} page(s). Pages read live data and may
            represent different moments. An absent product may have been
            deleted, moved outside Pet Shop, or affected by concurrent edits;
            absence is not recorded as zero stock.
          </p>
        </details>
      )}
    </section>
  );
}
function InventoryRow({
  product,
  open,
  toggle,
}: {
  product: RetailInventoryProduct;
  open: boolean;
  toggle: () => void;
}) {
  const label = state(product);
  const danger = product.is_active === true && product.available_quantity === 0;
  return (
    <>
      <tr className="border-t border-pink-50 hover:bg-[#FFF7FB]">
        <td className="py-3 pr-3">
          <p className="font-semibold text-[#223047]">
            {product.product_name || "Name not provided"}
          </p>
          <p className="text-xs text-slate-500">
            {product.category || "Category not provided"} ·{" "}
            {product.sku || "SKU not provided"}
          </p>
        </td>
        <td
          className={`font-bold ${danger ? "text-red-600" : "text-[#223047]"}`}
        >
          {product.available_quantity === null
            ? "Unknown"
            : product.available_quantity.toLocaleString("en-PH")}
          {product.unit_of_measure && (
            <span className="text-xs font-normal ml-1">
              {product.unit_of_measure}
            </span>
          )}
        </td>
        <td className="text-slate-500">
          {product.reorder_point === null
            ? "Not provided"
            : product.reorder_point}
        </td>
        <td>
          <span
            className={`text-xs rounded-full px-2 py-1 ${danger ? "bg-red-50 text-red-700" : product.is_active !== true ? "bg-slate-100 text-slate-600" : "bg-[#FFF2FA] text-[#D42A7D]"}`}
          >
            {label}
          </span>
        </td>
        <td>
          <button
            aria-expanded={open}
            aria-label={`View inventory details for ${product.product_name || product.product_id}`}
            onClick={toggle}
            className="p-2 text-[#D42A7D]"
          >
            {open ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} className="bg-[#FFF7FB] p-4 text-xs text-slate-600">
            <dl className="grid gap-2 sm:grid-cols-2">
              <div>
                <dt className="font-semibold">Stable PetHub product ID</dt>
                <dd className="break-all">{product.product_id}</dd>
              </div>
              <div>
                <dt className="font-semibold">Product row updated</dt>
                <dd>
                  {product.last_inventory_update
                    ? time(product.last_inventory_update)
                    : "Not provided"}{" "}
                  · may include non-stock edits
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Stock definition</dt>
                <dd>
                  Exact stored PetHub stock counter; no additional reservation,
                  damage, or expiry deductions.
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Location / unit</dt>
                <dd>
                  {product.location_id || "Location not provided"} /{" "}
                  {product.unit_of_measure || "Unit not provided"}
                </dd>
              </div>
            </dl>
          </td>
        </tr>
      )}
    </>
  );
}
