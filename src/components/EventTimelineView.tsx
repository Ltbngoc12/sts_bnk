import React, { useMemo } from 'react';
import { EventRecord } from '@/lib/db';

interface EventTimelineViewProps {
  events: EventRecord[];
  currentDate: Date;
  onEventClick?: (event: EventRecord) => void;
}

interface EventLayout {
  event: EventRecord;
  colIndex: number;
  totalCols: number;
  top: number;
  height: number;
}

export const EventTimelineView: React.FC<EventTimelineViewProps> = ({ events, currentDate, onEventClick }) => {
  // Define time slots (00:00 to 23:00)
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

  // Calculate Side-by-Side Column Layout (Option 1 - Google Calendar / Outlook style)
  const eventLayouts = useMemo(() => {
    if (dayEvents.length === 0) return [];

    const startOfDay = new Date(currentDate);
    startOfDay.setHours(0, 0, 0, 0);

    // 1. Map events to time intervals & position
    const items = dayEvents.map(ev => {
      const eStart = new Date(ev.startDateTime);
      let eEnd = new Date(ev.endDateTime);
      if (eEnd.getTime() <= eStart.getTime()) {
        eEnd = new Date(eStart.getTime() + 30 * 60 * 1000);
      }
      const startMs = eStart.getTime();
      const endMs = eEnd.getTime();

      const startOffsetMinutes = Math.max(0, (startMs - startOfDay.getTime()) / (1000 * 60));
      const durationMinutes = Math.min(24 * 60 - startOffsetMinutes, (endMs - Math.max(startMs, startOfDay.getTime())) / (1000 * 60));
      
      const top = (startOffsetMinutes / 60) * 60;
      const height = Math.max((durationMinutes / 60) * 60, 36);

      return {
        event: ev,
        startMs,
        endMs,
        top,
        height
      };
    });

    // Sort by startMs ascending, then duration descending
    items.sort((a, b) => {
      if (a.startMs !== b.startMs) return a.startMs - b.startMs;
      return (b.endMs - b.startMs) - (a.endMs - a.startMs);
    });

    // 2. Group into connected overlapping clusters
    const clusters: (typeof items)[] = [];
    let currentCluster: typeof items = [];
    let clusterEndMs = 0;

    items.forEach(item => {
      if (currentCluster.length === 0) {
        currentCluster.push(item);
        clusterEndMs = item.endMs;
      } else {
        if (item.startMs < clusterEndMs) {
          currentCluster.push(item);
          if (item.endMs > clusterEndMs) {
            clusterEndMs = item.endMs;
          }
        } else {
          clusters.push(currentCluster);
          currentCluster = [item];
          clusterEndMs = item.endMs;
        }
      }
    });
    if (currentCluster.length > 0) {
      clusters.push(currentCluster);
    }

    // 3. For each cluster, calculate column assignments
    const result: EventLayout[] = [];

    clusters.forEach(cluster => {
      const columns: (typeof items)[number][] = [];

      const assigned = cluster.map(item => {
        let placedCol = -1;
        for (let i = 0; i < columns.length; i++) {
          if (columns[i].endMs <= item.startMs) {
            placedCol = i;
            columns[i] = item;
            break;
          }
        }
        if (placedCol === -1) {
          placedCol = columns.length;
          columns.push(item);
        }
        return { item, colIndex: placedCol };
      });

      const totalCols = columns.length;

      assigned.forEach(({ item, colIndex }) => {
        result.push({
          event: item.event,
          colIndex,
          totalCols,
          top: item.top,
          height: item.height
        });
      });
    });

    return result;
  }, [dayEvents, currentDate]);

  return (
    <div
      className="timeline-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-card)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
        overflow: 'hidden',
        position: 'relative',
        height: '100%',
        minHeight: '600px'
      }}
    >
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

        {/* Event Blocks (Side-by-Side Columns) */}
        <div style={{ position: 'absolute', top: 20, left: '60px', right: 0, bottom: 20 }}>
          {eventLayouts.map(({ event, colIndex, totalCols, top, height }) => {
            const eStart = new Date(event.startDateTime);
            const eEnd = new Date(event.endDateTime);
            const isEmergency = event.type === 'Emergency' || event.type === 'Critical';

            const bg = isEmergency ? 'var(--color-critical-bg)' : 'var(--color-info-bg)';
            const border = isEmergency ? 'var(--color-critical-border)' : 'var(--color-info-border)';
            const color = isEmergency ? 'var(--color-critical)' : 'var(--color-info)';

            // Side-by-side positioning calculations
            const widthPct = 95 / totalCols;
            const leftPct = 2 + (colIndex * widthPct);

            return (
              <div
                key={event.id}
                onClick={() => onEventClick && onEventClick(event)}
                style={{
                  position: 'absolute',
                  top: `${top}px`,
                  height: `${height}px`,
                  left: `${leftPct}%`,
                  width: `calc(${widthPct}% - 6px)`,
                  background: bg,
                  border: `1px solid ${border}`,
                  borderLeft: `4px solid ${color}`,
                  borderRadius: 'var(--radius-sm)',
                  padding: '6px 10px',
                  boxSizing: 'border-box',
                  cursor: 'pointer',
                  overflow: 'hidden',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.02)',
                  transition: 'all 0.2s ease',
                  zIndex: 2
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'scale(1.02)';
                  e.currentTarget.style.boxShadow = '0 8px 18px rgba(0,0,0,0.12)';
                  e.currentTarget.style.zIndex = '15';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 2px 5px rgba(0,0,0,0.02)';
                  e.currentTarget.style.zIndex = '2';
                }}
              >
                <div style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color,
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden'
                }}>
                  {event.name}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-sub)', marginTop: '2px', display: 'flex', flexDirection: totalCols > 2 ? 'column' : 'row', gap: '4px', overflow: 'hidden' }}>
                  <span style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>📍 {event.location.commonName || event.location.road || 'Sentosa'}</span>
                  <span style={{ whiteSpace: 'nowrap' }}>🕒 {eStart.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })} - {eEnd.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
