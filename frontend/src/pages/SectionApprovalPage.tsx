import { useState } from 'react';
import { Layout } from '../components/Layout';
import { QueueStudent } from '../types';

interface SectionApprovalPageProps {
    officerName: string;
    heading: string;
    students: QueueStudent[];
    saving: boolean;
    onSave: (approvals: Record<string, boolean>) => void;
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
    const [checked, setChecked] = useState<Record<string, boolean>>(() => {
        const init: Record<string, boolean> = {};
        students.forEach((s) => { init[s.webmail] = s.approved; });
        return init;
    });

    const toggle = (webmail: string) =>
        setChecked((prev) => ({ ...prev, [webmail]: !prev[webmail] }));

    const handleSave = () => {
        if (!window.confirm('Are you sure you want to save these clearance updates?')) return;
        onSave(checked);
    };

    const notApproved = students.filter((s) => !checked[s.webmail]);
    const approved = students.filter((s) => checked[s.webmail]);

    const StudentRow = ({ s }: { s: QueueStudent }) => (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 16px',
            borderBottom: '1px solid #e2e8f0',
            background: '#ffffff'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input
                    type="checkbox"
                    checked={!!checked[s.webmail]}
                    onChange={() => toggle(s.webmail)}
                    style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#1b365d' }}>{s.roll}</span>
                <span style={{ fontWeight: 500 }}>{s.name}</span>
            </div>
            <span style={{ fontSize: 12, color: '#64748b' }}>{s.webmail}</span>
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
