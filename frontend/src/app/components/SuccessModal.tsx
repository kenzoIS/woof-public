import { CheckCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";

export type SuccessType =
  | "export_success"
  | "model_retrain_success"
  | "data_sync_success"
  | "payment_success"
  | "connection_restored";

interface SuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  successType: SuccessType;
}

const successConfig = {
  export_success: {
    title: "Export Successful",
    description: "Your report has been successfully generated and exported.",
  },
  model_retrain_success: {
    title: "Model Retrained Successfully",
    description: "The AI model has been retrained with the latest data and is now active.",
  },
  data_sync_success: {
    title: "Data Synced Successfully",
    description: "All data from POS, Shopee, and Tiktok channels has been synchronized.",
  },
  payment_success: {
    title: "Payment Processed",
    description: "Payment transaction has been successfully processed.",
  },
  connection_restored: {
    title: "Connection Restored",
    description: "Connection to the server has been successfully restored.",
  },
};

export function SuccessModal({ isOpen, onClose, successType }: SuccessModalProps) {
  const config = successConfig[successType];

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-4 mb-2">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "#10B98120" }}
            >
              <CheckCircle className="w-6 h-6" style={{ color: "#10B981" }} />
            </div>
            <AlertDialogTitle className="text-xl">{config.title}</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-base pt-2">
            {config.description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction
            onClick={onClose}
            className="bg-[#10B981] hover:bg-[#059669]"
          >
            OK
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
