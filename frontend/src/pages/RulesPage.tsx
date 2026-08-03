import { Layout } from '../components/Layout';

interface RulesPageProps {
    onLogout: () => void;
    onHome: () => void;
}

/**
 * Replicates rules.html
 */
export function RulesPage({ onLogout, onHome }: RulesPageProps) {
    const rules = [
        'Students must clear all pending dues before applying for No-Dues.',
        'Each section must be cleared independently. The order of clearance follows the institute circular.',
        'Upload documents in JPG, PNG, or PDF format. Maximum file size: 10 MB.',
        'LUCS may submit either a file or an event-report URL.',
        'A cancelled cheque is required for refund processing by the Accounts section.',
        'Any rejected section requires re-submission by the student with the corrected document.',
        'The No-Dues certificate is issued only when all required sections have approved.',
        'Hostel clearance is specific to the student\'s assigned hostel.',
        'HOD clearance depends on prior clearance of Store Release, LUCS, Sports, Medical Unit, NAD Cell, and Department form.',
    ];

    return (
        <Layout
            title="Rules | No Dues Portal"
            userName=""
            onHome={onHome}
            onLogout={onLogout}
        >
            <div className="container-fluid" style={{ textAlign: 'center' }}>
                <div className="row content">
                    <div className="well">
                        <h2>Important Rules</h2>
                    </div>
                    <div className="col-sm-9" style={{ textAlign: 'left' }}>
                        {rules.map((rule, i) => (
                            <p key={i}>
                                &nbsp;&nbsp;➤&nbsp;{rule}
                            </p>
                        ))}
                    </div>
                </div>
            </div>
        </Layout>
    );
}
