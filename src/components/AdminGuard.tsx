'use client';

import React, { useState, useEffect } from 'react';
import { useRole } from '@/context/RoleContext';

interface AdminGuardProps {
  children: React.ReactNode;
  pageTitle: string;
}

export const AdminGuard: React.FC<AdminGuardProps> = ({ children, pageTitle }) => {
  const { role } = useRole();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div style={{ minHeight: '80vh' }} />;
  }

  if (role !== 'System Administrator') {
    return (
      <div className="admin-access-denied glass" style={{ margin: '40px auto', maxWidth: '640px', padding: '40px 30px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
        <div className="icon-wrapper" style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--color-critical-bg)', border: '2px solid var(--color-critical)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-critical)', fontSize: '28px', fontWeight: 'bold' }}>
          ⚠️
        </div>
        <h1 style={{ fontFamily: 'var(--font-headline)', fontSize: '24px', color: 'var(--text-main)', margin: '10px 0 0' }}>
          Access Restricted
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-sub)', maxWidth: '480px', lineHeight: '1.6' }}>
          The module <strong>{pageTitle}</strong> is reserved exclusively for System Administrators. You do not have the required permissions to view this content.
        </p>
        <div style={{ background: 'var(--bg-inset)', padding: '16px 20px', borderRadius: '8px', borderLeft: '4px solid var(--color-primary)', fontSize: '13px', color: 'var(--text-muted)', textAlign: 'left', width: '100%', maxWidth: '480px' }}>
          <strong>How to access:</strong>
          <ol style={{ marginLeft: '16px', marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <li>Locate the <strong>Switch Role</strong> menu at the bottom-left of the sidebar.</li>
            <li>Select <strong>System Administrator</strong> from the dropdown menu.</li>
            <li>This console will automatically refresh and unlock.</li>
          </ol>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
