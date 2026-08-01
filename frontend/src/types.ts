// ─── Types aligned to the redesigned backend (Design.md) ─────────────────────

export type RoleType =
  | 'STUDENT'
  | 'LIBRARY'
  | 'TPC'
  | 'WARDEN'
  | 'STORE'
  | 'LUCS'
  | 'SPORTS'
  | 'MEDICAL'
  | 'NAD'
  | 'DEPT'
  | 'HOD'
  | 'ACCOUNTS'
  | 'ADMINISTRATION'
  | 'ADMIN';

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type ExitType = 'GRADUATION' | 'NEP_EXIT' | 'WITHDRAWAL' | 'ADMISSION_CANCEL';

export interface CurrentUser {
  username: string;
  role: RoleType;
  name: string;
  department?: string;
  hostel?: string;
}

export interface SectionComment {
  body: string;
  author: string;
  is_system: boolean;
  created_at: string;
}

export interface SectionDocument {
  id: number;
  original_name: string;
  event_report_url: string | null;
  ocr_text: string;
  ocr_fields: Record<string, unknown> & { review?: Record<string, string> };
  download_url: string | null;
}

export interface SectionInfo {
  code: string;
  name: string;
  status: ApprovalStatus;
  actionable: boolean;
  is_upload_section: boolean;
  student_confirmed: boolean;
  needs_confirm: boolean;
  decided_by: string | null;
  decided_at: string | null;
  comments: SectionComment[];
  documents: SectionDocument[];
}

export interface IntakeState {
  required_uploads: string[];
  uploaded: string[];
  pending: string[];
  rejected: string[];   // only these sections need re-upload
}

export interface ClearanceRequest {
  id: number;
  exit_type: ExitType;
  overall_status: 'IN_PROGRESS' | 'CLEARED';
  fund_us_amount: string;
  vacant_room_no: string;
  intake_submitted: boolean;
  current_page: number;         // 1 = intake, 2 = dashboard
  intake: IntakeState;
  student: {
    name: string;
    roll_no: string;
    department: string;
    hostel: string;
    webmail: string;
  };
  sections: SectionInfo[];
  has_certificate: boolean;
}

export interface StudentRequestResponse {
  has_request: boolean;
  request?: ClearanceRequest;
  student?: { name: string; roll_no: string; department: string; hostel: string };
  exit_types?: ExitType[];
}

export interface QueueRow {
  request_id: number;
  section_status_id: number;
  roll_no: string;
  name: string;
  department: string;
  hostel: string;
  exit_type: ExitType;
  status: ApprovalStatus;
  actionable: boolean;
  vacant_room_no: string;
}

export interface SectionQueue {
  role: RoleType;
  heading: string;
  students: QueueRow[];
}

export interface SectionReview {
  request_id: number;
  student: { name: string; roll_no: string; department: string; hostel: string };
  vacant_room_no: string;
  section: SectionInfo;
  prerequisites?: SectionInfo[];   // for consolidators (HOD, Administration)
}

export interface CertificateData {
  request_id: number;
  student: string;
  roll_no: string;
  exit_type: ExitType;
  fund_us_amount: string;
  generated_at: string;
  sections: { code: string; name: string; approved_by: string | null; decided_at: string | null }[];
}
