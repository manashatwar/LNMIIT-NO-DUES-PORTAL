import React, { useState } from 'react';
import { api } from '../api';
import { RefundRowState } from '../types';

const input: React.CSSProperties = { padding: '3px 6px', fontSize: 11 };
const smallBtn: React.CSSProperties = { fontSize: 11, padding: '3px 8px' };

const localToday = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const rupees = (v: string) => `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

/**
 * The Refund and Action cells of the Approved tab, for whoever sends Accounts'
 * refunds. Three actions only:
 *  - Mark refund sent: pay it from the bank, enter the UTR → the request clears,
 *    the student is told and their certificate unlocks.
 *  - No refund due: same, with nothing paid.
 *  - Reject: send it back to the student with a reason (e.g. wrong bank details).
 * Paying waits until every section has approved; Reject works any time before
 * the refund is recorded.
 */
export function RefundCells({ info, modes, onDone, onMessage }: {
    info: RefundRowState;
    modes: string[];
    onDone: () => void | Promise<void>;
    onMessage: (text: string) => void;
}) {
    const r = info.refund;
    const [busy, setBusy] = useState(false);
    const [amount, setAmount] = useState(info.suggested_amount);
    const [mode, setMode] = useState(modes[0] || 'NEFT');
    const [reference, setReference] = useState('');
    const [paidOn, setPaidOn] = useState(localToday());
    const [rejecting, setRejecting] = useState(false);
    const [reason, setReason] = useState('');

    const record = async (noRefund: boolean) => {
        if (noRefund && !window.confirm(`Record that no refund is due for ${info.name} (${info.roll_no})?\n\nTheir clearance completes and the certificate unlocks.`)) return;
        setBusy(true);
        try {
            await api.recordRefund(noRefund ? { request_id: info.request_id, no_refund: true }
                : { request_id: info.request_id, amount, mode, reference, paid_on: paidOn });
            await onDone();
            onMessage(noRefund ? `✓ ${info.roll_no}: recorded that no refund is due. The student has been told and their certificate is unlocked.`
                : `✓ ${info.roll_no}: refund of ${rupees(amount)} recorded. The student has been told and their certificate is unlocked.`);
        } catch (e) { onMessage(e instanceof Error ? e.message : 'Could not record the refund'); }
        finally { setBusy(false); }
    };

    const reject = async () => {
        if (!reason.trim()) return;
        setBusy(true);
        try {
            await api.rejectRefund(info.request_id, reason.trim());
            await onDone();
            onMessage(`↩ ${info.roll_no}: sent back to the student with your reason. Once they fix it, it goes through Accounts again.`);
        } catch (e) { onMessage(e instanceof Error ? e.message : 'Could not send it back'); }
        finally { setBusy(false); }
    };

    // ── Refund cell ──
    let refundCell: React.ReactNode;
    if (info.state === 'not_due') {
        refundCell = <span style={{ fontSize: 11, color: '#15803d' }}>✅ No refund due</span>;
    } else if (info.state === 'sent' && r) {
        refundCell = (
            <div style={{ fontSize: 11, color: '#15803d' }}>
                ✅ <strong>Sent {rupees(r.amount)}</strong> · {r.mode}
                <div style={{ color: '#475569' }}>
                    UTR <code>{r.reference}</code>{r.paid_on ? ` · ${new Date(r.paid_on).toLocaleDateString()}` : ''}
                </div>
            </div>
        );
    } else if (info.state === 'waiting') {
        refundCell = (
            <div style={{ fontSize: 11, color: '#94a3b8' }}>
                ⏳ Waiting for {info.waiting_for.join(', ')}
            </div>
        );
    } else {
        refundCell = (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 220 }}>
                <div style={{ fontSize: 10, color: '#475569' }}>
                    Pay to {info.bank.account_holder || 'the student'} · A/c <code>{info.bank.account_no || '—'}</code> · {info.bank.ifsc}
                </div>
                <div style={{ display: 'flex', gap: 3 }}>
                    <input className="erp-input" style={{ ...input, width: 80 }} type="number" min={0} step="0.01" title="Amount (₹)"
                        value={amount} onChange={(e) => setAmount(e.target.value)} />
                    <select className="erp-select" style={{ ...input, width: 'auto' }} value={mode} onChange={(e) => setMode(e.target.value)}>
                        {modes.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <input className="erp-input" style={{ ...input, width: 118 }} type="date" max={localToday()} title="Paid on"
                        value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
                </div>
                <input className="erp-input" style={input} placeholder="UTR / transaction ref." maxLength={64}
                    value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
        );
    }

    // ── Action cell: Mark refund sent · No refund due · Reject ──
    const done = info.state === 'sent' || info.state === 'not_due';
    const waitTitle = info.state === 'waiting' ? `Waiting for ${info.waiting_for.join(', ')}` : undefined;
    let actionCell: React.ReactNode;
    if (done) {
        actionCell = <span style={{ color: '#94a3b8' }}>—</span>;
    } else if (rejecting) {
        // Own keys: fresh buttons, not the three above restyled (.btn fades colours over 0.2s).
        actionCell = (
            <div key="reject" style={{ display: 'flex', gap: 4 }}>
                <input autoFocus type="text" value={reason} onChange={(e) => setReason(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') reject(); if (e.key === 'Escape') { setRejecting(false); setReason(''); } }}
                    placeholder="Reason (required)…"
                    style={{ flex: 1, minWidth: 0, fontSize: 12, padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: 4 }} />
                <button className="btn btn-danger" style={smallBtn} disabled={busy || !reason.trim()} onClick={reject}>Confirm</button>
                <button className="btn btn-secondary" style={smallBtn} disabled={busy}
                    onClick={() => { setRejecting(false); setReason(''); }}>Cancel</button>
            </div>
        );
    } else {
        actionCell = (
            <div key="actions" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <button className="btn btn-success" style={smallBtn} disabled={busy || info.state !== 'ready'}
                    title={waitTitle} onClick={() => record(false)}>{busy ? 'Saving…' : 'Mark refund sent'}</button>
                <button className="btn btn-secondary" style={smallBtn} disabled={busy || info.state !== 'ready'}
                    title={waitTitle} onClick={() => record(true)}>No refund due</button>
                <button className="btn btn-danger" style={smallBtn} disabled={busy}
                    title="Send it back to the student with a reason" onClick={() => setRejecting(true)}>Reject</button>
            </div>
        );
    }

    return <><td>{refundCell}</td><td>{actionCell}</td></>;
}
