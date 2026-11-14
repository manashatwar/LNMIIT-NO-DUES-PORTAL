import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { HodLab } from '../types';

interface LabManagerProps {
    /** Removing a lab can release students waiting on it — refresh the HOD queue. */
    onChanged: () => void;
}

type EditFields = { name: string; incharge_name: string; email: string; level: number };

const input: React.CSSProperties = { padding: '6px 10px', fontSize: 12 };
const label: React.CSSProperties = { display: 'block', color: '#64748b', marginBottom: 2, fontSize: 11 };
const smallBtn: React.CSSProperties = { fontSize: 11, padding: '3px 8px' };

/**
 * HOD "Manage Labs": the department's labs and their hierarchy. Labs on the
 * same level receive a student's request together; the next level receives it
 * only once every lab on the previous one approves; HOD approves last. Adding
 * a lab creates its in-charge's login (role "Lab In-charge") with the email +
 * password entered here.
 */
export function LabManager({ onChanged }: LabManagerProps) {
    const [department, setDepartment] = useState('');
    const [labs, setLabs] = useState<HodLab[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState('');
    const [noteErr, setNoteErr] = useState(false);

    const [form, setForm] = useState({ name: '', incharge_name: '', email: '', password: '', level: 1 });
    const [showPassword, setShowPassword] = useState(false);
    const [editId, setEditId] = useState<number | null>(null);
    const [edit, setEdit] = useState<EditFields>({ name: '', incharge_name: '', email: '', level: 1 });
    const [pwId, setPwId] = useState<number | null>(null);
    const [pwValue, setPwValue] = useState('');
    const [showRemoved, setShowRemoved] = useState(false);

    const active = labs.filter((l) => l.is_active);
    const removed = labs.filter((l) => !l.is_active);
    const levels = Array.from(new Set(active.map((l) => l.level))).sort((a, b) => a - b);
    const maxLevel = levels.length ? levels[levels.length - 1] : 0;

    const say = (text: string, isErr = false) => { setNote(text); setNoteErr(isErr); };

    const load = async () => {
        try {
            const data = await api.hodLabs();
            setDepartment(data.department);
            setLabs(data.labs);
        } catch (e) { say(e instanceof Error ? e.message : 'Could not load labs', true); }
        finally { setLoading(false); }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { load(); }, []);

    // Default a new lab to the current last level (or 1 for the first lab).
    useEffect(() => {
        setForm((f) => (f.name || f.email ? f : { ...f, level: Math.max(1, maxLevel) }));
    }, [maxLevel]);

    const run = async (action: () => Promise<void>) => {
        setBusy(true);
        try { await action(); await load(); }
        catch (e) { say(e instanceof Error ? e.message : 'Something went wrong', true); }
        finally { setBusy(false); }
    };

    const addLab = (ev: React.FormEvent) => {
        ev.preventDefault();
        run(async () => {
            const { lab } = await api.hodAddLab({ ...form, level: Number(form.level) });
            say(`✓ Added ${lab.name} at level ${lab.level}. Its in-charge can now sign in as "Lab In-charge" with ${lab.email}.`);
            setForm({ name: '', incharge_name: '', email: '', password: '', level: lab.level });
            setShowPassword(false);
        });
    };

    const startEdit = (lab: HodLab) => {
        setPwId(null);
        setEditId(lab.id);
        setEdit({ name: lab.name, incharge_name: lab.incharge_name, email: lab.email, level: lab.level });
    };

    const saveEdit = (lab: HodLab) => run(async () => {
        await api.hodUpdateLab(lab.id, { ...edit, level: Number(edit.level) });
        setEditId(null);
        say(`✓ Saved ${edit.name}.` + (Number(edit.level) !== lab.level
            ? ' The new level applies to students who start their lab clearance from now on.' : ''));
    });

    const savePassword = (lab: HodLab) => run(async () => {
        await api.hodUpdateLab(lab.id, { password: pwValue });
        setPwId(null); setPwValue('');
        say(`✓ Password changed for ${lab.name} (${lab.email}).`);
    });

    const removeLab = (lab: HodLab) => {
        const waiting = lab.waiting > 0
            ? `\n\n${lab.waiting} student(s) currently waiting on it will no longer need its approval.` : '';
        if (!window.confirm(`Remove ${lab.name} from the ${department} lab chain?${waiting}\n\nIts login (${lab.email}) will stop working.`)) return;
        run(async () => {
            const res = await api.hodRemoveLab(lab.id);
            say(res.outcome === 'deleted'
                ? `✓ ${lab.name} removed.`
                : `✓ ${lab.name} removed — kept under "Removed labs" because past requests record its approvals.`);
            onChanged();
        });
    };

    const restoreLab = (lab: HodLab) => run(async () => {
        await api.hodUpdateLab(lab.id, { is_active: true });
        say(`✓ ${lab.name} restored at level ${lab.level}; its login works again.`);
    });

    if (loading) return <div className="well">Loading labs…</div>;

    const labCard = (lab: HodLab) => {
        if (editId === lab.id) {
            return (
                <div key={lab.id} style={{ background: '#fff', border: '2px solid #7c3aed', borderRadius: 8, padding: 10, minWidth: 260, flex: '1 1 260px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        <div><label style={label}>Lab name</label><input className="erp-input" style={input} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
                        <div><label style={label}>Level</label><input className="erp-input" style={input} type="number" min={1} max={20} value={edit.level} onChange={(e) => setEdit({ ...edit, level: Number(e.target.value) })} /></div>
                        <div><label style={label}>In-charge name</label><input className="erp-input" style={input} value={edit.incharge_name} onChange={(e) => setEdit({ ...edit, incharge_name: e.target.value })} /></div>
                        <div><label style={label}>Login email</label><input className="erp-input" style={input} value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <button className="btn btn-success" style={smallBtn} disabled={busy} onClick={() => saveEdit(lab)}>Save</button>
                        <button className="btn btn-secondary" style={smallBtn} onClick={() => setEditId(null)}>Cancel</button>
                    </div>
                </div>
            );
        }
        return (
            <div key={lab.id} style={{ background: '#fff', border: '1px solid #ddd6fe', borderRadius: 8, padding: 10, minWidth: 220, flex: '1 1 220px' }}>
                <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 14 }}>🧪 {lab.name}</div>
                <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>{lab.incharge_name || <em>In-charge not named</em>}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>🔑 Login: <code>{lab.email}</code></div>
                {lab.waiting > 0 && <div style={{ fontSize: 11, color: '#b45309', marginTop: 2 }}>⏳ {lab.waiting} student{lab.waiting !== 1 ? 's' : ''} waiting</div>}
                {pwId === lab.id ? (
                    <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                        <input className="erp-input" style={{ ...input, flex: 1 }} type="text" autoComplete="new-password" autoFocus
                            placeholder="New password" value={pwValue} onChange={(e) => setPwValue(e.target.value)} />
                        <button className="btn btn-success" style={smallBtn} disabled={busy || !pwValue} onClick={() => savePassword(lab)}>Set</button>
                        <button className="btn btn-secondary" style={smallBtn} onClick={() => { setPwId(null); setPwValue(''); }}>✕</button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                        <button className="btn btn-primary" style={smallBtn} onClick={() => startEdit(lab)}>Edit</button>
                        <button className="btn btn-warning" style={smallBtn} onClick={() => { setEditId(null); setPwId(lab.id); setPwValue(''); }}>Reset password</button>
                        <button className="btn btn-danger" style={smallBtn} disabled={busy} onClick={() => removeLab(lab)}>Remove</button>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {note && (noteErr
                ? <div className="alert alert-danger" style={{ fontSize: 13, margin: 0 }}>⚠️ {note}</div>
                : <div className="well" style={{ padding: '8px 12px', fontSize: 13, margin: 0, color: '#15803d' }}>{note}</div>)}

            <div className="well" style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, margin: 0 }}>
                <h3 style={{ marginTop: 0, color: '#1b365d', fontSize: 16 }}>🧪 {department} Lab Hierarchy</h3>
                <p style={{ fontSize: 12, color: '#64748b', marginTop: 0 }}>
                    Students send their request level by level from their HOD card. Labs on the <strong>same level</strong> get it
                    together; the next level gets it only after <strong>every</strong> lab on the previous level approves. Your
                    approval comes last. Changing a level affects students who start their lab clearance from then on — students
                    already in progress keep the order they started with.
                </p>
                {active.length === 0 ? (
                    <div style={{ fontSize: 13, color: '#64748b', background: '#f8fafc', padding: 12, borderRadius: 6 }}>
                        No labs yet — requests from {department} students come straight to you. Add a lab below to require lab clearance first.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {levels.map((lv, i) => {
                            const here = active.filter((l) => l.level === lv);
                            return (
                                <div key={lv}>
                                    <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, padding: 10 }}>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: '#5b21b6', marginBottom: 8 }}>
                                            Level {lv}{here.length > 1 ? ' · these labs receive the request together' : ''}
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{here.map(labCard)}</div>
                                    </div>
                                    <div style={{ textAlign: 'center', fontSize: 11, color: '#64748b', padding: '2px 0' }}>
                                        ↓ {i < levels.length - 1 ? `after every Level ${lv} lab approves` : 'after every lab approves'}
                                    </div>
                                </div>
                            );
                        })}
                        <div style={{ background: '#eef4ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: 10, fontSize: 13, fontWeight: 700, color: '#1b365d' }}>
                            🏛️ HOD — final departmental approval (you)
                        </div>
                    </div>
                )}
            </div>

            <form onSubmit={addLab} className="well" style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, margin: 0 }} autoComplete="off">
                <h4 style={{ marginTop: 0, color: '#1b365d', fontSize: 15 }}>➕ Add a lab</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
                    <div><label style={label}>Lab name *</label>
                        <input className="erp-input" style={input} placeholder="e.g. Microwave Lab" value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                    <div><label style={label}>In-charge name</label>
                        <input className="erp-input" style={input} placeholder="e.g. Mr. Kamta Sharma" value={form.incharge_name}
                            onChange={(e) => setForm({ ...form, incharge_name: e.target.value })} /></div>
                    <div><label style={label}>Login email *</label>
                        <input className="erp-input" style={input} type="email" placeholder="lab@lnmiit.ac.in" value={form.email}
                            onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                    <div><label style={label}>Password *</label>
                        <div style={{ display: 'flex', gap: 4 }}>
                            <input className="erp-input" style={{ ...input, flex: 1 }} type={showPassword ? 'text' : 'password'}
                                autoComplete="new-password" value={form.password}
                                onChange={(e) => setForm({ ...form, password: e.target.value })} />
                            <button type="button" className="btn btn-secondary" style={smallBtn} onClick={() => setShowPassword((s) => !s)}>
                                {showPassword ? 'Hide' : 'Show'}
                            </button>
                        </div></div>
                    <div><label style={label}>Level *</label>
                        <input className="erp-input" style={input} type="number" min={1} max={20} value={form.level}
                            onChange={(e) => setForm({ ...form, level: Number(e.target.value) })} /></div>
                </div>
                <p style={{ fontSize: 11, color: '#64748b', margin: '8px 0 0' }}>
                    Same level as an existing lab = they get requests together. Use the next number to make it wait for the
                    labs before it. Password: at least 8 characters, not a common or all-numeric one.
                </p>
                <button type="submit" className="btn btn-success" style={{ marginTop: 10, fontSize: 13 }}
                    disabled={busy || !form.name.trim() || !form.email.trim() || !form.password}>
                    {busy ? 'Saving…' : 'Add lab & create login'}
                </button>
            </form>

            {removed.length > 0 && (
                <div className="well" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, margin: 0 }}>
                    <button onClick={() => setShowRemoved((s) => !s)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 700, color: '#475569', fontSize: 13 }}>
                        🗄️ Removed labs ({removed.length}) {showRemoved ? '▲' : '▼'}
                    </button>
                    {showRemoved && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                            {removed.map((lab) => (
                                <div key={lab.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, background: '#f8fafc', padding: '6px 10px', borderRadius: 6 }}>
                                    <span><strong>{lab.name}</strong> · level {lab.level} · <code>{lab.email}</code></span>
                                    <button className="btn btn-primary" style={smallBtn} disabled={busy} onClick={() => restoreLab(lab)}>Restore</button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
