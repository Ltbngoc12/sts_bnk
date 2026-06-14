'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useNotifications, NotificationItem } from '@/context/NotificationContext';
import { useRole } from '@/context/RoleContext';

export const NotificationWidget: React.FC = () => {
  const { role } = useRole();
  const { filteredNotifications, unreadCount, markAsRead, markAllAsRead, clearAll } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState<number>(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true);
      setNow(Date.now());
    }, 0);

    const interval = setInterval(() => {
      setNow(Date.now());
    }, 30000);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  if (!mounted) return null;

  const getIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'task':
        return (
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        );
      case 'incident':
        return (
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        );
      case 'cmms':
        return (
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
        );
      case 'nop':
        return (
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        );
      case 'ageing':
        return (
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        );
      default:
        return (
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        );
    }
  };

  const formatRelativeTime = (dateString: string) => {
    if (!now) return '';
    const diff = now - new Date(dateString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <>
      {/* Floating Action Button */}
      <button
        className={`floating-noti-btn ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(prev => !prev)}
        aria-label="Toggle notifications panel"
      >
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="noti-badge">{unreadCount}</span>
        )}
      </button>

      {/* Backdrop overlay */}
      {isOpen && (
        <div className="drawer-backdrop" onClick={() => setIsOpen(false)} />
      )}

      {/* Slide-out Drawer Panel */}
      <div className={`noti-drawer ${isOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <div className="header-titles">
            <h2>SYSTEM NOTIFICATIONS</h2>
            <div className="role-tag">Role: {role}</div>
          </div>
          <button className="close-btn" onClick={() => setIsOpen(false)} aria-label="Close panel">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {filteredNotifications.length > 0 && (
          <div className="drawer-actions">
            <button className="action-btn text-success" onClick={markAllAsRead}>
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 4 }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Mark all as read
            </button>
            <button className="action-btn text-danger" onClick={clearAll}>
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 4 }}>
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              Clear all
            </button>
          </div>
        )}

        <div className="drawer-body">
          {filteredNotifications.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </div>
              <p className="empty-title">All caught up!</p>
              <p className="empty-desc">No active system alerts for the <strong>{role}</strong> role at this time.</p>
            </div>
          ) : (
            <div className="notifications-list">
              {filteredNotifications.map(n => {
                const CardContent = (
                  <div className={`noti-card ${n.read ? 'read' : 'unread'} ${n.type}`}>
                    <div className="noti-indicator" />
                    <div className="noti-icon-container">
                      {getIcon(n.type)}
                    </div>
                    <div className="noti-info">
                      <div className="noti-card-header">
                        <span className="noti-title">{n.title}</span>
                        <span className="noti-time">{formatRelativeTime(n.timestamp)}</span>
                      </div>
                      <p className="noti-msg">{n.message}</p>
                      
                      {!n.read && (
                        <button
                          className="mark-read-inline"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            markAsRead(n.id);
                          }}
                        >
                          Mark as read
                        </button>
                      )}
                    </div>
                  </div>
                );

                if (n.link) {
                  return (
                    <Link
                      key={n.id}
                      href={n.link}
                      onClick={() => {
                        markAsRead(n.id);
                        setIsOpen(false);
                      }}
                      style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
                    >
                      {CardContent}
                    </Link>
                  );
                }

                return (
                  <div key={n.id} onClick={() => markAsRead(n.id)}>
                    {CardContent}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        /* Floating Button styling */
        .floating-noti-btn {
          position: fixed;
          bottom: 24px;
          right: 24px;
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: rgba(251, 251, 250, 0.85);
          border: 2px solid var(--color-primary);
          color: var(--color-primary-dark);
          box-shadow: 0 10px 25px -5px rgba(43, 31, 29, 0.15), 0 8px 12px -6px rgba(43, 31, 29, 0.08);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          z-index: 999;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          backdrop-filter: blur(12px);
          outline: none;
          padding: 0;
        }

        .floating-noti-btn:hover {
          transform: scale(1.08) rotate(3deg);
          box-shadow: 0 12px 30px -4px rgba(43, 31, 29, 0.2), 0 8px 16px -4px rgba(43, 31, 29, 0.1);
          color: var(--color-primary);
          background: rgba(251, 251, 250, 0.95);
        }

        .floating-noti-btn:active {
          transform: scale(0.95);
        }

        .floating-noti-btn.active {
          transform: rotate(180deg);
          background: var(--color-primary);
          color: #fff;
          border-color: var(--color-primary);
        }

        .noti-badge {
          position: absolute;
          top: -2px;
          right: -2px;
          background: var(--color-primary);
          color: white;
          font-size: 10px;
          font-weight: 700;
          font-family: var(--font-body);
          width: 20px;
          height: 20px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid #FBFBFA;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0% {
            box-shadow: 0 0 0 0 rgba(255, 130, 0, 0.7);
          }
          70% {
            box-shadow: 0 0 0 6px rgba(255, 130, 0, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(255, 130, 0, 0);
          }
        }

        /* Backdrop Overlay */
        .drawer-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(43, 31, 29, 0.35);
          backdrop-filter: blur(4px);
          z-index: 1000;
          animation: fadeIn 0.25s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        /* Drawer Styling */
        .noti-drawer {
          position: fixed;
          top: 0;
          right: 0;
          height: 100vh;
          width: 420px;
          max-width: 100%;
          background: var(--bg-card);
          border-left: 1px solid var(--border-color);
          box-shadow: -10px 0 30px rgba(43, 31, 29, 0.08);
          z-index: 1001;
          display: flex;
          flex-direction: column;
          transform: translateX(100%);
          transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .noti-drawer.open {
          transform: translateX(0);
        }

        .drawer-header {
          padding: 24px;
          border-bottom: 1px solid var(--border-color);
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          background: var(--bg-card);
        }

        .drawer-header h2 {
          font-family: var(--font-title);
          font-size: 18px;
          font-weight: 700;
          color: var(--color-primary-dark);
          margin: 0 0 6px 0;
          letter-spacing: 0.02em;
        }

        .role-tag {
          font-family: var(--font-body);
          font-size: 11px;
          font-weight: 600;
          color: var(--text-muted);
          background: var(--bg-base);
          padding: 3px 8px;
          border-radius: 4px;
          display: inline-block;
          border: 1px solid var(--border-color);
        }

        .close-btn {
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 4px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .close-btn:hover {
          background: var(--bg-base);
          color: var(--text-main);
        }

        .drawer-actions {
          padding: 8px 24px;
          background: var(--bg-base);
          border-bottom: 1px solid var(--border-color);
          display: flex;
          gap: 16px;
        }

        .action-btn {
          background: none;
          border: none;
          font-family: var(--font-body);
          font-size: 11.5px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          padding: 4px 0;
          transition: opacity 0.2s;
        }

        .action-btn:hover {
          opacity: 0.8;
          text-decoration: underline;
        }

        .text-success { color: var(--color-secondary); }
        .text-danger { color: #DC2626; }

        .drawer-body {
          flex: 1;
          overflow-y: auto;
          padding: 16px 20px;
          background: #FDFDFD;
        }

        /* Empty State */
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 60%;
          text-align: center;
          padding: 24px;
          color: var(--text-muted);
        }

        .empty-icon {
          color: var(--border-color);
          margin-bottom: 16px;
        }

        .empty-title {
          font-family: var(--font-title);
          font-size: 16px;
          font-weight: 600;
          color: var(--text-main);
          margin: 0 0 6px 0;
        }

        .empty-desc {
          font-family: var(--font-body);
          font-size: 12.5px;
          line-height: 1.5;
          margin: 0;
        }

        /* Notification list & cards */
        .notifications-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .noti-card {
          position: relative;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 14px 16px;
          display: flex;
          gap: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          overflow: hidden;
        }

        .noti-card:hover {
          border-color: var(--border-color-hover);
          box-shadow: 0 4px 12px rgba(43, 31, 29, 0.04);
          transform: translateY(-1px);
        }

        .noti-indicator {
          position: absolute;
          top: 0;
          left: 0;
          bottom: 0;
          width: 4px;
          background: transparent;
        }

        .noti-card.unread .noti-indicator {
          background: var(--color-primary);
        }

        .noti-card.unread {
          background: #FFFDFC; /* Extremely soft highlight for unread */
        }

        .noti-icon-container {
          flex-shrink: 0;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: var(--bg-base);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
        }

        /* Specific types colors */
        .noti-card.task .noti-icon-container {
          color: var(--color-secondary);
          background: rgba(0, 140, 149, 0.08);
        }
        .noti-card.incident .noti-icon-container {
          color: #DC2626;
          background: rgba(220, 38, 38, 0.08);
        }
        .noti-card.cmms .noti-icon-container {
          color: var(--color-primary-dark);
          background: rgba(109, 53, 0, 0.08);
        }
        .noti-card.nop .noti-icon-container {
          color: var(--color-tertiary);
          background: rgba(74, 20, 140, 0.08);
        }
        .noti-card.ageing .noti-icon-container {
          color: #D97706;
          background: rgba(217, 119, 6, 0.08);
        }

        .noti-info {
          flex: 1;
          min-width: 0;
        }

        .noti-card-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 4px;
          gap: 8px;
        }

        .noti-title {
          font-family: var(--font-body);
          font-size: 13px;
          font-weight: 700;
          color: var(--text-main);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .noti-time {
          font-family: var(--font-body);
          font-size: 10.5px;
          color: var(--text-muted);
          flex-shrink: 0;
        }

        .noti-msg {
          font-family: var(--font-body);
          font-size: 12.5px;
          line-height: 1.4;
          color: var(--text-muted);
          margin: 0;
          word-break: break-word;
        }

        .mark-read-inline {
          background: none;
          border: none;
          color: var(--color-secondary);
          font-family: var(--font-body);
          font-size: 11.5px;
          font-weight: 600;
          cursor: pointer;
          padding: 4px 0 0 0;
          margin-top: 6px;
          display: inline-block;
          transition: color 0.2s;
        }

        .mark-read-inline:hover {
          color: var(--color-primary-dark);
          text-decoration: underline;
        }

        /* Read/unread text formatting styles */
        .noti-card.read .noti-title {
          font-weight: 600;
          color: var(--text-muted);
        }
        .noti-card.read .noti-icon-container {
          opacity: 0.7;
        }
      `}</style>
    </>
  );
};
