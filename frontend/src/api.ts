// ─── API client for the Django backend (via Vite proxy at /api) ──────────────
import { CurrentUser, RoleType, StudentStatus, SectionQueue, DeptDetail, LabDetail } from './types';

/** Read a cookie value by name (used for CSRF token). */
function getCookie(name: string): string | null {
    const match = document.cookie.match(new RegExp('(^|;\\s*)' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[2]) : null;
}

/** Ensure the csrftoken cookie is set before any state-changing request. */
async function ensureCsrf(): Promise<void> {
    if (!getCookie('csrftoken')) {
        await fetch('/api/csrf/', { credentials: 'include' });
    }
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const method = (options.method || 'GET').toUpperCase();
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> | undefined),
    };

    if (method !== 'GET') {
        await ensureCsrf();
        const token = getCookie('csrftoken');
        if (token) headers['X-CSRFToken'] = token;
    }

    const res = await fetch(url, {
        credentials: 'include',
        ...options,
        method,
        headers,
    });

    let data: any = null;
    try {
        data = await res.json();
    } catch {
        // no JSON body
    }

    if (!res.ok) {
        const message = (data && data.detail) || `Request failed (${res.status})`;
        throw new Error(message);
    }
    return data as T;
}

export const api = {
    login: (username: string, password: string, role: RoleType) =>
        request<CurrentUser>('/api/login/', {
            method: 'POST',
            body: JSON.stringify({ username, password, role }),
        }),

    logout: () => request<{ detail: string }>('/api/logout/', { method: 'POST' }),

    me: () => request<CurrentUser>('/api/me/'),

    studentStatus: () => request<StudentStatus>('/api/student/status/'),

    deptDetail: () => request<DeptDetail>('/api/student/dept_detail/'),

    labDetail: () => request<LabDetail>('/api/student/lab_detail/'),

    sectionQueue: () => request<SectionQueue>('/api/section/queue/'),

    sectionSave: (approvals: Record<string, boolean>) =>
        request<{ detail: string }>('/api/section/save/', {
            method: 'POST',
            body: JSON.stringify({ approvals }),
        }),

    submitIntake: (data: {
        hostel_block?: string;
        vacant_room_no?: string;
        btp_doc_title?: string;
        btp_form_no?: string;
        btp_plagiarism?: string;
        offer_letter_name?: string;
    }) =>
        request<{ ok: boolean; student: StudentStatus }>('/api/student/submit-intake/', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
};
