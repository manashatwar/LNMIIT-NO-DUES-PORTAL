// ─── API client for the redesigned Django backend (via Vite proxy at /api) ────
import {
    CurrentUser, RoleType, StudentRequestResponse, SectionQueue,
    SectionReview, ExitType, CertificateData,
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
    confirmSection: (section: string, details: { name: string; roll_no: string; department: string }) =>
        request<{ ok: boolean }>('/api/student/confirm-section/', {
            method: 'POST',
            body: JSON.stringify({ section, ...details }),
        }),
    officerComment: (requestId: number, body: string) =>
        request<{ ok: boolean }>('/api/section/comment/', {
            method: 'POST',
            body: JSON.stringify({ request_id: requestId, body }),
        }),
    submitIntake: (vacant_room_no: string, fund_us_amount: number) =>
        request<StudentRequestResponse>('/api/student/submit-intake/', {
            method: 'POST',
            body: JSON.stringify({ vacant_room_no, fund_us_amount }),
        }),
    certificate: () => request<{ ok: boolean; certificate: CertificateData }>('/api/student/certificate/', { method: 'POST' }),

    // Officer
    sectionQueue: () => request<SectionQueue>('/api/section/queue/'),
    sectionReview: (requestId: number) => request<SectionReview>(`/api/section/review/?request_id=${requestId}`),
    approve: (requestId: number) =>
        request<{ ok: boolean; status: string }>('/api/section/approve/', { method: 'POST', body: JSON.stringify({ request_id: requestId }) }),
    reject: (requestId: number, reason: string) =>
        request<{ ok: boolean; status: string }>('/api/section/reject/', { method: 'POST', body: JSON.stringify({ request_id: requestId, reason }) }),
};
