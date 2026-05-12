import { toast } from "sonner";

export const showSuccess = (message: string) => {
  toast.success(message);
};

export const showError = (message: string) => {
  toast.error(message);
};

export const showInfo = (message: string, options?: { duration?: number; action?: { label: string; onClick: () => void } }) => {
  toast.info(message, { duration: options?.duration ?? 8000, action: options?.action });
};

export const showLoading = (message: string) => {
  return toast.loading(message);
};

// Sonner's toast.loading() returns string | number depending on internal
// id generation, so dismissToast must accept either. The narrower string
// signature triggered TS2345 in pages that store the loading toast id.
export const dismissToast = (toastId: string | number) => {
  toast.dismiss(toastId);
};
