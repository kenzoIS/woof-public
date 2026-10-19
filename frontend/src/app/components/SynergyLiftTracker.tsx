import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp, Store, Globe } from "lucide-react";

const physicalData = [
  { week: "W1", lift: 12 },
  { week: "W2", lift: 18 },
  { week: "W3", lift: 15 },
  { week: "W4", lift: 22 },
  { week: "W5", lift: 28 },
  { week: "W6", lift: 24 },
];

const digitalData = [
  { week: "W1", conversion: 8 },
  { week: "W2", conversion: 14 },
  { week: "W3", conversion: 11 },
  { week: "W4", conversion: 17 },
  { week: "W5", conversion: 21 },
  { week: "W6", conversion: 20 },
];

export function SynergyLiftTracker() {
  const physicalAvg = Math.round(
    physicalData.reduce((sum, item) => sum + item.lift, 0) / physicalData.length
  );
  const digitalAvg = Math.round(
    digitalData.reduce((sum, item) => sum + item.conversion, 0) / digitalData.length
  );
  const difference = physicalAvg - digitalAvg;

  return (
    <div className="relative">
      {/* Blurred background container */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 to-white rounded-2xl opacity-70 backdrop-blur-sm"></div>
      <div className="absolute inset-0 bg-white/70 rounded-2xl backdrop-blur-md"></div>

      {/* Content */}
      <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-lg p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Synergy Lift Tracker</h3>
            <p className="text-sm text-slate-600">Online vs. Offline Performance Analysis</p>
          </div>
          <div className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
            Live Feedback Loop
          </div>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* Chart A: In-Store Impulse Lift */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <Store className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-900">In-Store Impulse Lift</h4>
                <p className="text-xs text-slate-500">Physical</p>
              </div>
            </div>

            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={physicalData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis 
                  dataKey="week" 
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  axisLine={{ stroke: '#e2e8f0' }}
                />
                <YAxis 
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  axisLine={{ stroke: '#e2e8f0' }}
                  label={{ value: '%', angle: 0, position: 'top', fill: '#64748b', fontSize: 12 }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '12px'
                  }}
                  formatter={(value: number) => [`${value}%`, 'Lift']}
                />
                <Bar 
                  dataKey="lift" 
                  fill="#10B981" 
                  radius={[8, 8, 0, 0]}
                  maxBarSize={40}
                />
              </BarChart>
            </ResponsiveContainer>

            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-slate-500">Avg. Performance</span>
              <div className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-emerald-600" />
                <span className="text-sm font-bold text-emerald-600">{physicalAvg}%</span>
              </div>
            </div>
          </div>

          {/* Chart B: Online Bundle Conversion */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Globe className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-900">Online Bundle Conversion</h4>
                <p className="text-xs text-slate-500">Digital</p>
              </div>
            </div>

            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={digitalData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis 
                  dataKey="week" 
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  axisLine={{ stroke: '#e2e8f0' }}
                />
                <YAxis 
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  axisLine={{ stroke: '#e2e8f0' }}
                  label={{ value: '%', angle: 0, position: 'top', fill: '#64748b', fontSize: 12 }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '12px'
                  }}
                  formatter={(value: number) => [`${value}%`, 'Conversion']}
                />
                <Bar 
                  dataKey="conversion" 
                  fill="#10B981" 
                  radius={[8, 8, 0, 0]}
                  maxBarSize={40}
                />
              </BarChart>
            </ResponsiveContainer>

            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-slate-500">Avg. Performance</span>
              <div className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-emerald-600" />
                <span className="text-sm font-bold text-emerald-600">{digitalAvg}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* AI Insight Summary */}
        <div className="woof-insight-band bg-gradient-to-r from-emerald-50 to-green-50 border-l-4 border-emerald-500 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-emerald-100 rounded-lg">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h5 className="text-sm font-semibold text-slate-900 mb-1">WOOF Insight</h5>
              <p className="text-sm text-slate-700">
                Physical placement outperformed digital bundles by <span className="font-bold text-emerald-600">{difference}%</span> this week. 
                Consider reallocating promotional budget to in-store merchandising for optimal ROI.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
