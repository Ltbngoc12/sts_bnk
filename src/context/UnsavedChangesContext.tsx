'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmLeaveModal } from '@/components/ConfirmLeaveModal';

interface UnsavedChangesContextType {
  /** Whether the currently-active form has unsaved changes. */
  isDirty: boolean;
  setDirty: (dirty: boolean) => void;
  /** Whether the left navigation sidebar should be hidden (full-page forms only). */
  hideNav: boolean;
  setHideNav: (hidden: boolean) => void;
  /**
   * Destination to send the user to if they confirm leaving via the browser
   * Back button (which has no target the guard can otherwise infer). Forms
   * should set this to whatever their own Cancel button navigates to.
   */
  setLeaveHref: (href: string | null) => void;
  /**
   * Call from a Cancel/close action. If the form is dirty, shows the confirm
   * dialog and only runs `onConfirmed` if the user chooses to leave;
   * otherwise runs it immediately.
   */
  requestLeave: (onConfirmed: () => void) => void;
}

const UnsavedChangesContext = createContext<UnsavedChangesContextType | undefined>(undefined);

export const UnsavedChangesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const router = useRouter();
  const [isDirty, setIsDirty] = useState(false);
  const [hideNav, setHideNavState] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isDirtyRef = useRef(false);
  const leaveHrefRef = useRef<string | null>(null);
  const pendingActionRef = useRef<(() => void) | null>(null);
  const bypassPopGuardRef = useRef(false);

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  const setDirty = useCallback((dirty: boolean) => setIsDirty(dirty), []);
  const setHideNav = useCallback((hidden: boolean) => setHideNavState(hidden), []);
  const setLeaveHref = useCallback((href: string | null) => {
    leaveHrefRef.current = href;
  }, []);

  const requestLeave = useCallback((onConfirmed: () => void) => {
    if (isDirtyRef.current) {
      pendingActionRef.current = onConfirmed;
      setConfirmOpen(true);
    } else {
      onConfirmed();
    }
  }, []);

  // Warn on tab close / refresh while a form has unsaved changes. The
  // confirmation text itself is controlled by the browser, not us.
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Intercept the browser Back/Forward button while dirty.
  //
  // Next.js App Router has no built-in route-leave guard (unlike the old
  // Pages Router's `router.events`), so this uses the common pushState/
  // popstate workaround: while the form is dirty we keep an extra "guard"
  // history entry on top of the real one. When the user presses Back, the
  // guard entry is popped and we get a popstate event — if the form is
  // still dirty at that point we immediately re-push a guard entry
  // (visually cancelling the back-navigation) and show the confirm dialog.
  // Confirming sends the user to `leaveHref` via router.push rather than
  // replaying history.back(), which sidesteps having to precisely count how
  // many guard entries have piled up.
  //
  // Known limitation (flagged in the implementation plan): this is a best
  // effort, not a guarantee — Safari/iOS back-forward cache (bfcache) can
  // suppress popstate/beforeunload in ways that are inconsistent across
  // browsers. Needs the dedicated cross-browser QA pass before this is
  // considered fully reliable.
  useEffect(() => {
    const pushGuardEntry = () => {
      window.history.pushState({ __unsavedGuard: true }, '', window.location.href);
    };

    if (isDirty) {
      pushGuardEntry();
    }

    const handlePopState = () => {
      if (bypassPopGuardRef.current) {
        bypassPopGuardRef.current = false;
        return;
      }
      if (!isDirtyRef.current) return;

      pushGuardEntry();
      pendingActionRef.current = () => {
        if (leaveHrefRef.current) {
          router.push(leaveHrefRef.current);
        } else {
          bypassPopGuardRef.current = true;
          window.history.back();
        }
      };
      setConfirmOpen(true);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isDirty, router]);

  const handleStay = useCallback(() => {
    setConfirmOpen(false);
    pendingActionRef.current = null;
  }, []);

  const handleConfirmLeave = useCallback(() => {
    setConfirmOpen(false);
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    setIsDirty(false);
    if (action) action();
  }, []);

  return (
    <UnsavedChangesContext.Provider
      value={{ isDirty, setDirty, hideNav, setHideNav, setLeaveHref, requestLeave }}
    >
      {children}
      <ConfirmLeaveModal isOpen={confirmOpen} onStay={handleStay} onLeave={handleConfirmLeave} />
    </UnsavedChangesContext.Provider>
  );
};

export const useUnsavedChanges = () => {
  const context = useContext(UnsavedChangesContext);
  if (context === undefined) {
    throw new Error('useUnsavedChanges must be used within an UnsavedChangesProvider');
  }
  return context;
};
