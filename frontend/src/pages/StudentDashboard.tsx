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

/**
 * Student clearance dashboard — mirrors student.html exactly.
 *   Row 1 (five 20% panels): Caretaker, Gymkhana, Online-CC, Department, Labs
 *   Row 2 (three panels):    Warden, Library, CC
 *   Row 3 (three panels):    Assistant Registrar, HOD, Account
 * Every panel is clickable and opens its detail page.
 */
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
                className="panel panel-primary"
                onClick={() => onOpenSection(section, label)}
                style={{ cursor: 'pointer' }}
                title="Click to view details"
            >
                <div className={`panel-heading ${approved ? 'approved' : 'not-approved'}`}>{label}</div>
                <div className="panel-body">
                    Status : {approved ? 'Approved ✓' : 'Not Approved ⚠'}
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
            {/* Row 1 — five 20% panels */}
            <div className="container">
                <div className="row" style={{ marginBottom: 0 }}>
                    <div className="col-sm-3half"><Panel label="Caretaker" section="caretaker" /></div>
                    <div className="col-sm-3half"><Panel label="Gymkhana" section="gymkhana" /></div>
                    <div className="col-sm-3half"><Panel label="Online-CC" section="online_cc" /></div>
                    <div className="col-sm-3half"><Panel label="Department" section="department" /></div>
                    <div className="col-sm-3half"><Panel label="Labs" section="labs" /></div>
                </div>
            </div>
            <br />

            {/* Row 2 */}
            <div className="container">
                <div className="row">
                    <div className="col-sm-4"><Panel label="Warden" section="warden" /></div>
                    <div className="col-sm-4"><Panel label="Library" section="library" /></div>
                    <div className="col-sm-4"><Panel label="CC" section="cc" /></div>
                </div>
            </div>
            <br /><br />

            {/* Row 3 */}
            <div className="container">
                <div className="row">
                    <div className="col-sm-4"><Panel label="Assistant Registrar" section="assistant_registrar" /></div>
                    <div className="col-sm-4"><Panel label="HOD" section="hod" /></div>
                    <div className="col-sm-4"><Panel label="Account" section="account" /></div>
                </div>
            </div>
            <br /><br />

            <div className="col-sm-12">
                <p>&nbsp;&nbsp;➤&nbsp; For detailed status of approval by Department, click on 'Department'.</p>
                <p>&nbsp;&nbsp;➤&nbsp; For detailed status of approval by Labs, click on 'Labs'.</p>
            </div>
        </Layout>
    );
}
