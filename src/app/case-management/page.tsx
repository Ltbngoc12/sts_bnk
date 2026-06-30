'use client';

import React, { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CaseLogTab } from '@/components/tabs/CaseLogTab';
import { IncidentLogTab } from '@/components/tabs/IncidentLogTab';
import { FaultLogTab } from '@/components/tabs/FaultLogTab';
import { TaskBoardTab } from '@/components/tabs/TaskBoardTab';
import { EDiaryTab } from '@/components/tabs/EDiaryTab';

type TabKey = 'cases' | 'incidents' | 'faults' | 'tasks' | 'ediary';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'cases',     label: 'Case Log',     icon: '📁' },
  { key: 'incidents', label: 'Incident Log',  icon: '🚨' },
  { key: 'faults',    label: 'Fault Log',     icon: '🔧' },
  { key: 'tasks',     label: 'Task Board',    icon: '✅' },
  { key: 'ediary',    label: 'e-Diary',       icon: '📓' },
];

function CaseManagementInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeTab = (searchParams.get('tab') as TabKey) || 'cases';

  const setTab = (key: TabKey) => {
    router.replace(`/case-management?tab=${key}`);
  };

  return (
    <>
      {/* Shared Page Header */}
      <div className="page-header-bar glass">
        <div className="title-section">
          <h1 style={{ fontSize: '15px', textTransform: 'uppercase' }}>Case Management</h1>
          <p>Security, Safety, and Operational case management — Incidents, Tasks, e-Diary occurrences, and Faults</p>
        </div>
      </div>

      {/* Tab Bar */}
      <div
        className="glass"
        style={{
          padding: '0 20px',
          display: 'flex',
          alignItems: 'flex-end',
          gap: '0',
          background: 'var(--bg-card)',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setTab(tab.key)}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: isActive
                  ? '2px solid var(--color-primary)'
                  : '2px solid transparent',
                color: isActive ? 'var(--color-primary)' : 'var(--text-muted)',
                padding: '14px 20px',
                fontSize: '13px',
                fontWeight: isActive ? 700 : 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ fontSize: '14px' }}>{tab.icon}</span>
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {activeTab === 'cases'     && <CaseLogTab />}
        {activeTab === 'incidents' && <IncidentLogTab />}
        {activeTab === 'faults'    && <FaultLogTab />}
        {activeTab === 'tasks'     && <TaskBoardTab />}
        {activeTab === 'ediary'    && <EDiaryTab />}
      </div>
    </>
  );
}

export default function CaseManagementPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>Loading…</div>}>
      <CaseManagementInner />
    </Suspense>
  );
}
