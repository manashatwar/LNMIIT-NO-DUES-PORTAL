import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { ClearanceRequest, SectionInfo, CertificateData } from '../types';
import { api } from '../api';

interface StudentDashboardProps {
    request: ClearanceRequest;
    onReload: () => void;
    onLogout: () => void;
    onRules: () => void;
    onContact: () => void;
}

const EXIT_LABELS: Record<string, string> = {
    GRADUATION: 'Graduation', NEP_EXIT: 'NEP Exit',
    WITHDRAWAL: 'Withdrawal', ADMISSION_CANCEL: 'Admission Cancellation',
};

// Hostel room numbers: one block letter + exactly 3 digits, e.g. A102, B501.
const VACANT_ROOM_RE = /^[A-Za-z]\d{3}$/;

const circle = (n: number) => (
    <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#1b365d', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 14 }}>{n}</div>
);

const Spinner = () => (
    <span style={{ width: 14, height: 14, border: '2px solid #2563eb', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 1s linear infinite' }} />
);

export function StudentDashboard({ request, onReload, onLogout, onRules, onContact }: StudentDashboardProps) {
    const sec = (code: string): SectionInfo | undefined => request.sections.find((s) => s.code === code);
    const has = (code: string) => !!sec(code);
    const approved = (code: string) => sec(code)?.status === 'APPROVED';
    const uploaded = (code: string) =>
        request.intake.uploaded.includes(code) || (sec(code)?.documents.length ?? 0) > 0;

    // Stage groupings (mirror the Design.md dependency graph / the reference flow)
    const triGate = ['LIBRARY', 'TPC', 'WARDEN'].filter(has);
    const deptField = ['STORE', 'LUCS', 'SPORTS', 'MEDICAL', 'NAD', 'HOD'].filter(has);
    const triGateApproved = triGate.length > 0 && triGate.every(approved);
    const accountsUnlock = ['LIBRARY', 'TPC', 'WARDEN', 'HOD'].filter(has).every(approved);
    const accountsApproved = approved('ACCOUNTS');
    const cleared = request.overall_status === 'CLEARED';

    // Page lock rules
    const locks = {
        page1: true,
        page2: request.intake_submitted,
        page3: triGateApproved,
        page4: accountsUnlock,
        page5: accountsApproved,
    };

    type TabId = 'page1' | 'page2' | 'page3' | 'page4' | 'page5';
    // Resume on the current stage (the furthest page the student has reached).
    const resumeTab: TabId =
        !request.intake_submitted ? 'page1'
            : !triGateApproved ? 'page2'
                : !accountsUnlock ? 'page3'
                    : !accountsApproved ? 'page4'
                        : 'page5';
    const [activeTab, setActiveTab] = useState<TabId>(resumeTab);
    // Which section the student clicked to fix (drives back-to-page1 re-upload)
    const [fixingSection, setFixingSection] = useState<string | null>(null);
    // Which Page-3 section detail is open (null = grid)
    const [openStageSection, setOpenStageSection] = useState<string | null>(null);

    // If intake not submitted, only page 1 is reachable.
    if (!request.intake_submitted && activeTab !== 'page1') {
        setActiveTab('page1');
    }

    // When a rejection is cleared (re-upload done), clear fixingSection so locking screen shows.
    useEffect(() => {
        if (fixingSection && !request.intake.rejected.includes(fixingSection)) {
            setFixingSection(null);
        }
        if (request.intake.rejected.includes('LIBRARY')) {
            setBtpConfirmed(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [request.intake.rejected.join(',')]);

    // Initialise OCR-review fields from an existing upload (so re-login resumes).
    const initDoc = request.sections.find((s) => s.code === 'LIBRARY')?.documents[0];
    const initReview = (initDoc?.ocr_fields?.review as Record<string, string>) || {};
    const initConfirmed = !!(initDoc?.ocr_fields as { confirmed?: boolean } | undefined)?.confirmed;

    const [docType, setDocType] = useState(initReview.doc_type || 'BTP Report');
    const [formNo, setFormNo] = useState(initReview.form_no || '');
    const [title, setTitle] = useState(initReview.title || '');
    const [author, setAuthor] = useState(initReview.author || request.student.name);
    const [rollNo, setRollNo] = useState(initReview.roll_no || request.student.roll_no);
    const [department, setDepartment] = useState(initReview.department || request.student.department);
    const [plagiarism, setPlagiarism] = useState(initReview.plagiarism || '');
    const [ocrText, setOcrText] = useState(initDoc?.ocr_text || '');
    const [ocrProcessing, setOcrProcessing] = useState(false);
    const [btpConfirmed, setBtpConfirmed] = useState(initConfirmed);

    const [room, setRoom] = useState(request.vacant_room_no || '');
    const [donate, setDonate] = useState(Number(request.fund_us_amount) > 0);
    const [amount, setAmount] = useState(Number(request.fund_us_amount) || 1000);

    const [busy, setBusy] = useState<string | null>(null);
    const [msg, setMsg] = useState('');
    const [msgErr, setMsgErr] = useState(false);
    const [intakeError, setIntakeError] = useState('');
    const sendComment = async (code: string, text: string) => {
        if (!text.trim()) return;
        setBusy('comment-' + code);
        try {
            await api.studentComment(code, text.trim());
            onReload();
        } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not send comment'); }
        finally { setBusy(null); }
    };

    const upload = async (code: string, file: File | null) => {
        if (!file) return;
        setBusy(code); setMsg(''); setMsgErr(false);
        if (file.size > 10 * 1024 * 1024) {
            setMsgErr(true); setMsg(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum allowed is 10 MB.`);
            setOcrProcessing(false); setBusy(null); return;
        }
        try {
            if (code === 'LIBRARY') {
                setOcrProcessing(true);
                setBtpConfirmed(false);           // new upload must be re-confirmed
                setMsg('');
                const res = await api.upload('LIBRARY', file);
                const af = res.autofill || {};
                if (af.roll_no) setRollNo(af.roll_no);
                if (af.author) setAuthor(af.author);
                if (af.department) setDepartment(af.department);
                if (res.ocr_text) setOcrText(res.ocr_text);
                if (!title) setTitle(file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' '));
                setOcrProcessing(false);
                setMsg('OCR complete — review the auto-filled details and Confirm.');
            } else {
                await api.upload(code, file);
                setMsg(`✓ Uploaded to ${code}`);
            }
            onReload();
        } catch (e) { setOcrProcessing(false); setMsgErr(true); setMsg(e instanceof Error ? e.message : 'Upload failed'); }
        finally { setBusy(null); }
    };

    const confirmOcr = async () => {
        setBusy('confirm'); setMsg('');
        try {
            await api.confirmReview('LIBRARY', {
                doc_type: docType, form_no: formNo, title, plagiarism,
                author, roll_no: rollNo, department,
            });
            setBtpConfirmed(true);
            setMsg('✓ OCR data confirmed and sent to the Library.');
            onReload();
        } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not confirm'); }
        finally { setBusy(null); }
    };

    const setFixingSectionAndAdvance = () => { setFixingSection(null); setActiveTab('page2'); };

    const proceed = async () => {
        const missing: string[] = [];
        if (!uploaded('LIBRARY')) missing.push('Library BTP document upload');
        else if (!btpConfirmed) missing.push('Confirm the Library OCR review');
        if (has('TPC') && !uploaded('TPC')) missing.push('TPC offer letter upload');
        const roomTrimmed = room.trim();
        if (!roomTrimmed) missing.push('Hostel vacant room number');
        else if (!VACANT_ROOM_RE.test(roomTrimmed)) missing.push('Vacant room number must be a block letter followed by 3 digits, e.g. A102');
        if (missing.length) { setIntakeError(missing.join('\n• ')); return; }
        setIntakeError(''); setBusy('submit');
        try {
            await api.submitIntake(roomTrimmed.toUpperCase(), donate ? Number(amount) || 0 : 0);
            setFixingSectionAndAdvance();
            onReload();
        } catch (e) { setIntakeError(e instanceof Error ? e.message : 'Submit failed'); }
        finally { setBusy(null); }
    };

    const buildCertificateMarkup = (c: CertificateData) => {
        const rows = c.sections.map((s) => `
            <tr>
                <td style="padding:8px 12px;border-bottom:1px solid #dbe3ee;">${s.name}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #dbe3ee;">${s.approved_by || '—'}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #dbe3ee;">${s.decided_at ? new Date(s.decided_at).toLocaleDateString() : '—'}</td>
            </tr>`).join('');
        return `
            <div style="width:760px;padding:40px;font-family:Arial,Helvetica,sans-serif;color:#0f2748;background:#ffffff;border:6px solid #1b365d;">
                <div style="text-align:center;border-bottom:3px solid #1b365d;padding-bottom:16px;margin-bottom:24px;">
                    <div style="font-size:22px;font-weight:bold;letter-spacing:1px;">THE LNM INSTITUTE OF INFORMATION TECHNOLOGY</div>
                    <div style="font-size:16px;color:#475569;margin-top:4px;">No-Dues Certificate</div>
                </div>
                <table style="width:100%;font-size:14px;margin-bottom:20px;">
                    <tr><td style="padding:4px 0;color:#475569;width:160px;">Student Name</td><td style="font-weight:bold;">${c.student}</td></tr>
                    <tr><td style="padding:4px 0;color:#475569;">Roll Number</td><td style="font-weight:bold;">${c.roll_no}</td></tr>
                    <tr><td style="padding:4px 0;color:#475569;">Exit Type</td><td style="font-weight:bold;">${EXIT_LABELS[c.exit_type] || c.exit_type}</td></tr>
                    <tr><td style="padding:4px 0;color:#475569;">Fund-Us Contribution</td><td style="font-weight:bold;">₹${c.fund_us_amount}</td></tr>
                </table>
                <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px;">
                    <thead>
                        <tr style="background:#eef4ff;">
                            <th style="text-align:left;padding:8px 12px;border-bottom:2px solid #1b365d;">Section</th>
                            <th style="text-align:left;padding:8px 12px;border-bottom:2px solid #1b365d;">Approved By</th>
                            <th style="text-align:left;padding:8px 12px;border-bottom:2px solid #1b365d;">Date</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
                <div style="font-size:12px;color:#64748b;display:flex;justify-content:space-between;border-top:1px solid #dbe3ee;padding-top:12px;">
                    <span>Certificate ID: NDC-${c.request_id}</span>
                    <span>Generated: ${new Date(c.generated_at).toLocaleString()}</span>
                </div>
            </div>`;
    };

    const downloadCertificate = async () => {
        try {
            const { certificate: c } = await api.certificate();

            // Loaded on demand (not in the main bundle) — most students never click this,
            // so nobody pays the ~200 KB jsPDF/html2canvas cost on initial page load.
            const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
                import('jspdf'), import('html2canvas'),
            ]);

            // Render the certificate off-screen, rasterize it, then embed it in a PDF.
            const holder = document.createElement('div');
            holder.style.position = 'fixed';
            holder.style.left = '-9999px';
            holder.style.top = '0';
            holder.innerHTML = buildCertificateMarkup(c);
            document.body.appendChild(holder);

            try {
                const canvas = await html2canvas(holder.firstElementChild as HTMLElement, { scale: 2, backgroundColor: '#ffffff' });
                const imgData = canvas.toDataURL('image/png');
                const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
                const pageWidth = pdf.internal.pageSize.getWidth();
                const imgWidth = pageWidth - 80;
                const imgHeight = (canvas.height * imgWidth) / canvas.width;
                pdf.addImage(imgData, 'PNG', 40, 40, imgWidth, imgHeight);
                pdf.save(`NoDues_${c.roll_no}.pdf`);
            } finally {
                document.body.removeChild(holder);
            }

            onReload();
        } catch (e) { setMsg(e instanceof Error ? e.message : 'Certificate not available'); }
    };

    // ── Reusable bits ──
    const VerifyCard = ({ code, icon, title: t, subtitle, detail }: { code: string; icon: string; title: string; subtitle: string; detail: React.ReactNode }) => {
        const ok = approved(code);
        const rejected = sec(code)?.status === 'REJECTED';
        // Latest non-system comment = the officer's rejection reason
        const reason = sec(code)?.comments.filter((c) => !c.is_system && c.body).slice(-1)[0];

        return (
            <div
                style={{
                    border: `1px solid ${rejected ? '#fca5a5' : '#e2e8f0'}`,
                    borderRadius: 8, padding: 18,
                    background: ok ? '#f0fdf4' : rejected ? '#fef2f2' : '#fafafa',
                    cursor: rejected ? 'pointer' : 'default',
                    transition: 'box-shadow 0.15s',
                }}
                onClick={() => { if (rejected) { setFixingSection(code); setActiveTab('page1'); } }}
                title={rejected ? 'Click to go back and fix your submission' : undefined}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ fontSize: 26, background: '#dbeafe', padding: 10, borderRadius: 8 }}>{icon}</div>
                        <div>
                            <h4 style={{ margin: 0, color: '#1e293b', fontSize: 15 }}>{t}</h4>
                            <span style={{ fontSize: 12, color: '#64748b' }}>{subtitle}</span>
                            <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>{detail}</div>
                        </div>
                    </div>
                    {ok ? (
                        <span style={{ background: '#dcfce7', color: '#15803d', padding: '6px 16px', borderRadius: 20, fontWeight: 700, fontSize: 12 }}>APPROVED ✓</span>
                    ) : rejected ? (
                        <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '6px 16px', borderRadius: 20, fontWeight: 700, fontSize: 12 }}>REJECTED ✗</span>
                    ) : (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Spinner />
                            <span style={{ background: '#f1f5f9', color: '#475569', padding: '6px 14px', borderRadius: 20, fontWeight: 700, fontSize: 12 }}>IN PROGRESS</span>
                        </span>
                    )}
                </div>

                {rejected && (
                    <div style={{ marginTop: 10, fontSize: 12, color: '#b91c1c' }}>
                        {reason && <div><strong>Officer's reason:</strong> {reason.body}</div>}
                        <div style={{ marginTop: 4, color: '#7f1d1d', fontStyle: 'italic' }}>Click this card to go back and fix your submission.</div>
                    </div>
                )}
                <div onClick={(e) => e.stopPropagation()}>
                    <CommentThread
                        comments={sec(code)?.comments || []}
                        me={request.student.webmail}
                        busy={busy === 'comment-' + code}
                        onSend={(t) => sendComment(code, t)}
                    />
                </div>
            </div>
        );
    };

    // Upload-enabled Page-3 sections: which fields their review form has + the downloadable form.
    // Department-Purpose was removed (HOD no longer requires a dedicated form
    // upload) and LUCS is no longer an upload section — both are now confirm-only,
    // same as Store/Sports/Medical/NAD (see main/engine.py, main/api.py).
    const UPLOAD_SECTION_CONFIG: Record<string, { formUrl?: string; formLabel?: string; allowLink?: boolean; fields: { key: string; label: string }[] }> = {
        ACCOUNTS: {
            formLabel: 'Cancelled Cheque',
            fields: [
                { key: 'account_holder', label: 'Account Holder Name' },
                { key: 'account_no', label: 'Bank Account No.' },
                { key: 'ifsc', label: 'IFSC Code' },
                { key: 'bank_name', label: 'Bank Name' },
                { key: 'roll_no', label: 'Roll No' },
            ],
        },
    };

    // Section metadata for stage pages
    const SECTION_META: Record<string, { icon: string; subtitle: string }> = {
        STORE: { icon: '📦', subtitle: 'Outstanding store material check' },
        LUCS: { icon: '📅', subtitle: 'Event / activity clearance check' },
        SPORTS: { icon: '🏅', subtitle: 'Sports equipment & records' },
        MEDICAL: { icon: '🏥', subtitle: 'Medical-cell dues' },
        NAD: { icon: '🎓', subtitle: 'NAD-related verification' },
        HOD: { icon: '🏛️', subtitle: 'Departmental consolidation' },
        ACCOUNTS: { icon: '💰', subtitle: 'Refund & cancelled cheque' },
        ADMINISTRATION: { icon: '🏢', subtitle: 'Final all-green approval' },
    };

    return (
        <Layout title={activeTab === 'page1' ? 'Intake & Uploads' : 'Clearance Matrix'} userName={request.student.name} onLogout={onLogout} onRules={onRules} onContact={onContact}>
            <div className="container">
                <div className="lnmiit-section-title-banner" style={{ borderRadius: 6, marginBottom: 16 }}>
                    <span>{{
                        page1: 'PAGE 1 · STUDENT INTAKE & OFFLINE VERIFICATION UPLOADS',
                        page2: 'PAGE 2 · CORE TRI-GATE VERIFICATION',
                        page3: 'PAGE 3 · DEPARTMENTAL & FIELD CLEARANCE',
                        page4: 'PAGE 4 · FINANCIAL CLEARANCE (ACCOUNTS)',
                        page5: 'PAGE 5 · FINAL ADMINISTRATION RELEASE',
                    }[activeTab]}</span>
                    <span style={{ fontSize: 12, fontWeight: 'normal' }}>{request.student.roll_no} · {request.student.department} · {EXIT_LABELS[request.exit_type] || request.exit_type}</span>
                </div>

                {/* Tabs — sequential pages, each locked until the previous clears */}
                <div style={{ display: 'flex', gap: 6, borderBottom: '2px solid #cbd5e1', marginBottom: 24, flexWrap: 'wrap' }}>
                    {([
                        { id: 'page1', label: '📄 1 · Intake & Uploads', lockMsg: '' },
                        { id: 'page2', label: '🔑 2 · Core Tri-Gate', lockMsg: 'Submit your intake (Page 1) first.' },
                        { id: 'page3', label: '🏫 3 · Dept & Field', lockMsg: 'Library, TPC and Warden must approve first.' },
                        { id: 'page4', label: '💰 4 · Financial', lockMsg: 'HOD (and tri-gate) must approve first.' },
                        { id: 'page5', label: '🏢 5 · Administration', lockMsg: 'Accounts must approve first.' },
                    ] as { id: TabId; label: string; lockMsg: string }[]).map((t) => {
                        const enabled = locks[t.id];
                        return (
                            <button key={t.id} style={tabStyle(activeTab === t.id, enabled)}
                                onClick={() => { if (!enabled) { alert('🔒 Locked. ' + t.lockMsg); return; } setActiveTab(t.id); }}>
                                {enabled ? t.label : '🔒 ' + t.label}
                            </button>
                        );
                    })}
                </div>

                {msg && (msgErr
                    ? <div className="alert alert-danger" style={{ marginBottom: 16, fontSize: 13 }}>⚠️ {msg}</div>
                    : <div className="well" style={{ padding: '8px 12px', marginBottom: 16, fontSize: 13 }}>{msg}</div>)}

                {/* ── PAGE 1: intake upload form ── */}
                {activeTab === 'page1' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                        {/* Back button when fixing a rejected section */}
                        {fixingSection && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
                                <button className="btn btn-secondary" style={{ fontSize: 12, padding: '6px 14px' }}
                                    onClick={() => { setFixingSection(null); if (request.intake_submitted) setActiveTab('page2'); }}>
                                    ← Back to Verification Status
                                </button>
                                <span style={{ fontSize: 13, color: '#b91c1c', fontWeight: 600 }}>
                                    Fixing: {request.sections.find((s) => s.code === fixingSection)?.name || fixingSection}
                                </span>
                            </div>
                        )}
                        {/* Section 1: Library BTP */}
                        <div className="well" style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{circle(1)}<h3 style={{ margin: 0, color: '#1b365d', fontSize: 16 }}>Library BTP Document Submission</h3></div>
                                <a href="/Thesis_Article_BTP_Report_submission_form.pdf" download target="_blank" rel="noreferrer"
                                    style={{ color: '#2563eb', fontWeight: 600, fontSize: 13, textDecoration: 'underline' }}>📥 Download Form</a>
                            </div>
                            <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 12px' }}>Download the form, get it signed by the Librarian, then scan &amp; upload it below.</p>
                            <div className="row">
                                <div className="col-sm-6">
                                    {(() => {
                                        const isRejected = request.intake.rejected.includes('LIBRARY');
                                        const isDone = uploaded('LIBRARY') && !isRejected;
                                        return (
                                            <label style={{ ...dropzone, border: isRejected ? '2px dashed #f87171' : '2px dashed #cbd5e1', background: isRejected ? '#fef2f2' : '#f8fafc' }}>
                                                <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }}
                                                    onChange={(e) => upload('LIBRARY', e.target.files && e.target.files[0] ? e.target.files[0] : null)} />
                                                <div style={{ fontSize: 32, marginBottom: 8 }}>{isRejected ? '⚠️' : isDone ? '✅' : '☁️'}</div>
                                                <strong style={{ fontSize: 14, color: isRejected ? '#b91c1c' : '#1e293b' }}>
                                                    {isRejected ? 'Rejected — click to re-upload' : isDone ? 'Uploaded ✓ (click to replace)' : 'Upload Signed Document'}
                                                </strong>
                                                <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>PDF, JPG, PNG · max 10 MB</span>
                                            </label>
                                        );
                                    })()}
                                </div>
                                <div className="col-sm-6">
                                    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, alignItems: 'center' }}>
                                            <strong style={{ fontSize: 13, color: '#334155' }}>OCR Review <span style={{ color: '#64748b', fontWeight: 'normal' }}>(auto-filled from the form)</span></strong>
                                            <span style={{
                                                background: ocrProcessing ? '#fef3c7' : btpConfirmed ? '#dcfce7' : uploaded('LIBRARY') ? '#dbeafe' : '#f1f5f9',
                                                color: ocrProcessing ? '#b45309' : btpConfirmed ? '#15803d' : uploaded('LIBRARY') ? '#1e40af' : '#64748b',
                                                padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6,
                                            }}>
                                                {ocrProcessing && <Spinner />}
                                                {ocrProcessing ? 'Scanning…' : btpConfirmed ? 'Confirmed ✓' : uploaded('LIBRARY') ? 'Review & Confirm' : 'Awaiting upload'}
                                            </span>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
                                            <div><label style={ocrLabel}>Document Type</label>
                                                <select className="erp-select" value={docType} onChange={(e) => setDocType(e.target.value)} disabled={btpConfirmed} style={ocrInput}>
                                                    <option>BTP Report</option><option>PG Thesis</option><option>Ph.D. Thesis</option><option>Article/Pre-Print</option>
                                                </select></div>
                                            <div><label style={ocrLabel}>Form No.</label><input className="erp-input" value={formNo} onChange={(e) => setFormNo(e.target.value)} disabled={btpConfirmed} style={ocrInput} /></div>
                                        </div>
                                        <div style={{ marginTop: 8 }}><label style={ocrLabel}>Title of Document</label><input className="erp-input" value={title} onChange={(e) => setTitle(e.target.value)} disabled={btpConfirmed} style={ocrInput} /></div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
                                            <div><label style={ocrLabel}>Author / Submitter</label><input className="erp-input" value={author} onChange={(e) => setAuthor(e.target.value)} disabled={btpConfirmed} style={ocrInput} /></div>
                                            <div><label style={ocrLabel}>Roll No.</label><input className="erp-input" value={rollNo} onChange={(e) => setRollNo(e.target.value)} disabled={btpConfirmed} style={ocrInput} /></div>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
                                            <div><label style={ocrLabel}>Department</label><input className="erp-input" value={department} onChange={(e) => setDepartment(e.target.value)} disabled={btpConfirmed} style={ocrInput} /></div>
                                            <div><label style={ocrLabel}>Plagiarism %</label><input className="erp-input" value={plagiarism} onChange={(e) => setPlagiarism(e.target.value)} disabled={btpConfirmed} style={{ ...ocrInput, color: '#dc2626', fontWeight: 700 }} /></div>
                                        </div>

                                        {ocrText && (
                                            <div style={{ marginTop: 10, fontSize: 11, background: '#f8fafc', padding: 8, borderRadius: 4 }}>
                                                <strong>Detected text:</strong>
                                                <pre style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>{ocrText.slice(0, 300)}</pre>
                                            </div>
                                        )}

                                        <button onClick={confirmOcr} className="btn btn-primary"
                                            disabled={!uploaded('LIBRARY') || ocrProcessing || btpConfirmed || busy === 'confirm'}
                                            style={{ width: '100%', marginTop: 12, fontSize: 13 }}>
                                            {btpConfirmed ? '✓ OCR Confirmed' : busy === 'confirm' ? 'Confirming…' : 'Confirm OCR Data'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Section 2: Hostel */}
                        <div className="well" style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>{circle(2)}<h3 style={{ margin: 0, color: '#1b365d', fontSize: 16 }}>Hostel Details</h3></div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                <div><label style={ocrLabel}>Hostel Block</label>
                                    <input className="erp-input" value={request.student.hostel} readOnly style={{ ...ocrInput, background: '#f1f5f9' }} /></div>
                                <div><label style={ocrLabel}>Vacant Room Number</label>
                                    <input className="erp-input" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="e.g. A102" style={ocrInput} /></div>
                            </div>
                            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <input type="checkbox" checked={donate} onChange={(e) => setDonate(e.target.checked)} />
                                <span style={{ fontSize: 13 }}>Donate to Students' Welfare Fund</span>
                                {donate && <input className="erp-input" type="number" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value))} style={{ ...ocrInput, width: 120 }} />}
                            </div>
                        </div>

                        {/* Section 3: TPC (only if applicable to exit type) */}
                        {has('TPC') && (
                            <div className="well" style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>{circle(3)}<h3 style={{ margin: 0, color: '#1b365d', fontSize: 16 }}>TPC Placement Section</h3></div>
                                <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 12px' }}>Upload your Official Offer Letter</p>
                                {(() => {
                                    const tpcRejected = request.intake.rejected.includes('TPC');
                                    const tpcDone = uploaded('TPC') && !tpcRejected;
                                    return (
                                        <label style={{
                                            ...dropzone, flexDirection: 'row', gap: 12, minHeight: 'auto', padding: 20,
                                            border: tpcRejected ? '2px dashed #f87171' : '2px dashed #cbd5e1',
                                            background: tpcRejected ? '#fef2f2' : '#f8fafc'
                                        }}>
                                            <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }}
                                                onChange={(e) => upload('TPC', e.target.files && e.target.files[0] ? e.target.files[0] : null)} />
                                            <div style={{ fontSize: 24 }}>{tpcRejected ? '⚠️' : tpcDone ? '✅' : '📄'}</div>
                                            <div>
                                                <strong style={{ fontSize: 13, color: tpcRejected ? '#b91c1c' : '#1e293b', display: 'block' }}>
                                                    {tpcRejected ? 'Rejected — click to re-upload' : tpcDone ? 'Offer letter uploaded ✓ (click to replace)' : 'Upload Offer Letter'}
                                                </strong>
                                                <span style={{ fontSize: 11, color: '#64748b' }}>PDF, JPG, PNG · max 10 MB</span>
                                            </div>
                                        </label>
                                    );
                                })()}
                            </div>
                        )}

                        {intakeError && <div className="alert alert-danger" style={{ whiteSpace: 'pre-line', fontSize: 13 }}>⚠️ <strong>Action Required:</strong>{'\n• '}{intakeError}</div>}

                        <div style={{ textAlign: 'right' }}>
                            <button onClick={proceed} className="btn btn-success" disabled={busy === 'submit'} style={{ padding: '12px 24px', fontSize: 14, fontWeight: 700 }}>
                                {busy === 'submit' ? 'Submitting…' : 'Save & Proceed to Clearance Matrix ➔'}
                            </button>
                        </div>
                    </div>
                )}

                {/* ── PAGE 2: Core Tri-Gate verification ── */}
                {activeTab === 'page2' && (
                    <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, padding: 24 }}>
                        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '14px 18px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ margin: 0, color: '#1e40af', fontSize: 16 }}>
                                    {triGate.some((c) => sec(c)?.status === 'REJECTED') ? '⚠️ Action Required' : '🔒 Verification In Progress'}
                                </h3>
                                <p style={{ margin: '4px 0 0', color: '#3b82f6', fontSize: 13 }}>
                                    {triGate.some((c) => sec(c)?.status === 'REJECTED')
                                        ? 'One or more sections were rejected. Re-upload and re-confirm, then re-submit.'
                                        : 'Please wait while officers verify your tri-gate submissions.'}
                                </p>
                            </div>
                            <span style={{
                                background: triGate.some((c) => sec(c)?.status === 'REJECTED') ? '#b91c1c' : triGateApproved ? '#16a34a' : '#1d4ed8',
                                color: '#fff', padding: '6px 14px', borderRadius: 20, fontWeight: 700, fontSize: 12,
                            }}>
                                {triGate.some((c) => sec(c)?.status === 'REJECTED') ? 'Needs Attention' : triGateApproved ? 'Tri-Gate Cleared' : 'Verification Pending'}
                            </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {has('LIBRARY') && <VerifyCard code="LIBRARY" icon="📘" title="Librarian Verification" subtitle="Checking OCR data against physical records" detail={<>Form No: <code>{formNo}</code> · Title: <em>{title}</em> · Plagiarism: <strong style={{ color: '#b91c1c' }}>{plagiarism}</strong></>} />}
                            {has('TPC') && <VerifyCard code="TPC" icon="💼" title="TPC Check" subtitle="Reviewing your offer letter" detail={<>Offer Letter: 📄 <em>{sec('TPC')?.documents[0]?.original_name || 'uploaded'}</em></>} />}
                            {has('WARDEN') && <VerifyCard code="WARDEN" icon="🏛️" title="Warden Desk" subtitle="Verifying vacant room details" detail={<>Block <strong>{request.student.hostel}</strong> · Vacant Room: <strong style={{ color: '#1b365d' }}>{request.vacant_room_no || '—'}</strong></>} />}
                        </div>
                        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>ℹ️ When the tri-gate is cleared, Page 3 unlocks automatically.</p>
                            <button onClick={() => triGateApproved && setActiveTab('page3')} disabled={!triGateApproved} className={triGateApproved ? 'btn btn-success' : 'btn btn-secondary'} style={{ padding: '10px 20px', fontSize: 13, fontWeight: 700 }}>
                                {triGateApproved ? 'Proceed to Dept & Field ➔' : '🔒 Page 3 Locked'}
                            </button>
                        </div>
                    </div>
                )}

                {/* ── PAGE 3: Departmental & Field Clearance ── */}
                {activeTab === 'page3' && !openStageSection && (
                    <div>
                        <p style={{ fontSize: 13, color: '#64748b', marginTop: 0 }}>
                            Click a section to open it. Each is verified by their office from your name &amp; roll number — confirm your details to send your request.
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
                            {deptField.map((code) => {
                                const s = sec(code)!;
                                const meta = SECTION_META[code] || { icon: '📋', subtitle: '' };
                                const ok = s.status === 'APPROVED', rej = s.status === 'REJECTED';
                                const needsUpload = !!UPLOAD_SECTION_CONFIG[code];
                                return (
                                    <div key={code} onClick={() => setOpenStageSection(code)}
                                        style={{
                                            border: `1px solid ${rej ? '#fca5a5' : ok ? '#bbf7d0' : '#e2e8f0'}`,
                                            borderRadius: 8, padding: 16, cursor: 'pointer',
                                            background: ok ? '#f0fdf4' : rej ? '#fef2f2' : '#fff',
                                        }}
                                        title="Click to open">
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <div style={{ fontSize: 22, background: '#dbeafe', padding: 8, borderRadius: 8 }}>{meta.icon}</div>
                                                <div>
                                                    <h4 style={{ margin: 0, fontSize: 14, color: '#1e293b' }}>{s.name}</h4>
                                                    <span style={{ fontSize: 11, color: '#64748b' }}>{needsUpload ? '📎 Upload required' : meta.subtitle}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            {(() => {
                                                const notSent = s.needs_confirm && !s.student_confirmed;
                                                const label = ok ? 'APPROVED ✓' : rej ? 'REJECTED ✗' : notSent ? 'NOT SENT' : (!s.actionable ? 'WAITING' : 'IN PROGRESS');
                                                const color = ok ? '#15803d' : rej ? '#b91c1c' : notSent ? '#b45309' : (!s.actionable ? '#94a3b8' : '#b45309');
                                                return <span style={{ fontSize: 11, color, fontWeight: 700 }}>{label}</span>;
                                            })()}
                                            <span style={{ fontSize: 11, color: '#2563eb', fontWeight: 600 }}>Open ▸</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>All departmental sections must be approved to proceed to Accounts.</p>
                            <button onClick={() => accountsUnlock && setActiveTab('page4')} disabled={!accountsUnlock} className={accountsUnlock ? 'btn btn-success' : 'btn btn-secondary'} style={{ padding: '10px 20px', fontSize: 13, fontWeight: 700 }}>
                                {accountsUnlock ? 'Proceed to Financial ➔' : '🔒 Page 4 Locked'}
                            </button>
                        </div>
                    </div>
                )}

                {/* ── PAGE 3 detail view (opened by clicking a section) ── */}
                {activeTab === 'page3' && openStageSection && (() => {
                    const s = sec(openStageSection)!;
                    const meta = SECTION_META[openStageSection] || { icon: '📋', subtitle: '' };
                    const cfg = UPLOAD_SECTION_CONFIG[openStageSection];
                    return (
                        <div>
                            <button className="btn btn-secondary" style={{ fontSize: 12, padding: '6px 14px', marginBottom: 16 }}
                                onClick={() => setOpenStageSection(null)}>← Back to Departmental & Field</button>
                            {cfg ? (
                                <UploadReview
                                    section={s} icon={meta.icon} config={cfg}
                                    student={{ name: request.student.name, roll_no: request.student.roll_no, department: request.student.department }}
                                    me={request.student.webmail}
                                    onReload={onReload}
                                />
                            ) : (
                                <BasicDetail
                                    section={s} icon={meta.icon} subtitle={meta.subtitle}
                                    student={{ name: request.student.name, roll_no: request.student.roll_no, department: request.student.department }}
                                    me={request.student.webmail}
                                    onReload={onReload}
                                />
                            )}
                        </div>
                    );
                })()}

                {/* ── PAGE 4: Financial Clearance (Accounts) ── */}
                {activeTab === 'page4' && (
                    <div>
                        <div className="row">
                            <div className="col-sm-7">
                                {has('ACCOUNTS') && (
                                    <UploadReview
                                        section={sec('ACCOUNTS')!} icon={SECTION_META.ACCOUNTS.icon}
                                        config={UPLOAD_SECTION_CONFIG.ACCOUNTS}
                                        student={{ name: request.student.name, roll_no: request.student.roll_no, department: request.student.department }}
                                        me={request.student.webmail}
                                        onReload={onReload}
                                    />
                                )}
                            </div>
                            <div className="col-sm-5">
                                <div className="well" style={{ background: '#fff' }}>
                                    <h4 style={{ marginTop: 0, color: '#1b365d' }}>Refund Ledger</h4>
                                    {(() => {
                                        const caution = 10000, dues = 0;
                                        const donation = Number(request.fund_us_amount) || 0;
                                        const net = caution - dues - donation;
                                        const Row = ({ k, v, bold }: { k: string; v: string; bold?: boolean }) => (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', fontWeight: bold ? 700 : 400, borderTop: bold ? '1px solid #cbd5e1' : 'none' }}>
                                                <span>{k}</span><span>{v}</span>
                                            </div>
                                        );
                                        return (<>
                                            <Row k="Caution Money (refundable)" v={`₹${caution.toLocaleString()}`} />
                                            <Row k="Total Dues" v={`₹${dues}`} />
                                            <Row k="Voluntary Donation (Fund-Us)" v={`₹${donation.toLocaleString()}`} />
                                            <Row k="Net Refund" v={`₹${net.toLocaleString()}`} bold />
                                        </>);
                                    })()}
                                    <p className="text-muted" style={{ fontSize: 11, marginTop: 8 }}>Amount is refunded to your registered bank account after final Administration release.</p>
                                </div>
                            </div>
                        </div>
                        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>Accounts must approve to proceed to Administration.</p>
                            <button onClick={() => accountsApproved && setActiveTab('page5')} disabled={!accountsApproved} className={accountsApproved ? 'btn btn-success' : 'btn btn-secondary'} style={{ padding: '10px 20px', fontSize: 13, fontWeight: 700 }}>
                                {accountsApproved ? 'Proceed to Administration ➔' : '🔒 Page 5 Locked'}
                            </button>
                        </div>
                    </div>
                )}

                {/* ── PAGE 5: Final Administration Release + Certificate ── */}
                {activeTab === 'page5' && (
                    <div>
                        {has('ADMINISTRATION') && (
                            <BasicDetail
                                section={sec('ADMINISTRATION')!}
                                icon={SECTION_META.ADMINISTRATION.icon}
                                subtitle={SECTION_META.ADMINISTRATION.subtitle}
                                student={{ name: request.student.name, roll_no: request.student.roll_no, department: request.student.department }}
                                me={request.student.webmail}
                                onReload={onReload}
                            />
                        )}
                        <div className="well" style={{ marginTop: 16, textAlign: 'center', background: cleared ? '#f0fdf4' : '#fff', border: cleared ? '1px solid #86efac' : '1px solid #cbd5e1' }}>
                            {cleared ? (
                                <>
                                    <h3 style={{ color: '#15803d', marginTop: 0 }}>✅ Released Successfully!</h3>
                                    <p style={{ color: '#475569', fontSize: 13 }}>Your clearance is complete. Download your digital No-Dues certificate below.</p>
                                    <button className="btn btn-success" style={{ padding: '12px 24px', fontSize: 14, fontWeight: 700 }} onClick={downloadCertificate}>
                                        🎓 Download Complete Digital No-Dues Certificate
                                    </button>
                                </>
                            ) : (
                                <>
                                    <h3 style={{ color: '#1b365d', marginTop: 0 }}>Administration Sign-Off</h3>
                                    <p style={{ color: '#64748b', fontSize: 13 }}>Once you confirm your details above, the Administration Office does the final all-green review and releases your certificate here.</p>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                        <Spinner /><span style={{ color: '#475569', fontSize: 13 }}>Pending Administration Release…</span>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
}

// ── Two-way comment thread (stable top-level component so the input keeps focus) ──
function CommentThread({ comments, me, busy, onSend }: {
    comments: { body: string; author: string; is_system: boolean }[];
    me: string;
    busy: boolean;
    onSend: (text: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState('');
    const submit = () => { if (draft.trim()) { onSend(draft); setDraft(''); } };

    return (
        <div style={{ marginTop: 10, borderTop: '1px dashed #e2e8f0', paddingTop: 8 }}>
            <button
                onClick={() => setOpen((o) => !o)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 11, fontWeight: 700, color: '#2563eb', display: 'flex', alignItems: 'center', gap: 4 }}
            >
                💬 Messages{comments.length ? ` (${comments.length})` : ''} <span style={{ fontSize: 9 }}>{open ? '▲' : '▼'}</span>
            </button>

            {open && (
                <div style={{ marginTop: 8 }}>
                    {comments.length === 0 && <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>No messages yet.</div>}
                    <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                        {comments.map((c, i) => {
                            const mine = c.author === me;
                            return (
                                <div key={i} style={{ fontSize: 11, marginBottom: 4, textAlign: mine ? 'right' : 'left' }}>
                                    <span style={{
                                        display: 'inline-block', padding: '4px 8px', borderRadius: 8, maxWidth: '85%',
                                        background: c.is_system ? '#f1f5f9' : mine ? '#dbeafe' : '#fee2e2',
                                        color: c.is_system ? '#64748b' : mine ? '#1e40af' : '#7f1d1d',
                                    }}>
                                        {c.is_system ? '⚙️ ' : ''}{c.body}
                                        <span style={{ display: 'block', fontSize: 9, opacity: 0.7 }}>{mine ? 'You' : c.author}</span>
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                            placeholder="Write a message…"
                            style={{ flex: 1, fontSize: 11, padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: 4 }} />
                        <button className="btn btn-primary" style={{ fontSize: 11, padding: '2px 10px' }} disabled={busy} onClick={submit}>Send</button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Upload + OCR review detail for LUCS / Department-Purpose (like Library) ──
function UploadReview({ section, icon, config, student, me, onReload }: {
    section: SectionInfo;
    icon: string;
    config: { formUrl?: string; formLabel?: string; allowLink?: boolean; fields: { key: string; label: string }[] };
    student: { name: string; roll_no: string; department: string };
    me: string;
    onReload: () => void;
}) {
    const doc = section.documents[0];
    const savedReview = (doc?.ocr_fields?.review as Record<string, string>) || {};
    const defaults: Record<string, string> = { name: student.name, roll_no: student.roll_no, department: student.department };
    const initFields: Record<string, string> = {};
    config.fields.forEach((f) => { initFields[f.key] = savedReview[f.key] ?? defaults[f.key] ?? ''; });

    const [fields, setFields] = useState<Record<string, string>>(initFields);
    const [ocrText, setOcrText] = useState(doc?.ocr_text || '');
    const [processing, setProcessing] = useState(false);
    const [confirmed, setConfirmed] = useState(!!(doc?.ocr_fields as { confirmed?: boolean } | undefined)?.confirmed && section.status !== 'REJECTED');
    const [busy, setBusy] = useState('');
    const [note, setNote] = useState('');
    const [noteErr, setNoteErr] = useState(false);

    const uploaded = section.documents.length > 0;
    const rejected = section.status === 'REJECTED';
    const approvedOk = section.status === 'APPROVED';
    const reason = section.comments.filter((c) => !c.is_system && c.body).slice(-1)[0];
    // Locked once confirmed or approved (unless the officer rejected → allow redo).
    const locked = (confirmed || approvedOk) && !rejected;

    // Re-sync when a new document is uploaded or the officer changes status, so the
    // dropzone / OCR / confirm button reflect the latest server state.
    const docId = section.documents[0]?.id;
    useEffect(() => {
        const d = section.documents[0];
        setOcrText(d?.ocr_text || '');
        setConfirmed(!!(d?.ocr_fields as { confirmed?: boolean } | undefined)?.confirmed && section.status !== 'REJECTED');
        const rev = (d?.ocr_fields?.review as Record<string, string>) || {};
        setFields((prev) => {
            const next = { ...prev };
            config.fields.forEach((f) => { if (rev[f.key]) next[f.key] = rev[f.key]; });
            return next;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [docId, section.status]);

    const doUpload = async (file: File | null) => {
        if (!file) return;
        setBusy('upload'); setProcessing(true); setConfirmed(false); setNote(''); setNoteErr(false);
        // Client-side size pre-check for an instant, clear message.
        if (file.size > 10 * 1024 * 1024) {
            setNoteErr(true); setNote(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum allowed is 10 MB.`);
            setProcessing(false); setBusy(''); return;
        }
        try {
            const res = await api.upload(section.code, file);
            const af = res.autofill || {};
            setFields((prev) => ({
                ...prev,
                ...(af.roll_no && 'roll_no' in prev ? { roll_no: af.roll_no } : {}),
                ...(af.author && 'name' in prev ? { name: af.author } : {}),
                ...(af.department && 'department' in prev ? { department: af.department } : {}),
            }));
            if (res.ocr_text) setOcrText(res.ocr_text);
            setNoteErr(false); setNote('OCR complete — review the auto-filled details and Confirm.');
            onReload();
        } catch (e) { setNoteErr(true); setNote(e instanceof Error ? e.message : 'Upload failed'); }
        finally { setProcessing(false); setBusy(''); }
    };

    const doConfirm = async () => {
        setBusy('confirm');
        try { await api.confirmReview(section.code, fields); setConfirmed(true); setNoteErr(false); setNote('✓ Confirmed and sent to the office.'); onReload(); }
        catch (e) { setNoteErr(true); setNote(e instanceof Error ? e.message : 'Could not confirm'); }
        finally { setBusy(''); }
    };

    return (
        <div className="well" style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontSize: 24, background: '#dbeafe', padding: 8, borderRadius: 8 }}>{icon}</div>
                    <h3 style={{ margin: 0, color: '#1b365d', fontSize: 16 }}>{section.name}</h3>
                    {approvedOk && <span style={{ background: '#dcfce7', color: '#15803d', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>APPROVED ✓</span>}
                    {rejected && <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>REJECTED ✗</span>}
                </div>
                {config.formUrl && (
                    <a href={config.formUrl} download target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontWeight: 600, fontSize: 13, textDecoration: 'underline' }}>
                        📥 Download {config.formLabel || 'Form'}
                    </a>
                )}
            </div>

            {rejected && reason && <div style={{ marginBottom: 12, fontSize: 12, color: '#b91c1c' }}><strong>Officer's reason:</strong> {reason.body}</div>}
            {note && (noteErr
                ? <div className="alert alert-danger" style={{ marginBottom: 12, fontSize: 13 }}>⚠️ {note}</div>
                : <div style={{ marginBottom: 12, fontSize: 12, color: '#15803d' }}>{note}</div>)}

            <div className="row">
                <div className="col-sm-6">
                    <label style={{ ...dropzone, cursor: locked ? 'default' : 'pointer', border: rejected ? '2px dashed #f87171' : locked ? '2px solid #bbf7d0' : '2px dashed #cbd5e1', background: rejected ? '#fef2f2' : locked ? '#f0fdf4' : '#f8fafc' }}>
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} disabled={locked}
                            onChange={(e) => doUpload(e.target.files && e.target.files[0] ? e.target.files[0] : null)} />
                        <div style={{ fontSize: 32, marginBottom: 8 }}>{rejected ? '⚠️' : approvedOk ? '✅' : uploaded ? '✅' : '☁️'}</div>
                        <strong style={{ fontSize: 14, color: rejected ? '#b91c1c' : approvedOk ? '#15803d' : '#1e293b' }}>
                            {rejected ? 'Rejected — click to re-upload' : approvedOk ? 'Approved ✓' : locked ? 'Uploaded ✓' : uploaded ? 'Uploaded ✓ (click to replace)' : 'Upload Document'}
                        </strong>
                        <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>PDF, JPG, PNG · max 10 MB</span>
                    </label>
                    {config.allowLink && (
                        <button className="btn btn-primary" style={{ fontSize: 12, padding: '4px 10px', marginTop: 8 }}
                            onClick={() => { const u = window.prompt('Event report URL:'); if (u) api.upload(section.code, null, u).then(onReload); }}>
                            Submit link instead
                        </button>
                    )}
                </div>
                <div className="col-sm-6">
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <strong style={{ fontSize: 13, color: '#334155' }}>Review <span style={{ color: '#64748b', fontWeight: 'normal' }}>(auto-filled)</span></strong>
                            <span style={{
                                background: processing ? '#fef3c7' : approvedOk ? '#dcfce7' : confirmed ? '#dcfce7' : uploaded ? '#dbeafe' : '#f1f5f9',
                                color: processing ? '#b45309' : approvedOk ? '#15803d' : confirmed ? '#15803d' : uploaded ? '#1e40af' : '#64748b',
                                padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6,
                            }}>
                                {processing && <Spinner />}
                                {processing ? 'Scanning…' : approvedOk ? 'Approved ✓' : confirmed ? 'Confirmed ✓' : uploaded ? 'Review & Confirm' : 'Awaiting upload'}
                            </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            {config.fields.map((f) => (
                                <div key={f.key} style={f.key === 'purpose' || f.key === 'event_name' ? { gridColumn: '1 / -1' } : undefined}>
                                    <label style={{ display: 'block', color: '#64748b', marginBottom: 2, fontSize: 11 }}>{f.label}</label>
                                    <input className="erp-input" value={fields[f.key] || ''} disabled={locked}
                                        onChange={(e) => setFields((p) => ({ ...p, [f.key]: e.target.value }))}
                                        style={{ padding: '6px 10px', fontSize: 12 }} />
                                </div>
                            ))}
                        </div>
                        {ocrText && (
                            <div style={{ marginTop: 10, fontSize: 11, background: '#f8fafc', padding: 8, borderRadius: 4 }}>
                                <strong>Detected text:</strong>
                                <pre style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>{ocrText.slice(0, 250)}</pre>
                            </div>
                        )}
                        <button className="btn btn-primary" style={{ width: '100%', marginTop: 12, fontSize: 13 }}
                            disabled={!uploaded || processing || locked || busy === 'confirm'} onClick={doConfirm}>
                            {approvedOk ? '✓ Approved' : confirmed ? '✓ Confirmed' : busy === 'confirm' ? 'Confirming…' : 'Confirm & Send'}
                        </button>
                    </div>
                </div>
            </div>

            <CommentThread comments={section.comments} me={me} busy={false} onSend={(t) => api.studentComment(section.code, t).then(onReload)} />
        </div>
    );
}

// ── Basic detail for non-upload sections (Store, Sports, Medical, NAD, HOD) ──
// Confirm-required sections (needs_confirm) show editable name/roll/dept + a Confirm
// button; the request only reaches the office after the student confirms.
function BasicDetail({ section, icon, subtitle, student, me, onReload }: {
    section: SectionInfo;
    icon: string;
    subtitle: string;
    student: { name: string; roll_no: string; department: string };
    me: string;
    onReload: () => void;
}) {
    const ok = section.status === 'APPROVED', rejected = section.status === 'REJECTED';
    const waiting = !section.actionable && section.status === 'PENDING';
    const reason = section.comments.filter((c) => !c.is_system && c.body).slice(-1)[0];

    const savedReview = (section.documents[0]?.ocr_fields?.review as Record<string, string>) || {};
    const [name, setName] = useState(savedReview.name || student.name);
    const [roll, setRoll] = useState(savedReview.roll_no || student.roll_no);
    const [dept, setDept] = useState(savedReview.department || student.department);
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState('');

    const needsConfirm = section.needs_confirm;
    const sent = section.student_confirmed;

    const confirm = async () => {
        setBusy(true); setNote('');
        try {
            await api.confirmSection(section.code, { name: name.trim(), roll_no: roll.trim(), department: dept.trim() });
            setNote('✓ Confirmed — request sent to the office.');
            onReload();
        } catch (e) { setNote(e instanceof Error ? e.message : 'Could not confirm'); }
        finally { setBusy(false); }
    };

    // Editable form shows when: a confirm-required section hasn't been sent yet,
    // OR any basic section (incl. HOD) was rejected and needs re-sending.
    const showForm = (needsConfirm && !sent) || rejected;
    const fieldStyle: React.CSSProperties = { padding: '6px 10px', fontSize: 13 };

    return (
        <div className="well" style={{ background: '#fff', border: `1px solid ${rejected ? '#fca5a5' : ok ? '#bbf7d0' : '#cbd5e1'}`, borderRadius: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontSize: 24, background: '#dbeafe', padding: 8, borderRadius: 8 }}>{icon}</div>
                    <div><h3 style={{ margin: 0, color: '#1b365d', fontSize: 16 }}>{section.name}</h3>
                        <span style={{ fontSize: 12, color: '#64748b' }}>{subtitle}</span></div>
                </div>
                <span style={{
                    padding: '4px 12px', borderRadius: 20, fontWeight: 700, fontSize: 12,
                    background: ok ? '#dcfce7' : rejected ? '#fee2e2' : (needsConfirm && !sent) ? '#fef3c7' : '#f1f5f9',
                    color: ok ? '#15803d' : rejected ? '#b91c1c' : (needsConfirm && !sent) ? '#b45309' : '#64748b',
                }}>{ok ? 'APPROVED ✓' : rejected ? 'REJECTED ✗' : (needsConfirm && !sent) ? 'NOT SENT' : waiting ? 'WAITING' : 'IN PROGRESS'}</span>
            </div>

            {note && <div style={{ fontSize: 12, color: '#475569', marginBottom: 10 }}>{note}</div>}

            {showForm ? (
                <>
                    {rejected && reason && (
                        <div style={{ fontSize: 12, color: '#b91c1c', marginBottom: 8 }}><strong>Officer's reason:</strong> {reason.body}</div>
                    )}
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
                        {rejected
                            ? <>Update your details and click <strong>Confirm &amp; Re-send</strong> to send the request back to this office.</>
                            : <>Verify your details and click <strong>Confirm &amp; Send</strong>. The request reaches this office only after you confirm.</>}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                        <div><label style={ocrLabel}>Name</label><input className="erp-input" value={name} onChange={(e) => setName(e.target.value)} style={fieldStyle} /></div>
                        <div><label style={ocrLabel}>Roll No</label><input className="erp-input" value={roll} onChange={(e) => setRoll(e.target.value)} style={fieldStyle} /></div>
                        <div><label style={ocrLabel}>Department</label><input className="erp-input" value={dept} onChange={(e) => setDept(e.target.value)} style={fieldStyle} /></div>
                    </div>
                    <button className="btn btn-success" style={{ marginTop: 12, fontSize: 13 }} disabled={busy} onClick={confirm}>
                        {busy ? 'Sending…' : rejected ? 'Confirm & Re-send Request' : 'Confirm & Send Request'}
                    </button>
                </>
            ) : (
                <div style={{ fontSize: 13, color: '#334155' }}>
                    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: '#1e40af' }}>
                        ✓ Request sent to this office. They verify from the details below and approve/reject.
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, background: '#f8fafc', padding: 12, borderRadius: 6 }}>
                        <div><strong>Name:</strong> {savedReview.name || student.name}</div>
                        <div><strong>Roll No:</strong> {savedReview.roll_no || student.roll_no}</div>
                        <div><strong>Department:</strong> {savedReview.department || student.department}</div>
                    </div>
                </div>
            )}

            {waiting && <div className="text-muted" style={{ fontSize: 12, marginTop: 10 }}>Waiting on prerequisite sections to be approved first.</div>}
            {rejected && reason && !showForm && <div style={{ marginTop: 10, fontSize: 12, color: '#b91c1c' }}><strong>Officer's reason:</strong> {reason.body}</div>}
            <CommentThread comments={section.comments} me={me} busy={false} onSend={(t) => api.studentComment(section.code, t).then(onReload)} />
        </div>
    );
}

// ── inline style helpers ──
const tabStyle = (active: boolean, enabled: boolean): React.CSSProperties => ({
    padding: '10px 20px', background: active ? '#fff' : '#f1f5f9', border: '1px solid #cbd5e1',
    borderBottom: active ? '3px solid #b91c1c' : '1px solid #cbd5e1', fontWeight: 'bold',
    color: enabled ? (active ? '#1b365d' : '#64748b') : '#94a3b8', borderRadius: '6px 6px 0 0',
    cursor: enabled ? 'pointer' : 'not-allowed', fontSize: 13, opacity: enabled ? 1 : 0.7,
});
const dropzone: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed #cbd5e1', borderRadius: 8, padding: 24, background: '#f8fafc', cursor: 'pointer', textAlign: 'center', minHeight: 200 };
const ocrLabel: React.CSSProperties = { display: 'block', color: '#64748b', marginBottom: 2, fontSize: 11 };
const ocrInput: React.CSSProperties = { padding: '6px 10px', fontSize: 12 };
