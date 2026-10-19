import { useId } from "react";
import { currentFloor, floorConfig } from "./floorState";
import type { SimConfig, SimResult } from "../../lib/simulationTypes";
export { customerState } from "./floorState";
type Point = [number, number];
const mix = (a: Point, b: Point, n: number): Point => [
  a[0] + (b[0] - a[0]) * n,
  a[1] + (b[1] - a[1]) * n,
];
function route(from: Point, to: Point, elapsed: number): Point {
  const n = Math.max(0, Math.min(1, elapsed / 0.8));
  // Move through circulation space, then into the destination area.
  const middle: Point = [to[0], from[1]];
  return n < 0.5 ? mix(from, middle, n * 2) : mix(middle, to, (n - 0.5) * 2);
}
function Avatar({
  staff = false,
  pet = false,
  color = "#F53799",
}: {
  staff?: boolean;
  pet?: boolean;
  color?: string;
}) {
  return (
    <g>
      <circle
        cy="-7"
        r="5.5"
        fill={staff ? "#F2D6BB" : "#EAC5AD"}
        stroke="white"
        strokeWidth="1.5"
      />
      <path
        d="M-8,11 L-7,1 Q0,-5 7,1 L8,11 Z"
        fill={color}
        stroke="white"
        strokeWidth="1.4"
      />
      {staff && (
        <rect x="-2.5" y="2" width="5" height="4" rx="1" fill="white" />
      )}
      {pet && (
        <g transform="translate(18,7)">
          <ellipse rx="8" ry="5" fill="#B98255" stroke="white" />
          <circle cx="7" cy="-3" r="4" fill="#C89670" />
          <path
            d="M4,-6 L4,-10 L8,-6 M-8,0 L-13,-4"
            fill="none"
            stroke="#9C6843"
            strokeWidth="2"
          />
          <circle cx="9" cy="-4" r="1" fill="#223047" />
        </g>
      )}
    </g>
  );
}
function Plant({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <rect x="-8" y="-5" width="16" height="16" rx="5" fill="#EDCEB7" />
      <circle cy="-6" r="12" fill="#87B69D" />
      <circle cx="-7" cy="-9" r="7" fill="#A8CEB8" />
    </g>
  );
}
export function OperationsLayout({
  result,
  config,
  minute,
  animate,
  selected,
  onSelect,
}: {
  result?: SimResult;
  config?: SimConfig | null;
  minute: number;
  animate: boolean;
  selected?: number | null;
  onSelect?: (id: number) => void;
}) {
  const uid = useId().replace(/:/g, "");
  const floor = result ? currentFloor(result, minute) : null;
  const capacity = floorConfig(result?.config ?? config);
  const frame = floor?.frame;
  const active = floor?.activeEvents ?? [];
  const serviceStations = Math.max(capacity.stations, frame?.stations ?? 0),
    cafeStations = Math.max(capacity.cafeStations, frame?.cafeStations ?? 0);
  const bayCount = Math.min(6, Math.max(3, serviceStations));
  const bayWidth = 610 / bayCount;
  const bayCenter = (slot: number): Point => [
    325 + bayWidth * (slot % bayCount) + bayWidth / 2,
    240,
  ];
  const cafeCenter = (slot: number): Point => [
    405 + (slot % 3) * 160,
    475 + Math.floor((slot % 6) / 3) * 72,
  ];
  const queuePosition = (slot: number): Point => [
    70 + (slot % 5) * 39,
    312 + Math.floor(slot / 5) * 34,
  ];
  const visits = floor?.visits ?? [];
  const visible = visits.filter(
    (v) =>
      v.state !== "scheduled" &&
      (v.state !== "completed" || minute - (v.customer.completed ?? 0) < 1.4) &&
      (v.state !== "lost" || minute - (v.customer.lostAt ?? 0) < 1.4),
  );
  const waiting = floor?.queue ?? [];
  const isClosed = (sector: string) =>
    active.some(
      (e) =>
        e.effect === "closure" && (e.sector === sector || e.sector === "All"),
    );
  const statusColor = (unavailable: boolean) =>
    unavailable ? "#FEE2E2" : "#F4F9F8";
  const ranked: Record<string, number> = {};
  const sprites = visible.map((v) => {
    const p = v.customer,
      state = v.state,
      index = ranked[state] ?? 0;
    ranked[state] = index + 1;
    const slot = v.progress.slot ?? index;
    let position: Point = [95, 175];
    if (state === "reception")
      position = route(
        [0, 185],
        [90 + (index % 3) * 28, 195],
        minute - p.arrival,
      );
    if (state === "waiting") {
      const rank = waiting.findIndex((x) => x.customer.id === p.id);
      position = queuePosition(Math.max(0, rank));
      if (animate)
        position = route(
          [125, 208],
          position,
          minute - (p.checkInEnd ?? p.arrival),
        );
    }
    if (state === "service" || state === "cafe") {
      position = state === "service" ? bayCenter(slot) : cafeCenter(slot);
      if (animate)
        position = route(
          [290, 355],
          position,
          minute - (p.serviceStart ?? minute),
        );
    }
    if (state === "checkout") {
      position = [700 + (index % 5) * 35, 650 + Math.floor(index / 5) * 25];
      if (animate)
        position = route(
          p.sector === "Services" ? bayCenter(slot) : cafeCenter(slot),
          position,
          minute - (p.serviceEnd ?? minute),
        );
    }
    if (state === "payment") {
      position = [875, 595 + index * 25];
      if (animate)
        position = route(
          [760, 650],
          position,
          minute - (p.checkoutStart ?? minute),
        );
    }
    if (state === "completed" || state === "lost") {
      const when = p.completed ?? p.lostAt ?? minute;
      position = route(
        state === "completed" ? [875, 615] : [230, 355],
        [1030, 690],
        minute - when,
      );
    }
    const overflow =
      (state === "waiting" && index >= 30) ||
      (state === "checkout" && index >= 15) ||
      (state === "service" && slot >= 6) ||
      (state === "cafe" && slot >= 6);
    return { v, position, overflow };
  });
  return (
    <div className="relative rounded-2xl border border-[#F2D5E4] bg-[#FBF8F7] overflow-hidden shadow-sm">
      <svg
        viewBox="0 0 1000 735"
        fontFamily="Inter, Arial, sans-serif"
        className="w-full"
        role="img"
        aria-label="Animated top-down Pet Cafe floor. Customers move from entrance to reception, queue, service, cashier and exit."
      >
        <defs>
          <pattern
            id={`tiles-${uid}`}
            width="32"
            height="32"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M32 0H0V32"
              fill="none"
              stroke="#E8DFDB"
              strokeWidth="0.65"
            />
          </pattern>
          <pattern
            id={`wood-${uid}`}
            width="18"
            height="64"
            patternUnits="userSpaceOnUse"
          >
            <rect width="18" height="64" fill="#F0DFCE" />
            <path d="M0 0V64 M0 32H18" stroke="#E4CEB9" strokeWidth="0.8" />
          </pattern>
        </defs>
        <rect width="1000" height="735" fill="#FBF8F7" />
        <rect
          x="24"
          y="75"
          width="951"
          height="636"
          rx="18"
          fill={`url(#tiles-${uid})`}
          stroke="#DCCDC7"
          strokeWidth="5"
        />
        <text x="40" y="34" fill="#223047" fontSize="17" fontWeight="750">
          HAPPY TAILS · OPERATIONS FLOOR
        </text>
        <text x="40" y="56" fill="#8D7D82" fontSize="11">
          {result
            ? `${result.config.name} · ${result.config.date}`
            : "Scenario ready · load analytics to populate your cafe"}
        </text>
        <rect
          x="32"
          y="98"
          width="258"
          height="148"
          rx="12"
          fill="#FFF0F7"
          stroke="#E6BDCF"
          strokeWidth="2"
        />
        <text x="48" y="120" fontSize="13" fontWeight="700" fill="#9B3A66">
          RECEPTION
        </text>
        <rect x="49" y="141" width="141" height="30" rx="8" fill="#DFC2B4" />
        <rect x="65" y="146" width="33" height="17" rx="4" fill="#635565" />
        <text x="52" y="225" fontSize="10" fill="#967880">
          CHECK-IN · ENTRY →
        </text>
        <rect x="19" y="170" width="10" height="49" fill="#FBF8F7" />
        <path d="M25 170L64 194" stroke="#D2A2B5" strokeWidth="2" />
        <rect
          x="32"
          y="266"
          width="258"
          height="248"
          rx="12"
          fill="#F7F1F5"
          stroke={waiting.length ? "#F53799" : "#DDCBD5"}
          strokeWidth="2"
        />
        <text x="49" y="289" fontSize="13" fontWeight="700" fill="#765D6E">
          WAITING LOUNGE
        </text>
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <rect
              x={50 + i * 44}
              y="470"
              width="32"
              height="23"
              rx="6"
              fill="#D6C5D5"
            />
            <rect
              x={48 + i * 44}
              y="465"
              width="36"
              height="8"
              rx="3"
              fill="#B8A1BB"
            />
          </g>
        ))}
        <text
          x="48"
          y="444"
          fontSize="11"
          fill={waiting.length ? "#B52D6A" : "#8C7C8B"}
        >
          {waiting.length
            ? `${waiting.length} visits · ${waiting.reduce((n, v) => n + v.customer.pets, 0)} pets in queue`
            : "No queue · arrivals flow through check-in"}
        </text>
        {waiting.length > 30 && (
          <text x="48" y="424" fontSize="11" fontWeight="700" fill="#B52D6A">
            +{waiting.length - 30} visits in extended queue
          </text>
        )}
        <rect
          x="314"
          y="98"
          width="631"
          height="243"
          rx="14"
          fill="#ECF5F3"
          stroke="#C1D8D0"
          strokeWidth="2"
        />
        <text x="332" y="121" fontSize="13" fontWeight="700" fill="#476E64">
          PET SERVICES
        </text>
        <text x="928" y="121" textAnchor="end" fontSize="10" fill="#6B8B83">
          {frame?.serviceStaff ?? capacity.staff} staff ·{" "}
          {frame?.stations ?? capacity.stations} available stations
        </text>
        {Array.from({ length: bayCount }, (_, slot) => {
          const x = 325 + slot * bayWidth;
          const visit = visits.find(
            (v) =>
              v.state === "service" &&
              (v.progress.slot ??
                visits.filter((k) => k.state === "service").indexOf(v)) ===
                slot,
          );
          const unavailable =
            isClosed("Services") ||
            slot >= (frame?.stations ?? capacity.stations) ||
            slot >= (frame?.serviceStaff ?? capacity.staff);
          const paused = visit && !visit.progress.working;
          const service = result?.config.services.find(
            (s) => s.id === visit?.customer.serviceId,
          );
          return (
            <g key={slot}>
              <rect
                x={x + 3}
                y="142"
                width={bayWidth - 10}
                height="184"
                rx="10"
                fill={statusColor(unavailable)}
                stroke={unavailable ? "#FCA5A5" : "#C6D9D3"}
              />
              <text
                x={x + 12}
                y="161"
                fontSize="10"
                fontWeight="700"
                fill="#476E64"
              >
                BAY {slot + 1}
              </text>
              <circle
                cx={x + bayWidth - 25}
                cy="158"
                r="4"
                fill={unavailable ? "#EF4444" : visit ? "#F53799" : "#55A58A"}
              />
              <rect
                x={x + bayWidth / 2 - 27}
                y="190"
                width="62"
                height="58"
                rx="9"
                fill={unavailable ? "#EDC5C5" : "#D9E8E2"}
                stroke="#ADCCC0"
              />
              <path
                d={`M${x + bayWidth / 2 - 15} 220h37`}
                stroke="#BDD5CA"
                strokeWidth="2"
              />
              <text
                x={x + 12}
                y="278"
                fontSize="9"
                fill={unavailable ? "#BD4444" : "#688B7E"}
              >
                {unavailable
                  ? paused
                    ? "SERVICE PAUSED"
                    : "UNAVAILABLE"
                  : visit
                    ? `VISIT #${visit.customer.id}`
                    : "AVAILABLE"}
              </text>
              {visit && (
                <>
                  <text x={x + 12} y="293" fontSize="8.5" fill="#526C63">
                    {(service?.name ?? "Pet service").slice(
                      0,
                      Math.floor(bayWidth / 5.4),
                    )}
                  </text>
                  <rect
                    x={x + 12}
                    y="302"
                    width={bayWidth - 34}
                    height="5"
                    rx="2.5"
                    fill="#E7D6DF"
                  />
                  <rect
                    x={x + 12}
                    y="302"
                    width={
                      ((bayWidth - 34) * (visit.progress.percent ?? 0)) / 100
                    }
                    height="5"
                    rx="2.5"
                    fill={paused ? "#E6A241" : "#F53799"}
                  />
                  <text x={x + 12} y="319" fontSize="8.5" fill="#7C6974">
                    {visit.progress.percent === null
                      ? "Legacy lifecycle"
                      : `${Math.floor(visit.progress.percent)}% · ${Math.ceil(visit.progress.remaining ?? 0)} work min${paused ? " · paused" : ""}`}
                  </text>
                </>
              )}
              {(frame?.serviceStaff ?? capacity.staff) > slot && (
                <g
                  transform={`translate(${x + bayWidth / 2 + 35},${visit && !unavailable ? 228 : 182})`}
                  style={{
                    transition: animate ? "transform 500ms ease" : "none",
                  }}
                >
                  <Avatar staff color={unavailable ? "#BAA4A4" : "#06A7B9"} />
                </g>
              )}
            </g>
          );
        })}
        {serviceStations > 6 && (
          <text x="930" y="356" textAnchor="end" fontSize="10" fill="#765D6E">
            +{serviceStations - 6} additional stations included in analytics
          </text>
        )}
        <text x="350" y="371" fontSize="10" letterSpacing="3" fill="#B8A4AA">
          CIRCULATION / SERVICE ROUTE
        </text>
        <rect
          x="314"
          y="389"
          width="485"
          height="200"
          rx="14"
          fill={`url(#wood-${uid})`}
          stroke={isClosed("Cafe") ? "#EF4444" : "#D7BEA3"}
          strokeWidth="2"
        />
        <text x="332" y="413" fontSize="13" fontWeight="700" fill="#866647">
          PET CAFE
        </text>
        <text x="780" y="413" textAnchor="end" fontSize="10" fill="#987D60">
          {frame?.cafeStaff ?? capacity.cafeStaff} staff ·{" "}
          {frame?.cafeStations ?? cafeStations} service slots
        </text>
        {Array.from(
          { length: Math.min(6, Math.max(3, cafeStations)) },
          (_, slot) => {
            const [x, y] = cafeCenter(slot),
              unavailable =
                isClosed("Cafe") ||
                slot >= (frame?.cafeStations ?? capacity.cafeStations) ||
                slot >= (frame?.cafeStaff ?? capacity.cafeStaff);
            const visit = visits.find(
              (v) =>
                v.state === "cafe" &&
                (v.progress.slot ??
                  visits.filter((k) => k.state === "cafe").indexOf(v)) === slot,
            );
            return (
              <g key={slot}>
                <circle
                  cx={x}
                  cy={y}
                  r="26"
                  fill={unavailable ? "#E4C6C0" : "#FCF6EC"}
                  stroke="#BD9C7A"
                  strokeWidth="2"
                />
                <rect
                  x={x - 10}
                  y={y - 35}
                  width="20"
                  height="10"
                  rx="4"
                  fill="#B99577"
                />
                <rect
                  x={x - 10}
                  y={y + 26}
                  width="20"
                  height="10"
                  rx="4"
                  fill="#B99577"
                />
                <text x={x - 3} y={y + 3} fontSize="12" fill="#A98665">
                  ☕
                </text>
                {visit && (
                  <>
                    <rect
                      x={x - 30}
                      y={y + 40}
                      width="60"
                      height="4"
                      rx="2"
                      fill="#DCC9BD"
                    />
                    <rect
                      x={x - 30}
                      y={y + 40}
                      width={(60 * (visit.progress.percent ?? 0)) / 100}
                      height="4"
                      rx="2"
                      fill="#8B5CF6"
                    />
                  </>
                )}
                {slot < (frame?.cafeStaff ?? capacity.cafeStaff) && (
                  <g transform={`translate(${x + 42},${y - 5})`}>
                    <Avatar staff color="#8B5CF6" />
                  </g>
                )}
                {unavailable && (
                  <text
                    x={x}
                    y={y - 18}
                    fontSize="7"
                    textAnchor="middle"
                    fill="#BA4B4B"
                  >
                    UNAVAILABLE
                  </text>
                )}
              </g>
            );
          },
        )}
        <rect
          x="819"
          y="389"
          width="126"
          height="126"
          rx="12"
          fill="#F0EFF7"
          stroke="#D0CBDF"
        />
        <text x="830" y="412" fontSize="11" fontWeight="700" fill="#776C93">
          SUPPLIES
        </text>
        <rect x="835" y="427" width="91" height="27" rx="5" fill="#D8C9BB" />
        <path d="M866 427v27 M897 427v27" stroke="#BCA694" />
        <text x="831" y="476" fontSize="9" fill="#776C93">
          Service stock:{" "}
          {frame?.metrics.serviceStock ?? config?.serviceInventory ?? "—"}
        </text>
        <text x="831" y="492" fontSize="9" fill="#776C93">
          Cafe stock: {frame?.metrics.cafeStock ?? config?.cafeInventory ?? "—"}
        </text>
        <rect
          x="32"
          y="536"
          width="258"
          height="164"
          rx="12"
          fill="#F1F4F2"
          stroke="#CCD8D0"
        />
        <text x="49" y="560" fontSize="12" fontWeight="700" fill="#708277">
          STAFF / STOCK ROOM
        </text>
        <rect x="48" y="580" width="112" height="36" rx="5" fill="#C8D3CA" />
        <rect x="184" y="578" width="74" height="55" rx="8" fill="#E1D7C6" />
        <Plant x={65} y={668} />
        <Plant x={265} y={659} />
        <rect
          x="819"
          y="538"
          width="126"
          height="118"
          rx="12"
          fill={isClosed("All") ? "#FEE2E2" : "#FFF0F7"}
          stroke="#E1BAD0"
        />
        <text x="831" y="561" fontSize="11" fontWeight="700" fill="#9B3A66">
          CASHIER
        </text>
        <rect x="836" y="572" width="92" height="22" rx="4" fill="#D9BACB" />
        <rect x="898" y="575" width="14" height="11" rx="2" fill="#5B4E68" />
        {(frame?.cashiers ?? capacity.cashiers) > 0 && (
          <g transform="translate(910,614)">
            <Avatar staff color="#DAA141" />
          </g>
        )}
        <text x="347" y="667" fontSize="10" letterSpacing="2" fill="#B49CA7">
          CHECKOUT QUEUE →
        </text>
        <text x="874" y="693" fontSize="10" fontWeight="700" fill="#9B3A66">
          EXIT →
        </text>
        <rect x="972" y="670" width="9" height="33" fill="#FBF8F7" />
        <Plant x={960} y={103} />
        <Plant x={787} y={619} />
        {sprites
          .filter((s) => !s.overflow)
          .map(({ v, position }) => (
            <g
              key={v.customer.id}
              transform={`translate(${position[0]},${position[1]})`}
              onClick={() => onSelect?.(v.customer.id)}
              role="button"
              tabIndex={0}
              aria-label={`Inspect visit ${v.customer.id}, ${v.state}`}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect?.(v.customer.id);
                }
              }}
              style={{ cursor: "pointer" }}
            >
              {selected === v.customer.id && (
                <circle
                  r="22"
                  fill="none"
                  stroke="#F53799"
                  strokeWidth="2"
                  strokeDasharray="3 3"
                />
              )}
              <Avatar
                pet={v.customer.pets > 0}
                color={
                  v.state === "lost"
                    ? "#A6A0A8"
                    : v.customer.sector === "Cafe"
                      ? "#8B5CF6"
                      : "#F53799"
                }
              />
              <title>{`Visit #${v.customer.id} · ${v.state} · ${result?.config.services.find((s) => s.id === v.customer.serviceId)?.name ?? "Service visit"}`}</title>
            </g>
          ))}
        {!result && (
          <g>
            <rect
              x="320"
              y="620"
              width="360"
              height="44"
              rx="12"
              fill="white"
              stroke="#F2D5E4"
            />
            <text
              x="500"
              y="638"
              textAnchor="middle"
              fontSize="12"
              fontWeight="700"
              fill="#9B3A66"
            >
              READY TO OPEN
            </text>
            <text
              x="500"
              y="653"
              textAnchor="middle"
              fontSize="9"
              fill="#987F8C"
            >
              Configure your scenario, then start the simulation
            </text>
          </g>
        )}
      </svg>
      {active.length > 0 && (
        <div className="absolute top-16 right-4 max-w-[45%] space-y-1 pointer-events-none">
          {active.slice(-3).map((e) => (
            <div
              key={e.id}
              className={`rounded-lg border px-3 py-1.5 text-[11px] font-semibold shadow-sm ${["closure", "stations", "staff"].includes(e.effect) && e.value <= 1 ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}
            >
              {e.label} ·{" "}
              {Math.max(0, Math.ceil(e.start + e.duration - minute))} min
            </div>
          ))}
        </div>
      )}
      <div className="border-t border-[#F2D5E4] bg-white/90 px-4 py-2 flex flex-wrap gap-3 text-[10px] text-slate-500">
        <span>● Pink: customers + pets</span>
        <span className="text-violet-600">● Cafe customers</span>
        <span className="text-cyan-600">● Service staff</span>
        <span>Click a visit to inspect</span>
        <span className="ml-auto">
          Illustrative floor · state-driven movement
        </span>
      </div>
    </div>
  );
}
