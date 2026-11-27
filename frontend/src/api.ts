// ─── API client for the redesigned Django backend (via Vite proxy at /api) ────
import {
    CurrentUser, RoleType, StudentRequestResponse, SectionQueue,
    SectionReview, ExitType, CertificateData, HodLab, StaffMember, ChecklistEntry, RefundRow,
} from './types';

function getCookie(name: string): string | null {
    const match = document.cookie.match(new RegExp('(^|;\\s*)' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[2]) : null;
}

async function ensureCsrf(): Promise<void> {
    if (!getCookie('csrftoken')) {
        await fetch('/api/csrf/', { credentials: 'include' });
    }
}

async function request<T>(url: string, options: RequestInit = {}, isForm = false): Promise<T> {
    const method = (options.method || 'GET').toUpperCase();
    const headers: Record<string, string> = { ...(options.headers as Record<string, string> | undefined) };
    if (!isForm) headers['Content-Type'] = 'application/json';

    if (method !== 'GET') {
        await ensureCsrf();
        const token = getCookie('csrftoken');
        if (token) headers['X-CSRFToken'] = token;
    }

    const res = await fetch(url, { credentials: 'include', ...options, method, headers });

    let data: any = null;
    try { data = await res.json(); } catch { /* no body */ }

    if (!res.ok) {
        throw new Error((data && data.detail) || `Request failed (${res.status})`);
    }
    return data as T;
}

export const api = {
    // Auth
    login: (username: string, password: string, role: RoleType) =>
        request<CurrentUser>('/api/login/', { method: 'POST', body: JSON.stringify({ username, password, role }) }),
    logout: () => request<{ detail: string }>('/api/logout/', { method: 'POST' }),
    me: () => request<CurrentUser>('/api/me/'),

    // Student
    studentRequest: () => request<StudentRequestResponse>('/api/student/request/'),
    initiate: (exit_type: ExitType, fund_us_amount: number, vacant_room_no: string) =>
        request<StudentRequestResponse>('/api/student/initiate/', {
            method: 'POST',
            body: JSON.stringify({ exit_type, fund_us_amount, vacant_room_no }),
        }),
    upload: (section: string, file: File | null, eventReportUrl?: string) => {
        const form = new FormData();
        form.append('section', section);
        if (file) form.append('file', file);
        if (eventReportUrl) form.append('event_report_url', eventReportUrl);
        return request<{ detail: string; warnings: string[]; document_id?: number; autofill?: Record<string, string>; ocr_text?: string }>(
            '/api/student/upload/', { method: 'POST', body: form }, true);
    },
    confirmReview: (section: string, review: Record<string, string>) =>
        request<{ ok: boolean }>('/api/student/confirm-review/', {
            method: 'POST',
            body: JSON.stringify({ section, review }),
        }),
    studentComment: (section: string, body: string) =>
        request<{ ok: boolean }>('/api/student/comment/', {
            method: 'POST',
            body: JSON.stringify({ section, body }),
        }),
    // Send a rejected basic section back to its office. The HOD card also sends
    // the (optionally edited) name / roll / department; the others send nothing.
    resendSection: (section: string, details?: { name: string; roll_no: string; department: string }) =>
        request<{ ok: boolean }>('/api/student/resend-section/', {
            method: 'POST',
            body: JSON.stringify({ section, ...details }),
        }),
    officerComment: (requestId: number, body: string) =>
        request<{ ok: boolean }>('/api/section/comment/', {
            method: 'POST',
            body: JSON.stringify({ request_id: requestId, body }),
        }),
    submitIntake: (vacant_room_no: string) =>
        request<StudentRequestResponse>('/api/student/submit-intake/', {
            method: 'POST',
            body: JSON.stringify({ vacant_room_no }),
        }),
    // Financial page: the Fund-Us donation (0 = none), until Accounts approves.
    setDonation: (fund_us_amount: number | string) =>
        request<StudentRequestResponse>('/api/student/donation/', {
            method: 'POST',
            body: JSON.stringify({ fund_us_amount }),
        }),
    certificate: () => request<{ ok: boolean; certificate: CertificateData }>('/api/student/certificate/', { method: 'POST' }),

    // Officer
    sectionQueue: () => request<SectionQueue>('/api/section/queue/'),
    sectionReview: (requestId: number) => request<SectionReview>(`/api/section/review/?request_id=${requestId}`),
    // `level`: the Accounts chain step the officer saw the request at (so a request
    // that moved on meanwhile isn't approved a step further by mistake).
    approve: (requestId: number, level?: number | null) =>
        request<{ ok: boolean; status: string }>('/api/section/approve/', {
            method: 'POST',
            body: JSON.stringify(level === undefined || level === null ? { request_id: requestId } : { request_id: requestId, level }),
        }),
    reject: (requestId: number, reason: string) =>
        request<{ ok: boolean; status: string }>('/api/section/reject/', { method: 'POST', body: JSON.stringify({ request_id: requestId, reason }) }),

    // Student — department lab chain (HOD card)
    sendToLabs: () =>
        request<StudentRequestResponse & { sent_to: string[] }>('/api/student/labs/send/', { method: 'POST' }),
    resendToLab: (labId: number) =>
        request<StudentRequestResponse>('/api/student/labs/resend/', { method: 'POST', body: JSON.stringify({ lab_id: labId }) }),
    labCommentFromStudent: (labId: number, body: string) =>
        request<{ ok: boolean }>('/api/student/labs/comment/', { method: 'POST', body: JSON.stringify({ lab_id: labId, body }) }),

    // Lab in-charge
    labQueue: () => request<SectionQueue>('/api/lab/queue/'),
    labReview: (requestId: number) => request<SectionReview>(`/api/lab/review/?request_id=${requestId}`),
    labApprove: (requestId: number) =>
        request<{ ok: boolean; status: string }>('/api/lab/approve/', { method: 'POST', body: JSON.stringify({ request_id: requestId }) }),
    labReject: (requestId: number, reason: string) =>
        request<{ ok: boolean; status: string }>('/api/lab/reject/', { method: 'POST', body: JSON.stringify({ request_id: requestId, reason }) }),
    labComment: (requestId: number, body: string) =>
        request<{ ok: boolean }>('/api/lab/comment/', { method: 'POST', body: JSON.stringify({ request_id: requestId, body }) }),

    // HOD — manage the department's labs
    hodLabs: () => request<{ department: string; labs: HodLab[] }>('/api/hod/labs/'),
    hodAddLab: (lab: { name: string; incharge_name: string; email: string; password: string; level: number }) =>
        request<{ lab: HodLab }>('/api/hod/labs/', { method: 'POST', body: JSON.stringify(lab) }),
    hodUpdateLab: (id: number, changes: Partial<{ name: string; incharge_name: string; email: string; level: number; password: string; is_active: boolean }>) =>
        request<{ lab: HodLab }>(`/api/hod/labs/${id}/`, { method: 'PATCH', body: JSON.stringify(changes) }),
    hodRemoveLab: (id: number) =>
        request<{ ok: boolean; outcome: 'deleted' | 'deactivated'; released: number }>(`/api/hod/labs/${id}/`, { method: 'DELETE' }),

    // Section head (library@ / lucs@ / nad@) — send requests to staff, manage staff
    sendToStaff: (staffId: number, count: number) =>
        request<{ ok: boolean; moved: number; to: { id: number; name: string } | null }>('/api/section/assign/', {
            method: 'POST', body: JSON.stringify({ staff_id: staffId, count }),
        }),
    moveRequests: (requestIds: number[], staffId: number | null) =>
        request<{ ok: boolean; moved: number; to: { id: number; name: string } | null }>('/api/section/assign/', {
            method: 'POST', body: JSON.stringify({ request_ids: requestIds, staff_id: staffId }),
        }),
    sectionStaff: () => request<{
        section: string; staff: StaffMember[];
        head_waiting: number;                                 // levels: waiting for the head's final approval
        checklist: { id: number; label: string }[] | null;   // Administration only
        refund_senders: string[] | null;                      // Accounts only: who sends refunds
    }>('/api/section/staff/'),
    addStaff: (member: { name: string; email: string; password: string; level?: number; refund_manager?: boolean }) =>
        request<{ staff: StaffMember }>('/api/section/staff/', { method: 'POST', body: JSON.stringify(member) }),
    updateStaff: (id: number, changes: Partial<{ name: string; email: string; password: string; level: number; refund_manager: boolean; is_active: boolean }>) =>
        request<{ staff: StaffMember }>(`/api/section/staff/${id}/`, { method: 'PATCH', body: JSON.stringify(changes) }),
    removeStaff: (id: number) =>
        request<{ ok: boolean; outcome: 'deleted' | 'deactivated'; returned: number }>(`/api/section/staff/${id}/`, { method: 'DELETE' }),

    // Administration checklist — its office ticks items per request; the head manages the list
    tickChecklist: (requestId: number, itemId: number, done: boolean) =>
        request<{ ok: boolean; checklist: ChecklistEntry[] }>('/api/section/checklist/tick/', {
            method: 'POST', body: JSON.stringify({ request_id: requestId, item_id: itemId, done }),
        }),
    addChecklistItem: (label: string) =>
        request<{ item: { id: number; label: string } }>('/api/section/checklist/', { method: 'POST', body: JSON.stringify({ label }) }),
    removeChecklistItem: (id: number) =>
        request<{ ok: boolean; outcome: 'deleted' | 'deactivated' }>(`/api/section/checklist/${id}/`, { method: 'DELETE' }),

    // Refunds — whoever sends them records each one paid (or none due), or sends it back
    refunds: () => request<{ pending: RefundRow[]; sent: RefundRow[]; modes: string[] }>('/api/accounts/refunds/'),
    recordRefund: (body: { request_id: number; amount?: string; mode?: string; reference?: string; paid_on?: string; no_refund?: boolean }) =>
        request<{ ok: boolean; refund: RefundRow['refund'] }>('/api/accounts/refunds/', { method: 'POST', body: JSON.stringify(body) }),
    rejectRefund: (requestId: number, reason: string) =>
        request<{ ok: boolean; status: string }>('/api/accounts/refunds/', {
            method: 'POST', body: JSON.stringify({ request_id: requestId, reject: true, reason }),
        }),
};

/** The endpoints an officer desk acts through: sections, or a department lab. */
export interface OfficerDesk {
    queue: () => Promise<SectionQueue>;
    review: (requestId: number) => Promise<SectionReview>;
    approve: (requestId: number, level?: number | null) => Promise<{ ok: boolean; status: string }>;
    reject: (requestId: number, reason: string) => Promise<{ ok: boolean; status: string }>;
    comment: (requestId: number, body: string) => Promise<{ ok: boolean }>;
}

export const sectionDesk: OfficerDesk = {
    queue: api.sectionQueue, review: api.sectionReview, approve: api.approve,
    reject: api.reject, comment: api.officerComment,
};

export const labDesk: OfficerDesk = {
    queue: api.labQueue, review: api.labReview, approve: api.labApprove,
    reject: api.labReject, comment: api.labComment,
};

export const deskFor = (role: RoleType): OfficerDesk => (role === 'LAB' ? labDesk : sectionDesk);
