import { Plus, TrendingUp, Target } from "lucide-react";
import { useState } from "react";
import { ImageWithFallback } from "./figma/ImageWithFallback";

interface BundleCreatorProps {
  product1: {
    name: string;
    image: string;
    price: number;
  };
  product2: {
    name: string;
    image: string;
    price: number;
  };
  conversionLift: number;
  confidenceScore: number;
  suggestedPrice: number;
}

export function PromoBundleCard({
  product1,
  product2,
  conversionLift,
  confidenceScore,
  suggestedPrice,
}: BundleCreatorProps) {
  const [bundlePrice, setBundlePrice] = useState(suggestedPrice);

  const regularPrice = product1.price + product2.price;
  const savings = regularPrice - bundlePrice;
  const savingsPercent = Math.round((savings / regularPrice) * 100);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg transition-shadow p-6">
      {/* Bundle Products Display */}
      <div className="flex items-center justify-center gap-4 mb-6">
        {/* Product 1 */}
        <div className="flex flex-col items-center">
          <div className="w-24 h-24 bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl border-2 border-slate-200 flex items-center justify-center overflow-hidden shadow-sm">
            <ImageWithFallback
              src={product1.image}
              alt={product1.name}
              className="w-full h-full object-cover"
            />
          </div>
          <p className="text-xs font-medium text-slate-700 mt-2 text-center max-w-[100px] truncate">
            {product1.name}
          </p>
          <p className="text-xs text-slate-500">₱{product1.price}</p>
        </div>

        {/* Plus Icon */}
        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center shadow-md">
          <Plus className="w-5 h-5 text-white" />
        </div>

        {/* Product 2 */}
        <div className="flex flex-col items-center">
          <div className="w-24 h-24 bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl border-2 border-slate-200 flex items-center justify-center overflow-hidden shadow-sm">
            <ImageWithFallback
              src={product2.image}
              alt={product2.name}
              className="w-full h-full object-cover"
            />
          </div>
          <p className="text-xs font-medium text-slate-700 mt-2 text-center max-w-[100px] truncate">
            {product2.name}
          </p>
          <p className="text-xs text-slate-500">₱{product2.price}</p>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-green-600" />
            <span className="text-xs text-slate-600">Expected Lift</span>
          </div>
          <p className="text-xl font-bold text-green-600">+{conversionLift}%</p>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-200 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-4 h-4 text-blue-600" />
            <span className="text-xs text-slate-600">Confidence</span>
          </div>
          <p className="text-xl font-bold text-blue-600">{confidenceScore}%</p>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent mb-6"></div>

      {/* Price Input */}
      <div>
        <label className="text-sm font-medium text-slate-700 mb-2 block">Bundle Price (₱)</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium">₱</span>
          <input
            type="number"
            value={bundlePrice}
            onChange={(e) => setBundlePrice(Number(e.target.value))}
            className="w-full pl-8 pr-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
        </div>
        <div className="flex items-center justify-between mt-2 text-xs">
          <span className="text-slate-500">Regular: ₱{regularPrice}</span>
        </div>
      </div>
    </div>
  );
}