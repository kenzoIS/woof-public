import { Sparkles, Zap } from "lucide-react";

interface MerchandisingPanelProps {
  className?: string;
}

export function SpatialMerchandisingPanel({ className = "" }: MerchandisingPanelProps) {
  const recommendations = [
    {
      pairing: "Dog Shampoo + Dog Toothbrushes",
      advice: "Position these items in the same aisle or on adjacent end-caps to maximize impulse purchases.",
      synergyScore: 92,
      color: "cyan"
    },
    {
      pairing: "Pet Treats + Chew Toys",
      advice: "Position these items in the same aisle or on adjacent end-caps to maximize impulse purchases.",
      synergyScore: 87,
      color: "purple"
    },
    {
      pairing: "Dog Collar + Leash",
      advice: "Position these items in the same aisle or on adjacent end-caps to maximize impulse purchases.",
      synergyScore: 94,
      color: "cyan"
    },
    {
      pairing: "Food Bowls + Treat Containers",
      advice: "Position these items in the same aisle or on adjacent end-caps to maximize impulse purchases.",
      synergyScore: 78,
      color: "purple"
    },
    {
      pairing: "Pet Grooming Wipes + Paw Balm",
      advice: "Position these items in the same aisle or on adjacent end-caps to maximize impulse purchases.",
      synergyScore: 85,
      color: "cyan"
    },
    {
      pairing: "Dog Toys + Training Treats",
      advice: "Position these items in the same aisle or on adjacent end-caps to maximize impulse purchases.",
      synergyScore: 89,
      color: "purple"
    }
  ];

  return (
    <div className={`relative ${className}`}>
      {/* Background with glassmorphism effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0F172A] via-slate-900 to-[#0F172A] rounded-2xl"></div>
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-purple-500/5 to-pink-500/5 rounded-2xl backdrop-blur-xl"></div>
      
      {/* Ambient glow effects */}
      <div className="absolute -top-20 -right-20 w-40 h-40 bg-cyan-500/20 rounded-full blur-3xl"></div>
      <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-purple-500/20 rounded-full blur-3xl"></div>

      {/* Content */}
      <div className="relative p-6 border border-cyan-500/20 rounded-2xl backdrop-blur-xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-cyan-500/20">
          <div className="p-2 bg-gradient-to-br from-cyan-500/30 to-purple-500/30 rounded-xl border border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.4)]">
            <Sparkles className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h3 className="font-bold text-white tracking-tight text-lg">Strategic Proximity Recommendations</h3>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">AI-Driven Merchandising Intelligence</p>
          </div>
        </div>

        {/* Recommendations Grid - Landscape Layout */}
        <div className="grid grid-cols-3 gap-4">
          {recommendations.map((rec, idx) => (
            <div
              key={idx}
              className="group relative"
            >
              {/* Card background */}
              <div className={`absolute inset-0 bg-gradient-to-br ${rec.color === "cyan" ? "from-cyan-500/10 to-cyan-600/5" : "from-purple-500/10 to-purple-600/5"} rounded-xl opacity-60 group-hover:opacity-90 transition-all duration-300`}></div>
              
              {/* Card content */}
              <div className={`relative p-4 border ${rec.color === "cyan" ? "border-cyan-500/30" : "border-purple-500/30"} rounded-xl backdrop-blur-sm h-full flex flex-col`}>
                {/* Strategic Pairing Header */}
                <div className="flex items-start gap-2 mb-3">
                  <Zap className={`w-4 h-4 mt-0.5 flex-shrink-0 ${rec.color === "cyan" ? "text-cyan-400" : "text-purple-400"}`} />
                  <div className="flex-1">
                    <div className="text-[9px] uppercase tracking-wider font-mono text-slate-500 mb-1">
                      Strategic Pairing
                    </div>
                    <div className="text-sm font-semibold text-white tracking-tight leading-tight">
                      {rec.pairing}
                    </div>
                  </div>
                </div>

                {/* Merchandising Advice */}
                <div className="mb-4 flex-grow">
                  <div className="text-[9px] uppercase tracking-wider font-mono text-slate-500 mb-1.5">
                    Merchandising Advice
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {rec.advice}
                  </p>
                </div>

                {/* Synergy Score */}
                <div className="mt-auto">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[9px] uppercase tracking-wider font-mono text-slate-500">
                      Synergy Score
                    </span>
                    <span className={`text-xs font-bold font-mono ${rec.color === "cyan" ? "text-cyan-400" : "text-purple-400"}`}>
                      {rec.synergyScore}%
                    </span>
                  </div>
                  
                  {/* Progress bar */}
                  <div className="relative h-2 bg-slate-800/80 rounded-full overflow-hidden border border-slate-700/50">
                    <div
                      className={`absolute inset-y-0 left-0 bg-gradient-to-r ${rec.color === "cyan" ? "from-cyan-500 to-cyan-400" : "from-purple-500 to-purple-400"} rounded-full transition-all duration-700 ease-out`}
                      style={{ width: `${rec.synergyScore}%` }}
                    >
                      {/* Animated shine effect */}
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse"></div>
                      
                      {/* Glow effect */}
                      <div className={`absolute inset-0 ${rec.color === "cyan" ? "shadow-[0_0_12px_rgba(6,182,212,0.6)]" : "shadow-[0_0_12px_rgba(168,85,247,0.6)]"}`}></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer insight */}
        <div className="mt-6 p-4 bg-slate-900/80 border border-cyan-500/20 rounded-xl backdrop-blur-sm">
          <div className="flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-slate-300 leading-relaxed">
              <span className="text-cyan-400 font-semibold font-mono uppercase tracking-wider text-[10px]">Predictive Insight:</span>
              <span className="text-slate-400"> High-synergy pairings (85%+) demonstrate strong correlation in purchase patterns. Strategic proximity placement can increase basket size by 18-32%.</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}