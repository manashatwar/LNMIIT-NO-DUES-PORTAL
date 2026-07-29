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

/**
 * Officer approval page — mirrors the two-column split from base.html
 * (Not Approved | Approved). Checking a box approves; Save persists to the backend.
 */
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
        if (!window.confirm('Are you sure?')) return;
        onSave(checked);
    };

    const notApproved = students.filter((s) => !checked[s.webmail]);
    const approved = students.filter((s) => checked[s.webmail]);

    const Row = ({ s }: { s: QueueStudent }) => (
        <p style={{ textAlign: 'center', margin: '4px 0' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 20 }}>
                <input
                    type="checkbox"
                    checked={!!checked[s.webmail]}
                    onChange={() => toggle(s.webmail)}
                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                />
                <span style={{ minWidth: 70, fontFamily: 'monospace' }}>{s.roll}</span>
                <span>{s.name}</span>
            </span>
        </p>
    );

    return (
        <Layout
            title={`${heading} | No Dues Portal`}
            userName={officerName}
            onLogout={onLogout}
            onRules={onRules}
            onContact={onContact}
        >
            <div className="container-fluid" style={{ textAlign: 'center' }}>
                <div className="row content">
                    <div className="well">
                        <h2>{heading}</h2>
                    </div>

                    <h4 style={{ marginBottom: 20 }}>☑&nbsp;&nbsp;Check to approve No Dues</h4>

                    <div style={{ display: 'flex', flexWrap: 'wrap', marginBottom: 20 }}>
                        <div className="col-sm-6" style={{ textAlign: 'center', borderRight: '1px solid #eee' }}>
                            <h4>Not Approved</h4>
                            <hr />
                            {notApproved.length === 0
                                ? <p className="text-muted">None</p>
                                : notApproved.map((s) => <Row key={s.webmail} s={s} />)}
                        </div>

                        <div className="col-sm-6" style={{ textAlign: 'center' }}>
                            <h4>Approved</h4>
                            <hr />
                            {approved.length === 0
                                ? <p className="text-muted">None yet</p>
                                : approved.map((s) => <Row key={s.webmail} s={s} />)}
                        </div>
                    </div>

                    <br />
                    <div className="col-sm-12" style={{ marginBottom: 20 }}>
                        <button className="btn btn-success" onClick={handleSave} disabled={saving}>
                            {saving ? 'Saving…' : 'Save changes'}
                        </button>
                    </div>
                </div>
            </div>
        </Layout>
    );
}
