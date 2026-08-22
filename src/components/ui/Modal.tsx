import { GripHorizontal, X } from 'lucide-react';
import { type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useId, useRef } from 'react';
import { ZPortal } from './ZPortal';
import { motion, AnimatePresence, useDragControls, useMotionValue } from 'framer-motion';
import { cn } from '../../lib/utils';
import { Button } from './Button';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const DRAG_BLOCK_SELECTOR = 'button, a, input, textarea, select, [role="button"], [data-no-modal-drag="true"]';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  width?: string;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  titleClassName?: string;
  closeOnEsc?: boolean;
  closeOnOverlayClick?: boolean;
  showCloseButton?: boolean;
  /** When true, only in-content actions dismiss the modal (no Escape, overlay, or header X). */
  explicitDismissOnly?: boolean;
  /** Optional custom z-index class for the modal wrapper and overlay (defaults to 'z-[9999]') */
  zIndexClassName?: string;
}

/**
 * Render a centered modal dialog into the ZPortal target (defaults to 'modal-portal-root').
 *
 * @param isOpen - Whether the modal is visible.
 * @param onClose - Callback invoked to close the modal (overlay click, Escape key, or close button).
 * @param title - Header title text displayed at the top of the modal.
 * @param subtitle - Optional secondary text shown under the title in the modal header.
 * @param children - Modal content.
 * @param width - Tailwind width utility applied to the dialog container (default 'max-w-md').
 * @param className - Additional classes merged into the dialog container.
 * @param headerClassName - Optional classes applied to the modal header container.
 * @param contentClassName - Optional classes applied to the modal body/content container.
 * @param titleClassName - Optional classes applied to the modal title text.
 * @param closeOnEsc - Whether pressing Escape closes the modal (default true).
 * @param closeOnOverlayClick - Whether clicking the overlay closes the modal (default true).
 * @param showCloseButton - Whether to render the close button in the header (default true).
 * @param explicitDismissOnly - When true, only in-content actions dismiss the modal (Escape, overlay, and header X are disabled).
 * @returns The modal element mounted into the ZPortal target when `isOpen` is true, otherwise null.
 */
export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  width = 'max-w-md',
  className,
  headerClassName,
  contentClassName,
  titleClassName,
  closeOnEsc = true,
  closeOnOverlayClick = true,
  showCloseButton = true,
  explicitDismissOnly = false,
  zIndexClassName,
}: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const dragConstraintsRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const effectiveCloseOnEsc = explicitDismissOnly ? false : closeOnEsc;
  const effectiveCloseOnOverlayClick = explicitDismissOnly ? false : closeOnOverlayClick;
  const effectiveShowCloseButton = explicitDismissOnly
    ? false
    : (closeOnEsc || closeOnOverlayClick || showCloseButton ? showCloseButton : true);

  useEffect(() => {
    if (
      import.meta.env.DEV
      && !explicitDismissOnly
      && !closeOnEsc
      && !closeOnOverlayClick
      && !showCloseButton
    ) {
      console.warn(
        '[Modal] closeOnEsc, closeOnOverlayClick, and showCloseButton are all false; forcing close button for accessibility.'
      );
    }
  }, [explicitDismissOnly, closeOnEsc, closeOnOverlayClick, showCloseButton]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (document.querySelector('[data-zync-select-open="true"]')) return;
      if (e.key === 'Escape') onClose();
    };
    if (isOpen && effectiveCloseOnEsc) {
      window.addEventListener('keydown', handleEsc, { capture: true });
    }
    return () => window.removeEventListener('keydown', handleEsc, { capture: true });
  }, [effectiveCloseOnEsc, isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    x.set(0);
    y.set(0);

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const frame = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      const firstFocusable = dialog?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (firstFocusable ?? dialog)?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
      if (previouslyFocused && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [isOpen, x, y]);

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      .filter((element) => element.offsetParent !== null);

    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleDragHandlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest(DRAG_BLOCK_SELECTOR)) return;
    dragControls.start(event.nativeEvent);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <ZPortal passive key={titleId}>
          <motion.div
            ref={dragConstraintsRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, pointerEvents: 'none' }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className={cn(
              "absolute inset-0 flex items-center justify-center p-4 pointer-events-none",
              zIndexClassName ?? "z-[9999]"
            )}
          >
            <div
              onClick={effectiveCloseOnOverlayClick ? onClose : undefined}
              className="absolute inset-0 bg-black/70 pointer-events-auto"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              drag
              dragControls={dragControls}
              dragListener={false}
              dragConstraints={dragConstraintsRef}
              dragElastic={0}
              dragMomentum={false}
              style={{ x, y }}
              className={cn(
                'relative w-full bg-app-panel backdrop-blur-xl border border-app-border rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden ring-1 ring-black/5 dark:ring-white/5 transition-[max-width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] pointer-events-auto',
                width,
                className
              )}
              ref={dialogRef}
              data-zync-modal-surface="true"
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
              onKeyDown={handleDialogKeyDown}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className={cn("flex items-start justify-between p-5 border-b border-app-border/50 cursor-move active:cursor-grabbing select-none", headerClassName)}
                onPointerDown={handleDragHandlePointerDown}
              >
                <div className="min-w-0 pr-2">
                  <h3 id={titleId} className={cn("text-lg font-semibold text-app-text tracking-tight", titleClassName)}>{title}</h3>
                  {subtitle && (
                    <p className="mt-1 text-xs text-app-muted leading-relaxed">{subtitle}</p>
                  )}
                </div>
                <GripHorizontal
                  aria-hidden="true"
                  className="mx-3 mt-1 h-4 w-4 shrink-0 text-app-muted/45"
                />
                {effectiveShowCloseButton && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClose}
                    aria-label="Close"
                    className="h-8 w-8 rounded-full text-app-muted hover:bg-app-accent hover:text-white transition-all hover:scale-110 active:scale-95 hover:shadow-lg hover:shadow-app-accent/20"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className={cn("p-6 overflow-y-auto custom-scrollbar flex-1", contentClassName)}>{children}</div>
            </motion.div>
          </motion.div>
        </ZPortal>
      )}
    </AnimatePresence>
  );
}
