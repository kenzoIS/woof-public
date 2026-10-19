import { AlertTriangle, WifiOff, Database, Shield, Clock, XCircle, RefreshCw } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";

export type ErrorType =
  | "connection_lost"
  | "api_timeout"
  | "data_sync_failed"
  | "data_corruption"
  | "permission_denied"
  | "session_expired"
  | "model_failed"
  | "export_failed"
  | "payment_failed"
  | "invalid_action"
  | "concurrent_modification"
  | "rate_limit";

interface ErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  errorType: ErrorType;
  onRetry?: () => void;
  onViewDetails?: () => void;
  onContactSupport?: () => void;
  onRefresh?: () => void;
}

const errorConfig = {
  connection_lost: {
    icon: WifiOff,
    title: "Connection Lost",
    description: "Unable to connect to the server. Please check your internet connection and try again.",
    color: "#F59E0B",
    actionText: "Retry Connection",
    showCancel: true,
  },
  api_timeout: {
    icon: Clock,
    title: "Request Timeout",
    description: "The server took too long to respond. This might be due to heavy traffic or network issues.",
    color: "#F59E0B",
    actionText: "Try Again",
    showCancel: true,
  },
  data_sync_failed: {
    icon: Database,
    title: "Data Sync Failed",
    description: "Failed to synchronize data from POS, Shopee, and Tiktok channels. Your local data may be outdated.",
    color: "#EF4444",
    actionText: "Retry Sync",
    showCancel: true,
  },
  data_corruption: {
    icon: AlertTriangle,
    title: "Data Integrity Issue",
    description: "We detected inconsistencies in your data. Please contact support to resolve this issue.",
    color: "#DC2626",
    actionText: "Contact Support",
    showCancel: false,
  },
  permission_denied: {
    icon: Shield,
    title: "Access Denied",
    description: "You don't have permission to perform this action. Please contact your administrator.",
    color: "#EF4444",
    actionText: "OK",
    showCancel: false,
  },
  session_expired: {
    icon: Clock,
    title: "Session Expired",
    description: "Your session has expired due to inactivity. Please log in again to continue.",
    color: "#F59E0B",
    actionText: "Log In Again",
    showCancel: false,
  },
  model_failed: {
    icon: XCircle,
    title: "Model Training Failed",
    description: "Unable to retrain the AI model. This could be due to insufficient data or system resources.",
    color: "#EF4444",
    actionText: "View Details",
    showCancel: true,
  },
  export_failed: {
    icon: XCircle,
    title: "Export Failed",
    description: "Failed to generate and export the report. Please try again or select a smaller date range.",
    color: "#EF4444",
    actionText: "Retry Export",
    showCancel: true,
  },
  payment_failed: {
    icon: XCircle,
    title: "Payment Processing Error",
    description: "Unable to process payment from Shopee. Transaction has been rolled back.",
    color: "#DC2626",
    actionText: "Retry Payment",
    showCancel: true,
  },
  invalid_action: {
    icon: AlertTriangle,
    title: "Invalid Operation",
    description: "This action cannot be completed because the promotion is already active or has expired.",
    color: "#F59E0B",
    actionText: "OK",
    showCancel: false,
  },
  concurrent_modification: {
    icon: RefreshCw,
    title: "Concurrent Modification Detected",
    description: "Another user has modified this data. Please refresh and try again.",
    color: "#F59E0B",
    actionText: "Refresh Data",
    showCancel: true,
  },
  rate_limit: {
    icon: Clock,
    title: "Too Many Requests",
    description: "You've exceeded the rate limit. Please wait a moment before trying again.",
    color: "#F59E0B",
    actionText: "OK",
    showCancel: false,
  },
};

export function ErrorModal({ isOpen, onClose, errorType, onRetry, onViewDetails, onContactSupport, onRefresh }: ErrorModalProps) {
  const config = errorConfig[errorType];
  const Icon = config.icon;

  const handleAction = () => {
    // Handle specific actions based on error type
    if (errorType === "model_failed" && onViewDetails) {
      onViewDetails();
      return;
    }

    if (errorType === "data_corruption" && onContactSupport) {
      onContactSupport();
      onClose();
      return;
    }

    if (errorType === "concurrent_modification" && onRefresh) {
      onRefresh();
      onClose();
      return;
    }

    if (onRetry) {
      onRetry();
    }
    onClose();
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-4 mb-2">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ backgroundColor: `${config.color}20` }}
            >
              <Icon className="w-6 h-6" style={{ color: config.color }} />
            </div>
            <AlertDialogTitle className="text-xl">{config.title}</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-base pt-2">
            {config.description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {config.showCancel && (
            <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
          )}
          <AlertDialogAction
            onClick={handleAction}
            className="bg-[#F53799] hover:bg-[#D42A7D]"
          >
            {config.actionText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
