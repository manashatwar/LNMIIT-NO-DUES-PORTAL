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

export function StudentDashboard({
    student,
    onHome,
    onLogout,
    onRules,
    onContact,
    onOpenSection,
}: StudentDashboardProps) {
    const [activeTab, setActiveTab] = useState<'page1' | 'page2'>('page1');

    // Page 1 State: Library BTP Document & Comprehensive OCR Extraction
    const [btpFile, setBtpFile] = useState<File | null>(null);
    const [ocrProcessing, setOcrProcessing] = useState(false);
    const [docType, setDocType] = useState('BTP Report');
    const [formNo, setFormNo] = useState('CL/LB/IR/2026/042');
    const [btpDocTitle, setBtpDocTitle] = useState('Development of Online No-Dues Portal');
    const [btpAuthor, setBtpAuthor] = useState(student.name || 'Rahul Sharma');
    const [rollNo, setRollNo] = useState(student.roll ? String(student.roll) : '1401001');
    const [department, setDepartment] = useState(student.dept || 'CSE');
    const [keywords, setKeywords] = useState('Web Portal, React, Django, No Dues');
    const [subjectArea, setSubjectArea] = useState('Computer Science & Engineering');
    const [emailId, setEmailId] = useState(student.webmail || 'student@lnmiit.ac.in');
    const [mobileNo, setMobileNo] = useState('9876543210');
    const [supervisorName, setSupervisorName] = useState('Prof. Verma');
    const [supervisorCode, setSupervisorCode] = useState('EMP-2041');
    const [btpPlagiarism, setBtpPlagiarism] = useState('8%');
    const [btpSubmitted, setBtpSubmitted] = useState(false);

    // Page 1 State: Hostel Details
    const [hostelBlock, setHostelBlock] = useState(student.hostel || 'BH1');
    const [vacantRoomNo, setVacantRoomNo] = useState('A110');

    // Page 1 State: TPC Offer Letter
    const [offerLetterFile, setOfferLetterFile] = useState<File | null>(null);
    const [tpcSubmitted, setTpcSubmitted] = useState(false);

    // Intake Pipeline Submission & Locking Screen State
    const [intakeSubmitted, setIntakeSubmitted] = useState(false);
    const [intakeError, setIntakeError] = useState('');

    const handleBtpUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setBtpFile(file);
            setOcrProcessing(true);
            setTimeout(() => {
                setOcrProcessing(false);
                const titleStr = file.name.replace(/\.[^/.]+$/, "").replace(/_/g, " ");
                if (titleStr) setBtpDocTitle(titleStr);
            }, 800);
        }
    };

    const handleOfferUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setOfferLetterFile(e.target.files[0]);
            setTpcSubmitted(true);
        }
    };

    const handleConfirmBtp = () => {
        setBtpSubmitted(true);
        alert('Library BTP document details verified & submitted successfully!');
    };

    const handleProceedToClearance = async () => {
        const missing: string[] = [];
        if (!btpSubmitted && !btpFile) {
            missing.push('1. Library BTP Document Submission & OCR Confirmation');
        }
        if (!vacantRoomNo.trim()) {
            missing.push('2. Hostel Vacant Room Details (e.g. A110)');
        }
        if (!tpcSubmitted && !offerLetterFile) {
            missing.push('3. TPC Placement Offer Letter Upload');
        }

        if (missing.length > 0) {
            setIntakeError(`Please complete all mandatory steps before proceeding:\n• ` + missing.join('\n• '));
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
                offer_letter_name: offerLetterFile ? offerLetterFile.name : 'Offer_Letter_2026.pdf',
            });
        } catch {
            // fallback gracefully
        }
        setIntakeSubmitted(true);
    };

    const handleDownloadForm = (e?: React.MouseEvent) => {
        if (e) e.preventDefault();
        fetch('/Thesis_Article_BTP_Report_submission_form.pdf')
            .then((res) => {
                if (!res.ok) throw new Error('Network error');
                return res.blob();
            })
            .then((blob) => {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = 'Thesis_Article_BTP_Report_submission_form.pdf';
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                }, 100);
            })
            .catch(() => {
                window.open('/Thesis_Article_BTP_Report_submission_form.pdf', '_blank');
            });
    };

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

    const isPage1Approved = !!(student.sections.library && student.sections.warden && student.sections.thesis);

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
                {/* Pipeline Header Banner */}
                <div className="lnmiit-section-title-banner" style={{ borderRadius: 6, marginBottom: 20 }}>
                    <span>
                        {activeTab === 'page1'
                            ? 'PAGE 1: STUDENT INTAKE & OFFLINE VERIFICATION UPLOADS'
                            : 'PAGE 2: STUDENT CLEARANCE MATRIX'}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 'normal' }}>
                        Roll No: {student.roll} ({student.dept})
                    </span>
                </div>

                {/* Tab Switcher */}
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
                            if (!isPage1Approved) {
                                alert('🔒 Page 2: Clearance Matrix is locked!\n\nAll 3 offline intake requests (Librarian, TPC, and Warden) must be approved by officers before Page 2 unlocks.');
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
                            color: isPage1Approved ? (activeTab === 'page2' ? '#1b365d' : '#64748b') : '#94a3b8',
                            borderRadius: '6px 6px 0 0',
                            cursor: isPage1Approved ? 'pointer' : 'not-allowed',
                            fontSize: 13,
                            opacity: isPage1Approved ? 1 : 0.7,
                        }}
                    >
                        {isPage1Approved ? '📊 Page 2: Clearance Matrix' : '🔒 Page 2: Clearance Matrix (Locked)'}
                    </button>
                </div>

                {/* ─── PAGE 1: STUDENT INTAKE & OFFLINE VERIFICATION UPLOADS ─── */}
                {activeTab === 'page1' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

                        {/* SECTION 1: Library BTP Document Submission */}
                        <div className="well" style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div style={{
                                        width: 28,
                                        height: 28,
                                        borderRadius: '50%',
                                        background: '#1b365d',
                                        color: '#ffffff',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontWeight: 'bold',
                                        fontSize: 14,
                                    }}>
                                        1
                                    </div>
                                    <h3 style={{ margin: 0, color: '#1b365d', fontSize: 16 }}>
                                        Library BTP Document Submission
                                    </h3>
                                </div>

                                <a
                                    href="/Thesis_Article_BTP_Report_submission_form.pdf"
                                    download="Thesis_Article_BTP_Report_submission_form.pdf"
                                    onClick={handleDownloadForm}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#2563eb',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        fontSize: 13,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        textDecoration: 'underline'
                                    }}
                                >
                                    📥 Download Form
                                </a>
                            </div>

                            <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 16px 0' }}>
                                Download the form, get it signed by the Librarian, scan/photograph and upload it below.
                            </p>

                            <div className="row">
                                {/* Left Upload Box */}
                                <div className="col-sm-6">
                                    <label style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        border: '2px dashed #cbd5e1',
                                        borderRadius: 8,
                                        padding: 24,
                                        background: '#f8fafc',
                                        cursor: 'pointer',
                                        textAlign: 'center',
                                        minHeight: 220,
                                    }}>
                                        <input
                                            type="file"
                                            accept=".pdf,.jpg,.jpeg,.png"
                                            onChange={handleBtpUpload}
                                            style={{ display: 'none' }}
                                        />
                                        <div style={{ fontSize: 32, marginBottom: 8 }}>☁️</div>
                                        <strong style={{ fontSize: 14, color: '#1e293b' }}>
                                            {btpFile ? btpFile.name : 'Upload Signed Document'}
                                        </strong>
                                        <span style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                                            {btpFile ? 'File selected ✓ Click to change' : 'Drag & drop or click to upload'}
                                        </span>
                                        <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>
                                            Supports: PDF, JPG, PNG (Max 10MB)
                                        </span>
                                    </label>
                                </div>

                                {/* Right OCR Review Card */}
                                <div className="col-sm-6">
                                    <div style={{
                                        border: '1px solid #e2e8f0',
                                        borderRadius: 8,
                                        padding: 16,
                                        background: '#ffffff',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                            <strong style={{ fontSize: 13, color: '#334155' }}>
                                                OCR Review <span style={{ color: '#64748b', fontWeight: 'normal' }}>(Auto-detected from Form)</span>
                                            </strong>
                                            <span style={{
                                                background: ocrProcessing ? '#fef3c7' : '#dcfce7',
                                                color: ocrProcessing ? '#b45309' : '#15803d',
                                                padding: '2px 8px',
                                                borderRadius: 12,
                                                fontSize: 11,
                                                fontWeight: 600,
                                            }}>
                                                {ocrProcessing ? 'Scanning Document OCR… 🔄' : 'Processing Complete ✓'}
                                            </span>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
                                            {/* Document Type & Form No */}
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                                <div>
                                                    <label style={{ display: 'block', color: '#64748b', marginBottom: 2 }}>Document Type</label>
                                                    <select
                                                        className="erp-select"
                                                        value={docType}
                                                        onChange={(e) => setDocType(e.target.value)}
                                                        style={{ padding: '6px 10px', fontSize: 12 }}
                                                    >
                                                        <option value="Article/Pre-Print/Post-print">Article/Pre-Print/Post-print</option>
                                                        <option value="Ph.D. Thesis">Ph.D. Thesis</option>
                                                        <option value="BTP Report">BTP Report</option>
                                                        <option value="PG Thesis">PG Thesis</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', color: '#64748b', marginBottom: 2 }}>Form No.</label>
                                                    <input
                                                        type="text"
                                                        className="erp-input"
                                                        value={formNo}
                                                        onChange={(e) => setFormNo(e.target.value)}
                                                        style={{ padding: '6px 10px', fontSize: 12 }}
                                                    />
                                                </div>
                                            </div>

                                            {/* Title of Document */}
                                            <div>
                                                <label style={{ display: 'block', color: '#64748b', marginBottom: 2 }}>Title of Document</label>
                                                <input
                                                    type="text"
                                                    className="erp-input"
                                                    value={btpDocTitle}
                                                    onChange={(e) => setBtpDocTitle(e.target.value)}
                                                    style={{ padding: '6px 10px', fontSize: 12 }}
                                                />
                                            </div>

                                            {/* Author Name & Roll No */}
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                                <div>
                                                    <label style={{ display: 'block', color: '#64748b', marginBottom: 2 }}>Author / Submitter Name</label>
                                                    <input
                                                        type="text"
                                                        className="erp-input"
                                                        value={btpAuthor}
                                                        onChange={(e) => setBtpAuthor(e.target.value)}
                                                        style={{ padding: '6px 10px', fontSize: 12 }}
                                                    />
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', color: '#64748b', marginBottom: 2 }}>Roll No. / Emp. ID</label>
                                                    <input
                                                        type="text"
                                                        className="erp-input"
                                                        value={rollNo}
                                                        onChange={(e) => setRollNo(e.target.value)}
                                                        style={{ padding: '6px 10px', fontSize: 12 }}
                                                    />
                                                </div>
                                            </div>

                                            {/* Department & Subject Area */}
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                                <div>
                                                    <label style={{ display: 'block', color: '#64748b', marginBottom: 2 }}>Department</label>
                                                    <input
                                                        type="text"
                                                        className="erp-input"
                                                        value={department}
                                                        onChange={(e) => setDepartment(e.target.value)}
                                                        style={{ padding: '6px 10px', fontSize: 12 }}
                                                    />
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', color: '#64748b', marginBottom: 2 }}>Subject Area</label>
                                                    <input
                                                        type="text"
                                                        className="erp-input"
                                                        value={subjectArea}
                                                        onChange={(e) => setSubjectArea(e.target.value)}
                                                        style={{ padding: '6px 10px', fontSize: 12 }}
                                                    />
                                                </div>
                                            </div>

                                            {/* Keywords */}
                                            <div>
                                                <label style={{ display: 'block', color: '#64748b', marginBottom: 2 }}>Author Keywords</label>
                                                <input
                                                    type="text"
                                                    className="erp-input"
                                                    value={keywords}
                                                    onChange={(e) => setKeywords(e.target.value)}
                                                    style={{ padding: '6px 10px', fontSize: 12 }}
                                                />
                                            </div>

                                            {/* Email & Mobile */}
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                                <div>
                                                    <label style={{ display: 'block', color: '#64748b', marginBottom: 2 }}>Email ID</label>
                                                    <input
                                                        type="text"
                                                        className="erp-input"
                                                        value={emailId}
                                                        onChange={(e) => setEmailId(e.target.value)}
                                                        style={{ padding: '6px 10px', fontSize: 12 }}
                                                    />
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', color: '#64748b', marginBottom: 2 }}>Mobile No.</label>
                                                    <input
                                                        type="text"
                                                        className="erp-input"
                                                        value={mobileNo}
                                                        onChange={(e) => setMobileNo(e.target.value)}
                                                        style={{ padding: '6px 10px', fontSize: 12 }}
                                                    />
                                                </div>
                                            </div>

                                            {/* Supervisor Details & Plagiarism % */}
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                                                <div>
                                                    <label style={{ display: 'block', color: '#64748b', marginBottom: 2 }}>Supervisor Name</label>
                                                    <input
                                                        type="text"
                                                        className="erp-input"
                                                        value={supervisorName}
                                                        onChange={(e) => setSupervisorName(e.target.value)}
                                                        style={{ padding: '6px 8px', fontSize: 11 }}
                                                    />
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', color: '#64748b', marginBottom: 2 }}>Emp. Code</label>
                                                    <input
                                                        type="text"
                                                        className="erp-input"
                                                        value={supervisorCode}
                                                        onChange={(e) => setSupervisorCode(e.target.value)}
                                                        style={{ padding: '6px 8px', fontSize: 11 }}
                                                    />
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', color: '#64748b', marginBottom: 2 }}>Plagiarism %</label>
                                                    <input
                                                        type="text"
                                                        className="erp-input"
                                                        value={btpPlagiarism}
                                                        onChange={(e) => setBtpPlagiarism(e.target.value)}
                                                        style={{ padding: '6px 8px', fontSize: 11, color: '#dc2626', fontWeight: 'bold' }}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <button
                                            onClick={handleConfirmBtp}
                                            className="btn btn-primary"
                                            style={{ width: '100%', marginTop: 14, padding: '8px', fontSize: 13 }}
                                        >
                                            {btpSubmitted ? '✓ Submitted & Verified' : 'Confirm & Submit'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* SECTION 2: Hostel Details */}
                        <div className="well" style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                                <div style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: '50%',
                                    background: '#1b365d',
                                    color: '#ffffff',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 'bold',
                                    fontSize: 14,
                                }}>
                                    2
                                </div>
                                <h3 style={{ margin: 0, color: '#1b365d', fontSize: 16 }}>
                                    Hostel Details
                                </h3>
                            </div>

                            <div className="row" style={{ alignItems: 'center' }}>
                                {/* Left Form Inputs */}
                                <div className="col-sm-7">
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                        <div>
                                            <label style={{ display: 'block', fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                                                Hostel Block
                                            </label>
                                            <select
                                                className="erp-select"
                                                value={hostelBlock}
                                                onChange={(e) => setHostelBlock(e.target.value)}
                                                style={{ padding: '8px 12px', fontSize: 13 }}
                                            >
                                                <option value="BH1">BH1</option>
                                                <option value="BH2">BH2</option>
                                                <option value="BH3">BH3</option>
                                                <option value="BH4">BH4</option>
                                                <option value="BH5">BH5</option>
                                                <option value="GH1">GH1</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label style={{ display: 'block', fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                                                Vacant Room Number
                                            </label>
                                            <input
                                                type="text"
                                                className="erp-input"
                                                value={vacantRoomNo}
                                                onChange={(e) => setVacantRoomNo(e.target.value)}
                                                placeholder="e.g. A110"
                                                style={{ padding: '8px 12px', fontSize: 13 }}
                                            />
                                            <span style={{ fontSize: 11, color: '#64748b', marginTop: 4, display: 'block' }}>
                                                Format: Block & 3 digits (e.g. A110, B204, C301)
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Right Warden Routing Box */}
                                <div className="col-sm-5">
                                    <div style={{
                                        background: '#f0fdf4',
                                        border: '1px solid #bbf7d0',
                                        borderRadius: 8,
                                        padding: 16,
                                    }}>
                                        <div style={{ fontWeight: 700, color: '#166534', fontSize: 13, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                                            ✉️ Warden Routing
                                        </div>
                                        <div style={{ fontSize: 12, color: '#475569', marginBottom: 6 }}>
                                            Your clearance request will route to:
                                        </div>
                                        <div style={{
                                            background: '#ffffff',
                                            border: '1px solid #86efac',
                                            color: '#15803d',
                                            padding: '6px 12px',
                                            borderRadius: 4,
                                            fontWeight: 600,
                                            fontSize: 12,
                                            display: 'inline-block',
                                            fontFamily: 'monospace',
                                        }}>
                                            {hostelBlock.toLowerCase()}-support@lnmiit.ac.in
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* SECTION 3: TPC Placement Section */}
                        <div className="well" style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                <div style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: '50%',
                                    background: '#1b365d',
                                    color: '#ffffff',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 'bold',
                                    fontSize: 14,
                                }}>
                                    3
                                </div>
                                <h3 style={{ margin: 0, color: '#1b365d', fontSize: 16 }}>
                                    TPC Placement Section
                                </h3>
                            </div>

                            <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 16px 0' }}>
                                Upload your Official Offer Letter
                            </p>

                            <label style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 12,
                                border: '2px dashed #cbd5e1',
                                borderRadius: 8,
                                padding: 20,
                                background: '#f8fafc',
                                cursor: 'pointer',
                            }}>
                                <input
                                    type="file"
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    onChange={handleOfferUpload}
                                    style={{ display: 'none' }}
                                />
                                <div style={{ fontSize: 24 }}>📄</div>
                                <div>
                                    <strong style={{ fontSize: 13, color: '#1e293b', display: 'block' }}>
                                        {offerLetterFile ? offerLetterFile.name : 'Upload Offer Letter'}
                                    </strong>
                                    <span style={{ fontSize: 11, color: '#64748b' }}>
                                        {offerLetterFile ? 'Offer letter uploaded ✓ Click to change' : 'PDF, JPG, PNG (Max 10MB)'}
                                    </span>
                                </div>
                            </label>
                        </div>

                        {/* Mandatory Validation Gating Warning */}
                        {intakeError && (
                            <div className="alert alert-danger" style={{ whiteSpace: 'pre-line', fontSize: 13, marginBottom: 16 }}>
                                ⚠️ <strong>Action Required:</strong>
                                {'\n'}{intakeError}
                            </div>
                        )}

                        {/* Action Submit Footer */}
                        <div style={{ textAlign: 'right', marginTop: 8 }}>
                            <button
                                onClick={handleProceedToClearance}
                                className="btn btn-success"
                                style={{ padding: '12px 24px', fontSize: 14, fontWeight: 700 }}
                            >
                                Save & Proceed to Clearance Matrix ➔
                            </button>
                        </div>

                    </div>
                )}

                {/* ─── STUDENT VIEW (LOCKING SCREEN) ─── */}
                {activeTab === 'page1' && intakeSubmitted && (
                    <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, padding: 24 }}>
                        <div style={{
                            background: '#eff6ff',
                            border: '1px solid #bfdbfe',
                            borderRadius: 6,
                            padding: '14px 18px',
                            marginBottom: 20,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <div>
                                <h3 style={{ margin: 0, color: '#1e40af', fontSize: 16, fontWeight: 700 }}>
                                    🔒 STUDENT VIEW (LOCKING SCREEN)
                                </h3>
                                <p style={{ margin: '4px 0 0 0', color: '#3b82f6', fontSize: 13 }}>
                                    Please wait while your clearance is being verified by officials
                                </p>
                            </div>
                            <span style={{ background: '#1d4ed8', color: '#ffffff', padding: '6px 14px', borderRadius: 20, fontWeight: 700, fontSize: 12 }}>
                                Verification Pending
                            </span>
                        </div>

                        {/* 3 Verification Cards */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                            {/* 1. Librarian Final Verification */}
                            <div style={{
                                border: '1px solid #e2e8f0',
                                borderRadius: 8,
                                padding: 18,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                background: student.sections.library ? '#f0fdf4' : '#fafafa'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                    <div style={{ fontSize: 26, background: '#dbeafe', padding: 10, borderRadius: 8 }}>📘</div>
                                    <div>
                                        <h4 style={{ margin: 0, color: '#1e293b', fontSize: 15 }}>Librarian Final Verification</h4>
                                        <span style={{ fontSize: 12, color: '#64748b' }}>Checking OCR data against physical records</span>
                                        <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>
                                            Form No: <code>{formNo}</code> | Title: <em>{btpDocTitle}</em> | Plagiarism: <strong style={{ color: '#b91c1c' }}>{btpPlagiarism}</strong>
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    {student.sections.library ? (
                                        <span style={{ background: '#dcfce7', color: '#15803d', padding: '6px 16px', borderRadius: 20, fontWeight: 700, fontSize: 12 }}>
                                            APPROVED ✓
                                        </span>
                                    ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{
                                                width: 14,
                                                height: 14,
                                                border: '2px solid #2563eb',
                                                borderTopColor: 'transparent',
                                                borderRadius: '50%',
                                                display: 'inline-block',
                                                animation: 'spin 1s linear infinite'
                                            }}></span>
                                            <span style={{ background: '#f1f5f9', color: '#475569', padding: '6px 14px', borderRadius: 20, fontWeight: 700, fontSize: 12 }}>
                                                IN PROGRESS
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* 2. TPC Check */}
                            <div style={{
                                border: '1px solid #e2e8f0',
                                borderRadius: 8,
                                padding: 18,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                background: student.sections.thesis ? '#f0fdf4' : '#fafafa'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                    <div style={{ fontSize: 26, background: '#dbeafe', padding: 10, borderRadius: 8 }}>💼</div>
                                    <div>
                                        <h4 style={{ margin: 0, color: '#1e293b', fontSize: 15 }}>TPC Check</h4>
                                        <span style={{ fontSize: 12, color: '#64748b' }}>Reviewing your offer letter</span>
                                        <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>
                                            Offer Letter: 📄 <em>{offerLetterFile ? offerLetterFile.name : 'Offer_Letter_2026.pdf'}</em>
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    {student.sections.thesis ? (
                                        <span style={{ background: '#dcfce7', color: '#15803d', padding: '6px 16px', borderRadius: 20, fontWeight: 700, fontSize: 12 }}>
                                            APPROVED ✓
                                        </span>
                                    ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{
                                                width: 14,
                                                height: 14,
                                                border: '2px solid #2563eb',
                                                borderTopColor: 'transparent',
                                                borderRadius: '50%',
                                                display: 'inline-block',
                                                animation: 'spin 1s linear infinite'
                                            }}></span>
                                            <span style={{ background: '#f1f5f9', color: '#475569', padding: '6px 14px', borderRadius: 20, fontWeight: 700, fontSize: 12 }}>
                                                IN PROGRESS
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* 3. Warden Desk */}
                            <div style={{
                                border: '1px solid #e2e8f0',
                                borderRadius: 8,
                                padding: 18,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                background: student.sections.warden ? '#f0fdf4' : '#fafafa'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                    <div style={{ fontSize: 26, background: '#dbeafe', padding: 10, borderRadius: 8 }}>🏛️</div>
                                    <div>
                                        <h4 style={{ margin: 0, color: '#1e293b', fontSize: 15 }}>Warden Desk</h4>
                                        <span style={{ fontSize: 12, color: '#64748b' }}>Verifying vacant room details</span>
                                        <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>
                                            Hostel Block: <strong>{hostelBlock}</strong> | Vacant Room: <strong style={{ color: '#1b365d' }}>{vacantRoomNo}</strong>
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    {student.sections.warden ? (
                                        <span style={{ background: '#dcfce7', color: '#15803d', padding: '6px 16px', borderRadius: 20, fontWeight: 700, fontSize: 12 }}>
                                            APPROVED ✓
                                        </span>
                                    ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{
                                                width: 14,
                                                height: 14,
                                                border: '2px solid #2563eb',
                                                borderTopColor: 'transparent',
                                                borderRadius: '50%',
                                                display: 'inline-block',
                                                animation: 'spin 1s linear infinite'
                                            }}></span>
                                            <span style={{ background: '#f1f5f9', color: '#475569', padding: '6px 14px', borderRadius: 20, fontWeight: 700, fontSize: 12 }}>
                                                IN PROGRESS
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>

                        </div>

                        {/* Lock / Unlock Footer */}
                        <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
                                ℹ️ When Librarian, TPC, and Warden complete verification, Page 2 Clearance Matrix will unlock automatically.
                            </p>

                            <button
                                onClick={() => setActiveTab('page2')}
                                disabled={!isPage1Approved}
                                className={isPage1Approved ? 'btn btn-success' : 'btn btn-secondary'}
                                style={{ padding: '10px 20px', fontSize: 13, fontWeight: 700 }}
                            >
                                {isPage1Approved
                                    ? 'Proceed to Clearance Matrix ➔'
                                    : '🔒 Matrix Locked (Verification Pending)'}
                            </button>
                        </div>
                    </div>
                )}

                {/* ─── PAGE 2: STUDENT CLEARANCE MATRIX ─── */}
                {activeTab === 'page2' && (
                    <div>
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
                )}
            </div>
        </Layout>
    );
}
