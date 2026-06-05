'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRole, UserRole } from '@/context/RoleContext';

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const { role, username, setRole } = useRole();

  const iconStyle = {
    width: '20px',
    height: '20px',
    flexShrink: 0,
    strokeWidth: 2,
    stroke: 'currentColor',
    fill: 'none'
  };

  const navItems = [
    { 
      name: 'Dashboard', 
      path: '/', 
      icon: (
        <svg style={iconStyle} viewBox="0 0 24 24">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
        </svg>
      )
    },
    { 
      name: 'Case Log', 
      path: '/cases', 
      icon: (
        <svg style={iconStyle} viewBox="0 0 24 24">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      )
    },
    { 
      name: 'Incident Log', 
      path: '/incidents', 
      icon: (
        <svg style={iconStyle} viewBox="0 0 24 24">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      )
    },
    { 
      name: 'Fault Log (CMMS)', 
      path: '/faults', 
      icon: (
        <svg style={iconStyle} viewBox="0 0 24 24">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      )
    },
    { 
      name: 'Task Management', 
      path: '/tasks', 
      icon: (
        <svg style={iconStyle} viewBox="0 0 24 24">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      )
    },
    { 
      name: 'Occurrence Log', 
      path: '/occurrences', 
      icon: (
        <svg style={iconStyle} viewBox="0 0 24 24">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      )
    }
  ];

  const roles: UserRole[] = [
    'Controller',
    'Duty Manager',
    'Duty Officer',
    'Responder (Ranger)',
    'System Administrator',
    'Stakeholder'
  ];

  return (
    <div className="sidebar-container">
      {/* Brand Header */}
      <div className="brand-header">
        <div className="brand-logo">
          <svg className="logo-svg" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span>SENTOSA ISS</span>
        </div>
        <div className="sub-logo">CASE MANAGEMENT SYSTEM</div>
      </div>

      {/* Nav Menu */}
      <nav className="nav-menu">
        {navItems.map((item) => {
          const isActive = pathname === item.path || (item.path !== '/' && pathname?.startsWith(item.path));
          return (
            <Link 
              key={item.name} 
              href={item.path}
              className={`nav-item ${isActive ? 'active' : ''}`}
            >
              {item.icon}
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* User Context & Role Switcher */}
      <div className="sidebar-footer">
        <div className="user-info">
          <div className="avatar">
            {username.charAt(0)}
          </div>
          <div>
            <div className="user-name">{username}</div>
            <div className="user-role">{role}</div>
          </div>
        </div>

        <div className="role-switcher">
          <label htmlFor="role-select">Switch Role (Testing):</label>
          <select 
            id="role-select" 
            value={role} 
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="role-select-input"
          >
            {roles.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      </div>

      <style jsx>{`
        .sidebar-container {
          width: var(--sidebar-width);
          height: 100vh;
          background: #ffffff;
          border-right: 1px solid var(--border-color);
          position: fixed;
          left: 0;
          top: 0;
          display: flex;
          flex-direction: column;
          z-index: 100;
        }

        .brand-header {
          padding: 24px;
          border-bottom: 1px solid var(--border-color);
        }

        .brand-logo {
          display: flex;
          align-items: center;
          gap: 10px;
          font-family: var(--font-title);
          font-size: 17px;
          font-weight: 800;
          color: var(--text-main);
          letter-spacing: 0.05em;
        }

        .logo-svg {
          width: 24px;
          height: 24px;
          color: var(--color-primary);
        }

        .sub-logo {
          font-family: var(--font-title);
          font-size: 10px;
          font-weight: 600;
          color: var(--text-muted);
          letter-spacing: 0.12em;
          margin-top: 4px;
          padding-left: 34px;
        }

        .nav-menu {
          padding: 20px 16px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex-grow: 1;
        }

        /* Using global selectors to override default link rendering behaviors */
        :global(.nav-item) {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          color: #475569 !important; /* Slate 600 default */
          text-decoration: none !important;
          font-size: 13.5px;
          font-weight: 600;
          border-radius: 6px;
          transition: all 0.15s ease;
          border: 1px solid transparent;
        }

        :global(.nav-item svg) {
          width: 20px !important;
          height: 20px !important;
          stroke: currentColor;
          fill: none;
          flex-shrink: 0;
        }

        :global(.nav-item span) {
          color: inherit;
          text-decoration: none !important;
        }

        :global(.nav-item:hover) {
          color: var(--text-main) !important;
          background: #f1f5f9;
          text-decoration: none !important;
        }

        :global(.nav-item.active) {
          color: var(--color-primary) !important;
          background: var(--color-primary-glow) !important;
          border-color: rgba(2, 132, 199, 0.15) !important;
          text-decoration: none !important;
        }

        .sidebar-footer {
          padding: 20px;
          border-top: 1px solid var(--border-color);
          background: #f8fafc;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .user-info {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: var(--color-primary-glow);
          border: 1px solid rgba(2, 132, 199, 0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--color-primary);
          font-weight: 700;
          font-family: var(--font-title);
          font-size: 13px;
        }

        .user-name {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-main);
        }

        .user-role {
          font-size: 11px;
          color: var(--text-muted);
          margin-top: 1px;
        }

        .role-switcher {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .role-switcher label {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
        }

        .role-select-input {
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 7px 10px;
          color: var(--text-main);
          font-family: var(--font-body);
          font-size: 12px;
          outline: none;
          cursor: pointer;
          transition: all 0.15s ease;
          width: 100%;
        }

        .role-select-input:focus {
          border-color: var(--color-primary);
          box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.1);
        }
        
        .role-select-input option {
          background-color: #ffffff;
          color: var(--text-main);
        }
      `}</style>
    </div>
  );
};
