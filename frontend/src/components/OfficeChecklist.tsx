/** Student view of Administration's checklist: what to complete at the office. */
import { Icon } from './Icon';

/** Where students hand in their physical ID card and the rest of the checklist. */
const ADMINISTRATION_OFFICE_LOCATION = 'Administration Block, LNMIIT';

export function OfficeChecklist({ items }: { items: { label: string; done: boolean }[] }) {
    if (items.length === 0) return null;
    const left = items.filter((i) => !i.done).length;
    return (
        <div className="well" style={{ marginTop: 12, padding: '10px 12px', background: left ? '#fffbeb' : '#f0fdf4', border: `1px solid ${left ? '#fde68a' : '#bbf7d0'}`, borderRadius: 6 }}>
            <strong style={{ fontSize: 13, color: '#1b365d' }}>Complete at the Administration office</strong>
            <div style={{ fontSize: 12, color: '#1b365d', marginTop: 4 }}>
                Where: <strong>{ADMINISTRATION_OFFICE_LOCATION}</strong>. Hand in your physical ID card there.
            </div>
            <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 8px' }}>
                {left ? 'Do these in person. The office ticks each one, and Administration can approve once all are ticked.'
                    : 'All done: the office has ticked everything.'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {items.map((i) => (
                    <div key={i.label} style={{ fontSize: 13, color: i.done ? '#166534' : '#334155', display: 'flex', alignItems: 'center' }}>
                        {/* A tick only once the office has received it; nothing while pending. */}
                        {i.done && <Icon name="tick" size={14} strokeWidth={3} color="#157347" style={{ marginRight: 6 }} />}
                        {i.label}
                        <span style={{ fontSize: 11, color: '#64748b', marginLeft: 6 }}>· {i.done ? 'received' : 'pending'}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
