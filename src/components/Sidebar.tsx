'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRole, UserRole } from '@/context/RoleContext';

// Icons as SVG components
const Icon = ({ d, d2 }: { d: string; d2?: string }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    style={{ flexShrink: 0 }}>
    <path d={d} />
    {d2 && <path d={d2} />}
  </svg>
);

// Nav structure with groups
const NAV_GROUPS = [
  {
    label: 'Operations',
    items: [
      { name: 'Dashboard',       path: '/',            d: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', d2: 'M9 22V12h6v10' },
      { name: 'Case Log',        path: '/cases',        d: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z' },
      { name: 'Incident Log',    path: '/incidents',    d: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z', d2: 'M12 9v4M12 17h.01' },
      { name: 'Fault Log',       path: '/faults',       d: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z' },
      { name: 'Task Board',      path: '/tasks',        d: 'M9 11l3 3L22 4', d2: 'M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11' },
      { name: 'e-Diary',         path: '/occurrences',  d: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20', d2: 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z' },
    ]
  },
  {
    label: 'Planning',
    items: [
      { name: 'Events',          path: '/events',       d: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z' },
      { name: 'Permits (NOP)',   path: '/nops',         d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', d2: 'M14 2v6h6M16 13H8M16 17H8M10 9H8' },
    ]
  },
  {
    label: 'Communications',
    items: [
      { name: 'Broadcasts',      path: '/broadcasts',   d: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.64 3.45a2 2 0 0 1 1.97-2.18H6.5c.47 0 .87.33.94.79.1.6.28 1.18.53 1.73a2 2 0 0 1-.45 2.11L6.15 7.57' },
    ]
  },
  {
    label: 'Analytics',
    items: [
      { name: 'Statistics',      path: '/statistics',   d: 'M18 20V10M12 20V4M6 20v-6' },
    ]
  }
];

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const { role, username, setRole } = useRole();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDOElevated, setIsDOElevated] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('sidebar_collapsed');
    if (stored === 'true') setIsCollapsed(true);
  }, []);

  useEffect(() => {
    if (isCollapsed) {
      document.body.classList.add('sidebar-collapsed');
      localStorage.setItem('sidebar_collapsed', 'true');
    } else {
      document.body.classList.remove('sidebar-collapsed');
      localStorage.setItem('sidebar_collapsed', 'false');
    }
  }, [isCollapsed]);

  const roles: UserRole[] = [
    'Controller', 'Duty Manager', 'Duty Officer',
    'Responder (Ranger)', 'System Administrator', 'Stakeholder'
  ];

  const isActive = (path: string) =>
    path === '/' ? pathname === '/' : pathname?.startsWith(path);

  return (
    <div className={`sidebar-container ${isCollapsed ? 'collapsed' : ''}`}>
      {/* Collapse toggle */}
      <button
        className="collapse-btn"
        onClick={() => setIsCollapsed(p => !p)}
        aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          {isCollapsed
            ? <polyline points="9 18 15 12 9 6" />
            : <polyline points="15 18 9 12 15 6" />}
        </svg>
      </button>

      {/* Brand */}
      <div className="brand-area">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.png" alt="SDC" className="brand-icon" />
        <div className="brand-text">
          <div className="brand-name">SDC IIOC</div>
          <div className="brand-sub">Case Management System</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="nav-scroll">
        {NAV_GROUPS.map(group => (
          <div key={group.label} className="nav-group">
            {!isCollapsed && <div className="nav-group-label">{group.label}</div>}
            {group.items.map(item => (
              <Link
                key={item.path}
                href={item.path}
                className={`nav-item ${isActive(item.path) ? 'active' : ''}`}
              >
                <Icon d={item.d} d2={item.d2} />
                <span className="nav-label">{item.name}</span>
                {isCollapsed && <span className="nav-tooltip">{item.name}</span>}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        {/* DO Elevation toggle */}
        {role === 'Duty Officer' && (
          <div className="elevation-toggle">
            <label className="toggle-label">
              <span>DO → DM Elevation</span>
              <button
                className={`toggle-switch ${isDOElevated ? 'on' : ''}`}
                onClick={() => setIsDOElevated(p => !p)}
                aria-pressed={isDOElevated}
              >
                <span className="toggle-thumb" />
              </button>
            </label>
            {isDOElevated && !isCollapsed && (
              <div className="elevation-badge">Elevated to DM</div>
            )}
          </div>
        )}

        {/* User info */}
        <div className="user-row">
          <div className="avatar">{username.charAt(0).toUpperCase()}</div>
          <div className="user-info">
            <div className="user-name">{username}</div>
            <div className="user-role-label">
              {isDOElevated && role === 'Duty Officer' ? 'Duty Manager (Elevated)' : role}
            </div>
          </div>
        </div>

        {/* Role switcher (dev/test only) */}
        {!isCollapsed && (
          <div className="role-switcher">
            <label className="switcher-label" htmlFor="role-select">Switch Role</label>
            <select
              id="role-select"
              value={role}
              onChange={e => setRole(e.target.value as UserRole)}
              className="role-select"
            >
              {roles.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        )}

        {/* System Config link (admin only) */}
        {(role === 'System Administrator') && (
          <Link href="/admin" className={`nav-item ${isActive('/admin') ? 'active' : ''}`} style={{ marginTop: 4 }}>
            <Icon d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" d2="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            <span className="nav-label">System Config</span>
          </Link>
        )}
      </div>

      <style jsx>{`
        .sidebar-container {
          width: var(--sidebar-width);
          height: 100vh;
          background: var(--bg-sidebar);
          position: fixed; left: 0; top: 0;
          display: flex; flex-direction: column;
          z-index: 100;
          transition: width 0.25s ease;
          overflow: hidden;
        }

        .collapse-btn {
          position: absolute; top: 48px; right: -12px;
          width: 24px; height: 24px; border-radius: 50%;
          background: #1F2937; border: 1px solid rgba(255,255,255,0.12);
          color: rgba(255,255,255,0.5);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; z-index: 110;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          transition: all 0.15s ease;
          padding: 0;
        }
        .collapse-btn:hover { color: #fff; border-color: rgba(255,255,255,0.3); }

        .brand-area {
          display: flex; align-items: center; gap: 10px;
          padding: 18px 14px 14px;
          border-bottom: 1px solid var(--sidebar-divider);
          flex-shrink: 0;
          overflow: hidden;
        }

        .brand-icon {
          width: 28px; height: 28px; flex-shrink: 0;
          object-fit: contain;
          filter: brightness(10);
          mix-blend-mode: normal;
        }

        .brand-text { overflow: hidden; white-space: nowrap; min-width: 0; }

        .brand-name {
          font-size: 12px; font-weight: 700;
          color: rgba(255,255,255,0.95);
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .brand-sub {
          font-size: 9.5px; color: rgba(255,255,255,0.40);
          margin-top: 2px; letter-spacing: 0.04em;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }

        .nav-scroll {
          flex: 1; overflow-y: auto; overflow-x: hidden;
          padding: 8px 8px 12px;
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.1) transparent;
        }

        .nav-group { margin-bottom: 6px; }

        .nav-group-label {
          font-size: 9.5px; font-weight: 700;
          color: rgba(255,255,255,0.25);
          text-transform: uppercase; letter-spacing: 0.10em;
          padding: 10px 8px 4px;
          white-space: nowrap;
        }

        :global(.nav-item) {
          display: flex; align-items: center; gap: 9px;
          padding: 8px 8px;
          border-radius: 6px;
          color: var(--sidebar-text) !important;
          text-decoration: none !important;
          font-size: 12.5px; font-weight: 500;
          cursor: pointer; border: 1px solid transparent;
          transition: all 0.12s ease;
          position: relative;
          white-space: nowrap;
          overflow: hidden;
        }

        :global(.nav-item:hover) {
          color: var(--sidebar-text-hover) !important;
          background: rgba(255,255,255,0.06);
        }

        :global(.nav-item.active) {
          color: #fff !important;
          background: var(--sidebar-active-bg);
          border-color: var(--sidebar-active-border);
          font-weight: 600;
        }

        :global(.nav-label) {
          overflow: hidden; text-overflow: ellipsis;
          white-space: nowrap; flex: 1;
        }

        /* Tooltip for collapsed */
        :global(.nav-tooltip) {
          position: absolute; left: 100%; top: 50%;
          transform: translateY(-50%) translateX(8px);
          margin-left: 8px;
          background: var(--bg-sidebar); color: #fff;
          font-size: 12px; font-weight: 500;
          padding: 5px 10px; border-radius: 5px;
          white-space: nowrap;
          opacity: 0; pointer-events: none;
          transition: all 0.15s ease;
          z-index: 200;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }

        :global(.nav-item:hover .nav-tooltip) {
          opacity: 1; transform: translateY(-50%) translateX(0);
        }

        /* Collapsed state */
        .collapsed .brand-text  { display: none; }
        .collapsed .brand-area  { justify-content: center; padding: 18px 0 14px; }
        .collapsed .nav-scroll  { padding: 8px 6px; }
        .collapsed .nav-group-label { display: none; }

        :global(.collapsed .nav-item) {
          justify-content: center; padding: 9px 0; gap: 0;
        }
        :global(.collapsed .nav-label) { display: none; }

        /* Footer */
        .sidebar-footer {
          border-top: 1px solid var(--sidebar-divider);
          padding: 12px 10px;
          display: flex; flex-direction: column; gap: 10px;
          flex-shrink: 0;
        }

        .user-row {
          display: flex; align-items: center; gap: 9px; overflow: hidden;
        }

        .avatar {
          width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0;
          background: rgba(255,255,255,0.12);
          border: 1px solid rgba(255,255,255,0.15);
          color: rgba(255,255,255,0.85); font-size: 12px; font-weight: 700;
          display: flex; align-items: center; justify-content: center;
        }

        .user-info { overflow: hidden; white-space: nowrap; min-width: 0; }

        .user-name {
          font-size: 12px; font-weight: 600;
          color: rgba(255,255,255,0.85);
          overflow: hidden; text-overflow: ellipsis;
        }

        .user-role-label {
          font-size: 10.5px; color: rgba(255,255,255,0.40);
          margin-top: 1px; overflow: hidden; text-overflow: ellipsis;
        }

        .collapsed .user-info { display: none; }

        /* Role switcher */
        .role-switcher {
          display: flex; flex-direction: column; gap: 4px;
        }

        .switcher-label {
          font-size: 9.5px; font-weight: 700;
          color: rgba(255,255,255,0.25);
          text-transform: uppercase; letter-spacing: 0.10em;
        }

        .role-select {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 5px; padding: 5px 8px;
          color: rgba(255,255,255,0.75);
          font-family: var(--font-body); font-size: 11.5px;
          outline: none; cursor: pointer; width: 100%;
          transition: border-color 0.15s;
        }
        .role-select:focus { border-color: rgba(255,255,255,0.3); }
        .role-select option { background: #1F2937; color: #fff; }

        /* DO Elevation Toggle */
        .elevation-toggle {
          display: flex; flex-direction: column; gap: 5px;
        }

        .toggle-label {
          display: flex; align-items: center; justify-content: space-between;
          font-size: 11px; color: rgba(255,255,255,0.55); cursor: pointer;
        }

        .toggle-switch {
          width: 32px; height: 18px; border-radius: 9px;
          background: rgba(255,255,255,0.15); border: none;
          cursor: pointer; position: relative;
          transition: background 0.2s;
          padding: 0; flex-shrink: 0;
        }
        .toggle-switch.on { background: #16A34A; }

        .toggle-thumb {
          position: absolute; top: 2px; left: 2px;
          width: 14px; height: 14px; border-radius: 50%;
          background: #fff;
          transition: transform 0.2s;
          display: block;
        }
        .toggle-switch.on .toggle-thumb { transform: translateX(14px); }

        .elevation-badge {
          font-size: 9.5px; font-weight: 700; letter-spacing: 0.06em;
          color: #16A34A; text-transform: uppercase;
        }
      `}</style>
    </div>
  );
};
