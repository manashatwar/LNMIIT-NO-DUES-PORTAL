import { Layout } from '../components/Layout';
import { DetailItem } from '../types';

interface StudentDetailPageProps {
    title: string;       // e.g. "Department (CSE) Details" / "Lab Details"
    studentName: string;
    items: DetailItem[];
    onHome: () => void;
    onBack: () => void;
    onLogout: () => void;
}

/**
 * Detail breakdown page — mirrors student_dept_detail.html / student_lab_detail.html.
 * Lists each faculty / lab with green (Approved) or red (Not Approved) text.
 */
export function StudentDetailPage({
    title,
    studentName,
    items,
    onHome,
    onBack,
    onLogout,
}: StudentDetailPageProps) {
    return (
        <Layout title={`${title} | No Dues Portal`} userName={studentName} onHome={onHome} onLogout={onLogout}>
            <div className="container">
                <div className="col-sm-12">
                    <div className="well">
                        <h4>{title}</h4>
                        <hr />
                        {items.length === 0 ? (
                            <p className="text-muted">No records found.</p>
                        ) : (
                            items.map((item, i) => (
                                <p key={i}>
                                    <span style={{ color: item.approved ? 'green' : 'red', fontWeight: 500 }}>
                                        {item.name} &nbsp;:&nbsp; {item.approved ? 'Approved' : 'Not Approved'}
                                    </span>
                                </p>
                            ))
                        )}
                    </div>
                    <button className="btn btn-primary" onClick={onBack}>
                        ← Back to Dashboard
                    </button>
                </div>
            </div>
        </Layout>
    );
}
