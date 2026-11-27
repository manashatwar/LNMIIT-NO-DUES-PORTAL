import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { OfficeChecklist } from '../components/OfficeChecklist';
import { labBadge } from '../labBadge';
import { Icon } from '../components/Icon';
import { ClearanceRequest, SectionInfo, CertificateData, LabChain } from '../types';
import { api } from '../api';

// The certificate is assembled as an HTML string (rendered off-screen for
// html2canvas), so every value from the server is escaped first — lab names,
// for one, are free text typed in by HODs.
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));

const rupees = (v: string) => `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

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

const Spinner = () => <span className="spinner" role="status" aria-label="Loading" />;

// "A", "A and B", "A, B and C".
const joinNames = (names: string[]) =>
    names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
const mustApproveFirst = (names: string[]) =>
    names.length ? `${joinNames(names)} must approve first.` : 'The earlier sections must approve first.';

export function StudentDashboard({ request, onReload, onLogout, onRules, onContact }: StudentDashboardProps) {
    const sec = (code: string): SectionInfo | undefined => request.sections.find((s) => s.code === code);
    const has = (code: string) => !!sec(code);
    const approved = (code: string) => sec(code)?.status === 'APPROVED';
    const uploaded = (code: string) =>
        request.intake.uploaded.includes(code) || (sec(code)?.documents.length ?? 0) > 0;

    // Stage groupings (the reference flow). Only the sections this student's exit
    // type has: no TPC on an NEP exit, a withdrawal or an admission cancel.
    const triGate = ['LIBRARY', 'TPC', 'WARDEN'].filter(has);
    const deptField = ['STORE', 'LUCS', 'SPORTS', 'MEDICAL', 'NAD', 'HOD'].filter(has);
    const triGateApproved = triGate.length > 0 && triGate.every(approved);
    // Accounts and Administration work in parallel on Page 4. It opens when the
    // backend says they can act: the tri-gate and all six Page-3 departments have
    // approved (engine.prerequisites). The rule lives there only — not copied here.
    const accountsUnlock = !!sec('ACCOUNTS')?.actionable;
    const adminUnlock = !!sec('ADMINISTRATION')?.actionable;
    const financeUnlock = accountsUnlock || adminUnlock;
    const financeApproved = ['ACCOUNTS', 'ADMINISTRATION'].filter(has).every(approved);
    const cleared = request.overall_status === 'CLEARED';   // every section approved + refund sent
    const refund = request.refund;

    // Department labs: when the student's department has them, the HOD card is
    // the lab chain (sent level by level) followed by HOD's final approval.
    const labs = request.labs;
    const labsOn = !!labs?.enabled;
    const labRejected = labsOn && labs.levels.some((lv) => lv.labs.some((e) => e.status === 'REJECTED'));

    // Page lock rules. Page 3's six departments receive the request by themselves
    // once the tri-gate clears. Page 4 holds Accounts and Administration side by
    // side: both open once all six departments approve. Page 5 (the certificate)
    // opens with it, showing what it still waits for.
    const locks = {
        page1: true,
        page2: request.intake_submitted,
        page3: triGateApproved,
        page4: financeUnlock,
        page5: financeUnlock,
    };
    // What a locked page is waiting for, by name (this student's sections only).
    const financeWaiting = mustApproveFirst([...new Set([
        ...(sec('ACCOUNTS')?.waiting_for ?? []), ...(sec('ADMINISTRATION')?.waiting_for ?? []),
    ])]);
    const lockMsgs = {
        page3: mustApproveFirst(triGate.filter((c) => !approved(c)).map((c) => sec(c)?.name ?? c)),
        page4: financeWaiting,
        page5: financeWaiting,
    };

    type TabId = 'page1' | 'page2' | 'page3' | 'page4' | 'page5';
    // Resume on the current stage (the furthest page the student has reached).
    const resumeTab: TabId =
        !request.intake_submitted ? 'page1'
            : !triGateApproved ? 'page2'
                : !financeUnlock ? 'page3'
                    : !financeApproved ? 'page4'
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
                setMsg(`Uploaded to ${code}`);
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
            setMsg('OCR data confirmed and sent to the Library.');
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
            await api.submitIntake(roomTrimmed.toUpperCase());
            setFixingSectionAndAdvance();
            onReload();
        } catch (e) { setIntakeError(e instanceof Error ? e.message : 'Submit failed'); }
        finally { setBusy(null); }
    };

    const buildCertificateMarkup = (c: CertificateData) => {
        // A certificate exists only once everything is approved, so each row just says so (no names).
        const approved = '<span style="color:#15803d;font-weight:bold;">Approved</span>';
        const rows = c.sections.map((s) => `
            <tr>
                <td style="padding:8px 12px;border-bottom:1px solid #dbe3ee;">${esc(s.name)}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #dbe3ee;">${approved}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #dbe3ee;">${s.decided_at ? esc(new Date(s.decided_at).toLocaleDateString()) : '—'}</td>
            </tr>`).join('');
        // Department labs cleared before HOD (none for departments without labs).
        const labRows = (c.labs || []).map((l) => `
            <tr>
                <td style="padding:6px 12px;border-bottom:1px solid #dbe3ee;">${esc(l.name)}</td>
                <td style="padding:6px 12px;border-bottom:1px solid #dbe3ee;">Level ${esc(l.level)}</td>
                <td style="padding:6px 12px;border-bottom:1px solid #dbe3ee;">${approved}</td>
                <td style="padding:6px 12px;border-bottom:1px solid #dbe3ee;">${l.decided_at ? esc(new Date(l.decided_at).toLocaleDateString()) : '—'}</td>
            </tr>`).join('');
        const labsTable = labRows ? `
                <div style="font-size:14px;font-weight:bold;margin:0 0 8px;">Department Lab Clearance (before HOD)</div>
                <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:24px;">
                    <thead>
                        <tr style="background:#f4f7fb;">
                            <th style="text-align:left;padding:6px 12px;border-bottom:2px solid #1b365d;">Lab</th>
                            <th style="text-align:left;padding:6px 12px;border-bottom:2px solid #1b365d;">Level</th>
                            <th style="text-align:left;padding:6px 12px;border-bottom:2px solid #1b365d;">Status</th>
                            <th style="text-align:left;padding:6px 12px;border-bottom:2px solid #1b365d;">Date</th>
                        </tr>
                    </thead>
                    <tbody>${labRows}</tbody>
                </table>` : '';
        // Staff levels that approved a section (Accounts), in order.
        const stageRows = (c.stages || []).map((s) => `
            <tr>
                <td style="padding:6px 12px;border-bottom:1px solid #dbe3ee;">${esc(s.section)}</td>
                <td style="padding:6px 12px;border-bottom:1px solid #dbe3ee;">Level ${esc(s.level)}</td>
                <td style="padding:6px 12px;border-bottom:1px solid #dbe3ee;">${approved}</td>
                <td style="padding:6px 12px;border-bottom:1px solid #dbe3ee;">${esc(new Date(s.approved_at).toLocaleDateString())}</td>
            </tr>`).join('');
        const stagesTable = stageRows ? `
                <div style="font-size:14px;font-weight:bold;margin:0 0 8px;">Approvals by Staff Level</div>
                <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:24px;">
                    <thead>
                        <tr style="background:#f4f7fb;">
                            <th style="text-align:left;padding:6px 12px;border-bottom:2px solid #1b365d;">Section</th>
                            <th style="text-align:left;padding:6px 12px;border-bottom:2px solid #1b365d;">Level</th>
                            <th style="text-align:left;padding:6px 12px;border-bottom:2px solid #1b365d;">Status</th>
                            <th style="text-align:left;padding:6px 12px;border-bottom:2px solid #1b365d;">Date</th>
                        </tr>
                    </thead>
                    <tbody>${stageRows}</tbody>
                </table>` : '';
        return `
            <div style="width:760px;padding:40px;font-family:Arial,Helvetica,sans-serif;color:#0f2748;background:#ffffff;border:6px solid #1b365d;">
                <div style="text-align:center;border-bottom:3px solid #1b365d;padding-bottom:16px;margin-bottom:24px;">
                    <div style="font-size:22px;font-weight:bold;letter-spacing:1px;">THE LNM INSTITUTE OF INFORMATION TECHNOLOGY</div>
                    <div style="font-size:16px;color:#475569;margin-top:4px;">No-Dues Certificate</div>
                </div>
                <table style="width:100%;font-size:14px;margin-bottom:20px;">
                    <tr><td style="padding:4px 0;color:#475569;width:160px;">Student Name</td><td style="font-weight:bold;">${esc(c.student)}</td></tr>
                    <tr><td style="padding:4px 0;color:#475569;">Roll Number</td><td style="font-weight:bold;">${esc(c.roll_no)}</td></tr>
                    <tr><td style="padding:4px 0;color:#475569;">Exit Type</td><td style="font-weight:bold;">${esc(EXIT_LABELS[c.exit_type] || c.exit_type)}</td></tr>
                    <tr><td style="padding:4px 0;color:#475569;">Fund-Us Contribution</td><td style="font-weight:bold;">₹${esc(c.fund_us_amount)}</td></tr>
                    <tr><td style="padding:4px 0;color:#475569;">Refund</td><td style="font-weight:bold;">${c.refund && c.refund.status === 'sent'
                        ? `${esc(rupees(c.refund.amount))} · ${esc(c.refund.mode)} · UTR ${esc(c.refund.reference)}${c.refund.paid_on ? ` · ${esc(new Date(c.refund.paid_on).toLocaleDateString())}` : ''}`
                        : 'No refund due'}</td></tr>
                </table>
                <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px;">
                    <thead>
                        <tr style="background:#f4f7fb;">
                            <th style="text-align:left;padding:8px 12px;border-bottom:2px solid #1b365d;">Section</th>
                            <th style="text-align:left;padding:8px 12px;border-bottom:2px solid #1b365d;">Status</th>
                            <th style="text-align:left;padding:8px 12px;border-bottom:2px solid #1b365d;">Date</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>${labsTable}${stagesTable}
                <div style="font-size:12px;color:#64748b;display:flex;justify-content:space-between;border-top:1px solid #dbe3ee;padding-top:12px;">
                    <span>Certificate ID: NDC-${esc(c.request_id)}</span>
                    <span>Generated: ${esc(new Date(c.generated_at).toLocaleString())}</span>
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
                        <div className="section-mark">{icon}</div>
                        <div>
                            <h4 style={{ margin: 0, color: '#1e293b', fontSize: 15 }}>{t}</h4>
                            <span style={{ fontSize: 12, color: '#64748b' }}>{subtitle}</span>
                            <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>{detail}</div>
                        </div>
                    </div>
                    {ok ? (
                        <span style={{ background: '#dcfce7', color: '#15803d', padding: '6px 16px', borderRadius: 20, fontWeight: 700, fontSize: 12 }}>APPROVED</span>
                    ) : rejected ? (
                        <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '6px 16px', borderRadius: 20, fontWeight: 700, fontSize: 12 }}>REJECTED</span>
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
        STORE: { icon: 'ST', subtitle: 'Outstanding store material check' },
        LUCS: { icon: 'LU', subtitle: 'Event / activity clearance check' },
        SPORTS: { icon: 'SP', subtitle: 'Sports equipment & records' },
        MEDICAL: { icon: 'MC', subtitle: 'Medical-cell dues' },
        NAD: { icon: 'NA', subtitle: 'NAD-related verification' },
        HOD: { icon: 'HD', subtitle: 'Departmental consolidation' },
        ACCOUNTS: { icon: 'AC', subtitle: 'Refund & cancelled cheque' },
        ADMINISTRATION: { icon: 'AD', subtitle: 'Alongside Accounts · ID card to the Administration Block' },
    };

    return (
        <Layout title={activeTab === 'page1' ? 'Intake & Uploads' : 'Clearance Matrix'} userName={request.student.name} onLogout={onLogout} onRules={onRules} onContact={onContact}>
            <div className="container">
                <div className="lnmiit-section-title-banner" style={{ borderRadius: 6, marginBottom: 16 }}>
                    <span>{{
                        page1: 'PAGE 1 · STUDENT INTAKE & OFFLINE VERIFICATION UPLOADS',
                        page2: 'PAGE 2 · CORE TRI-GATE VERIFICATION',
                        page3: 'PAGE 3 · DEPARTMENTAL & FIELD CLEARANCE',
                        page4: 'PAGE 4 · FINANCIAL & ADMINISTRATION CLEARANCE (IN PARALLEL)',
                        page5: 'PAGE 5 · NO-DUES CERTIFICATE',
                    }[activeTab]}</span>
                    <span style={{ fontSize: 12, fontWeight: 'normal' }}>{request.student.roll_no} · {request.student.department} · {EXIT_LABELS[request.exit_type] || request.exit_type}</span>
                </div>

                {/* Accounts has paid the refund (or none was due): tell the student on every page. */}
                {(refund.status === 'sent' || refund.status === 'not_due') && (
                    <div className="well" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '12px 16px', marginBottom: 16, background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6 }}>
                        <span style={{ fontSize: 14, color: '#166534' }}>
                            {refund.status === 'sent'
                                ? <><strong>Your refund of {rupees(refund.amount)} has been sent</strong>
                                    {refund.account ? ` to your account ${refund.account}` : ''} by {refund.mode}
                                    {refund.paid_on ? ` on ${new Date(refund.paid_on).toLocaleDateString()}` : ''}
                                    {refund.reference ? <> · UTR <code>{refund.reference}</code></> : null}.</>
                                : <><strong>No refund was due</strong> (your caution money went to your Fund-Us donation / dues).</>}
                            {cleared ? ' Your No-Dues certificate is ready.' : ''}
                        </span>
                        {cleared && activeTab !== 'page5' && (
                            <button className="btn btn-success" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => setActiveTab('page5')}>
                                Get your certificate
                            </button>
                        )}
                    </div>
                )}

                {/* Tabs — sequential pages, each locked until the previous clears */}
                <div style={{ display: 'flex', gap: 6, borderBottom: '2px solid #cbd5e1', marginBottom: 24, flexWrap: 'wrap' }}>
                    {([
                        { id: 'page1', label: '1 · Intake & Uploads', lockMsg: '' },
                        { id: 'page2', label: '2 · Core Tri-Gate', lockMsg: 'Submit your intake (Page 1) first.' },
                        { id: 'page3', label: '3 · Dept & Field', lockMsg: lockMsgs.page3 },
                        { id: 'page4', label: '4 · Financial & Administration', lockMsg: lockMsgs.page4 },
                        { id: 'page5', label: '5 · Certificate', lockMsg: lockMsgs.page5 },
                    ] as { id: TabId; label: string; lockMsg: string }[]).map((t) => {
                        const enabled = locks[t.id];
                        return (
                            <button key={t.id} style={tabStyle(activeTab === t.id, enabled)}
                                onClick={() => { if (!enabled) { alert('Locked. ' + t.lockMsg); return; } setActiveTab(t.id); }}>
                                {!enabled && <Icon name="lock" size={12} style={{ marginRight: 6, marginTop: -2 }} />}{t.label}
                            </button>
                        );
                    })}
                </div>

                {msg && (msgErr
                    ? <div className="alert alert-danger" style={{ marginBottom: 16, fontSize: 13 }}>{msg}</div>
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
                                    style={{ color: '#1b365d', fontWeight: 600, fontSize: 13, textDecoration: 'underline' }}>Download Form</a>
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
                                                <div style={{ marginBottom: 8, color: isRejected ? '#b42318' : isDone ? '#157347' : '#64748b' }}><Icon name={isRejected ? 'alert' : isDone ? 'check' : 'upload'} size={30} /></div>
                                                <strong style={{ fontSize: 14, color: isRejected ? '#b91c1c' : '#1e293b' }}>
                                                    {isRejected ? 'Rejected — click to re-upload' : isDone ? 'Uploaded (click to replace)' : 'Upload Signed Document'}
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
                                                background: ocrProcessing ? '#fef3c7' : btpConfirmed ? '#dcfce7' : uploaded('LIBRARY') ? '#eef2f8' : '#f1f5f9',
                                                color: ocrProcessing ? '#b45309' : btpConfirmed ? '#15803d' : uploaded('LIBRARY') ? '#1b365d' : '#64748b',
                                                padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6,
                                            }}>
                                                {ocrProcessing && <Spinner />}
                                                {ocrProcessing ? 'Scanning…' : btpConfirmed ? 'Confirmed' : uploaded('LIBRARY') ? 'Review & Confirm' : 'Awaiting upload'}
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
                                            {btpConfirmed ? 'OCR Confirmed' : busy === 'confirm' ? 'Confirming…' : 'Confirm OCR Data'}
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
                                            <div style={{ color: tpcRejected ? '#b42318' : tpcDone ? '#157347' : '#64748b' }}><Icon name={tpcRejected ? 'alert' : tpcDone ? 'check' : 'file'} size={24} /></div>
                                            <div>
                                                <strong style={{ fontSize: 13, color: tpcRejected ? '#b91c1c' : '#1e293b', display: 'block' }}>
                                                    {tpcRejected ? 'Rejected — click to re-upload' : tpcDone ? 'Offer letter uploaded (click to replace)' : 'Upload Offer Letter'}
                                                </strong>
                                                <span style={{ fontSize: 11, color: '#64748b' }}>PDF, JPG, PNG · max 10 MB</span>
                                            </div>
                                        </label>
                                    );
                                })()}
                            </div>
                        )}

                        {intakeError && <div className="alert alert-danger" style={{ whiteSpace: 'pre-line', fontSize: 13 }}><strong>Action Required:</strong>{'\n• '}{intakeError}</div>}

                        <div style={{ textAlign: 'right' }}>
                            <button onClick={proceed} className="btn btn-success" disabled={busy === 'submit'} style={{ padding: '12px 24px', fontSize: 14, fontWeight: 700 }}>
                                {busy === 'submit' ? 'Submitting…' : 'Save & Proceed to Clearance Matrix'}
                            </button>
                        </div>
                    </div>
                )}

                {/* ── PAGE 2: Core Tri-Gate verification ── */}
                {activeTab === 'page2' && (
                    <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, padding: 24 }}>
                        <div style={{ background: '#f4f7fb', border: '1px solid #c9d6e6', borderRadius: 6, padding: '14px 18px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ margin: 0, color: '#1b365d', fontSize: 16 }}>
                                    {triGate.some((c) => sec(c)?.status === 'REJECTED') ? 'Action Required' : 'Verification In Progress'}
                                </h3>
                                <p style={{ margin: '4px 0 0', color: '#475569', fontSize: 13 }}>
                                    {triGate.some((c) => sec(c)?.status === 'REJECTED')
                                        ? 'One or more sections were rejected. Re-upload and re-confirm, then re-submit.'
                                        : 'Please wait while officers verify your tri-gate submissions.'}
                                </p>
                            </div>
                            <span style={{
                                background: triGate.some((c) => sec(c)?.status === 'REJECTED') ? '#b91c1c' : triGateApproved ? '#15803d' : '#1b365d',
                                color: '#fff', padding: '6px 14px', borderRadius: 20, fontWeight: 700, fontSize: 12,
                            }}>
                                {triGate.some((c) => sec(c)?.status === 'REJECTED') ? 'Needs Attention' : triGateApproved ? 'Tri-Gate Cleared' : 'Verification Pending'}
                            </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {has('LIBRARY') && <VerifyCard code="LIBRARY" icon="LI" title="Librarian Verification" subtitle="Checking OCR data against physical records" detail={<>Form No: <code>{formNo}</code> · Title: <em>{title}</em> · Plagiarism: <strong style={{ color: '#b91c1c' }}>{plagiarism}</strong></>} />}
                            {has('TPC') && <VerifyCard code="TPC" icon="TP" title="TPC Check" subtitle="Reviewing your offer letter" detail={<>Offer Letter: <em>{sec('TPC')?.documents[0]?.original_name || 'uploaded'}</em></>} />}
                            {has('WARDEN') && <VerifyCard code="WARDEN" icon="WA" title="Warden Desk" subtitle="Verifying vacant room details" detail={<>Block <strong>{request.student.hostel}</strong> · Vacant Room: <strong style={{ color: '#1b365d' }}>{request.vacant_room_no || '—'}</strong></>} />}
                        </div>
                        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>When the tri-gate is cleared, Page 3 unlocks automatically.</p>
                            <button onClick={() => triGateApproved && setActiveTab('page3')} disabled={!triGateApproved} className={triGateApproved ? 'btn btn-success' : 'btn btn-secondary'} style={{ padding: '10px 20px', fontSize: 13, fontWeight: 700 }}>
                                {triGateApproved ? 'Proceed to Dept & Field' : 'Page 3 Locked'}
                            </button>
                        </div>
                    </div>
                )}

                {/* ── PAGE 3: Departmental & Field Clearance ── */}
                {activeTab === 'page3' && !openStageSection && (
                    <div>
                        <p style={{ fontSize: 13, color: '#64748b', marginTop: 0 }}>
                            Your request has been sent to all of these offices together. Each verifies you from your name &amp; roll number. Click a section to see where it stands or to message the office.
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
                            {deptField.map((code) => {
                                const s = sec(code)!;
                                const labView = code === 'HOD' && labsOn;
                                const meta = labView
                                    ? { icon: 'HD', subtitle: `Labs (${labs.approved}/${labs.total} approved) → HOD approval` }
                                    : SECTION_META[code] || { icon: code.slice(0, 2), subtitle: '' };
                                const ok = s.status === 'APPROVED';
                                const rej = s.status === 'REJECTED' || (labView && !ok && labRejected);
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
                                                <div className="section-mark">{meta.icon}</div>
                                                <div>
                                                    <h4 style={{ margin: 0, fontSize: 14, color: '#1e293b' }}>{s.name}</h4>
                                                    <span style={{ fontSize: 11, color: '#64748b' }}>{needsUpload ? 'Upload required' : meta.subtitle}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            {(() => {
                                                if (labView && s.status === 'PENDING') {
                                                    const [label, color] = !labs.started ? ['NOT SENT', '#b45309']
                                                        : labRejected ? ['LAB REJECTED', '#b91c1c']
                                                            : !labs.cleared ? [`LABS ${labs.approved}/${labs.total}`, '#b45309']
                                                                : ['WITH HOD', '#b45309'];
                                                    return <span style={{ fontSize: 11, color, fontWeight: 700 }}>{label}</span>;
                                                }
                                                const label = ok ? 'APPROVED' : rej ? 'REJECTED' : (!s.actionable ? 'WAITING' : 'IN PROGRESS');
                                                const color = ok ? '#15803d' : rej ? '#b91c1c' : (!s.actionable ? '#94a3b8' : '#b45309');
                                                return <span style={{ fontSize: 11, color, fontWeight: 700 }}>{label}</span>;
                                            })()}
                                            <span style={{ fontSize: 11, color: '#1b365d', fontWeight: 600 }}>Open ▸</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>All departmental sections must be approved to proceed to Accounts and Administration.</p>
                            <button onClick={() => financeUnlock && setActiveTab('page4')} disabled={!financeUnlock} className={financeUnlock ? 'btn btn-success' : 'btn btn-secondary'} style={{ padding: '10px 20px', fontSize: 13, fontWeight: 700 }}>
                                {financeUnlock ? 'Proceed to Financial & Administration' : 'Page 4 Locked'}
                            </button>
                        </div>
                    </div>
                )}

                {/* ── PAGE 3 detail view (opened by clicking a section) ── */}
                {activeTab === 'page3' && openStageSection && (() => {
                    const s = sec(openStageSection)!;
                    const meta = SECTION_META[openStageSection] || { icon: openStageSection.slice(0, 2), subtitle: '' };
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
                            ) : openStageSection === 'HOD' && labsOn ? (
                                <LabChainDetail
                                    chain={labs} hod={s}
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

                {/* ── PAGE 4: Accounts and Administration side by side — they work in parallel ── */}
                {activeTab === 'page4' && (
                    <div>
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#475569' }}>
                            <strong>Accounts</strong> and <strong>Administration</strong> work on your request at the same time. Finish both.
                            Your certificate (Page 5) unlocks once both have approved and Accounts has sent your refund.
                        </div>
                        <div className="row">
                            <div className="col-sm-6">
                                {has('ACCOUNTS') && (
                                    <UploadReview
                                        stacked
                                        section={sec('ACCOUNTS')!} icon={SECTION_META.ACCOUNTS.icon}
                                        config={UPLOAD_SECTION_CONFIG.ACCOUNTS}
                                        student={{ name: request.student.name, roll_no: request.student.roll_no, department: request.student.department }}
                                        me={request.student.webmail}
                                        onReload={onReload}
                                    />
                                )}
                                <RefundLedger request={request} onReload={onReload} />
                            </div>
                            <div className="col-sm-6">
                                {has('ADMINISTRATION') && (
                                    <>
                                        <BasicDetail
                                            section={sec('ADMINISTRATION')!}
                                            icon={SECTION_META.ADMINISTRATION.icon}
                                            subtitle={SECTION_META.ADMINISTRATION.subtitle}
                                            student={{ name: request.student.name, roll_no: request.student.roll_no, department: request.student.department }}
                                            me={request.student.webmail}
                                            onReload={onReload}
                                        />
                                        <OfficeChecklist items={sec('ADMINISTRATION')!.checklist ?? []} />
                                    </>
                                )}
                            </div>
                        </div>
                        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                            <button onClick={() => setActiveTab('page5')} className="btn btn-success" style={{ padding: '10px 20px', fontSize: 13, fontWeight: 700 }}>
                                Go to Certificate
                            </button>
                        </div>
                    </div>
                )}

                {/* ── PAGE 5: the No-Dues certificate ── */}
                {activeTab === 'page5' && (
                    <div className="well" style={{ textAlign: 'center', background: cleared ? '#f0fdf4' : '#fff', border: cleared ? '1px solid #86efac' : '1px solid #cbd5e1' }}>
                        {cleared ? (
                            <>
                                <h3 style={{ color: '#15803d', marginTop: 0 }}>Released Successfully!</h3>
                                <p style={{ color: '#475569', fontSize: 13 }}>Your clearance is complete. Download your digital No-Dues certificate below.</p>
                                <button className="btn btn-success" style={{ padding: '12px 24px', fontSize: 14, fontWeight: 700 }} onClick={downloadCertificate}>
                                    Download Complete Digital No-Dues Certificate
                                </button>
                            </>
                        ) : (
                            <>
                                <h3 style={{ color: '#1b365d', marginTop: 0 }}>Your No-Dues Certificate</h3>
                                <p style={{ color: '#64748b', fontSize: 13 }}>
                                    It is released here once every section has approved and Accounts has sent your refund.
                                </p>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                    <Spinner />
                                    <span style={{ color: '#475569', fontSize: 13 }}>
                                        {refund.status === 'pending'
                                            ? `Every section has approved. Waiting for Accounts to send your refund of ${rupees(refund.amount)}${refund.account ? ` to ${refund.account}` : ''}.`
                                            : `Still waiting for: ${request.sections.filter((s) => s.status !== 'APPROVED').map((s) => s.name).join(', ')}`}
                                    </span>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </Layout>
    );
}

// ── Page 4: the Fund-Us donation and the Refund Ledger ──
// The donation comes out of the caution money, so it lowers the refund. The
// student sets it here until Accounts approves (`donation_locked` says why not).
const CAUTION_MONEY = 10000;   // refunds.CAUTION_MONEY on the server

function RefundLedger({ request, onReload }: { request: ClearanceRequest; onReload: () => void }) {
    const saved = Number(request.fund_us_amount) || 0;
    const refund = request.refund;
    const locked = request.donation_locked;
    const [donate, setDonate] = useState(saved > 0);
    const [amount, setAmount] = useState(String(saved > 0 ? saved : 1000));
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState<{ text: string; err: boolean } | null>(null);
    // Follow the saved value (after a save, or a reload from another tab).
    useEffect(() => {
        setDonate(saved > 0);
        if (saved > 0) setAmount(String(saved));
    }, [saved]);

    const value = donate ? amount.trim() : '0';
    const changed = Number(value) !== saved;
    const save = async () => {
        if (value === '' || !Number.isFinite(Number(value))) {
            setNote({ text: 'Enter the donation in rupees, e.g. 1000.', err: true });
            return;
        }
        setBusy(true); setNote(null);
        try {
            await api.setDonation(value);
            setNote({ text: Number(value) > 0 ? 'Donation saved. Thank you!' : 'Saved: no donation.', err: false });
            onReload();
        } catch (e) { setNote({ text: e instanceof Error ? e.message : 'Could not save the donation', err: true }); }
        finally { setBusy(false); }
    };

    const dues = 0;
    const net = Math.max(CAUTION_MONEY - dues - saved, 0);
    const Row = ({ k, v, bold }: { k: string; v: string; bold?: boolean }) => (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', fontWeight: bold ? 700 : 400, borderTop: bold ? '1px solid #cbd5e1' : 'none' }}>
            <span>{k}</span><span>{v}</span>
        </div>
    );
    const paid = refund.status === 'sent' || refund.status === 'not_due';

    return (
        <div className="well" style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8 }}>
            <h4 style={{ marginTop: 0, color: '#1b365d' }}>Refund Ledger</h4>

            {/* Fund-Us donation: editable until Accounts approves */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '10px 12px', marginBottom: 12 }}>
                {locked ? (
                    <div style={{ fontSize: 13 }}>
                        Students' Welfare Fund (Fund-Us) donation: <strong>₹{saved.toLocaleString('en-IN')}</strong>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{locked}</div>
                    </div>
                ) : (
                    <>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                            <input type="checkbox" checked={donate} disabled={busy} onChange={(e) => { setDonate(e.target.checked); setNote(null); }} />
                            Donate to Students' Welfare Fund (Fund-Us)
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                            {donate && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13 }}>₹
                                    <input className="erp-input" type="number" min={0} max={CAUTION_MONEY} step={1} value={amount} disabled={busy}
                                        aria-label="Donation amount in rupees"
                                        onChange={(e) => { setAmount(e.target.value); setNote(null); }} style={{ ...ocrInput, width: 110 }} />
                                </span>
                            )}
                            <button className="btn btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} disabled={busy || !changed} onClick={save}>
                                {busy ? 'Saving…' : 'Save donation'}
                            </button>
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
                            Optional. It comes out of your ₹{CAUTION_MONEY.toLocaleString('en-IN')} caution money, so it lowers your refund. You can change it until Accounts approves.
                        </div>
                    </>
                )}
                {note && <div style={{ fontSize: 12, marginTop: 6, color: note.err ? '#b91c1c' : '#15803d' }}>{note.text}</div>}
            </div>

            <Row k="Caution Money (refundable)" v={`₹${CAUTION_MONEY.toLocaleString('en-IN')}`} />
            <Row k="Total Dues" v={`₹${dues}`} />
            <Row k="Voluntary Donation (Fund-Us)" v={`₹${saved.toLocaleString('en-IN')}`} />
            <Row k="Net Refund" v={`₹${net.toLocaleString('en-IN')}`} bold />
            <div style={{
                marginTop: 10, padding: '8px 10px', borderRadius: 6, fontSize: 12,
                background: paid ? '#f0fdf4' : '#f8fafc', color: paid ? '#166534' : '#475569',
            }}>
                {refund.status === 'sent' ? <><strong>Paid {rupees(refund.amount)}</strong> by {refund.mode}
                    {refund.paid_on ? ` on ${new Date(refund.paid_on).toLocaleDateString()}` : ''} · UTR {refund.reference}</>
                    : refund.status === 'not_due' ? <>No refund was due.</>
                        : refund.status === 'pending' ? <>Every section has approved: Accounts is sending your refund
                            {refund.account ? ` to your account ${refund.account}` : ''}.</>
                            : <>Your refund is sent to the bank account on your cancelled cheque once every section has approved.</>}
            </div>
        </div>
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
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 11, fontWeight: 700, color: '#1b365d', display: 'flex', alignItems: 'center', gap: 4 }}
            >
                Messages{comments.length ? ` (${comments.length})` : ''} <span style={{ fontSize: 9 }}>{open ? '▲' : '▼'}</span>
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
                                        background: c.is_system ? '#f8fafc' : mine ? '#eef2f8' : '#ffffff',
                                        border: `1px solid ${c.is_system ? '#e2e8f0' : mine ? '#c9d6e6' : '#d7dee8'}`,
                                        color: c.is_system ? '#64748b' : mine ? '#1b365d' : '#334155',
                                        fontStyle: c.is_system ? 'italic' : 'normal',
                                    }}>
                                        {c.body}
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
function UploadReview({ section, icon, config, student, me, onReload, stacked = false }: {
    section: SectionInfo;
    icon: string;
    config: { formUrl?: string; formLabel?: string; allowLink?: boolean; fields: { key: string; label: string }[] };
    student: { name: string; roll_no: string; department: string };
    me: string;
    onReload: () => void;
    stacked?: boolean;   // upload above the review (a half-width column) instead of beside it
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
        try { await api.confirmReview(section.code, fields); setConfirmed(true); setNoteErr(false); setNote('Confirmed and sent to the office.'); onReload(); }
        catch (e) { setNoteErr(true); setNote(e instanceof Error ? e.message : 'Could not confirm'); }
        finally { setBusy(''); }
    };

    return (
        <div className="well" style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="section-mark">{icon}</div>
                    <h3 style={{ margin: 0, color: '#1b365d', fontSize: 16 }}>{section.name}</h3>
                    {approvedOk && <span style={{ background: '#dcfce7', color: '#15803d', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>APPROVED</span>}
                    {rejected && <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>REJECTED</span>}
                </div>
                {config.formUrl && (
                    <a href={config.formUrl} download target="_blank" rel="noreferrer" style={{ color: '#1b365d', fontWeight: 600, fontSize: 13, textDecoration: 'underline' }}>
                        Download {config.formLabel || 'Form'}
                    </a>
                )}
            </div>

            {rejected && reason && <div style={{ marginBottom: 12, fontSize: 12, color: '#b91c1c' }}><strong>Officer's reason:</strong> {reason.body}</div>}
            {note && (noteErr
                ? <div className="alert alert-danger" style={{ marginBottom: 12, fontSize: 13 }}>{note}</div>
                : <div style={{ marginBottom: 12, fontSize: 12, color: '#15803d' }}>{note}</div>)}

            <div className="row" style={stacked ? { rowGap: 12 } : undefined}>
                <div className={stacked ? 'col-sm-12' : 'col-sm-6'}>
                    <label style={{ ...dropzone, ...(stacked ? { minHeight: 120, padding: 16 } : {}), cursor: locked ? 'default' : 'pointer', border: rejected ? '2px dashed #f87171' : locked ? '2px solid #bbf7d0' : '2px dashed #cbd5e1', background: rejected ? '#fef2f2' : locked ? '#f0fdf4' : '#f8fafc' }}>
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} disabled={locked}
                            onChange={(e) => doUpload(e.target.files && e.target.files[0] ? e.target.files[0] : null)} />
                        <div style={{ marginBottom: 8, color: rejected ? '#b42318' : uploaded ? '#157347' : '#64748b' }}><Icon name={rejected ? 'alert' : uploaded ? 'check' : 'upload'} size={30} /></div>
                        <strong style={{ fontSize: 14, color: rejected ? '#b91c1c' : approvedOk ? '#15803d' : '#1e293b' }}>
                            {rejected ? 'Rejected — click to re-upload' : approvedOk ? 'Approved' : locked ? 'Uploaded' : uploaded ? 'Uploaded (click to replace)' : 'Upload Document'}
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
                <div className={stacked ? 'col-sm-12' : 'col-sm-6'}>
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <strong style={{ fontSize: 13, color: '#334155' }}>Review <span style={{ color: '#64748b', fontWeight: 'normal' }}>(auto-filled)</span></strong>
                            <span style={{
                                background: processing ? '#fef3c7' : approvedOk ? '#dcfce7' : confirmed ? '#dcfce7' : uploaded ? '#eef2f8' : '#f1f5f9',
                                color: processing ? '#b45309' : approvedOk ? '#15803d' : confirmed ? '#15803d' : uploaded ? '#1b365d' : '#64748b',
                                padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6,
                            }}>
                                {processing && <Spinner />}
                                {processing ? 'Scanning…' : approvedOk ? 'Approved' : confirmed ? 'Confirmed' : uploaded ? 'Review & Confirm' : 'Awaiting upload'}
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
                            {approvedOk ? 'Approved' : confirmed ? 'Confirmed' : busy === 'confirm' ? 'Confirming…' : 'Confirm & Send'}
                        </button>
                    </div>
                </div>
            </div>

            <CommentThread comments={section.comments} me={me} busy={false} onSend={(t) => api.studentComment(section.code, t).then(onReload)} />
        </div>
    );
}

// ── HOD card for a department with labs: the lab chain, level by level, then HOD ──
// Replaces the paper "No Dues Form for Department Purpose": the student sends the
// request to one level of labs at a time; labs on a level get it together, and the
// next level can be sent only once every lab on the current one has approved.
function LabChainDetail({ chain, hod, student, me, onReload }: {
    chain: LabChain;
    hod: SectionInfo;
    student: { name: string; roll_no: string; department: string };
    me: string;
    onReload: () => void;
}) {
    const [busy, setBusy] = useState<string | null>(null);
    const [note, setNote] = useState('');
    const [noteErr, setNoteErr] = useState(false);

    const run = async (key: string, action: () => Promise<string | void>) => {
        setBusy(key); setNote('');
        try {
            const done = await action();
            setNoteErr(false); setNote(done || '');
            onReload();
        } catch (e) { setNoteErr(true); setNote(e instanceof Error ? e.message : 'Something went wrong'); }
        finally { setBusy(null); }
    };

    const sendNext = () => run('send', async () => {
        const res = await api.sendToLabs();
        return `Request sent to ${res.sent_to.join(', ')}.`;
    });
    const resend = (labId: number, name: string) => run('resend-' + labId, async () => {
        await api.resendToLab(labId);
        return `Request re-sent to ${name}.`;
    });
    const comment = (labId: number, text: string) => run('c-' + labId, async () => {
        await api.labCommentFromStudent(labId, text.trim());
    });

    const next = chain.levels.find((lv) => lv.level === chain.next_level);
    const hodStatus = hod.status === 'APPROVED' ? 'APPROVED' : hod.status === 'REJECTED' ? 'REJECTED'
        : chain.cleared ? 'WITH HOD' : 'AFTER ALL LABS APPROVE';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="well" style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, margin: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="section-mark">HD</div>
                        <div>
                            <h3 style={{ margin: 0, color: '#1b365d', fontSize: 16 }}>{hod.name} — {student.department} Labs</h3>
                            <span style={{ fontSize: 12, color: '#64748b' }}>Your department's labs clear you first; HOD gives the final approval.</span>
                        </div>
                    </div>
                    <span style={{
                        padding: '4px 12px', borderRadius: 20, fontWeight: 700, fontSize: 12,
                        background: chain.cleared ? '#dcfce7' : '#f4f7fb', color: chain.cleared ? '#15803d' : '#1b365d',
                    }}>{chain.approved}/{chain.total} labs approved</span>
                </div>
                <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px' }}>
                    Labs on the same level get your request together. Once every lab on a level approves, send the request to the next level.
                </p>

                {note && (noteErr
                    ? <div className="alert alert-danger" style={{ fontSize: 13 }}>{note}</div>
                    : <div style={{ fontSize: 12, color: '#15803d', marginBottom: 10 }}>{note}</div>)}

                {next && (chain.can_send ? (
                    <button className="btn btn-success" style={{ marginBottom: 12, fontSize: 13, fontWeight: 700, whiteSpace: 'normal', textAlign: 'left' }}
                        disabled={busy === 'send'} onClick={sendNext}>
                        {busy === 'send' ? 'Sending…' : `Send request to Level ${next.level}: ${next.labs.map((e) => e.name).join(', ')}`}
                    </button>
                ) : chain.started && (
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
                        Level {next.level} can be sent once every lab on the earlier level has approved.
                    </div>
                ))}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {chain.levels.map((lv) => (
                        <div key={lv.level}>
                            <div style={{
                                background: lv.approved ? '#f0fdf4' : '#f4f7fb', borderRadius: 8, padding: 10,
                                border: `1px solid ${lv.approved ? '#bbf7d0' : '#c9d6e6'}`,
                            }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#1b365d', marginBottom: 8 }}>
                                    Level {lv.level}{lv.labs.length > 1 ? ' · these labs get it together' : ''}{!lv.sent ? ' · not sent yet' : ''}
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                    {lv.labs.map((e) => {
                                        const b = labBadge(e);
                                        return (
                                            <div key={e.lab_id} style={{
                                                background: '#fff', borderRadius: 8, padding: 10, flex: '1 1 240px',
                                                border: `1px solid ${e.status === 'REJECTED' ? '#fca5a5' : '#e2e8f0'}`,
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                                                    <div>
                                                        <strong style={{ fontSize: 13, color: '#1e293b' }}>{e.name}</strong>
                                                        {e.incharge_name && <div style={{ fontSize: 11, color: '#64748b' }}>{e.incharge_name}</div>}
                                                    </div>
                                                    <span style={{ fontSize: 11, fontWeight: 700, color: b.color, background: b.bg, padding: '2px 8px', borderRadius: 12, whiteSpace: 'nowrap' }}>{b.label}</span>
                                                </div>
                                                {e.status === 'APPROVED' && e.decided_at && (
                                                    <div style={{ fontSize: 11, color: '#15803d', marginTop: 4 }}>No dues — cleared on {new Date(e.decided_at).toLocaleDateString()}</div>
                                                )}
                                                {e.sent && e.status === 'PENDING' && !e.actionable && (
                                                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Waiting for an earlier lab to approve again.</div>
                                                )}
                                                {e.status === 'REJECTED' && (
                                                    <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 6 }}>
                                                        <strong>Lab's reason:</strong> {e.reason || '—'}
                                                        <div style={{ marginTop: 6 }}>
                                                            <button className="btn btn-primary" style={{ fontSize: 11, padding: '3px 10px' }}
                                                                disabled={busy === 'resend-' + e.lab_id} onClick={() => resend(e.lab_id, e.name)}>
                                                                {busy === 'resend-' + e.lab_id ? 'Re-sending…' : `Re-send to ${e.name}`}
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                                {e.sent && (
                                                    <CommentThread comments={e.comments || []} me={me} busy={busy === 'c-' + e.lab_id}
                                                        onSend={(t) => comment(e.lab_id, t)} />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            <div style={{ textAlign: 'center', fontSize: 11, color: '#64748b', padding: '2px 0' }}>↓</div>
                        </div>
                    ))}
                    <div style={{
                        background: hod.status === 'APPROVED' ? '#f0fdf4' : '#f4f7fb', border: '1px solid #c9d6e6', borderRadius: 8,
                        padding: 10, fontSize: 13, color: '#1b365d', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                        <strong>HOD — final departmental approval</strong>
                        <span style={{ fontSize: 11, fontWeight: 700 }}>{hodStatus}</span>
                    </div>
                </div>
            </div>

            {/* HOD's own status, thread, and re-send (if HOD rejects) — once it's HOD's turn. */}
            {(chain.cleared || hod.status !== 'PENDING') && (
                <BasicDetail section={hod} icon="HD" subtitle="Final departmental approval" student={student} me={me} onReload={onReload} />
            )}
        </div>
    );
}

// ── Basic detail for non-upload sections (Store, LUCS, Sports, Medical, NAD, HOD,
// Administration) ──
// The request reaches each of these offices by itself (no "Confirm & Send"). After
// a rejection the student sends it back: HOD with its editable name/roll/dept form,
// the others with a plain Re-send button.
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

    const isHod = section.code === 'HOD';

    const resend = async () => {
        setBusy(true); setNote('');
        try {
            await api.resendSection(section.code,
                isHod ? { name: name.trim(), roll_no: roll.trim(), department: dept.trim() } : undefined);
            setNote('Request sent back to the office.');
            onReload();
        } catch (e) { setNote(e instanceof Error ? e.message : 'Could not re-send'); }
        finally { setBusy(false); }
    };

    // HOD keeps its editable form for a re-send after a rejection.
    const showForm = isHod && rejected;
    const fieldStyle: React.CSSProperties = { padding: '6px 10px', fontSize: 13 };

    return (
        <div className="well" style={{ background: '#fff', border: `1px solid ${rejected ? '#fca5a5' : ok ? '#bbf7d0' : '#cbd5e1'}`, borderRadius: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="section-mark">{icon}</div>
                    <div><h3 style={{ margin: 0, color: '#1b365d', fontSize: 16 }}>{section.name}</h3>
                        <span style={{ fontSize: 12, color: '#64748b' }}>{subtitle}</span></div>
                </div>
                <span style={{
                    padding: '4px 12px', borderRadius: 20, fontWeight: 700, fontSize: 12,
                    background: ok ? '#dcfce7' : rejected ? '#fee2e2' : '#f1f5f9',
                    color: ok ? '#15803d' : rejected ? '#b91c1c' : '#64748b',
                }}>{ok ? 'APPROVED' : rejected ? 'REJECTED' : waiting ? 'WAITING' : 'IN PROGRESS'}</span>
            </div>

            {note && <div style={{ fontSize: 12, color: '#475569', marginBottom: 10 }}>{note}</div>}

            {showForm ? (
                <>
                    {rejected && reason && (
                        <div style={{ fontSize: 12, color: '#b91c1c', marginBottom: 8 }}><strong>Officer's reason:</strong> {reason.body}</div>
                    )}
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
                        Update your details and click <strong>Confirm &amp; Re-send</strong> to send the request back to this office.
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                        <div><label style={ocrLabel}>Name</label><input className="erp-input" value={name} onChange={(e) => setName(e.target.value)} style={fieldStyle} /></div>
                        <div><label style={ocrLabel}>Roll No</label><input className="erp-input" value={roll} onChange={(e) => setRoll(e.target.value)} style={fieldStyle} /></div>
                        <div><label style={ocrLabel}>Department</label><input className="erp-input" value={dept} onChange={(e) => setDept(e.target.value)} style={fieldStyle} /></div>
                    </div>
                    <button className="btn btn-success" style={{ marginTop: 12, fontSize: 13 }} disabled={busy} onClick={resend}>
                        {busy ? 'Sending…' : 'Confirm & Re-send Request'}
                    </button>
                </>
            ) : (
                <div style={{ fontSize: 13, color: '#334155' }}>
                    {/* Only while the office is still deciding: once approved there's nothing left to explain. */}
                    {!ok && !rejected && !waiting && (
                        <div style={{ background: '#f4f7fb', border: '1px solid #c9d6e6', borderRadius: 6, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: '#1b365d' }}>
                            Request sent to this office. They verify from the details below and approve/reject.
                        </div>
                    )}
                    {rejected && (
                        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: '#7f1d1d' }}>
                            {reason && <div style={{ marginBottom: 6 }}><strong>Officer's reason:</strong> {reason.body}</div>}
                            Sort this out with the office, then send your request back to them.
                            <div>
                                <button className="btn btn-success" style={{ marginTop: 8, fontSize: 13 }} disabled={busy} onClick={resend}>
                                    {busy ? 'Sending…' : 'Re-send Request'}
                                </button>
                            </div>
                        </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, background: '#f8fafc', padding: 12, borderRadius: 6 }}>
                        <div><strong>Name:</strong> {savedReview.name || student.name}</div>
                        <div><strong>Roll No:</strong> {savedReview.roll_no || student.roll_no}</div>
                        <div><strong>Department:</strong> {savedReview.department || student.department}</div>
                    </div>
                </div>
            )}

            {waiting && <div className="text-muted" style={{ fontSize: 12, marginTop: 10 }}>
                {section.waiting_for?.length ? `Waiting for ${joinNames(section.waiting_for)} to approve first.`
                    : 'Waiting on prerequisite sections to be approved first.'}
            </div>}
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
