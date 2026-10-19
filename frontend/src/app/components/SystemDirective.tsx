import { LineChart, Line, ResponsiveContainer } from "recharts";
import { Zap, TrendingDown, TrendingUp } from "lucide-react";

const footTrafficData = [
  { value: 85 },
  { value: 82 },
  { value: 78 },
  { value: 75 },
  { value: 72 },
  { value: 68 },
  { value: 65 },
  { value: 60 },
  { value: 55 },
  { value: 50 },
  { value: 45 },
  { value: 40 },
];

const attachmentRateData = [
  { value: 65 },
  { value: 67 },
  { value: 68 },
  { value: 72 },
  { value: 75 },
  { value: 78 },
  { value: 82 },
  { value: 84 },
  { value: 87 },
  { value: 88 },
  { value: 89 },
  { value: 90 },
];

export function SystemDirective() {
  return (
    <div className="max-w-5xl mx-auto">
      {/* System Directive Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg text-slate-900">System Directive</h2>
        </div>
        <p className="text-sm text-slate-500">
          AI-generated recommendation based on real-time analytics
        </p>
      </div>

      {/* Main Directive Card */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {/* Executive Choice Section */}
        <div className="p-8 border-b border-slate-200 bg-gradient-to-br from-white to-slate-50">
          <div className="mb-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide mb-2">
              Executive Choice
            </div>
            <h3 className="text-3xl text-slate-900 mb-3">
              ACTIVATE HAPPY HOUR PROMO
            </h3>
            <p className="text-slate-600">
              Deploy a coordinated promotion across cafe and grooming services to maximize revenue during the upcoming low-traffic period.
            </p>
          </div>

          {/* Promotion Details */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mt-6">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-slate-500 mb-1">Discount</div>
                <div className="text-slate-900 font-medium">25% Off Combos</div>
              </div>
              <div>
                <div className="text-slate-500 mb-1">Duration</div>
                <div className="text-slate-900 font-medium">2 Hours</div>
              </div>
              <div>
                <div className="text-slate-500 mb-1">Target Revenue</div>
                <div className="text-slate-900 font-medium">+PHP 2,400</div>
              </div>
            </div>
          </div>
        </div>

        {/* Logic Justification Section */}
        <div className="p-8">
          <div className="mb-6">
            <h4 className="text-sm text-slate-900 mb-4 uppercase tracking-wide">
              Logic Justification
            </h4>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-8">
            {/* Predicted Foot Traffic */}
            <div className="bg-red-50 border border-red-100 rounded-lg p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">
                    Predicted Foot Traffic
                  </div>
                  <div className="text-2xl text-slate-900">-47%</div>
                </div>
                <TrendingDown className="w-5 h-5 text-red-600" />
              </div>
              <div className="h-16">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={footTrafficData}>
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#dc2626"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="text-xs text-slate-500 mt-2">
                Next 2 hours vs. baseline
              </div>
            </div>

            {/* Cafe-Grooming Attachment Rate */}
            <div className="bg-green-50 border border-green-100 rounded-lg p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">
                    Cafe-Grooming Attachment Rate
                  </div>
                  <div className="text-2xl text-slate-900">89%</div>
                </div>
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <div className="h-16">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={attachmentRateData}>
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#16a34a"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="text-xs text-slate-500 mt-2">
                Last 7 days trend
              </div>
            </div>
          </div>

          {/* Additional Insights */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-8">
            <div className="text-xs text-slate-500 uppercase tracking-wide mb-2">
              Key Insights
            </div>
            <ul className="space-y-2 text-sm text-slate-600">
              <li className="flex items-start gap-2">
                <span className="text-blue-600 mt-0.5">•</span>
                <span>Historical data shows 3.2x conversion rate on combo promotions during low-traffic periods</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 mt-0.5">•</span>
                <span>High cafe-grooming attachment suggests strong cross-service demand</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 mt-0.5">•</span>
                <span>Staff availability optimal for coordinated promotion (6 employees on shift)</span>
              </li>
            </ul>
          </div>

          {/* Execute Button */}
          <button className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 px-6 rounded-lg transition-colors shadow-sm text-lg font-medium">
            Execute & Notify Staff
          </button>
        </div>
      </div>
    </div>
  );
}