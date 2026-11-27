import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { StaffMember } from '../types';

interface StaffManagerProps {
    sectionName: string;
    /** Accounts: staff work in levels — a ready request moves up them by itself. */
    levels?: boolean;
    /** Staff changes affect the desk (who can get work, returned requests) — refresh it. */
    onChanged: () => void;
}

const input: React.CSSProperties = { padding: '6px 10px', fontSize: 12 };
const label: React.CSSProperties = { display: 'block', color: '#64748b', marginBottom: 2, fontSize: 11 };
const smallBtn: React.CSSProperties = { fontSize: 11, padding: '3px 8px' };
const refundBadge = (
    <span style={{ fontSize: 10, fontWeight: 700, color: '#166534', background: '#dcfce7', borderRadius: 8, padding: '1px 6px', marginLeft: 6 }}>
        Refund manager
    </span>
);

/**
 * Section head's "Manage staff" (Library, LUCS, NAD Cell, Administration, Accounts):
 * add people who help handle this desk. Each gets a login with the section's user
 * type. By hand (Library, LUCS, NAD Cell, Administration): they see only what the
 * head sends them, and their approve/reject is final. By level (Accounts): each is
 * put on a level and requests move up the levels by themselves; after the last
 * level they come to the head (the main account), always the final step, which
 * also always sends the students' refunds. Staff can be made refund managers too.
 */
export function StaffManager({ sectionName, levels = false, onChanged }: StaffManagerProps) {
    const [staff, setStaff] = useState<StaffMember[]>([]);
    const [headWaiting, setHeadWaiting] = useState(0);              // levels: waiting for your final approval
    const [refundSenders, setRefundSenders] = useState<string[] | null>(null);
    // Administration: what the student must complete at the office (null = no checklist here).
    const [checklist, setChecklist] = useState<{ id: number; label: string }[] | null>(null);
    const [newItem, setNewItem] = useState('');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState('');
    const [noteErr, setNoteErr] = useState(false);

    // level as typed (a string, so the box can be cleared while typing)
    const [form, setForm] = useState({ name: '', email: '', password: '', level: '1' });
    const [showPassword, setShowPassword] = useState(false);
    const [editId, setEditId] = useState<number | null>(null);
    const [edit, setEdit] = useState({ name: '', email: '', level: 1, refund: false });
    const [pwId, setPwId] = useState<number | null>(null);
    const [pwValue, setPwValue] = useState('');
    const [showRemoved, setShowRemoved] = useState(false);

    const active = staff.filter((s) => s.is_active);
    const removed = staff.filter((s) => !s.is_active);
    const levelNumbers = Array.from(new Set(active.map((s) => s.level ?? 1))).sort((a, b) => a - b);
    const lastLevel = levelNumbers.length ? levelNumbers[levelNumbers.length - 1] : 1;

    const say = (text: string, isErr = false) => { setNote(text); setNoteErr(isErr); };

    const load = async () => {
        try {
            const data = await api.sectionStaff();
            setStaff(data.staff);
            setHeadWaiting(data.head_waiting ?? 0);
            setRefundSenders(data.refund_senders ?? null);
            setChecklist(data.checklist ?? null);
        }
        catch (e) { say(e instanceof Error ? e.message : 'Could not load staff', true); }
        finally { setLoading(false); }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { load(); }, []);

    // Levels: default a new person to the current last level (or 1 for the first).
    useEffect(() => {
        setForm((f) => (f.name || f.email ? f : { ...f, level: String(lastLevel) }));
    }, [lastLevel]);

    const run = async (action: () => Promise<void>) => {
        setBusy(true);
        try { await action(); await load(); onChanged(); }
        catch (e) { say(e instanceof Error ? e.message : 'Something went wrong', true); }
        finally { setBusy(false); }
    };

    const addStaff = (ev: React.FormEvent) => {
        ev.preventDefault();
        run(async () => {
            const { staff: s } = await api.addStaff({
                name: form.name, email: form.email, password: form.password,
                ...(levels ? { level: Number(form.level) } : {}),
            });
            say(`Added ${s.name}${levels ? ` at level ${s.level}` : ''}. `
                + `They can now sign in with user type "${sectionName}" as ${s.email}.`);
            setForm({ name: '', email: '', password: '', level: String(s.level ?? 1) });
            setShowPassword(false);
        });
    };

    const saveEdit = (s: StaffMember) => run(async () => {
        await api.updateStaff(s.id, {
            name: edit.name, email: edit.email,
            ...(levels ? { level: Number(edit.level), refund_manager: edit.refund } : {}),
        });
        setEditId(null);
        say(`Saved ${edit.name}.`);
    });

    const savePassword = (s: StaffMember) => run(async () => {
        await api.updateStaff(s.id, { password: pwValue });
        setPwId(null); setPwValue('');
        say(`Password changed for ${s.name} (${s.email}).`);
    });

    const removeStaff = (s: StaffMember) => {
        const back = !levels && s.pending > 0 ? `\n\nTheir ${s.pending} waiting request(s) will come back to you.` : '';
        const level = levels ? `\n\nIf nobody else is on level ${s.level}, requests will skip that level.` : '';
        if (!window.confirm(`Remove ${s.name} from the ${sectionName} desk?${back}${level}\n\nTheir login (${s.email}) will stop working.`)) return;
        run(async () => {
            const res = await api.removeStaff(s.id);
            say(`${s.name} removed${res.returned ? ` — ${res.returned} request(s) are back with you` : ''}.`
                + (res.outcome === 'deactivated' ? ' Kept under "Removed staff" because their past decisions are on record.' : ''));
        });
    };

    const restore = (s: StaffMember) => run(async () => {
        await api.updateStaff(s.id, { is_active: true });
        say(`${s.name} restored; their login works again.`);
    });

    const addItem = (ev: React.FormEvent) => {
        ev.preventDefault();
        run(async () => {
            const { item } = await api.addChecklistItem(newItem);
            setNewItem('');
            say(`Added "${item.label}" to the checklist. Approve now waits for it on every pending request too.`);
        });
    };

    const removeItem = (item: { id: number; label: string }) => {
        if (!window.confirm(`Remove "${item.label}" from the checklist?\n\nRequests will no longer need it ticked.`)) return;
        run(async () => {
            await api.removeChecklistItem(item.id);
            say(`Removed "${item.label}" from the checklist.`);
        });
    };

    const arrow = (text: string) => (
        <div style={{ textAlign: 'center', fontSize: 11, color: '#64748b', padding: '2px 0' }}>↓ {text}</div>
    );

    if (loading) return <div className="well loading-block"><span>Loading staff…</span><div className="loading-bar" /></div>;

    const card = (s: StaffMember) => (
        <div key={s.id} style={{ background: '#fff', border: editId === s.id ? '2px solid #1b365d' : '1px solid #c9d6e6', borderRadius: 8, padding: 10, minWidth: 240, flex: '1 1 240px' }}>
            {editId === s.id ? (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: levels ? '1fr 90px' : '1fr', gap: 6 }}>
                        <div><label style={label}>Name</label><input className="erp-input" style={input} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
                        {levels && (
                            <div><label style={label}>Level</label><input className="erp-input" style={input} type="number" min={1} max={20} value={edit.level} onChange={(e) => setEdit({ ...edit, level: Number(e.target.value) })} /></div>
                        )}
                    </div>
                    <div style={{ marginTop: 6 }}><label style={label}>Login email</label><input className="erp-input" style={input} value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></div>
                    {levels && (
                        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, marginTop: 6, fontWeight: 'normal' }}>
                            <input type="checkbox" checked={edit.refund} onChange={(e) => setEdit({ ...edit, refund: e.target.checked })} />
                            Refund manager (sends students' refunds)
                        </label>
                    )}
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <button className="btn btn-success" style={smallBtn} disabled={busy} onClick={() => saveEdit(s)}>Save</button>
                        <button className="btn btn-secondary" style={smallBtn} onClick={() => setEditId(null)}>Cancel</button>
                    </div>
                </>
            ) : (
                <>
                    <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 14 }}>{s.name}{s.refund_manager && refundBadge}</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Login: <code>{s.email}</code></div>
                    <div style={{ fontSize: 11, marginTop: 4 }}>
                        <span style={{ color: s.pending ? '#b45309' : '#64748b' }}>{s.pending} waiting{levels ? ' at this level' : ''}</span>
                        <span style={{ color: '#64748b' }}> · {s.decided} decided</span>
                    </div>
                    {pwId === s.id ? (
                        <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                            <input className="erp-input" style={{ ...input, flex: 1 }} type="text" autoComplete="new-password" autoFocus
                                placeholder="New password" value={pwValue} onChange={(e) => setPwValue(e.target.value)} />
                            <button className="btn btn-success" style={smallBtn} disabled={busy || !pwValue} onClick={() => savePassword(s)}>Set</button>
                            <button className="btn btn-secondary" style={smallBtn} onClick={() => { setPwId(null); setPwValue(''); }}>Cancel</button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                            <button className="btn btn-primary" style={smallBtn} onClick={() => { setPwId(null); setEditId(s.id); setEdit({ name: s.name, email: s.email, level: s.level ?? 1, refund: s.refund_manager }); }}>Edit</button>
                            <button className="btn btn-secondary" style={smallBtn} onClick={() => { setEditId(null); setPwId(s.id); setPwValue(''); }}>Reset password</button>
                            <button className="btn btn-danger" style={smallBtn} disabled={busy} onClick={() => removeStaff(s)}>Remove</button>
                        </div>
                    )}
                </>
            )}
        </div>
    );

    // The main account: always the final step after every level, and always the refund manager.
    const headCard = (
        <div style={{ background: '#fefce8', border: '2px solid #facc15', borderRadius: 8, padding: 10 }}>
            <div style={{ fontWeight: 700, color: '#b45309', fontSize: 14 }}>You (main account){refundBadge}</div>
            <div style={{ fontSize: 11, marginTop: 4, color: headWaiting ? '#b45309' : '#64748b' }}>
                {headWaiting} waiting for your final approval: approve them from <strong>Incoming</strong>
            </div>
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {note && (noteErr
                ? <div className="alert alert-danger" style={{ fontSize: 13, margin: 0 }}>{note}</div>
                : <div className="well" style={{ padding: '8px 12px', fontSize: 13, margin: 0, color: '#15803d' }}>{note}</div>)}

            <div className="well" style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, margin: 0 }}>
                <h3 style={{ marginTop: 0, color: '#1b365d', fontSize: 16 }}>{sectionName} Staff{levels ? ' — levels' : ''}</h3>
                {!levels && (
                    <p style={{ fontSize: 12, color: '#64748b', marginTop: 0 }}>
                        Every request comes to <strong>you</strong> first. From the <strong>Incoming</strong> tab, send requests to a staff
                        member — the next 35 in one go, or one by one. Staff sign in with user type <strong>{sectionName}</strong>, see only
                        what you send them, and their approve / reject is final. Only you can add or remove staff.
                    </p>
                )}
                {levels ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {levelNumbers.length === 0 && (
                            <>
                                <div style={{ fontSize: 13, color: '#64748b', background: '#f8fafc', padding: 12, borderRadius: 6 }}>
                                    No staff yet: every request comes straight to you. Add staff below to have it pass through levels first.
                                </div>
                                {arrow('then')}
                            </>
                        )}
                        {levelNumbers.map((lv) => {
                            const here = active.filter((s) => (s.level ?? 1) === lv);
                            return (
                                <div key={lv}>
                                    <div style={{ background: '#f4f7fb', border: '1px solid #c9d6e6', borderRadius: 8, padding: 10 }}>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: '#1b365d', marginBottom: 8 }}>
                                            Level {lv}{here.length > 1 ? ' · either of these can approve' : ''}
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{here.map(card)}</div>
                                    </div>
                                    {arrow(`once Level ${lv} approves`)}
                                </div>
                            );
                        })}
                        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: 10 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#b45309', marginBottom: 8 }}>Final approval</div>
                            {headCard}
                        </div>
                        {arrow('once you approve')}
                        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 10, fontSize: 13, fontWeight: 700, color: '#15803d' }}>
                            {sectionName} approved · once every section has approved and the refund is sent, the certificate is released
                        </div>
                        {refundSenders && refundSenders.length > 0 && (
                            <div style={{ fontSize: 12, color: '#475569', marginTop: 6 }}>
                                Refunds are sent by <strong>{refundSenders.join(', ')}</strong>.
                            </div>
                        )}
                    </div>
                ) : levelNumbers.length === 0 ? (
                    <div style={{ fontSize: 13, color: '#64748b', background: '#f8fafc', padding: 12, borderRadius: 6 }}>
                        No staff yet — you handle every request yourself. Add someone below to share the work.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{active.map(card)}</div>
                )}
            </div>

            {checklist !== null && (
                <div className="well" style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, margin: 0 }}>
                    <h4 style={{ marginTop: 0, color: '#1b365d', fontSize: 15 }}>Checklist at the office</h4>
                    <p style={{ fontSize: 12, color: '#64748b', marginTop: 0 }}>
                        What every student must complete in person, e.g. handing in their physical ID card. Your office ticks each item
                        on the request (<strong>Checklist</strong> column in Incoming); <strong>Approve stays locked</strong> until all
                        are ticked. Students see this list on their Page 4.
                    </p>
                    {checklist.length === 0 ? (
                        <div style={{ fontSize: 12, color: '#64748b', background: '#f8fafc', padding: 10, borderRadius: 6 }}>
                            Nothing on the checklist: requests can be approved without any office tick.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {checklist.map((item) => (
                                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, background: '#f8fafc', padding: '6px 10px', borderRadius: 6 }}>
                                    <span>{item.label}</span>
                                    <button className="btn btn-danger" style={smallBtn} disabled={busy} onClick={() => removeItem(item)}>Remove</button>
                                </div>
                            ))}
                        </div>
                    )}
                    <form onSubmit={addItem} style={{ display: 'flex', gap: 6, marginTop: 10 }} autoComplete="off">
                        <input className="erp-input" style={{ ...input, flex: 1 }} maxLength={120} value={newItem}
                            placeholder='e.g. "Hostel room key returned"' onChange={(e) => setNewItem(e.target.value)} />
                        <button type="submit" className="btn btn-success" style={{ fontSize: 12, padding: '5px 12px' }}
                            disabled={busy || !newItem.trim()}>Add item</button>
                    </form>
                </div>
            )}

            <form onSubmit={addStaff} className="well" style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, margin: 0 }} autoComplete="off">
                <h4 style={{ marginTop: 0, color: '#1b365d', fontSize: 15 }}>Add a staff member</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                    <div><label style={label}>Name *</label>
                        <input className="erp-input" style={input} placeholder="e.g. Anita Rao" value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                    <div><label style={label}>Login email *</label>
                        <input className="erp-input" style={input} type="email" placeholder="name@lnmiit.ac.in" value={form.email}
                            onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                    <div><label style={label}>Password *</label>
                        <div style={{ display: 'flex', gap: 4 }}>
                            <input className="erp-input" style={{ ...input, flex: 1 }} type={showPassword ? 'text' : 'password'}
                                autoComplete="new-password" value={form.password}
                                onChange={(e) => setForm({ ...form, password: e.target.value })} />
                            <button type="button" className="btn btn-secondary" style={smallBtn} onClick={() => setShowPassword((v) => !v)}>
                                {showPassword ? 'Hide' : 'Show'}
                            </button>
                        </div></div>
                    {levels && (
                        <div><label style={label}>Level *</label>
                            <input className="erp-input" style={input} type="number" min={1} max={20} value={form.level}
                                onChange={(e) => setForm({ ...form, level: e.target.value })} /></div>
                    )}
                </div>
                <p style={{ fontSize: 11, color: '#64748b', margin: '8px 0 0' }}>
                    {levels && <>Same level as someone else = they share that step (either can approve); the next number = a later step. </>}
                    Password: at least 8 characters, not a common or all-numeric one.
                </p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
                    <button type="submit" className="btn btn-success" style={{ fontSize: 13 }}
                        disabled={busy || !form.name.trim() || !form.email.trim() || !form.password || (levels && !form.level)}>
                        {busy ? 'Saving…' : 'Add staff & create login'}
                    </button>
                </div>
            </form>

            {removed.length > 0 && (
                <div className="well" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, margin: 0 }}>
                    <button onClick={() => setShowRemoved((v) => !v)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 700, color: '#475569', fontSize: 13 }}>
                        Removed staff ({removed.length}) {showRemoved ? '▲' : '▼'}
                    </button>
                    {showRemoved && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                            {removed.map((s) => (
                                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, background: '#f8fafc', padding: '6px 10px', borderRadius: 6 }}>
                                    <span><strong>{s.name}</strong>{levels && s.level ? ` · level ${s.level}` : ''} · <code>{s.email}</code> · {s.decided} decided</span>
                                    <button className="btn btn-primary" style={smallBtn} disabled={busy} onClick={() => restore(s)}>Restore</button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
