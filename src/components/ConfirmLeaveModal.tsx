'use client';

import React from 'react';

interface ConfirmLeaveModalProps {
  isOpen: boolean;
  onStay: () => void;
  onLeave: () => void;
}

// Shared confirmation dialog shown whenever a user tries to leave a form
// (via Cancel, browser Back, or in-page navigation) while it has unsaved
// changes. Rendered once globally by UnsavedChangesProvider — individual
// forms never need to render their own copy.
export const ConfirmLeaveModal: React.FC<ConfirmLeaveModalProps> = ({ isOpen, onStay, onLeave }) => {
  if (!isOpen) return null;

  return (
    // z-index pinned above every other modal in the app (create/edit modals
    // use .modal-backdrop at z-index 9000 — see globals.css) since this
    // dialog can be triggered *on top of* one of those (e.g. Cancel inside
    // FaultCreateModal). Without this override it rendered behind them and
    // was effectively invisible/unclickable.
    <div className="modal-overlay" style={{ zIndex: 9999 }} role="alertdialog" aria-modal="true" aria-labelledby="confirm-leave-title">
      <div className="modal-box" style={{ maxWidth: '420px' }}>
        <div className="modal-title" id="confirm-leave-title" style={{ border: 'none', marginBottom: '8px', paddingBottom: 0 }}>
          Unsaved changes will be lost
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          You have unsaved changes on this form. If you leave now, they will be discarded. Are you sure you want to leave this page?
        </p>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onStay} autoFocus>
            Stay on Page
          </button>
          <button type="button" className="btn btn-danger" onClick={onLeave}>
            Leave Page
          </button>
        </div>
      </div>
    </div>
  );
};
