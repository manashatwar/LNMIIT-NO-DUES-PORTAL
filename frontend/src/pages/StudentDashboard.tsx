import { Layout } from '../components/Layout';
import { StudentStatus, SectionKey } from '../types';

interface StudentDashboardProps {
    student: StudentStatus;
    onHome: () => void;
    onLogout: () => void;
    onRules: () => void;
    onContact: () => void;
    onOpenSection: (section: SectionKey, label: string) => void;
}

export function StudentDashboard({
    student,
    onHome,
    onLogout,
    onRules,
    onContact,
    onOpenSection,
}: StudentDashboardProps) {
    const Panel = ({ label, section }: { label: string; section: SectionKey }) => {
        const approved = student.sections[section];
        return (
            <div
                className="panel"
                onClick={() => onOpenSection(section, label)}
                style={{ cursor: 'pointer' }}
                title="Click to view section clearance details"
            >
                <div className={`panel-heading ${approved ? 'approved' : 'not-approved'}`}>
                    {label}
                </div>
                <div className="panel-body">
                    <strong>Status :</strong>{' '}
                    <span style={{ color: approved ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                        {approved ? 'Approved ✓' : 'Not Approved ⚠'}
                    </span>
                </div>
            </div>
        );
    };

    return (
        <Layout
            title="Student Homepage"
            userName={student.name}
            onHome={onHome}
            onLogout={onLogout}
            onRules={onRules}
            onContact={onContact}
        >
            <div className="container">
                {/* ERP Header Banner for Student Status */}
                <div className="lnmiit-section-title-banner" style={{ borderRadius: 6, marginBottom: 24 }}>
                    <span>STUDENT INFORMATION &nbsp;|&nbsp; NO DUES CLEARANCE MATRIX</span>
                    <span style={{ fontSize: 12, fontWeight: 'normal' }}>Roll No: {student.roll} ({student.dept})</span>
                </div>

                {/* ERP Styled Tab Header */}
                <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #cbd5e1', marginBottom: 24 }}>
                    <div style={{
                        padding: '8px 18px',
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderBottom: '2px solid #b91c1c',
                        fontWeight: 'bold',
                        color: '#1b365d',
                        borderRadius: '4px 4px 0 0'
                    }}>
                        Clearance Matrix
                    </div>
                </div>

                {/* Row 1 — five 20% panels */}
                <div className="row" style={{ marginBottom: 12 }}>
                    <div className="col-sm-3half"><Panel label="Caretaker" section="caretaker" /></div>
                    <div className="col-sm-3half"><Panel label="Gymkhana" section="gymkhana" /></div>
                    <div className="col-sm-3half"><Panel label="Online-CC" section="online_cc" /></div>
                    <div className="col-sm-3half"><Panel label="Department" section="department" /></div>
                    <div className="col-sm-3half"><Panel label="Labs" section="labs" /></div>
                </div>

                {/* Row 2 */}
                <div className="row" style={{ marginBottom: 12 }}>
                    <div className="col-sm-4"><Panel label="Warden" section="warden" /></div>
                    <div className="col-sm-4"><Panel label="Library" section="library" /></div>
                    <div className="col-sm-4"><Panel label="CC" section="cc" /></div>
                </div>

                {/* Row 3 */}
                <div className="row" style={{ marginBottom: 24 }}>
                    <div className="col-sm-4"><Panel label="Assistant Registrar" section="assistant_registrar" /></div>
                    <div className="col-sm-4"><Panel label="HOD" section="hod" /></div>
                    <div className="col-sm-4"><Panel label="Account" section="account" /></div>
                </div>

                <div className="well" style={{ background: '#f8fafc' }}>
                    <p style={{ margin: 0, fontSize: 13, color: '#475569' }}>
                        ➤ <strong>Department Clearance:</strong> Click on &apos;Department&apos; panel above to view individual faculty approvals.
                    </p>
                    <p style={{ margin: '6px 0 0 0', fontSize: 13, color: '#475569' }}>
                        ➤ <strong>Lab Clearance:</strong> Click on &apos;Labs&apos; panel above to view individual laboratory approvals.
                    </p>
                </div>
            </div>
        </Layout>
    );
}
