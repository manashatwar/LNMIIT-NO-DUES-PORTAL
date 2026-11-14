import { useState, Fragment } from 'react';
import { Layout } from '../components/Layout';
import { LabChainView } from '../components/LabChain';
import { LabManager } from '../components/LabManager';
import { RefundCells } from '../components/RefundCell';
import { StaffManager } from '../components/StaffManager';
import { QueueRow, RoleType, SectionReview, StaffMember, StageInfo } from '../types';
import { api, deskFor } from '../api';

interface SectionApprovalPageProps {
    role: RoleType;
    officerName: string;
    heading: string;
    rows: QueueRow[];
    onReload: () => void | Promise<void>;
    onLogout: () => void;
    onRules: () => void;
    onContact: () => void;
    // Section head with staff (library@ / lucs@ / nad@ / accounts@): manage staff;
    // 'manual' = send requests by hand, 'levels' = they move up staff levels (Accounts).
    canManageStaff?: boolean;
    staffMode?: 'manual' | 'levels';
    staff?: StaffMember[];
    readyToAssign?: number;
    canRecordRefunds?: boolean;    // Accounts: this person sends refunds (the main account, or a staff refund manager)
    refundsPending?: number;       // ... how many are ready to send
    refundModes?: string[];        // ... and how they can be paid
}

type Tab = 'incoming' | 'labs' | 'approved' | 'rejected' | 'manage' | 'staff';

// A staff level of the Accounts chain (the main account is the final step after them).
const stepLabel = (lv: number) => `Level ${lv}`;

// Why a request isn't at the section's levels yet (Accounts / Administration).
const notReadyWhy = (s: StageInfo, role: RoleType) => (s.blocked_by.length
    ? `Waiting for ${s.blocked_by.join(', ')}`
    : role === 'ACCOUNTS' ? "Student hasn't confirmed cheque details" : "Student hasn't confirmed their details");

// The login page's "User Type" label, for telling a head what their staff pick.
const LOGIN_LABEL: Partial<Record<RoleType, string>> = {
    LIBRARY: 'Library', LUCS: 'LUCS', NAD: 'NAD Cell', ACCOUNTS: 'Accounts', ADMINISTRATION: 'Administration',
};

/**
 * Officer desk: scoped queue of requests for this section, split into
 * Incoming / Approved / Rejected tabs so cleared and reopened requests don't
 * clutter the actionable queue. Approve is disabled until prerequisites are
 * met (backend also enforces it). Reject requires a written reason, entered
 * inline (not a browser prompt) — the same comment mechanism Feedback uses,
 * since both are "leave a note for the student," just with or without a
 * status change. Expand a row (View) to see documents + OCR.
 *
 * The same desk serves department lab in-charges (role LAB, via the /api/lab/
 * endpoints). HODs get two extra tabs: "In labs" (students still clearing the
 * department's labs — not yet theirs to approve) and "Manage labs".
 *
 * A section head with staff (library@, lucs@, nad@) also sends requests to staff — the
 * next N in one go, or per row — and gets a "Manage staff" tab. Staff see this
 * same desk, but only the requests sent to them (the backend filters it).
 */
export function SectionApprovalPage({
    role, officerName, heading, rows, onReload, onLogout, onRules, onContact,
    canManageStaff = false, staffMode = 'manual', staff = [], readyToAssign = 0,
    canRecordRefunds = false, refundsPending = 0, refundModes = ['NEFT'],
}: SectionApprovalPageProps) {
    const sendsByHand = canManageStaff && staffMode === 'manual';   // Library / LUCS / NAD head
    const levelsHead = canManageStaff && staffMode === 'levels';    // Accounts head: the final step after the levels
    // The staff levels the head has configured (for the "Show" filter).
    const staffLevels = Array.from(new Set(staff.map((s) => s.level).filter((lv): lv is number => lv !== null)))
        .sort((a, b) => a - b);
    const stageCol = rows.some((r) => !!r.stage);                    // Accounts: head and staff
    const desk = deskFor(role);
    const isHod = role === 'HOD';
    const isLab = role === 'LAB';
    const [tabPick, setTab] = useState<Tab>('incoming');
    const [bulkCount, setBulkCount] = useState(35);
    const [bulkTo, setBulkTo] = useState('');
    const [who, setWho] = useState('all');   // head's Incoming filter: all | me | <staff id>
    const [stageFilterPick, setStageFilter] = useState('all');   // Accounts head: all | mine | L<n> | waiting
    // Fall back to "Everything" if the picked level left the chain (nobody on it any more).
    const stageFilter = stageFilterPick === 'all' || stageFilterPick === 'waiting' || stageFilterPick === 'mine'
        || staffLevels.some((lv) => `L${lv}` === stageFilterPick) ? stageFilterPick : 'all';
    const [busy, setBusy] = useState<number | null>(null);
    const [ticking, setTicking] = useState<Record<string, boolean>>({});   // checklist ticks being saved
    const [msg, setMsg] = useState('');
    const [expanded, setExpanded] = useState<number | null>(null);
    const [review, setReview] = useState<SectionReview | null>(null);
    const [feedbackDraft, setFeedbackDraft] = useState('');
    const [msgOpen, setMsgOpen] = useState(false);
    const [rejectingId, setRejectingId] = useState<number | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [refreshing, setRefreshing] = useState(false);

    const doRefresh = async () => {
        setRefreshing(true);
        try { await onReload(); } finally { setRefreshing(false); }
    };

    // HOD: a request is only HOD's to decide once every department lab approved.
    const inLabs = (r: QueueRow) => isHod && r.status === 'PENDING' && !!r.labs && !r.labs.cleared;
    const inTab = (r: QueueRow, t: Tab) =>
        t === 'incoming' ? r.status === 'PENDING' && !inLabs(r)
            : t === 'labs' ? inLabs(r)
                : t === 'approved' ? r.status === 'APPROVED'
                    : t === 'rejected' ? r.status === 'REJECTED' : false;
    const tabs: Tab[] = isHod ? ['incoming', 'labs', 'approved', 'rejected', 'manage']
        : canManageStaff ? ['incoming', 'approved', 'rejected', 'staff']
            : ['incoming', 'approved', 'rejected'];
    const tab: Tab = tabs.includes(tabPick) ? tabPick : 'incoming';   // a tab no longer offered falls back to Incoming
    // Accounts: whoever sends refunds does so from Approved, in a Refund column.
    const refundCol = canRecordRefunds && tab === 'approved';
    const shownTo = (r: QueueRow) => {
        if (tab !== 'incoming') return true;
        if (sendsByHand && who !== 'all') return who === 'me' ? !r.assigned_to : String(r.assigned_to?.id) === who;
        if (levelsHead && stageFilter !== 'all') {
            const current = r.stage?.current ?? null;
            if (stageFilter === 'waiting') return !!r.stage && !r.stage.ready;
            if (stageFilter === 'mine') return !!r.stage?.final;          // waiting for its final approval
            return current !== null && `L${current}` === stageFilter;   // a staff level
        }
        return true;
    };
    const filteredRows = rows.filter((r) => inTab(r, tab) && shownTo(r));
    const extraCol = isHod || isLab;   // HOD: lab progress · lab: its level
    const checklistCol = rows.some((r) => !!r.checklist && r.checklist.length > 0);   // Administration
    // Roll, Name, Dept, Hostel, Status (or Refund), Action + the optional columns.
    // The refund view drops Stage and Status: only the refund matters there.
    const colCount = 6 + (extraCol ? 1 : 0) + (sendsByHand ? 1 : 0) + (stageCol && !refundCol ? 1 : 0) + (checklistCol ? 1 : 0);

    // Accounts: where a request is in the staff levels.
    const stageCell = (r: QueueRow) => {
        const s = r.stage;
        if (!s) return '—';
        const done = s.approved.length;
        if (s.current !== null) {
            return (
                <span>
                    <strong>Level {s.current}</strong> of {s.levels.length}
                    {done > 0 && <span style={{ color: '#15803d' }}> · {done} ✓</span>}
                    <div style={{ fontSize: 10, color: '#64748b' }}>{s.waiting_on.join(' / ')}</div>
                </span>
            );
        }
        if (s.final) {
            // Every level approved: with the main account for the final approval.
            return levelsHead
                ? <strong style={{ color: '#a16207' }}>👑 With you · final approval{done > 0 && <span style={{ color: '#15803d', fontWeight: 'normal' }}> · {done} ✓</span>}</strong>
                : <span style={{ color: '#64748b' }}>All levels ✓ · with the main account for the final approval</span>;
        }
        if (r.status === 'APPROVED') {
            return <span style={{ color: '#15803d' }}>{done ? `All ${done} level${done !== 1 ? 's' : ''} ✓` : 'Approved'}</span>;
        }
        if (r.status === 'REJECTED') {
            return <span style={{ color: '#b91c1c' }}>Rejected{done ? ` after ${stepLabel(s.approved[done - 1].level)}` : ''}</span>;
        }
        if (!s.ready) {
            // Not at Accounts' staff yet — nothing for anyone here to do.
            return (
                <span style={{ color: '#94a3b8' }}>
                    Not ready yet
                    <div style={{ fontSize: 10 }}>{notReadyWhy(s, role)}</div>
                </span>
            );
        }
        return '—';
    };
    // Approve, per row: can it be pressed, and what will it do (hover text)?
    // Accounts head: its own final approval once every level has approved; before
    // that, it approves the level a request is at, standing in for the people on it
    // (at the last level that is also its final approval). Not-ready requests can't
    // be approved. Administration: the office checklist must be ticked first.
    const approveState = (r: QueueRow): { enabled: boolean; title: string } => {
        const base = stepApproveState(r);
        const todo = (r.checklist ?? []).filter((e) => !e.done);
        return base.enabled && todo.length
            ? { enabled: false, title: `Tick the checklist first: ${todo.map((e) => e.label).join(', ')}` }
            : base;
    };
    const stepApproveState = (r: QueueRow): { enabled: boolean; title: string } => {
        const s = r.stage;
        if (!levelsHead || !s) return { enabled: r.actionable, title: r.actionable ? '' : approveBlockedTitle };
        if (s.current !== null) {
            const last = s.current === s.levels[s.levels.length - 1];
            return {
                enabled: true,
                title: `Approve Level ${s.current} for ${s.waiting_on.join(' / ')}: `
                    + (last ? `as the last level, this is also your final approval for ${LOGIN_LABEL[role] ?? heading}`
                        : 'it moves up to the next level'),
            };
        }
        if (s.levels.length === 0) return { enabled: r.actionable, title: r.actionable ? '' : `Not ready yet: ${notReadyWhy(s, role)}` };
        return s.final ? { enabled: true, title: `Every level has approved: your final approval for ${LOGIN_LABEL[role] ?? heading}` }
            : { enabled: false, title: `Not ready yet: ${notReadyWhy(s, role)}` };
    };

    // Administration: tick / untick one checklist item for a request. The box
    // shows the change at once; the saved list replaces it after the reload.
    const tick = async (row: QueueRow, itemId: number, done: boolean) => {
        const key = `${row.request_id}:${itemId}`;
        setTicking((t) => ({ ...t, [key]: done }));
        setBusy(row.request_id); setMsg('');
        try { await api.tickChecklist(row.request_id, itemId, done); await onReload(); }
        catch (e) { setMsg(e instanceof Error ? e.message : 'Could not update the checklist'); }
        finally {
            setTicking((t) => { const next = { ...t }; delete next[key]; return next; });
            setBusy(null);
        }
    };
    const checklistCell = (r: QueueRow) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {(r.checklist ?? []).map((e) => (
                <label key={e.id} style={{ display: 'flex', gap: 5, alignItems: 'flex-start', fontSize: 11, margin: 0, fontWeight: 'normal', cursor: 'pointer' }}
                    title={e.done ? `Ticked by ${e.by ?? 'someone'}${e.at ? ` on ${new Date(e.at).toLocaleDateString()}` : ''}` : 'Tick when the student has done this'}>
                    <input type="checkbox" checked={ticking[`${r.request_id}:${e.id}`] ?? e.done} style={{ marginTop: 1 }}
                        disabled={tab !== 'incoming' || r.status !== 'PENDING' || busy === r.request_id}
                        onChange={() => tick(r, e.id, !e.done)} />
                    <span style={{ color: e.done ? '#15803d' : '#b45309' }}>{e.label}</span>
                </label>
            ))}
        </div>
    );

    // Head: send the next N waiting requests (oldest first) to one staff member.
    const sendBulk = async () => {
        if (!bulkTo) return;
        setBusy(-1); setMsg('');
        try {
            const res = await api.sendToStaff(Number(bulkTo), bulkCount);
            await onReload();   // show the message and the updated list together
            setMsg(res.moved === 0 ? 'No requests are waiting to be sent.'
                : `✓ Sent ${res.moved} request${res.moved !== 1 ? 's' : ''} to ${res.to?.name}`
                + (res.moved < bulkCount ? ` (only ${res.moved} were waiting).` : '.'));
        } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not send'); }
        finally { setBusy(null); }
    };

    // Head: send one request to a staff member, or take it back ('' = you).
    const moveOne = async (row: QueueRow, staffId: string) => {
        setBusy(row.request_id); setMsg('');
        try {
            const res = await api.moveRequests([row.request_id], staffId ? Number(staffId) : null);
            await onReload();
            setMsg(res.to ? `✓ ${row.roll_no} sent to ${res.to.name}` : `✓ ${row.roll_no} is back with you`);
        } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not move'); }
        finally { setBusy(null); }
    };

    const assigneeCell = (r: QueueRow) => {
        if (r.status !== 'PENDING') {
            return <span style={{ color: '#475569' }}>{r.assigned_to ? r.assigned_to.name : 'You'}</span>;
        }
        const listed = staff.some((s) => s.id === r.assigned_to?.id);
        return (
            <>
                <select className="erp-select" style={{ fontSize: 12, padding: '2px 6px', minWidth: 140 }}
                    value={r.assigned_to ? String(r.assigned_to.id) : ''} disabled={busy === r.request_id}
                    onChange={(e) => moveOne(r, e.target.value)} title="Who handles this request">
                    <option value="">You (not sent)</option>
                    {r.assigned_to && !listed && <option value={String(r.assigned_to.id)}>{r.assigned_to.name}</option>}
                    {staff.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                </select>
                {r.ready === false && <div style={{ fontSize: 10, color: '#94a3b8' }}>Page 1 not submitted yet</div>}
            </>
        );
    };

    const labsCell = (r: QueueRow) => {
        if (isLab) return r.level ? `Level ${r.level}` : '—';
        if (!r.labs) return '—';
        if (!r.labs.started) return r.labs.cleared ? 'No labs' : 'Not sent yet';
        return `${r.labs.approved}/${r.labs.total} approved${r.labs.cleared ? ' ✓' : ''}`;
    };

    const sendFeedback = async (requestId: number) => {
        if (!feedbackDraft.trim()) return;
        try {
            await desk.comment(requestId, feedbackDraft.trim());
            setFeedbackDraft('');
            setReview(await desk.review(requestId));
        } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not send message'); }
    };

    const approve = async (row: QueueRow) => {
        setBusy(row.request_id); setMsg('');
        const s = row.stage;
        const at = s && s.current !== null ? s.current : null;   // the level on screen
        const lastLevel = !!s && at !== null && at === s.levels[s.levels.length - 1];
        try {
            const res = await desk.approve(row.request_id, at);
            await onReload();   // show the message and the updated list together
            setMsg(at === null || !s ? `✓ Approved ${row.roll_no}${s?.final ? ': final approval' : ''}`
                : res.status === 'APPROVED' ? `✓ Approved ${row.roll_no} at ${stepLabel(at)}: final approval`
                    : lastLevel ? `✓ Approved ${row.roll_no} at ${stepLabel(at)}: it's now with the main account for the final approval`
                        : `✓ Approved ${row.roll_no} at ${stepLabel(at)}: it moved up to the next level`);
        }
        catch (e) { setMsg(e instanceof Error ? e.message : 'Approve failed'); onReload(); }
        finally { setBusy(null); }
    };

    const startReject = (row: QueueRow) => { setRejectingId(row.request_id); setRejectReason(''); };
    const cancelReject = () => { setRejectingId(null); setRejectReason(''); };

    const submitReject = async (row: QueueRow) => {
        if (!rejectReason.trim()) return;
        setBusy(row.request_id); setMsg('');
        try {
            await desk.reject(row.request_id, rejectReason.trim());
            setMsg(`Rejected ${row.roll_no}`); cancelReject(); onReload();
        } catch (e) { setMsg(e instanceof Error ? e.message : 'Reject failed'); }
        finally { setBusy(null); }
    };

    // Single toggle: opens the detail panel with the chat/messages box already
    // expanded (previously two separate buttons — View and Feedback). Clicking
    // again while open (button now reads "Hide") collapses it.
    const toggleChat = async (row: QueueRow) => {
        if (expanded === row.request_id) { setExpanded(null); setReview(null); setMsgOpen(false); return; }
        setExpanded(row.request_id); setReview(null); setMsgOpen(true);
        try { setReview(await desk.review(row.request_id)); } catch { /* ignore */ }
    };

    const badge = (status: string) => {
        const c = status === 'APPROVED' ? '#16a34a' : status === 'REJECTED' ? '#dc2626' : '#b45309';
        return <span style={{ color: c, fontWeight: 700 }}>{status}</span>;
    };

    const TAB_META: Record<Tab, { label: string; icon: string }> = {
        incoming: { label: 'Incoming', icon: '📥' },
        labs: { label: 'In labs', icon: '🧪' },
        approved: { label: 'Approved', icon: '✅' },
        rejected: { label: 'Rejected', icon: '❌' },
        manage: { label: 'Manage labs', icon: '⚙️' },
        staff: { label: 'Manage staff', icon: '👥' },
    };
    const isPanelTab = tab === 'manage' || tab === 'staff';
    const approveBlockedTitle = isHod ? 'Every department lab must approve first'
        : isLab ? 'A lab on an earlier level has not approved yet' : 'Prerequisites not yet approved';

    return (
        <Layout title={`${heading} | No Dues`} userName={officerName} onLogout={onLogout} onRules={onRules} onContact={onContact}>
            <div className="container">
                <div className="lnmiit-section-title-banner" style={{ borderRadius: 6, marginBottom: 16 }}>
                    <span>OFFICER APPROVAL DESK &nbsp;|&nbsp; {heading.toUpperCase()}</span>
                    <span style={{ fontSize: 12, fontWeight: 'normal' }}>Officer: {officerName}</span>
                </div>

                {msg && <div className="well" style={{ padding: '8px 12px', marginBottom: 16, fontSize: 13 }}>{msg}</div>}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {tabs.map((t) => (
                            <button key={t} onClick={() => setTab(t)}
                                className={tab === t ? 'btn btn-primary' : 'btn btn-secondary'}
                                style={{ fontSize: 13, padding: '6px 14px', fontWeight: tab === t ? 700 : 400 }}>
                                {TAB_META[t].icon} {TAB_META[t].label}{t === 'manage' || t === 'staff' ? '' : ` (${rows.filter((r) => inTab(r, t)).length})`}
                                {t === 'approved' && canRecordRefunds && refundsPending > 0 ? ` · 💸 ${refundsPending} to send` : ''}
                            </button>
                        ))}
                    </div>
                    {/* Another officer approving/rejecting elsewhere (a different tab or
                        account) doesn't push updates here — this queue was only fetched on
                        login. Refresh pulls current prerequisite/actionable status without
                        a full page reload. */}
                    {!isPanelTab && (
                        <button className="btn btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }}
                            disabled={refreshing} onClick={doRefresh}>
                            {refreshing ? '↻ Refreshing…' : '↻ Refresh'}
                        </button>
                    )}
                </div>

                {tab === 'labs' && (
                    <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 10px' }}>
                        These students are still clearing your department's labs. Each moves to <strong>Incoming</strong> once every lab has approved.
                    </p>
                )}

                {levelsHead && tab === 'incoming' && (
                    <div className="well" style={{ padding: '10px 12px', margin: '0 0 12px', background: '#eef4ff', border: '1px solid #bfdbfe', borderRadius: 6, fontSize: 12, color: '#1e3a8a' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                            <div style={{ flex: '1 1 520px' }}>
                                {staff.length === 0 ? (
                                    <>🪜 You have no staff yet, so requests come to you and you approve them yourself. Add staff and their
                                        levels in <strong>Manage staff</strong> to have requests move up a chain by themselves.</>
                                ) : (
                                    <>🪜 Requests reach <strong>Level 1</strong> by themselves and move up: <strong>Level 1 → Level 2 → … → you</strong>.
                                        Either person on a level can approve. After the last level, every request comes to you: <strong>your approval
                                        is final</strong> for {LOGIN_LABEL[role] ?? heading}.</>
                                )}
                                {staff.length > 0 && <> You can also <strong>Approve</strong> a request at any level, standing in for the people on
                                    it: it moves up one step (at the last level, that is also your final approval).{' '}
                                    <em>Not ready yet</em> means it is still waiting for Library, Warden or HOD (or TPC, for a
                                    graduating student){role === 'ACCOUNTS' ? ", or for the student's cheque details" : ''}: each row
                                    says which.</>}
                                {checklistCol && <> 📋 Tick the <strong>Checklist</strong> (e.g. the physical ID card) when the student hands it in:
                                    Approve stays locked until every item is ticked.</>}
                            </div>
                            <span style={{ fontSize: 12, color: '#475569', whiteSpace: 'nowrap' }}>
                                Show:{' '}
                                <select className="erp-select" value={stageFilter}
                                    onChange={(e) => setStageFilter(e.target.value)}
                                    style={{ width: 'auto', padding: '2px 6px', fontSize: 12 }}>
                                    <option value="all">Everything ({rows.filter((r) => inTab(r, 'incoming')).length})</option>
                                    <option value="mine">
                                        With you · final approval ({rows.filter((r) => inTab(r, 'incoming') && !!r.stage?.final).length})
                                    </option>
                                    {staffLevels.map((lv) => (
                                        <option key={lv} value={`L${lv}`}>
                                            At Level {lv} ({rows.filter((r) => inTab(r, 'incoming') && r.stage?.current === lv).length})
                                        </option>
                                    ))}
                                    <option value="waiting">Not ready yet ({rows.filter((r) => inTab(r, 'incoming') && !!r.stage && !r.stage.ready).length})</option>
                                </select>
                            </span>
                        </div>
                    </div>
                )}

                {!levelsHead && checklistCol && tab === 'incoming' && (
                    <p style={{ fontSize: 12, color: '#475569', margin: '0 0 10px' }}>
                        📋 Tick the <strong>Checklist</strong> (e.g. the physical ID card) when the student hands it in: Approve stays locked until every item is ticked.
                    </p>
                )}

                {sendsByHand && tab === 'incoming' && (
                    <div className="well" style={{
                        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 12px',
                        margin: '0 0 12px', background: '#eef4ff', border: '1px solid #bfdbfe', borderRadius: 6,
                    }}>
                        <strong style={{ fontSize: 13, color: '#1b365d' }}>📤 Send the next</strong>
                        <input className="erp-input" type="number" min={1} max={500} value={bulkCount}
                            onChange={(e) => setBulkCount(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
                            style={{ width: 80, padding: '4px 8px', fontSize: 13 }} />
                        <span style={{ fontSize: 13 }}>waiting requests to</span>
                        <select className="erp-select" value={bulkTo} onChange={(e) => setBulkTo(e.target.value)}
                            style={{ width: 'auto', minWidth: 190, padding: '4px 8px', fontSize: 13 }}>
                            <option value="">Choose staff…</option>
                            {staff.map((s) => <option key={s.id} value={String(s.id)}>{s.name} ({s.pending} waiting)</option>)}
                        </select>
                        <button className="btn btn-primary" style={{ fontSize: 13, padding: '5px 14px' }}
                            disabled={!bulkTo || readyToAssign === 0 || busy === -1} onClick={sendBulk}>
                            {busy === -1 ? 'Sending…' : 'Send'}
                        </button>
                        <span style={{ fontSize: 12, color: '#475569' }}>
                            <strong>{readyToAssign}</strong> waiting with you · oldest first · only requests the student has fully submitted
                            {role === 'ADMINISTRATION' ? ' and Library, Warden & HOD (plus TPC, for a graduation) have approved' : ''}
                        </span>
                        {staff.length === 0 && (
                            <span style={{ fontSize: 12, color: '#b45309' }}>Add staff in <strong>Manage staff</strong> first.</span>
                        )}
                        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#475569' }}>
                            Show:{' '}
                            <select className="erp-select" value={who} onChange={(e) => setWho(e.target.value)}
                                style={{ width: 'auto', padding: '2px 6px', fontSize: 12 }}>
                                <option value="all">Everyone</option>
                                <option value="me">With you</option>
                                {staff.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                            </select>
                        </span>
                    </div>
                )}

                {refundCol && (
                    <p style={{ fontSize: 12, color: '#475569', margin: '0 0 10px' }}>
                        💸 You send the refunds. Once every section has approved a student, pay their refund from the bank to the account shown,
                        then enter the bank's <strong>UTR</strong> and click <strong>Mark refund sent</strong>: the student is told and their
                        No-Dues certificate unlocks. <strong>Reject</strong> sends it back to the student with your reason (e.g. wrong bank details).
                    </p>
                )}

                {tab === 'manage' ? <LabManager onChanged={onReload} />
                    : tab === 'staff' ? <StaffManager sectionName={LOGIN_LABEL[role] ?? heading} levels={staffMode === 'levels'} onChanged={onReload} /> : (
                <div className="well" style={{ padding: 0, overflow: 'hidden' }}>
                    <table className="table" style={{ marginBottom: 0 }}>
                        <thead>
                            <tr>
                                <th>Roll No</th><th>Name</th><th>Dept</th><th>Hostel</th>
                                {extraCol && <th>{isLab ? 'Level' : 'Labs'}</th>}
                                {sendsByHand && <th>Handled by</th>}
                                {stageCol && !refundCol && <th>Stage</th>}
                                {checklistCol && <th>Checklist</th>}
                                {refundCol ? <><th>Refund</th><th style={{ width: 230 }}>Action</th></>
                                    : <><th>Status</th><th style={{ width: 280 }}>Action</th></>}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRows.length === 0 && (
                                <tr><td colSpan={colCount} style={{ textAlign: 'center', color: '#94a3b8' }}>No {TAB_META[tab].label.toLowerCase()} requests.</td></tr>
                            )}
                            {filteredRows.map((row) => (
                                <Fragment key={row.request_id}>
                                    <tr>
                                        <td style={{ fontFamily: 'monospace' }}>{row.roll_no}</td>
                                        <td>{row.name}</td>
                                        <td>{row.department}</td>
                                        <td>{row.hostel}</td>
                                        {extraCol && <td style={{ fontSize: 12, color: '#475569' }}>{labsCell(row)}</td>}
                                        {sendsByHand && <td style={{ fontSize: 12 }}>{assigneeCell(row)}</td>}
                                        {stageCol && !refundCol && <td style={{ fontSize: 12 }}>{stageCell(row)}</td>}
                                        {checklistCol && <td>{checklistCell(row)}</td>}
                                        {refundCol ? (
                                            row.refund ? <RefundCells key={`${row.request_id}-${row.refund.state}`} info={row.refund}
                                                modes={refundModes} onDone={onReload} onMessage={setMsg} />
                                                : <><td>—</td><td>—</td></>
                                        ) : <>
                                        <td>{badge(row.status)}</td>
                                        <td>
                                            {rejectingId === row.request_id ? (
                                                <div style={{ display: 'flex', gap: 4 }}>
                                                    <input autoFocus type="text" value={rejectReason}
                                                        onChange={(e) => setRejectReason(e.target.value)}
                                                        onKeyDown={(e) => { if (e.key === 'Enter') submitReject(row); if (e.key === 'Escape') cancelReject(); }}
                                                        placeholder="Reason for rejecting (required)…"
                                                        style={{ flex: 1, fontSize: 12, padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: 4 }} />
                                                    <button className="btn btn-danger" style={{ fontSize: 11, padding: '3px 8px' }}
                                                        disabled={busy === row.request_id || !rejectReason.trim()}
                                                        onClick={() => submitReject(row)}>Confirm</button>
                                                    <button className="btn btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }}
                                                        onClick={cancelReject}>Cancel</button>
                                                </div>
                                            ) : (
                                                <>
                                                    {tab === 'incoming' && (
                                                        <>
                                                            {(() => {
                                                                const a = approveState(row);
                                                                return (
                                                                    <button className="btn btn-success" style={{ fontSize: 12, padding: '3px 8px', marginRight: 4 }}
                                                                        disabled={busy === row.request_id || !a.enabled}
                                                                        title={a.title}
                                                                        onClick={() => approve(row)}>Approve</button>
                                                                );
                                                            })()}
                                                            <button className="btn btn-danger" style={{ fontSize: 12, padding: '3px 8px', marginRight: 4 }}
                                                                disabled={busy === row.request_id}
                                                                onClick={() => startReject(row)}>Reject</button>
                                                        </>
                                                    )}
                                                    <button className="btn btn-warning" style={{ fontSize: 12, padding: '3px 8px' }}
                                                        onClick={() => toggleChat(row)}>{expanded === row.request_id ? 'Hide' : '💬 Chat'}</button>
                                                </>
                                            )}
                                        </td>
                                        </>}
                                    </tr>
                                    {expanded === row.request_id && (
                                        <tr>
                                            <td colSpan={colCount} style={{ background: '#f8fafc' }}>
                                                {!review ? <span className="text-muted">Loading…</span> : (
                                                    <div style={{ fontSize: 12 }}>
                                                        <div><strong>Vacated Room:</strong> {review.vacant_room_no || '—'}</div>

                                                        {review.labs && review.labs.length > 0 && (
                                                            <LabChainView levels={review.labs} highlight={isLab ? review.section.name : undefined} />
                                                        )}

                                                        {(() => {
                                                            const stage = review.stage;
                                                            if (!stage || stage.levels.length === 0) return null;
                                                            return (
                                                                <div style={{ marginTop: 8, border: '1px solid #bfdbfe', borderRadius: 6, padding: 10, background: '#eff6ff' }}>
                                                                    <strong style={{ fontSize: 12, color: '#1b365d' }}>🪜 Approval chain</strong>
                                                                    <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                                                                        {stage.levels.map((lv, i) => {
                                                                            const done = stage.approved.find((a) => a.level === lv);
                                                                            const here = stage.current === lv;
                                                                            return (
                                                                                <Fragment key={lv}>
                                                                                    {i > 0 && <span style={{ color: '#94a3b8' }}>→</span>}
                                                                                    <span style={{
                                                                                        fontSize: 11, padding: '3px 8px', borderRadius: 10, background: '#fff',
                                                                                        border: here ? '2px solid #2563eb' : '1px solid #e2e8f0',
                                                                                        color: done ? '#15803d' : here ? '#1d4ed8' : '#64748b',
                                                                                    }}>
                                                                                        {stepLabel(lv)}{done ? ` ✓ ${done.by ?? ''} · ${new Date(done.at).toLocaleDateString()}` : here ? ` · now with ${stage.waiting_on.join(' / ')}` : ''}
                                                                                    </span>
                                                                                </Fragment>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })()}

                                                        {review.intake && review.intake.length > 0 && (
                                                            <div style={{ marginTop: 8, border: '1px solid #cbd5e1', borderRadius: 6, padding: 10, background: '#eef4ff' }}>
                                                                <strong style={{ fontSize: 12, color: '#1b365d' }}>🎒 Student Intake &amp; Hostel Status (Page 2 — submitted before reaching your queue)</strong>
                                                                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                                    {review.intake.map((sec) => {
                                                                        const c = sec.status === 'APPROVED' ? '#15803d' : sec.status === 'REJECTED' ? '#b91c1c' : '#b45309';
                                                                        return (
                                                                            <div key={sec.code} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: 8 }}>
                                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                                    <strong style={{ fontSize: 12 }}>{sec.name}</strong>
                                                                                    <span style={{ fontSize: 11, fontWeight: 700, color: c }}>{sec.status}</span>
                                                                                </div>
                                                                                {sec.documents.length === 0 ? (
                                                                                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                                                                                        {sec.is_upload_section ? 'No document submitted.' : 'Verified by name/roll — no document required for this section.'}
                                                                                    </div>
                                                                                ) : sec.documents.map((d) => (
                                                                                    <div key={d.id} style={{ fontSize: 11, marginTop: 4 }}>
                                                                                        📎 {d.original_name || d.event_report_url || `Doc #${d.id}`}
                                                                                        {d.download_url && <a href={d.download_url} target="_blank" rel="noreferrer" style={{ marginLeft: 6, color: '#2563eb' }}>⬇ Download</a>}
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {review.section.documents.length === 0 ? (
                                                            <div style={{ marginTop: 6 }} className="text-muted">No documents / links submitted.</div>
                                                        ) : review.section.documents.map((d) => {
                                                            const rev = d.ocr_fields?.review as Record<string, string> | undefined;
                                                            return (
                                                                <div key={d.id} style={{ marginTop: 8, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: 10 }}>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                        <strong>📎 {d.original_name || d.event_report_url || `Document #${d.id}`}</strong>
                                                                        {d.download_url && (
                                                                            <a href={d.download_url} target="_blank" rel="noreferrer"
                                                                                style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'underline' }}>
                                                                                ⬇ Download
                                                                            </a>
                                                                        )}
                                                                        {d.event_report_url && !d.download_url && (
                                                                            <a href={d.event_report_url} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>🔗 Open link</a>
                                                                        )}
                                                                    </div>
                                                                    {rev && Object.keys(rev).length > 0 && (
                                                                        <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, color: '#475569' }}>
                                                                            {Object.entries(rev).map(([k, v]) => (
                                                                                v ? (
                                                                                    <div key={k} style={(k === 'title' || k === 'purpose' || k === 'event_name') ? { gridColumn: '1 / -1' } : undefined}>
                                                                                        <strong style={{ textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}:</strong>{' '}
                                                                                        <span style={k === 'plagiarism' ? { color: '#b91c1c' } : undefined}>{v}</span>
                                                                                    </div>
                                                                                ) : null
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                    {d.ocr_text && (
                                                                        <div style={{ marginTop: 6 }}>
                                                                            <strong>OCR (advisory):</strong>
                                                                            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, background: '#f8fafc', padding: 6, border: '1px solid #e2e8f0', margin: '4px 0 0' }}>{d.ocr_text.slice(0, 500)}</pre>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}

                                                        {review.prerequisites && review.prerequisites.length > 0 && (
                                                            <div style={{ marginTop: 10, border: '1px solid #cbd5e1', borderRadius: 6, padding: 10, background: '#f8fafc' }}>
                                                                <strong style={{ fontSize: 12, color: '#1b365d' }}>📋 Consolidation — {review.prerequisites.length} dependent section{review.prerequisites.length !== 1 ? 's' : ''} (documents · OCR · status · discussion)</strong>
                                                                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                                    {review.prerequisites.map((p) => {
                                                                        const c = p.status === 'APPROVED' ? '#15803d' : p.status === 'REJECTED' ? '#b91c1c' : '#b45309';
                                                                        const prev = (p.documents[0]?.ocr_fields?.review || {}) as Record<string, string>;
                                                                        return (
                                                                            <div key={p.code} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: 8 }}>
                                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                                    <strong style={{ fontSize: 12 }}>{p.name}</strong>
                                                                                    <span style={{ fontSize: 11, fontWeight: 700, color: c }}>{p.status}</span>
                                                                                </div>
                                                                                {p.documents.map((d) => (
                                                                                    <div key={d.id} style={{ fontSize: 11, marginTop: 4 }}>
                                                                                        📎 {d.original_name || d.event_report_url || `Doc #${d.id}`}
                                                                                        {d.download_url && <a href={d.download_url} target="_blank" rel="noreferrer" style={{ marginLeft: 6, color: '#2563eb' }}>⬇ Download</a>}
                                                                                        {d.ocr_text && (
                                                                                            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 10, background: '#f8fafc', padding: 4, margin: '2px 0 0', border: '1px solid #eef2f7' }}>{d.ocr_text.slice(0, 200)}</pre>
                                                                                        )}
                                                                                    </div>
                                                                                ))}
                                                                                {Object.keys(prev).length > 0 && (
                                                                                    <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>
                                                                                        {Object.entries(prev).filter(([, v]) => v).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' · ')}
                                                                                    </div>
                                                                                )}
                                                                                {p.comments.filter((cm) => cm.body).length > 0 && (
                                                                                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                                                                                        💬 {p.comments.filter((cm) => cm.body).slice(-1)[0].body}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}

                                                        <div style={{ marginTop: 8 }}>
                                                            <button onClick={() => setMsgOpen((o) => !o)}
                                                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 700, color: '#2563eb', fontSize: 12 }}>
                                                                💬 Messages{review.section.comments.length ? ` (${review.section.comments.length})` : ''} {msgOpen ? '▲' : '▼'}
                                                            </button>
                                                            {msgOpen && (
                                                                <div style={{ marginTop: 6 }}>
                                                                    {review.section.comments.length === 0 && <span className="text-muted">No messages yet.</span>}
                                                                    <ul style={{ margin: '4px 0 0 16px' }}>
                                                                        {review.section.comments.map((c, i) => (
                                                                            <li key={i}>{c.is_system ? '⚙️ ' : ''}{c.body} <span className="text-muted">— {c.author}</span></li>
                                                                        ))}
                                                                    </ul>
                                                                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                                                        <input type="text" value={feedbackDraft} onChange={(e) => setFeedbackDraft(e.target.value)}
                                                                            onKeyDown={(e) => { if (e.key === 'Enter') sendFeedback(row.request_id); }}
                                                                            placeholder="Send a message to the student…"
                                                                            style={{ flex: 1, fontSize: 12, padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: 4 }} />
                                                                        <button className="btn btn-primary" style={{ fontSize: 12, padding: '2px 10px' }}
                                                                            onClick={() => sendFeedback(row.request_id)}>Send</button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
                )}
            </div>
        </Layout>
    );
}
