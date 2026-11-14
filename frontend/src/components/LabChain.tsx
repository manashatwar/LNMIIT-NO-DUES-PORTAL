import { labBadge } from '../labBadge';
import { LabLevel } from '../types';

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : '');

/**
 * Read-only view of a request's department lab chain, level by level, ending
 * at HOD — shown to HOD, Administration and lab in-charges on the review panel.
 */
export function LabChainView({ levels, highlight }: { levels: LabLevel[]; highlight?: string }) {
    const all = levels.flatMap((lv) => lv.labs);
    const approved = all.filter((e) => e.status === 'APPROVED').length;
    return (
        <div style={{ marginTop: 8, border: '1px solid #cbd5e1', borderRadius: 6, padding: 10, background: '#f5f3ff' }}>
            <strong style={{ fontSize: 12, color: '#1b365d' }}>
                🧪 Department lab clearance — {approved} of {all.length} lab{all.length !== 1 ? 's' : ''} approved
            </strong>
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {levels.map((lv) => (
                    <div key={lv.level}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#5b21b6', minWidth: 54, paddingTop: 5 }}>Level {lv.level}</span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1 }}>
                                {lv.labs.map((e) => {
                                    const b = labBadge(e);
                                    const mine = highlight === e.name;
                                    return (
                                        <div key={e.lab_id} style={{
                                            background: '#fff', borderRadius: 6, padding: '4px 8px', fontSize: 11,
                                            border: mine ? '2px solid #7c3aed' : '1px solid #e2e8f0',
                                        }}>
                                            <strong>{e.name}</strong>{' '}
                                            <span style={{ color: b.color, background: b.bg, borderRadius: 10, padding: '0 6px', fontWeight: 700 }}>{b.label}</span>
                                            {e.decided_by && (
                                                <span style={{ color: '#64748b' }}> · {e.decided_by}{e.decided_at ? `, ${when(e.decided_at)}` : ''}</span>
                                            )}
                                            {e.reason && <div style={{ color: '#b91c1c', marginTop: 2 }}>Reason: {e.reason}</div>}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        <div style={{ fontSize: 11, color: '#94a3b8', paddingLeft: 62 }}>↓</div>
                    </div>
                ))}
                <div style={{ fontSize: 11, fontWeight: 700, color: '#1b365d', paddingLeft: 62 }}>🏛️ HOD — final departmental approval</div>
            </div>
        </div>
    );
}
