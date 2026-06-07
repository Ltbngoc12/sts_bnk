'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRole, UserRole } from '@/context/RoleContext';

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const { role, username, setRole } = useRole();
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Load state from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('sidebar_collapsed');
    if (stored === 'true') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsCollapsed(true);
    }
  }, []);

  // Update body class and localStorage when isCollapsed changes
  useEffect(() => {
    if (isCollapsed) {
      document.body.classList.add('sidebar-collapsed');
      localStorage.setItem('sidebar_collapsed', 'true');
    } else {
      document.body.classList.remove('sidebar-collapsed');
      localStorage.setItem('sidebar_collapsed', 'false');
    }
  }, [isCollapsed]);

  const toggleCollapse = () => {
    setIsCollapsed(prev => !prev);
  };

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
    <div className={`sidebar-container ${isCollapsed ? 'collapsed' : ''}`}>
      {/* Toggle Button */}
      <button 
        className="collapse-toggle-btn" 
        onClick={toggleCollapse}
        aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
          {isCollapsed ? (
            <polyline points="9 18 15 12 9 6" />
          ) : (
            <polyline points="15 18 9 12 15 6" />
          )}
        </svg>
      </button>

      {/* Brand Header */}
      <div className="brand-header">
        <div className="brand-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.png" alt="Sentosa Icon" className="logo-icon" />
          
          <div className="brand-text-group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Sentosa Logo" className="logo-wordmark" />
            <div className="sub-logo">CASE MANAGEMENT SYSTEM</div>
          </div>
        </div>
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
              <span className="nav-label">{item.name}</span>
              {isCollapsed && <span className="collapsed-tooltip">{item.name}</span>}
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
          <div className="user-details">
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
          background: var(--bg-sidebar);
          border-right: 1px solid var(--border-color);
          position: fixed;
          left: 0;
          top: 0;
          display: flex;
          flex-direction: column;
          z-index: 100;
          transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .brand-header {
          padding: 24px 20px 20px 20px; /* Restored left padding to 20px for a clean, non-stretched look */
          border-bottom: 1px solid var(--border-color);
          transition: padding 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .brand-logo {
          display: flex;
          align-items: center;
          gap: 12px; /* Increased gap for better breathing space */
          font-family: var(--font-body);
        }

        .logo-icon {
          height: 40px; /* Increased size for a prominent left-side emblem */
          width: auto;
          object-fit: contain;
          mix-blend-mode: multiply;
          flex-shrink: 0;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .brand-text-group {
          display: flex;
          flex-direction: column;
          gap: 3px;
          flex-grow: 1;
          min-width: 0;
          transition: opacity 0.2s ease, transform 0.2s ease;
        }

        .logo-wordmark {
          height: 26px; /* Significantly increased from 20px for high readability */
          width: auto;
          object-fit: contain;
          mix-blend-mode: multiply;
          align-self: flex-start;
        }

        .sub-logo {
          font-family: 'Outfit', 'Inter', sans-serif;
          font-size: 8.5px; /* Refined typography size to fit under wordmark */
          font-weight: 700;
          color: var(--text-muted); /* Softer gray-brown to avoid clashing with the orange logo */
          letter-spacing: 0.06em;
          text-transform: uppercase;
          white-space: nowrap;
          display: block;
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
          color: var(--text-muted) !important;
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
          background: rgba(43, 31, 29, 0.04);
          text-decoration: none !important;
        }

        :global(.nav-item.active) {
          color: var(--color-primary) !important;
          background: var(--color-primary-glow) !important;
          border-color: rgba(255, 130, 0, 0.12) !important;
          text-decoration: none !important;
        }

        .sidebar-footer {
          padding: 20px;
          border-top: 1px solid var(--border-color);
          background: rgba(43, 31, 29, 0.01);
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
          border: 1px solid rgba(255, 130, 0, 0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--color-primary);
          font-weight: 700;
          font-family: var(--font-body);
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
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
        }

        .role-select-input {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
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
          box-shadow: 0 0 0 3px var(--color-primary-glow);
        }
        
        .role-select-input option {
          background-color: var(--bg-card);
          color: var(--text-main);
        }

        /* Toggle Button */
        .collapse-toggle-btn {
          position: absolute;
          top: 35px;
          right: -14px;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          color: var(--text-muted);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(43, 31, 29, 0.08);
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          z-index: 110;
          outline: none;
          padding: 0;
        }

        .collapse-toggle-btn:hover {
          color: var(--color-primary);
          border-color: var(--color-primary);
          background: var(--bg-base);
          transform: translateY(0) scale(1.1);
        }

        .collapse-toggle-btn:active {
          transform: scale(0.95);
        }

        /* Collapsed Styles */
        .collapsed .brand-header {
          padding: 24px 0 22px 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        .collapsed .logo-icon {
          height: 32px; /* Slightly smaller centered icon in collapsed sidebar */
          margin: 0 auto;
        }

        .collapsed .brand-text-group {
          display: none;
        }

        .nav-menu {
          transition: padding 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .collapsed .nav-menu {
          padding: 20px 8px;
        }

        .collapsed :global(.nav-item) {
          justify-content: center;
          padding: 10px 0;
          gap: 0;
          position: relative;
        }

        .collapsed :global(.nav-item span.nav-label) {
          display: none;
        }

        /* Tooltip styling */
        :global(.collapsed-tooltip) {
          position: absolute;
          left: 100%;
          margin-left: 12px;
          padding: 6px 12px;
          background: var(--text-main);
          color: #ffffff;
          font-family: var(--font-body);
          font-size: 12px;
          font-weight: 500;
          border-radius: 6px;
          white-space: nowrap;
          opacity: 0;
          pointer-events: none;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          transform: translateX(-8px);
          box-shadow: 0 4px 12px rgba(43, 31, 29, 0.15);
          z-index: 200;
        }

        :global(.collapsed-tooltip::before) {
          content: '';
          position: absolute;
          right: 100%;
          top: 50%;
          transform: translateY(-50%);
          border-width: 5px;
          border-style: solid;
          border-color: transparent var(--text-main) transparent transparent;
        }

        :global(.nav-item:hover .collapsed-tooltip) {
          opacity: 1;
          transform: translateX(0);
        }

        .collapsed .sidebar-footer {
          padding: 20px 0;
          align-items: center;
        }

        .collapsed .user-info {
          justify-content: center;
          width: 100%;
        }

        .collapsed .user-details {
          display: none;
        }

        .collapsed .role-switcher {
          display: none;
        }
      `}</style>
    </div>
  );
};
