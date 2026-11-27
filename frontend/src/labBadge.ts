import { LabEntry } from './types';

/** Colour + label for one department lab's state on a request. */
export function labBadge(e: Pick<LabEntry, 'status' | 'sent' | 'actionable'>): { label: string; color: string; bg: string } {
    if (e.status === 'APPROVED') return { label: 'APPROVED', color: '#15803d', bg: '#dcfce7' };
    if (e.status === 'REJECTED') return { label: 'REJECTED', color: '#b91c1c', bg: '#fee2e2' };
    if (!e.sent) return { label: 'NOT SENT', color: '#64748b', bg: '#f1f5f9' };
    if (!e.actionable) return { label: 'WAITING', color: '#94a3b8', bg: '#f8fafc' };
    return { label: 'PENDING', color: '#b45309', bg: '#fef3c7' };
}
