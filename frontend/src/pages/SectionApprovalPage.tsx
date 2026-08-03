import { useState, Fragment } from 'react';
import { Layout } from '../components/Layout';
import { QueueRow, SectionReview } from '../types';
import { api } from '../api';

interface SectionApprovalPageProps {
    officerName: string;
    heading: string;
    rows: QueueRow[];
    onReload: () => void;
    onLogout: () => void;
    onRules: () => void;
    onContact: () => void;
}

/**
 * Officer desk: scoped queue of requests for this section.
 * Approve is disabled until prerequisites are met (backend also enforces it).
 * Reject requires a written reason. Expand a row to see documents + OCR.
 */
export function SectionApprovalPage({ officerName, heading, rows, onReload, onLogout, onRules, onContact }: SectionApprovalPageProps) {
    const [busy, setBusy] = useState<number | null>(null);
    const [msg, setMsg] = useState('');
    const [expanded, setExpanded] = useState<number | null>(null);
    const [review, setReview] = useState<SectionReview | null>(null);
    const [feedbackDraft, setFeedbackDraft] = useState('');
    const [msgOpen, setMsgOpen] = useState(false);

    const sendFeedback = async (requestId: number) => {
        if (!feedbackDraft.trim()) return;
        try {
            await api.officerComment(requestId, feedbackDraft.trim());
            setFeedbackDraft('');
            setReview(await api.sectionReview(requestId));
        } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not send message'); }
    };

    const approve = async (row: QueueRow) => {
        setBusy(row.request_id); setMsg('');
        try { await api.approve(row.request_id); setMsg(`✓ Approved ${row.roll_no}`); onReload(); }
        catch (e) { setMsg(e instanceof Error ? e.message : 'Approve failed'); }
        finally { setBusy(null); }
    };

    const reject = async (row: QueueRow) => {
        const reason = window.prompt(`Reason for rejecting ${row.name} (${row.roll_no}):`);
        if (reason === null) return;
        if (!reason.trim()) { setMsg('A reason is required to reject.'); return; }
        setBusy(row.request_id); setMsg('');
        try { await api.reject(row.request_id, reason.trim()); setMsg(`Rejected ${row.roll_no}`); onReload(); }
        catch (e) { setMsg(e instanceof Error ? e.message : 'Reject failed'); }
        finally { setBusy(null); }
    };

    const toggleReview = async (row: QueueRow) => {
        if (expanded === row.request_id) { setExpanded(null); setReview(null); return; }
        setExpanded(row.request_id); setReview(null);
        try { setReview(await api.sectionReview(row.request_id)); } catch { /* ignore */ }
    };

    const badge = (status: string) => {
        const c = status === 'APPROVED' ? '#16a34a' : status === 'REJECTED' ? '#dc2626' : '#b45309';
        return <span style={{ color: c, fontWeight: 700 }}>{status}</span>;
    };

    return (
        <Layout title={`${heading} | No Dues`} userName={officerName} onLogout={onLogout} onRules={onRules} onContact={onContact}>
            <div className="container">
                <div className="lnmiit-section-title-banner" style={{ borderRadius: 6, marginBottom: 16 }}>
                    <span>OFFICER APPROVAL DESK &nbsp;|&nbsp; {heading.toUpperCase()}</span>
                    <span style={{ fontSize: 12, fontWeight: 'normal' }}>Officer: {officerName}</span>
                </div>

                {msg && <div className="well" style={{ padding: '8px 12px', marginBottom: 16, fontSize: 13 }}>{msg}</div>}

                <div className="well" style={{ padding: 0, overflow: 'hidden' }}>
                    <table className="table" style={{ marginBottom: 0 }}>
                        <thead>
                            <tr>
                                <th>Roll No</th><th>Name</th><th>Dept</th><th>Hostel</th><th>Status</th><th style={{ width: 260 }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && (
                                <tr><td colSpan={6} style={{ textAlign: 'center', color: '#94a3b8' }}>No requests in your queue.</td></tr>
                            )}
                            {rows.map((row) => (
                                <Fragment key={row.request_id}>
                                    <tr>
                                        <td style={{ fontFamily: 'monospace' }}>{row.roll_no}</td>
                                        <td>{row.name}</td>
                                        <td>{row.department}</td>
                                        <td>{row.hostel}</td>
                                        <td>{badge(row.status)}</td>
                                        <td>
                                            <button className="btn btn-success" style={{ fontSize: 12, padding: '3px 8px', marginRight: 4 }}
                                                disabled={busy === row.request_id || !row.actionable || row.status === 'APPROVED'}
                                                title={!row.actionable ? 'Prerequisites not yet approved' : ''}
                                                onClick={() => approve(row)}>Approve</button>
                                            <button className="btn btn-danger" style={{ fontSize: 12, padding: '3px 8px', marginRight: 4 }}
                                                disabled={busy === row.request_id}
                                                onClick={() => reject(row)}>Reject</button>
                                            <button className="btn btn-primary" style={{ fontSize: 12, padding: '3px 8px' }}
                                                onClick={() => toggleReview(row)}>{expanded === row.request_id ? 'Hide' : 'View'}</button>
                                        </td>
                                    </tr>
                                    {expanded === row.request_id && (
                                        <tr>
                                            <td colSpan={6} style={{ background: '#f8fafc' }}>
                                                {!review ? <span className="text-muted">Loading…</span> : (
                                                    <div style={{ fontSize: 12 }}>
                                                        <div><strong>Vacated Room:</strong> {review.vacant_room_no || '—'}</div>

                                                        {review.intake && review.intake.length > 0 && (
                                                            <div style={{ marginTop: 8, border: '1px solid #cbd5e1', borderRadius: 6, padding: 10, background: '#eef4ff' }}>
                                                                <strong style={{ fontSize: 12, color: '#1b365d' }}>🎒 Student Intake (Page 2 — submitted before reaching your queue)</strong>
                                                                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                                    {review.intake.map((sec) => {
                                                                        const c = sec.status === 'APPROVED' ? '#15803d' : sec.status === 'REJECTED' ? '#b91c1c' : '#b45309';
                                                                        return (
                                                                            <div key={sec.code} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: 8 }}>
                                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                                    <strong style={{ fontSize: 12 }}>{sec.name}</strong>
                                                                                    <span style={{ fontSize: 11, fontWeight: 700, color: c }}>{sec.status}</span>
                                                                                </div>
                                                                                {sec.documents.length === 0 ? (
                                                                                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>No document submitted.</div>
                                                                                ) : sec.documents.map((d) => (
                                                                                    <div key={d.id} style={{ fontSize: 11, marginTop: 4 }}>
                                                                                        📎 {d.original_name || d.event_report_url || `Doc #${d.id}`}
                                                                                        {d.download_url && <a href={d.download_url} target="_blank" rel="noreferrer" style={{ marginLeft: 6, color: '#2563eb' }}>👁 Open</a>}
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {review.section.documents.length === 0 ? (
                                                            <div style={{ marginTop: 6 }} className="text-muted">No documents / links submitted.</div>
                                                        ) : review.section.documents.map((d) => {
                                                            const rev = d.ocr_fields?.review as Record<string, string> | undefined;
                                                            return (
                                                                <div key={d.id} style={{ marginTop: 8, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: 10 }}>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                        <strong>📎 {d.original_name || d.event_report_url || `Document #${d.id}`}</strong>
                                                                        {d.download_url && (
                                                                            <a href={d.download_url} target="_blank" rel="noreferrer"
                                                                                style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'underline' }}>
                                                                                👁 Open / Download
                                                                            </a>
                                                                        )}
                                                                        {d.event_report_url && !d.download_url && (
                                                                            <a href={d.event_report_url} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>🔗 Open link</a>
                                                                        )}
                                                                    </div>
                                                                    {rev && Object.keys(rev).length > 0 && (
                                                                        <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, color: '#475569' }}>
                                                                            {Object.entries(rev).map(([k, v]) => (
                                                                                v ? (
                                                                                    <div key={k} style={(k === 'title' || k === 'purpose' || k === 'event_name') ? { gridColumn: '1 / -1' } : undefined}>
                                                                                        <strong style={{ textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}:</strong>{' '}
                                                                                        <span style={k === 'plagiarism' ? { color: '#b91c1c' } : undefined}>{v}</span>
                                                                                    </div>
                                                                                ) : null
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                    {d.ocr_text && (
                                                                        <div style={{ marginTop: 6 }}>
                                                                            <strong>OCR (advisory):</strong>
                                                                            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, background: '#f8fafc', padding: 6, border: '1px solid #e2e8f0', margin: '4px 0 0' }}>{d.ocr_text.slice(0, 500)}</pre>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}

                                                        {review.prerequisites && review.prerequisites.length > 0 && (
                                                            <div style={{ marginTop: 10, border: '1px solid #cbd5e1', borderRadius: 6, padding: 10, background: '#f8fafc' }}>
                                                                <strong style={{ fontSize: 12, color: '#1b365d' }}>📋 Consolidation — {review.prerequisites.length} dependent section{review.prerequisites.length !== 1 ? 's' : ''} (documents · OCR · status · discussion)</strong>
                                                                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                                    {review.prerequisites.map((p) => {
                                                                        const c = p.status === 'APPROVED' ? '#15803d' : p.status === 'REJECTED' ? '#b91c1c' : '#b45309';
                                                                        const prev = (p.documents[0]?.ocr_fields?.review || {}) as Record<string, string>;
                                                                        return (
                                                                            <div key={p.code} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: 8 }}>
                                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                                    <strong style={{ fontSize: 12 }}>{p.name}</strong>
                                                                                    <span style={{ fontSize: 11, fontWeight: 700, color: c }}>{p.status}</span>
                                                                                </div>
                                                                                {p.documents.map((d) => (
                                                                                    <div key={d.id} style={{ fontSize: 11, marginTop: 4 }}>
                                                                                        📎 {d.original_name || d.event_report_url || `Doc #${d.id}`}
                                                                                        {d.download_url && <a href={d.download_url} target="_blank" rel="noreferrer" style={{ marginLeft: 6, color: '#2563eb' }}>👁 Open</a>}
                                                                                        {d.ocr_text && (
                                                                                            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 10, background: '#f8fafc', padding: 4, margin: '2px 0 0', border: '1px solid #eef2f7' }}>{d.ocr_text.slice(0, 200)}</pre>
                                                                                        )}
                                                                                    </div>
                                                                                ))}
                                                                                {Object.keys(prev).length > 0 && (
                                                                                    <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>
                                                                                        {Object.entries(prev).filter(([, v]) => v).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' · ')}
                                                                                    </div>
                                                                                )}
                                                                                {p.comments.filter((cm) => cm.body).length > 0 && (
                                                                                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                                                                                        💬 {p.comments.filter((cm) => cm.body).slice(-1)[0].body}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}

                                                        <div style={{ marginTop: 8 }}>
                                                            <button onClick={() => setMsgOpen((o) => !o)}
                                                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 700, color: '#2563eb', fontSize: 12 }}>
                                                                💬 Messages{review.section.comments.length ? ` (${review.section.comments.length})` : ''} {msgOpen ? '▲' : '▼'}
                                                            </button>
                                                            {msgOpen && (
                                                                <div style={{ marginTop: 6 }}>
                                                                    {review.section.comments.length === 0 && <span className="text-muted">No messages yet.</span>}
                                                                    <ul style={{ margin: '4px 0 0 16px' }}>
                                                                        {review.section.comments.map((c, i) => (
                                                                            <li key={i}>{c.is_system ? '⚙️ ' : ''}{c.body} <span className="text-muted">— {c.author}</span></li>
                                                                        ))}
                                                                    </ul>
                                                                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                                                        <input type="text" value={feedbackDraft} onChange={(e) => setFeedbackDraft(e.target.value)}
                                                                            onKeyDown={(e) => { if (e.key === 'Enter') sendFeedback(row.request_id); }}
                                                                            placeholder="Send a message to the student…"
                                                                            style={{ flex: 1, fontSize: 12, padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: 4 }} />
                                                                        <button className="btn btn-primary" style={{ fontSize: 12, padding: '2px 10px' }}
                                                                            onClick={() => sendFeedback(row.request_id)}>Send</button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </Layout>
    );
}
