import { Layout } from '../components/Layout';

interface ContactPageProps {
    onLogout: () => void;
    onHome: () => void;
}

/**
 * Replicates contact.html
 */
export function ContactPage({ onLogout, onHome }: ContactPageProps) {
    const contacts = [
        { name: 'Dean of Academic Affairs', phone: 'dean.academics@lnmiit.ac.in' },
        { name: 'Registrar Office', phone: 'registrar@lnmiit.ac.in' },
        { name: 'Central Library', phone: 'library@lnmiit.ac.in' },
        { name: 'Accounts Section', phone: 'accounts@lnmiit.ac.in' },
        { name: 'TPC / Placement', phone: 'tpc@lnmiit.ac.in' },
    ];

    return (
        <Layout
            title="Contact | No Dues Portal"
            userName=""
            onHome={onHome}
            onLogout={onLogout}
        >
            <div className="container-fluid" style={{ textAlign: 'center' }}>
                <div className="row content">
                    <div className="well">
                        <h2>Important Contacts</h2>
                    </div>
                    <div className="col-sm-9" style={{ textAlign: 'left' }}>
                        {contacts.map((c, i) => (
                            <p key={i}>
                                &nbsp;&nbsp;➤&nbsp;<strong>{c.name}</strong>:{' '}
                                <a href={`mailto:${c.phone}`}>{c.phone}</a>
                            </p>
                        ))}
                    </div>
                </div>
            </div>
        </Layout>
    );
}
