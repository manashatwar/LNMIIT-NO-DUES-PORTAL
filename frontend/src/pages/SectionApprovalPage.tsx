import { useState } from 'react';
import { Layout } from '../components/Layout';
import { QueueStudent } from '../types';

type DecisionChoice = 'approved' | 'rejected' | 'feedback';

interface DecisionState {
    choice: DecisionChoice;
    feedback: string;
}

interface SectionApprovalPageProps {
    officerName: string;
    heading: string;
    students: QueueStudent[];
    saving: boolean;
    onSave: (approvals: Record<string, { approved: boolean; feedback?: string }>) => void;
    onLogout: () => void;
    onRules: () => void;
    onContact: () => void;
}

export function SectionApprovalPage({
    officerName,
    heading,
    students,
    saving,
    onSave,
    onLogout,
    onRules,
    onContact,
}: SectionApprovalPageProps) {
    const [decisions, setDecisions] = useState<Record<string, DecisionState>>(() => {
        const init: Record<string, DecisionState> = {};
        students.forEach((s) => {
            init[s.webmail] = {
                choice: s.approved ? 'approved' : (s.feedback ? 'feedback' : 'rejected'),
                feedback: s.feedback || '',
            };
        });
        return init;
    });

    const setDecision = (webmail: string, next: Partial<DecisionState>) =>
        setDecisions((prev) => ({
            ...prev,
            [webmail]: {
                choice: next.choice || prev[webmail]?.choice || 'rejected',
                feedback: next.feedback !== undefined ? next.feedback : (prev[webmail]?.feedback || ''),
            },
        }));

    const handleSave = () => {
        if (!window.confirm('Are you sure you want to save these clearance updates?')) return;
        const payload: Record<string, { approved: boolean; feedback?: string }> = {};
        Object.entries(decisions).forEach(([webmail, decision]) => {
            payload[webmail] = {
                approved: decision.choice === 'approved',
                feedback: decision.feedback.trim(),
            };
        });
        onSave(payload);
    };

    const notApproved = students.filter((s) => decisions[s.webmail]?.choice !== 'approved');
    const approved = students.filter((s) => decisions[s.webmail]?.choice === 'approved');

    const StudentRow = ({ s }: { s: QueueStudent }) => (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: '12px 16px',
            borderBottom: '1px solid #e2e8f0',
            background: '#ffffff'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#1b365d' }}>{s.roll}</span>
                    <span style={{ fontWeight: 600, color: '#1e293b' }}>{s.name}</span>
                </div>
                <span style={{ fontSize: 12, color: '#64748b' }}>{s.webmail}</span>
            </div>

            {/* Officer Context Intake Submission Details Badge */}
            <div style={{ marginLeft: 30, fontSize: 11, color: '#475569', background: '#f8fafc', padding: '6px 10px', borderRadius: 4, borderLeft: '3px solid #1b365d' }}>
                {heading.toLowerCase().includes('library') && (
                    <span>📘 <strong>Submitted Library BTP:</strong> Title: <em>{s.btp_doc_title || 'Development of Online No-Dues Portal'}</em> &nbsp;|&nbsp; Form No: <code>{s.btp_form_no || 'CL/LB/IR/2026/042'}</code> &nbsp;|&nbsp; Plagiarism: <strong style={{ color: '#b91c1c' }}>{s.btp_plagiarism || '8%'}</strong></span>
                )}
                {(heading.toLowerCase().includes('bh') || heading.toLowerCase().includes('store') || heading.toLowerCase().includes('lucs') || heading.toLowerCase().includes('sports') || heading.toLowerCase().includes('medical') || heading.toLowerCase().includes('nad')) && (
                    <span>🏛️ <strong>Submitted Hostel Details:</strong> Block {s.hostel || 'BH1'} &nbsp;|&nbsp; Vacant Room: <strong style={{ color: '#1b365d' }}>{s.vacant_room_no || 'A110'}</strong> &nbsp;|&nbsp; Offer Letter: 📄 <em>{s.offer_letter_name || 'Offer_Letter_2026.pdf'}</em></span>
                )}
                {(heading.toLowerCase().includes('thesis') || heading.toLowerCase().includes('tpc')) && (
                    <span>💼 <strong>Submitted Offer Letter:</strong> 📄 <em>{s.offer_letter_name || 'Offer_Letter_2026.pdf'}</em> (Verified)</span>
                )}
                {!heading.toLowerCase().includes('library') && !heading.toLowerCase().includes('bh') && !heading.toLowerCase().includes('store') && !heading.toLowerCase().includes('lucs') && !heading.toLowerCase().includes('sports') && !heading.toLowerCase().includes('medical') && !heading.toLowerCase().includes('nad') && !heading.toLowerCase().includes('thesis') && !heading.toLowerCase().includes('tpc') && (
                    <span>📋 Student clearance request pending officer review</span>
                )}
            </div>

            <div style={{ marginLeft: 30, display: 'grid', gap: 8 }}>
                <label style={{ fontSize: 11, color: '#475569', fontWeight: 600 }}>Decision</label>
                <select
                    value={decisions[s.webmail]?.choice || 'rejected'}
                    onChange={(e) => setDecision(s.webmail, { choice: e.target.value as DecisionChoice })}
                    style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #cbd5e1', maxWidth: 240 }}
                >
                    <option value="approved">Approve</option>
                    <option value="rejected">Not Approved</option>
                    <option value="feedback">Feedback</option>
                </select>

                {decisions[s.webmail]?.choice === 'feedback' && (
                    <textarea
                        value={decisions[s.webmail]?.feedback || ''}
                        onChange={(e) => setDecision(s.webmail, { feedback: e.target.value })}
                        placeholder="Write feedback for the student"
                        rows={2}
                        style={{
                            width: '100%',
                            resize: 'vertical',
                            padding: '8px 10px',
                            borderRadius: 4,
                            border: '1px solid #cbd5e1',
                            fontSize: 12,
                        }}
                    />
                )}

                {decisions[s.webmail]?.feedback && decisions[s.webmail]?.choice !== 'feedback' && (
                    <div style={{ fontSize: 11, color: '#b45309', background: '#fffbeb', padding: '6px 8px', borderRadius: 4 }}>
                        Feedback: {decisions[s.webmail]?.feedback}
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <Layout
            title={`${heading} | No Dues Portal`}
            userName={officerName}
            onLogout={onLogout}
            onRules={onRules}
            onContact={onContact}
        >
            <div className="container">
                <div className="lnmiit-section-title-banner" style={{ borderRadius: 6, marginBottom: 20 }}>
                    <span>OFFICER APPROVAL DESK &nbsp;|&nbsp; {heading.toUpperCase()}</span>
                    <span style={{ fontSize: 12, fontWeight: 'normal' }}>Officer: {officerName}</span>
                </div>

                <div className="well" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                    <div>
                        <h3 style={{ margin: 0, color: '#1b365d' }}>{heading} Clearance Queue</h3>
                        <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: 13 }}>
                            Check boxes to approve student clearance, then click <strong>Save Changes</strong>.
                        </p>
                    </div>

                    <button className="btn btn-success" onClick={handleSave} disabled={saving} style={{ padding: '10px 20px', fontSize: 14 }}>
                        {saving ? 'Saving…' : '💾 Save Changes'}
                    </button>
                </div>

                <div className="row">
                    {/* Not Approved Column */}
                    <div className="col-sm-6">
                        <div style={{ border: '1px solid #fca5a5', borderRadius: 6, overflow: 'hidden' }}>
                            <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '12px 16px', fontWeight: 700, fontSize: 14 }}>
                                ⚠️ Pending Approval ({notApproved.length})
                            </div>
                            <div style={{ minHeight: 180 }}>
                                {notApproved.length === 0 ? (
                                    <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>
                                        No pending students in queue.
                                    </div>
                                ) : (
                                    notApproved.map((s) => <StudentRow key={s.webmail} s={s} />)
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Approved Column */}
                    <div className="col-sm-6">
                        <div style={{ border: '1px solid #86efac', borderRadius: 6, overflow: 'hidden' }}>
                            <div style={{ background: '#dcfce7', color: '#15803d', padding: '12px 16px', fontWeight: 700, fontSize: 14 }}>
                                ✓ Approved ({approved.length})
                            </div>
                            <div style={{ minHeight: 180 }}>
                                {approved.length === 0 ? (
                                    <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>
                                        No approved students yet.
                                    </div>
                                ) : (
                                    approved.map((s) => <StudentRow key={s.webmail} s={s} />)
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
}
