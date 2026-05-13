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

// Vivid celebratory toast — used by the login notifications for new MJA
// contact crossings. Yellow→orange gradient with a heavier border so the
// user can't miss it. Sonner's default success/info palette is too quiet
// for the "you have new stuff" moment.
export const showHighlight = (message: string, options?: { description?: string; duration?: number; action?: { label: string; onClick: () => void } }) => {
  toast(message, {
    description: options?.description,
    duration: options?.duration ?? 14000,
    action: options?.action,
    style: {
      background: 'linear-gradient(135deg, #FFC233 0%, #F97316 100%)',
      color: '#1a1a1a',
      border: '2px solid #C2410C',
      fontWeight: 600,
    },
  });
};

// Distinct blue-purple notification toast — pairs with showHighlight so
// the user can tell the two login notifications apart at a glance.
export const showNotif = (message: string, options?: { description?: string; duration?: number; action?: { label: string; onClick: () => void } }) => {
  toast(message, {
    description: options?.description,
    duration: options?.duration ?? 14000,
    action: options?.action,
    style: {
      background: 'linear-gradient(135deg, #3B82F6 0%, #6D28D9 100%)',
      color: '#ffffff',
      border: '2px solid #1E40AF',
      fontWeight: 600,
    },
  });
};

// Sonner's toast.loading() returns string | number depending on internal
// id generation, so dismissToast must accept either. The narrower string
// signature triggered TS2345 in pages that store the loading toast id.
export const dismissToast = (toastId: string | number) => {
  toast.dismiss(toastId);
};
