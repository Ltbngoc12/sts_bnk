'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRole, UserRole } from '@/context/RoleContext';

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: string; // ISO String
  read: boolean;
  role: UserRole | 'All';
  type: 'task' | 'incident' | 'nop' | 'cmms' | 'ageing';
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

const INITIAL_NOTIFICATIONS = (nowMs: number): NotificationItem[] => [
  // Controller Notifications
  {
    id: 'notif-1',
    title: 'Responder log submitted',
    message: 'Ranger John submitted an incident log for review on Incident SEN/IR/20260614/0001.',
    timestamp: new Date(nowMs - 1000 * 60 * 15).toISOString(), // 15 mins ago
    read: false,
    role: 'Controller',
    type: 'incident',
    link: '/incidents'
  },
  {
    id: 'notif-2',
    title: 'CMMS Fault ID received',
    message: 'Fault ID CMMS-89102 linked to Case SEN/CI/20260614/001.',
    timestamp: new Date(nowMs - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
    read: false,
    role: 'Controller',
    type: 'cmms',
    link: '/faults'
  },
  {
    id: 'notif-3',
    title: 'Incident returned for revision',
    message: 'Incident log SEN/IR/20260614/0002 returned for revision by Duty Manager.',
    timestamp: new Date(nowMs - 1000 * 60 * 60 * 5).toISOString(), // 5 hours ago
    read: true,
    role: 'Controller',
    type: 'incident',
    link: '/incidents'
  },

  // Duty Manager Notifications
  {
    id: 'notif-4',
    title: 'NOP Status Change',
    message: 'NOP-2026-0089: "Siloso Sand Restoration" is pending approval.',
    timestamp: new Date(nowMs - 1000 * 60 * 30).toISOString(), // 30 mins ago
    read: false,
    role: 'Duty Manager',
    type: 'nop',
    link: '/nops'
  },
  {
    id: 'notif-5',
    title: 'Incident ageing alert (12 days)',
    message: 'Incident SEN/IR/20260602/0001 has been active for 12 days without closure.',
    timestamp: new Date(nowMs - 1000 * 60 * 60 * 4).toISOString(), // 4 hours ago
    read: false,
    role: 'Duty Manager',
    type: 'ageing',
    link: '/incidents'
  },
  {
    id: 'notif-6',
    title: 'Incident ageing alert (14 days)',
    message: 'Action required: Incident SEN/IR/20260531/0002 active for 14 days.',
    timestamp: new Date(nowMs - 1000 * 60 * 60 * 24).toISOString(), // 1 day ago
    read: true,
    role: 'Duty Manager',
    type: 'ageing',
    link: '/incidents'
  },

  // Duty Officer Notifications
  {
    id: 'notif-7',
    title: 'Task Assigned',
    message: 'Duty Manager assigned task: "Review Siloso Beach Event Safety Plan".',
    timestamp: new Date(nowMs - 1000 * 60 * 10).toISOString(), // 10 mins ago
    read: false,
    role: 'Duty Officer',
    type: 'task',
    link: '/tasks'
  },
  {
    id: 'notif-8',
    title: 'Task Reassigned',
    message: 'Task: "Inspect Merlion Plaza CCTV alignment" has been reassigned to you.',
    timestamp: new Date(nowMs - 1000 * 60 * 60 * 3).toISOString(), // 3 hours ago
    read: true,
    role: 'Duty Officer',
    type: 'task',
    link: '/tasks'
  },

  // Responder (Ranger) Notifications
  {
    id: 'notif-9',
    title: 'Incident Assigned',
    message: 'Incident SEN/IR/20260614/0003: "Minor collision at Palawan Beach carpark" assigned to you.',
    timestamp: new Date(nowMs - 1000 * 60 * 8).toISOString(), // 8 mins ago
    read: false,
    role: 'Responder (Ranger)',
    type: 'incident',
    link: '/incidents'
  },
  {
    id: 'notif-10',
    title: 'Task Assigned',
    message: 'New Task: "Siloso Beach Walk Routine Foot Patrol".',
    timestamp: new Date(nowMs - 1000 * 60 * 45).toISOString(), // 45 mins ago
    read: false,
    role: 'Responder (Ranger)',
    type: 'task',
    link: '/tasks'
  },

  // Stakeholder Notifications
  {
    id: 'notif-11',
    title: 'NOP Approved',
    message: 'NOP-2026-0089 status updated to Approved by Duty Manager.',
    timestamp: new Date(nowMs - 1000 * 60 * 12).toISOString(), // 12 mins ago
    read: false,
    role: 'Stakeholder',
    type: 'nop',
    link: '/nops'
  },

  // System Administrator Notifications
  {
    id: 'notif-12',
    title: 'Database Auto-Backup Successful',
    message: 'IIS CMS database backup completed successfully and stored in process archive.',
    timestamp: new Date(nowMs - 1000 * 60 * 60 * 12).toISOString(), // 12 hours ago
    read: false,
    role: 'System Administrator',
    type: 'task',
    link: '/'
  }
];

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { role } = useRole();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  // Hydrate state from localStorage asynchronously to avoid SSR and cascading render warnings
  useEffect(() => {
    const saved = localStorage.getItem('sentosa_notifications');
    let initial: NotificationItem[];
    if (saved) {
      try {
        initial = JSON.parse(saved);
      } catch (err) {
        console.error('Error parsing notifications', err);
        initial = INITIAL_NOTIFICATIONS(Date.now());
      }
    } else {
      initial = INITIAL_NOTIFICATIONS(Date.now());
    }

    const timer = setTimeout(() => {
      setNotifications(initial);
      localStorage.setItem('sentosa_notifications', JSON.stringify(initial));
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  // Sync to localStorage whenever notifications change
  const saveNotifications = (newNotifs: NotificationItem[]) => {
    setNotifications(newNotifs);
    localStorage.setItem('sentosa_notifications', JSON.stringify(newNotifs));
  };

  // Filter based on active role
  const filteredNotifications = notifications
    .filter(n => n.role === 'All' || n.role === role)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const unreadCount = filteredNotifications.filter(n => !n.read).length;

  const addNotification = (item: Omit<NotificationItem, 'id' | 'timestamp' | 'read'>) => {
    const newNotif: NotificationItem = {
      ...item,
      id: `notif-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date().toISOString(),
      read: false
    };
    saveNotifications([newNotif, ...notifications]);
  };

  const markAsRead = (id: string) => {
    const updated = notifications.map(n => (n.id === id ? { ...n, read: true } : n));
    saveNotifications(updated);
  };

  const markAllAsRead = () => {
    const updated = notifications.map(n =>
      n.role === 'All' || n.role === role ? { ...n, read: true } : n
    );
    saveNotifications(updated);
  };

  const clearAll = () => {
    // Keep notifications for other roles, clear only for the active role
    const updated = notifications.filter(n => n.role !== 'All' && n.role !== role);
    saveNotifications(updated);
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
