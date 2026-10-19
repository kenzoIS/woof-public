import { useState, useEffect } from "react";
import { WifiOff, Wifi, X } from "lucide-react";
import { Button } from "./ui/button";

export function ConnectionBanner() {
  const [isOnline, setIsOnline] = useState(true);
  const [showBanner, setShowBanner] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (wasOffline) {
        setShowBanner(true);
        setTimeout(() => setShowBanner(false), 5000);
        setWasOffline(false);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowBanner(true);
      setWasOffline(true);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Simulate connection loss for demo (triggered by custom event)
    const handleSimulateOffline = () => {
      setIsOnline(false);
      setShowBanner(true);
      setWasOffline(true);

      // Auto-reconnect after 5 seconds
      setTimeout(() => {
        setIsOnline(true);
        setShowBanner(true);
        setTimeout(() => setShowBanner(false), 5000);
        setWasOffline(false);
      }, 5000);
    };

    window.addEventListener("simulateOffline", handleSimulateOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("simulateOffline", handleSimulateOffline);
    };
  }, [wasOffline]);

  if (!showBanner) return null;

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 ${
        isOnline ? "bg-green-500" : "bg-red-500"
      } text-white py-3 px-6 flex items-center justify-between shadow-lg transition-all`}
    >
      <div className="flex items-center gap-3">
        {isOnline ? (
          <Wifi className="w-5 h-5" />
        ) : (
          <WifiOff className="w-5 h-5 animate-pulse" />
        )}
        <span className="font-semibold">
          {isOnline
            ? "Connection restored! Your data is now syncing."
            : "Connection lost. Please check your internet connection."}
        </span>
      </div>
      <Button
        onClick={() => setShowBanner(false)}
        variant="ghost"
        size="sm"
        className="text-white hover:bg-white/20"
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
