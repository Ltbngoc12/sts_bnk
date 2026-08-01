'use client';

// Emergency recall acknowledgement page — Appendix A method 2 (tokenised link).
// Stories 19 and 20.
//
// ── THIS PAGE IS READ ON A PHONE, OUTDOORS, AT NIGHT, BY SOMEONE WHO WAS ASLEEP ─
// Every design choice here follows from that: two enormous buttons, no login, no
// navigation chrome, no scrolling before the decision, and the crisis details
// above the fold so the responder knows what they are agreeing to. Anything added
// to this page should have to justify itself against a responder who has fifteen
// seconds and one thumb.
//
// It is deliberately outside the authenticated app shell — requiring a login would
// defeat the purpose of an SMS recall link. Security rests on the token being
// opaque, unguessable and scoped to one recipient in one crisis.
//
// Note it does NOT record an acknowledgement on load. Messaging apps generate link
// previews by fetching the URL; if opening the page were enough to acknowledge,
// WhatsApp would mark responders as coming before they had read the message.

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface AckInfo {
  recipientName: string;
  alreadyResponded: boolean;
  ackStatus: string;
  crisis: { id: string; level: number; type: string; location: string; incidentNo: string; status: string } | null;
}

const page: React.CSSProperties = {
  minHeight: '100vh',
  background: '#0f1115',
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const bigButton = (bg: string): React.CSSProperties => ({
  width: '100%',
  padding: '26px',
  fontSize: '22px',
  fontWeight: 800,
  border: 'none',
  borderRadius: '14px',
  background: bg,
  color: '#fff',
  cursor: 'pointer',
  letterSpacing: '0.5px',
});

export default function AckPage() {
  const params = useParams();
  const token = String(params.token);

  const [info, setInfo] = useState<AckInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState<'ACKNOWLEDGED' | 'DECLINED' | null>(null);
  const [eta, setEta] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/crisis-ack?token=${encodeURIComponent(token)}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Invalid link');
        setInfo(json);
        if (json.alreadyResponded) setSubmitted(json.ackStatus);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const respond = async (decision: 'ACKNOWLEDGED' | 'DECLINED') => {
    setBusy(true);
    try {
      const res = await fetch('/api/crisis-ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, decision, eta: decision === 'ACKNOWLEDGED' ? eta || undefined : undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not record your response');
      setSubmitted(decision);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div style={page}>Loading…</div>;

  if (error || !info) {
    return (
      <div style={page}>
        <div style={{ maxWidth: '420px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '22px', marginBottom: '10px' }}>Link not valid</h1>
          <p style={{ color: '#aaa', fontSize: '15px' }}>{error || 'This acknowledgement link is not recognised. Contact the Duty Manager directly.'}</p>
        </div>
      </div>
    );
  }

  const c = info.crisis;

  if (submitted) {
    const ok = submitted === 'ACKNOWLEDGED';
    return (
      <div style={page}>
        <div style={{ maxWidth: '420px', width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '56px', marginBottom: '10px' }}>{ok ? '✓' : '✕'}</div>
          <h1 style={{ fontSize: '26px', margin: '0 0 10px', color: ok ? '#4caf50' : '#ff9800' }}>
            {ok ? 'Response recorded' : 'Marked unavailable'}
          </h1>
          <p style={{ color: '#bbb', fontSize: '16px', lineHeight: 1.5 }}>
            {ok ? (
              <>
                The Duty Manager knows you are responding{eta ? ` and expects you in ${eta}` : ''}. Proceed to the reporting point.
              </>
            ) : (
              <>The Duty Manager knows you are unavailable. No further action needed.</>
            )}
          </p>
          {c && (
            <p style={{ color: '#666', fontSize: '13px', marginTop: '20px' }}>
              {c.incidentNo} · L{c.level} {c.type} · {c.location}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={page}>
      <div style={{ maxWidth: '440px', width: '100%' }}>
        <div style={{ background: '#c62828', padding: '6px 14px', borderRadius: '6px', display: 'inline-block', fontSize: '13px', fontWeight: 800, letterSpacing: '1px' }}>
          EMERGENCY RECALL{c ? ` — LEVEL ${c.level}` : ''}
        </div>

        <h1 style={{ fontSize: '30px', margin: '16px 0 6px', lineHeight: 1.2 }}>{c?.type || 'Crisis'}</h1>
        <p style={{ fontSize: '19px', color: '#ddd', margin: '0 0 4px' }}>{c?.location}</p>
        <p style={{ fontSize: '15px', color: '#888', margin: '0 0 6px' }}>Report to Command Centre L1</p>
        <p style={{ fontSize: '13px', color: '#666', margin: '0 0 26px' }}>
          {c?.incidentNo} · for {info.recipientName}
        </p>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '13px', color: '#999', marginBottom: '6px' }}>Estimated arrival (optional)</label>
          <input
            value={eta}
            onChange={(e) => setEta(e.target.value)}
            placeholder="e.g. 20 minutes"
            style={{ width: '100%', padding: '14px', fontSize: '17px', borderRadius: '10px', border: '1px solid #333', background: '#1a1d23', color: '#fff' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button onClick={() => respond('ACKNOWLEDGED')} disabled={busy} style={bigButton('#2e7d32')}>
            {busy ? '…' : "YES — I'M RESPONDING"}
          </button>
          {/* Decline matters as much as accept: without it the DM waits out the full
              window before learning someone is not coming, losing 10–15 minutes. */}
          <button onClick={() => respond('DECLINED')} disabled={busy} style={bigButton('#455a64')}>
            NO — UNAVAILABLE
          </button>
        </div>

        <p style={{ fontSize: '12px', color: '#555', marginTop: '22px', textAlign: 'center' }}>
          Sentosa Development Corporation · Crisis Management System
        </p>
      </div>
    </div>
  );
}
