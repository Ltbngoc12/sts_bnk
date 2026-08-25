'use client';

import React, { createContext, useContext, useState } from 'react';
import { useRole, UserRole } from '@/context/RoleContext';
import { usePolling } from '@/hooks/usePolling';

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: string; // ISO String
  read: boolean;
  role: UserRole | 'All';
  type: 'task' | 'incident' | 'nop' | 'cmms' | 'ageing' | 'broadcast';
  link?: string;
}

interface NotificationContextType {
  notifications: NotificationItem[];
  filteredNotifications: NotificationItem[];
  unreadCount: number;
  addNotification: (notification: Omit<NotificationItem, 'id' | 'timestamp' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

// Map a server NotificationRecord (recipientRole) to the client NotificationItem (role).
type ServerNotification = {
  id: string; recipientRole: string; type: string; title: string;
  message: string; link?: string; read: boolean; timestamp: string;
};
const fromServer = (n: ServerNotification): NotificationItem => ({
  id: n.id,
  title: n.title,
  message: n.message,
  timestamp: n.timestamp,
  read: n.read,
  role: n.recipientRole as UserRole | 'All',
  type: (n.type as NotificationItem['type']) || 'incident',
  link: n.link,
});

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { role } = useRole();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  // Server-backed mailbox (FSD §10.5). Fetch on mount and poll so notifications are
  // shared/persistent across sessions instead of per-browser localStorage.
  const refetch = React.useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) setNotifications(data.map(fromServer));
    } catch { /* offline — keep current state */ }
  }, []);

  // Poll the server mailbox, but only while the tab is actually being looked at.
  // 60s instead of 20s: notifications are not second-critical, and at 20s a few
  // open tabs were generating thousands of Atlas reads a day with nobody watching.
  usePolling(refetch, 60_000);

  // Filter based on active role
  const filteredNotifications = notifications
    .filter(n => n.role === 'All' || n.role === role)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const unreadCount = filteredNotifications.filter(n => !n.read).length;

  const addNotification = (item: Omit<NotificationItem, 'id' | 'timestamp' | 'read'>) => {
    // Optimistic local insert for snappy UX; server reconciles on next poll.
    const optimistic: NotificationItem = {
      ...item,
      id: `notif-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date().toISOString(),
      read: false,
    };
    setNotifications(prev => [optimistic, ...prev]);
    fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipientRole: item.role,
        type: item.type,
        title: item.title,
        message: item.message,
        link: item.link,
      }),
    }).then(() => refetch()).catch(() => { /* keep optimistic copy */ });
  };

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
    fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n =>
      n.role === 'All' || n.role === role ? { ...n, read: true } : n
    ));
    fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAll: true, role }),
    }).catch(() => {});
  };

  const clearAll = () => {
    setNotifications(prev => prev.filter(n => n.role !== 'All' && n.role !== role));
    fetch(`/api/notifications?role=${encodeURIComponent(role)}`, { method: 'DELETE' })
      .then(() => refetch())
      .catch(() => {});
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        filteredNotifications,
        unreadCount,
        addNotification,
        markAsRead,
        markAllAsRead,
        clearAll
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
