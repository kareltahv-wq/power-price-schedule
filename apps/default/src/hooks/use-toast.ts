import { isValidElement, type ReactNode } from 'react';
import { toast as sonnerToast } from 'sonner';

/**
 * Compatibility shim for the shadcn/ui `useToast` pattern.
 *
 * LLM-generated app code overwhelmingly reaches for shadcn/ui's toast API -
 * `const { toast } = useToast(); toast({ title, description, variant })` - but
 * this template's toast library is Sonner, whose call shape is
 * `toast(message, options)`. Passing the shadcn OPTIONS OBJECT straight through
 * as Sonner's `message` makes React try to render `{ title }` as a child and
 * throw React error #31 ("Objects are not valid as a React child"), crashing
 * the whole app on the first toast it fires (e.g. a contact-form success).
 *
 * So the shim bridges the CALL SHAPE too, not only the `useToast()` hook shape.
 * It accepts both forms and forwards to Sonner:
 *   toast("Saved")                                        -> sonner("Saved")
 *   toast(<Custom />)                                     -> sonner(<Custom />)
 *   toast({ title, description })                         -> sonner(title, { description })
 *   toast({ title, description, variant: "destructive" }) -> sonner.error(title, { description })
 *
 * Sonner's static helpers (success/error/promise/dismiss/…) are carried over,
 * so `toast.success("…")` and `toast.dismiss()` keep working. New code can
 * still `import { toast } from "sonner"` directly.
 */
type ShadcnToastOptions = {
  title?: ReactNode;
  description?: ReactNode;
  variant?: 'default' | 'destructive';
};

/**
 * A plain object that is not a React element is the shadcn options form - a
 * real Sonner message is a string, number, or React element, never a bare
 * object (rendering one is the exact React #31 crash this shim prevents).
 */
function isShadcnToastOptions(message: unknown): message is ShadcnToastOptions {
  return (
    typeof message === 'object' &&
    message != null &&
    !Array.isArray(message) &&
    !isValidElement(message)
  );
}

function toastShim(
  message: ReactNode | ShadcnToastOptions,
  data?: Parameters<typeof sonnerToast>[1],
): string | number {
  if (isShadcnToastOptions(message)) {
    const { title, description, variant } = message;
    const content = title ?? description ?? '';
    const options = title != null && description != null ? { description } : undefined;
    return variant === 'destructive'
      ? sonnerToast.error(content, options)
      : sonnerToast(content, options);
  }
  return sonnerToast(message, data);
}

// Carry over Sonner's static helpers (success/error/info/warning/loading/
// promise/custom/message/dismiss/getHistory/getToasts) so they keep working
// when called off the shimmed `toast`.
const toast = Object.assign(toastShim, sonnerToast);

export function useToast() {
  return {
    toast,
    dismiss: sonnerToast.dismiss,
  };
}

export { toast };
