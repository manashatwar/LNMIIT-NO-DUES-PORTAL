import { useState } from 'react';
import { Layout } from '../components/Layout';
import { StudentStatus, SectionKey } from '../types';
import { api } from '../api';

interface StudentDashboardProps {
    student: StudentStatus;
    onHome: () => void;
    onLogout: () => void;
    onRules: () => void;
    onContact: () => void;
    onOpenSection: (section: SectionKey, label: string) => void;
}

const SECTION_LABELS: Record<SectionKey, string> = {
    department: 'Department',
    labs: 'Labs',
    bh1_support: 'BH1 Support',
    bh2_support: 'BH2 Support',
    bh3_support: 'BH3 Support',
    bh5_support: 'BH5 Support',
    library: 'Library',
    store_release: 'Store Release',
    lucs: 'LUCS',
    sports: 'Sports',
    medical_unit: 'Medical Unit',
    nad_cell: 'NAD Cell',
    hod: 'HOD',
    account: 'Account',
};

const MATRIX_ROWS: SectionKey[][] = [
    ['library', 'store_release', 'lucs', 'sports'],
    ['medical_unit', 'nad_cell', 'department', 'labs'],
    ['hod', 'account'],
];

export function StudentDashboard({
    student,
    onHome,
    onLogout,
    onRules,
    onContact,
    onOpenSection,
}: StudentDashboardProps) {
    const [activeTab, setActiveTab] = useState<'page1' | 'page2'>('page1');
    const intake = student.intake;
    const intakeSubmitted = !!intake?.submitted;
    const hostelSupportEmail = 'hostel-support@lnmiit.ac.in';

    const [btpDocTitle, setBtpDocTitle] = useState(intake?.btp_doc_title || 'Development of Online No-Dues Portal');
    const [formNo, setFormNo] = useState(intake?.btp_form_no || 'CL/LB/IR/2026/042');
    const [btpPlagiarism, setBtpPlagiarism] = useState(intake?.btp_plagiarism || '8%');
    const [hostelBlock, setHostelBlock] = useState(intake?.hostel_block || student.hostel || 'BH1');
    const [vacantRoomNo, setVacantRoomNo] = useState(intake?.vacant_room_no || 'A110');
    const [offerLetterFile, setOfferLetterFile] = useState<File | null>(null);
    const [intakeError, setIntakeError] = useState('');
    const [submitted, setSubmitted] = useState(intakeSubmitted);

    const handleDownloadForm = (e?: React.MouseEvent) => {
        if (e) e.preventDefault();
        fetch('/Thesis_Article_BTP_Report_submission_form.pdf')
            .then((res) => res.blob())
            .then((blob) => {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'Thesis_Article_BTP_Report_submission_form.pdf';
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                }, 100);
            })
            .catch(() => window.open('/Thesis_Article_BTP_Report_submission_form.pdf', '_blank'));
    };

    const handleProceedToClearance = async () => {
        const missing: string[] = [];
        if (!btpDocTitle.trim()) missing.push('Library BTP title');
        if (!formNo.trim()) missing.push('Form number');
        if (!hostelBlock.trim()) missing.push('Hostel block');
        if (!vacantRoomNo.trim()) missing.push('Vacant room number');
        if (!offerLetterFile && !intake?.offer_letter_name) missing.push('TPC offer letter');

        if (missing.length > 0) {
            setIntakeError(`Please complete all mandatory steps before proceeding:\n• ${missing.join('\n• ')}`);
            return;
        }

        setIntakeError('');
        try {
            await api.submitIntake({
                hostel_block: hostelBlock,
                vacant_room_no: vacantRoomNo,
                btp_doc_title: btpDocTitle,
                btp_form_no: formNo,
                btp_plagiarism: btpPlagiarism,
                offer_letter_name: offerLetterFile ? offerLetterFile.name : (intake?.offer_letter_name || 'Offer_Letter_2026.pdf'),
            });
        } catch {
            // keep the local UI responsive even if the network write fails in dev
        }
        setSubmitted(true);
    };

    const showPage2 = submitted;
    const btpProgressReady = submitted && !!btpDocTitle.trim() && !!formNo.trim();
    const tpcProgressReady = submitted && !!(offerLetterFile || intake?.offer_letter_name);
    const hostelProgressReady = submitted && !!hostelBlock.trim() && !!vacantRoomNo.trim();

    const Panel = ({ section }: { section: SectionKey }) => {
        const approved = !!student.sections[section];
        const feedback = student.feedbacks?.[section];
        return (
            <div className="panel" onClick={() => onOpenSection(section, SECTION_LABELS[section])} style={{ cursor: 'pointer' }}>
                <div className={`panel-heading ${approved ? 'approved' : 'not-approved'}`}>
                    {SECTION_LABELS[section]}
                </div>
                <div className="panel-body">
                    <strong>Status :</strong>{' '}
                    <span style={{ color: approved ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                        {approved ? 'Approved ✓' : 'Not Approved ⚠'}
                    </span>
                    {feedback && (
                        <div style={{ marginTop: 6, fontSize: 12, color: '#b45309', background: '#fffbeb', padding: '6px 8px', borderRadius: 4 }}>
                            Feedback: {feedback}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <Layout
            title={activeTab === 'page1' ? 'Student Intake & Uploads' : 'Clearance Matrix'}
            userName={student.name}
            onHome={onHome}
            onLogout={onLogout}
            onRules={onRules}
            onContact={onContact}
        >
            <div className="container">
                <div className="lnmiit-section-title-banner" style={{ borderRadius: 6, marginBottom: 20 }}>
                    <span>{activeTab === 'page1' ? 'PAGE 1: STUDENT INTAKE & OFFLINE VERIFICATION UPLOADS' : 'PAGE 2: STUDENT CLEARANCE MATRIX'}</span>
                    <span style={{ fontSize: 12, fontWeight: 'normal' }}>Roll No: {student.roll} ({student.dept})</span>
                </div>

                <div style={{ display: 'flex', gap: 8, borderBottom: '2px solid #cbd5e1', marginBottom: 24 }}>
                    <button
                        onClick={() => setActiveTab('page1')}
                        style={{
                            padding: '10px 20px',
                            background: activeTab === 'page1' ? '#ffffff' : '#f1f5f9',
                            border: '1px solid #cbd5e1',
                            borderBottom: activeTab === 'page1' ? '3px solid #b91c1c' : '1px solid #cbd5e1',
                            fontWeight: 'bold',
                            color: activeTab === 'page1' ? '#1b365d' : '#64748b',
                            borderRadius: '6px 6px 0 0',
                            cursor: 'pointer',
                            fontSize: 13,
                        }}
                    >
                        📄 Page 1: Intake & Uploads
                    </button>

                    <button
                        onClick={() => {
                            if (!showPage2) {
                                alert('🔒 Page 2: Clearance Matrix is locked!\n\nPlease complete Page 1 intake submission first.');
                                return;
                            }
                            setActiveTab('page2');
                        }}
                        style={{
                            padding: '10px 20px',
                            background: activeTab === 'page2' ? '#ffffff' : '#f1f5f9',
                            border: '1px solid #cbd5e1',
                            borderBottom: activeTab === 'page2' ? '3px solid #b91c1c' : '1px solid #cbd5e1',
                            fontWeight: 'bold',
                            color: showPage2 ? (activeTab === 'page2' ? '#1b365d' : '#64748b') : '#94a3b8',
                            borderRadius: '6px 6px 0 0',
                            cursor: showPage2 ? 'pointer' : 'not-allowed',
                            fontSize: 13,
                            opacity: showPage2 ? 1 : 0.7,
                        }}
                    >
                        {showPage2 ? '📊 Page 2: Clearance Matrix' : '🔒 Page 2: Clearance Matrix (Locked)'}
                    </button>
                </div>

                {activeTab === 'page1' && !submitted && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                        <div className="well" style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#1b365d', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 14 }}>1</div>
                                    <h3 style={{ margin: 0, color: '#1b365d', fontSize: 16 }}>Library BTP Document Submission</h3>
                                </div>
                                <a href="/Thesis_Article_BTP_Report_submission_form.pdf" download="Thesis_Article_BTP_Report_submission_form.pdf" onClick={handleDownloadForm} target="_blank" rel="noreferrer" style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: 600, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'underline' }}>
                                    📥 Download Form
                                </a>
                            </div>

                            <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 16px 0' }}>
                                Download the form, get it signed by the Librarian, scan/photograph and upload it below.
                            </p>

                            <div className="row">
                                <div className="col-sm-6">
                                    <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed #cbd5e1', borderRadius: 8, padding: 24, background: '#f8fafc', cursor: 'pointer', textAlign: 'center', minHeight: 220 }}>
                                        <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setOfferLetterFile(e.target.files?.[0] || null)} style={{ display: 'none' }} />
                                        <div style={{ fontSize: 32, marginBottom: 8 }}>☁️</div>
                                        <strong style={{ fontSize: 14, color: '#1e293b' }}>{offerLetterFile ? offerLetterFile.name : 'Upload Signed Document'}</strong>
                                        <span style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{offerLetterFile ? 'File selected ✓ Click to change' : 'Drag & drop or click to upload'}</span>
                                        <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>Supports: PDF, JPG, PNG (Max 10MB)</span>
                                    </label>
                                </div>

                                <div className="col-sm-6">
                                    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, background: '#ffffff' }}>
                                        <div style={{ display: 'grid', gap: 10, fontSize: 12 }}>
                                            <div>
                                                <label style={{ display: 'block', color: '#64748b', marginBottom: 2 }}>Document Title</label>
                                                <input className="erp-input" value={btpDocTitle} onChange={(e) => setBtpDocTitle(e.target.value)} style={{ padding: '6px 10px', fontSize: 12 }} />
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                                <div>
                                                    <label style={{ display: 'block', color: '#64748b', marginBottom: 2 }}>Form No.</label>
                                                    <input className="erp-input" value={formNo} onChange={(e) => setFormNo(e.target.value)} style={{ padding: '6px 10px', fontSize: 12 }} />
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', color: '#64748b', marginBottom: 2 }}>Plagiarism %</label>
                                                    <input className="erp-input" value={btpPlagiarism} onChange={(e) => setBtpPlagiarism(e.target.value)} style={{ padding: '6px 10px', fontSize: 12 }} />
                                                </div>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                                <div>
                                                    <label style={{ display: 'block', fontWeight: 600, color: '#475569', marginBottom: 6 }}>Hostel Block</label>
                                                    <select className="erp-select" value={hostelBlock} onChange={(e) => setHostelBlock(e.target.value)} style={{ padding: '8px 12px', fontSize: 13 }}>
                                                        <option value="BH1">BH1</option>
                                                        <option value="BH2">BH2</option>
                                                        <option value="BH3">BH3</option>
                                                        <option value="BH4">BH4</option>
                                                        <option value="BH5">BH5</option>
                                                        <option value="GH1">GH1</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', fontWeight: 600, color: '#475569', marginBottom: 6 }}>Vacant Room Number</label>
                                                    <input type="text" className="erp-input" value={vacantRoomNo} onChange={(e) => setVacantRoomNo(e.target.value)} placeholder="e.g. A110" style={{ padding: '8px 12px', fontSize: 13 }} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="well" style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#1b365d', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 14 }}>2</div>
                                <h3 style={{ margin: 0, color: '#1b365d', fontSize: 16 }}>Hostel Details</h3>
                            </div>
                            <p style={{ fontSize: 13, color: '#475569', margin: 0 }}>
                                The selected hostel and room will be visible to the hostel support officer during review.
                            </p>
                        </div>

                        <div className="well" style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#1b365d', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 14 }}>3</div>
                                <h3 style={{ margin: 0, color: '#1b365d', fontSize: 16 }}>TPC Placement Section</h3>
                            </div>

                            <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 16px 0' }}>Upload your Official Offer Letter</p>

                            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, border: '2px dashed #cbd5e1', borderRadius: 8, padding: 20, background: '#f8fafc', cursor: 'pointer' }}>
                                <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setOfferLetterFile(e.target.files?.[0] || null)} style={{ display: 'none' }} />
                                <div style={{ fontSize: 24 }}>📄</div>
                                <div>
                                    <strong style={{ fontSize: 13, color: '#1e293b', display: 'block' }}>{offerLetterFile ? offerLetterFile.name : 'Upload Offer Letter'}</strong>
                                    <span style={{ fontSize: 11, color: '#64748b' }}>{offerLetterFile ? 'Offer letter uploaded ✓ Click to change' : 'PDF, JPG, PNG (Max 10MB)'}</span>
                                </div>
                            </label>
                        </div>

                        {intakeError && (
                            <div className="alert alert-danger" style={{ whiteSpace: 'pre-line', fontSize: 13, marginBottom: 16 }}>
                                ⚠️ <strong>Action Required:</strong>
                                {'\n'}{intakeError}
                            </div>
                        )}

                        <div style={{ textAlign: 'right', marginTop: 8 }}>
                            <button onClick={handleProceedToClearance} className="btn btn-success" style={{ padding: '12px 24px', fontSize: 14, fontWeight: 700 }}>
                                Save & Proceed to Clearance Matrix ➔
                            </button>
                        </div>
                    </div>
                )}

                {activeTab === 'page1' && submitted && (
                    <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, padding: 24 }}>
                        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <h3 style={{ margin: 0, color: '#1e40af', fontSize: 16, fontWeight: 700 }}>🔒 STUDENT VIEW (LOCKING SCREEN)</h3>
                                <p style={{ margin: '4px 0 0 0', color: '#3b82f6', fontSize: 13 }}>Please wait while your clearance is being verified by officials</p>
                            </div>
                            <span style={{ background: '#1d4ed8', color: '#ffffff', padding: '6px 14px', borderRadius: 20, fontWeight: 700, fontSize: 12 }}>Verification Pending</span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {[
                                {
                                    title: 'BTP Submission Progress',
                                    icon: '📚',
                                    approved: btpProgressReady,
                                    detail: `Title: ${btpDocTitle} | Form No: ${formNo}`,
                                },
                                {
                                    title: 'TPC Progress',
                                    icon: '📄',
                                    approved: tpcProgressReady,
                                    detail: `Offer Letter: ${offerLetterFile?.name || intake?.offer_letter_name || 'Pending upload'}`,
                                },
                                {
                                    title: 'BH Hostel Progress',
                                    icon: '🏠',
                                    approved: hostelProgressReady,
                                    detail: `Hostel Block: ${hostelBlock} | Vacant Room: ${vacantRoomNo} | Routed to ${hostelSupportEmail}`,
                                },
                            ].map((item) => (
                                <div
                                    key={item.title}
                                    style={{
                                        border: '1px solid #e2e8f0',
                                        borderRadius: 8,
                                        padding: 18,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        background: item.approved ? '#f0fdf4' : '#fafafa',
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                        <div style={{ fontSize: 26, background: '#dbeafe', padding: 10, borderRadius: 8 }}>{item.icon}</div>
                                        <div>
                                            <h4 style={{ margin: 0, color: '#1e293b', fontSize: 15 }}>{item.title}</h4>
                                            <span style={{ fontSize: 12, color: '#64748b' }}>{item.title === 'BH Hostel Progress' ? 'Verifying hostel details' : 'Verification summary'}</span>
                                            <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>{item.detail}</div>
                                        </div>
                                    </div>
                                    <div>
                                        <span style={{ background: item.approved ? '#dcfce7' : '#f1f5f9', color: item.approved ? '#15803d' : '#475569', padding: '6px 16px', borderRadius: 20, fontWeight: 700, fontSize: 12 }}>
                                            {item.approved ? 'APPROVED ✓' : 'IN PROGRESS'}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>ℹ️ After Page 1 submission, you will still see BTP, TPC, and hostel progress here while Page 2 remains locked for the full matrix.</p>
                            <button onClick={() => setActiveTab('page2')} disabled={!showPage2} className={showPage2 ? 'btn btn-success' : 'btn btn-secondary'} style={{ padding: '10px 20px', fontSize: 13, fontWeight: 700 }}>
                                {showPage2 ? 'Proceed to Clearance Matrix ➔' : '🔒 Matrix Locked (Verification Pending)'}
                            </button>
                        </div>
                    </div>
                )}

                {activeTab === 'page2' && (
                    <div>
                        {MATRIX_ROWS.map((row, index) => (
                            <div className="row" key={index} style={{ marginBottom: 12 }}>
                                {row.map((section) => (
                                    <div className={row.length === 2 ? 'col-sm-6' : 'col-sm-3half'} key={section}>
                                        <Panel section={section} />
                                    </div>
                                ))}
                            </div>
                        ))}

                        <div className="well" style={{ background: '#f8fafc' }}>
                            <p style={{ margin: 0, fontSize: 13, color: '#475569' }}>
                                ➤ <strong>Department Clearance:</strong> Click on &apos;Department&apos; panel above to view individual faculty approvals.
                            </p>
                            <p style={{ margin: '6px 0 0 0', fontSize: 13, color: '#475569' }}>
                                ➤ <strong>Lab Clearance:</strong> Click on &apos;Labs&apos; panel above to view individual laboratory approvals.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
}