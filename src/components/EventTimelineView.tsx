import React, { useMemo } from 'react';
import { EventRecord } from '@/lib/db';

interface EventTimelineViewProps {
  events: EventRecord[];
  currentDate: Date;
  onEventClick?: (event: EventRecord) => void;
}

export const EventTimelineView: React.FC<EventTimelineViewProps> = ({ events, currentDate, onEventClick }) => {
  // Define time slots (e.g., 00:00 to 23:00)
  const hours = Array.from({ length: 24 }, (_, i) => i);

  // Filter events active on the current date
  const dayEvents = useMemo(() => {
    const startOfDay = new Date(currentDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(currentDate);
    endOfDay.setHours(23, 59, 59, 999);

    return events.filter(e => {
      const eStart = new Date(e.startDateTime);
      const eEnd = new Date(e.endDateTime);
      return eStart <= endOfDay && eEnd >= startOfDay;
    });
  }, [events, currentDate]);

  return (
    <div className="timeline-container" style={{
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-card)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
      overflow: 'hidden',
      position: 'relative',
      height: '100%',
      minHeight: '600px'
    }}>
      <div className="timeline-header" style={{
        padding: '16px 20px',
        borderBottom: '1px solid var(--border-color)',
        background: 'var(--bg-inset)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text-main)' }}>
          {currentDate.toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long' })}
        </h3>
        <span className="badge" style={{ background: 'var(--color-primary-bg)', color: 'var(--color-primary)', fontWeight: 600, padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>
          {dayEvents.length} Events Today
        </span>
      </div>

      <div className="timeline-body" style={{
        position: 'relative',
        flex: 1,
        overflowY: 'auto',
        padding: '20px 0'
      }}>
        {/* Background Grid */}
        <div style={{ position: 'absolute', top: 20, left: 0, right: 0, bottom: 20 }}>
          {hours.map(hour => (
            <div key={hour} style={{
              display: 'flex',
              height: '60px',
              borderBottom: '1px solid var(--border-color)',
              boxSizing: 'border-box'
            }}>
              <div style={{
                width: '60px',
                textAlign: 'right',
                paddingRight: '12px',
                color: 'var(--text-muted)',
                fontSize: '11px',
                fontWeight: 600,
                transform: 'translateY(-6px)'
              }}>
                {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
              </div>
              <div style={{ flex: 1, borderLeft: '1px solid var(--border-color)', position: 'relative' }}></div>
            </div>
          ))}
        </div>

        {/* Event Blocks */}
        <div style={{ position: 'absolute', top: 20, left: '60px', right: 0, bottom: 20 }}>
          {dayEvents.map((ev, i) => {
            const eStart = new Date(ev.startDateTime);
            const eEnd = new Date(ev.endDateTime);
            
            const startOfDay = new Date(currentDate);
            startOfDay.setHours(0, 0, 0, 0);

            // Calculate exact top position and height
            const startOffsetMinutes = Math.max(0, (eStart.getTime() - startOfDay.getTime()) / (1000 * 60));
            const durationMinutes = Math.min(24 * 60 - startOffsetMinutes, (eEnd.getTime() - Math.max(eStart.getTime(), startOfDay.getTime())) / (1000 * 60));
            
            const top = (startOffsetMinutes / 60) * 60;
            const height = (durationMinutes / 60) * 60;

            // Simple stacking logic
            const left = `${(i % 3) * 5 + 2}%`;
            const width = '90%';

            // Check if emergency
            const isEmergency = ev.type === 'Emergency' || ev.type === 'Critical';

            const bg = isEmergency ? 'var(--color-critical-bg)' : 'var(--color-info-bg)';
            const border = isEmergency ? 'var(--color-critical-border)' : 'var(--color-info-border)';
            const color = isEmergency ? 'var(--color-critical)' : 'var(--color-info)';
            const accent = isEmergency ? 'var(--color-critical)' : 'var(--color-info)';

            return (
              <div
                key={ev.id}
                onClick={() => onEventClick && onEventClick(ev)}
                style={{
                  position: 'absolute',
                  top: `${top}px`,
                  height: `${Math.max(height, 30)}px`,
                  left,
                  width,
                  background: bg,
                  border: `1px solid ${border}`,
                  borderLeft: `4px solid ${accent}`,
                  borderRadius: 'var(--radius-sm)',
                  padding: '6px 12px',
                  boxSizing: 'border-box',
                  cursor: 'pointer',
                  overflow: 'hidden',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.02)',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                  zIndex: 2
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 12px rgba(0,0,0,0.08)';
                  e.currentTarget.style.zIndex = '10';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 5px rgba(0,0,0,0.02)';
                  e.currentTarget.style.zIndex = '2';
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 700, color, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                  {ev.name}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-sub)', marginTop: '2px', display: 'flex', gap: '8px' }}>
                  <span>📍 {ev.location.commonName || ev.location.road || 'Sentosa'}</span>
                  <span>🕒 {eStart.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })} - {eEnd.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
