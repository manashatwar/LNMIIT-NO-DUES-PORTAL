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
  | 'HOD'
  | 'ACCOUNTS'
  | 'ADMINISTRATION'
  | 'LAB'      // department lab in-charge (login created by their HOD)
  | 'ADMIN';

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type ExitType = 'GRADUATION' | 'WITHDRAWAL' | 'ADMISSION_CANCEL';

export interface CurrentUser {
  username: string;
  role: RoleType;
  name: string;
  department?: string;
  hostel?: string;
  lab?: string;        // lab in-charges only
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
  decided_by: string | null;
  decided_at: string | null;
  comments: SectionComment[];
  documents: SectionDocument[];
  checklist?: { label: string; done: boolean }[];     // Administration: what to complete at the office
  waiting_for?: string[];   // earlier sections it still waits for, for this student's exit type (no TPC on a withdrawal)
}

// Administration's checklist for one request (e.g. "Physical ID card submitted"):
// its office ticks each item; Approve is locked until all are ticked.
export interface ChecklistEntry {
  id: number;
  label: string;
  done: boolean;
  by: string | null;     // who ticked it
  at: string | null;
}

export interface IntakeState {
  required_uploads: string[];
  uploaded: string[];
  pending: string[];
  rejected: string[];   // only these sections need re-upload
}

// ─── Department labs (HOD-managed hierarchy, cleared before HOD) ─────────────

export interface LabEntry {
  lab_id: number;
  name: string;
  incharge_name: string;
  level: number;
  status: ApprovalStatus;
  sent: boolean;               // student has sent the request to this lab
  sent_at: string | null;
  actionable: boolean;         // sent, and every earlier level approved
  decided_by: string | null;
  decided_at: string | null;
  reason: string | null;       // the lab's rejection reason, when REJECTED
  comments?: SectionComment[]; // student view only
}

export interface LabLevel {
  level: number;               // labs on the same level get the request together
  sent: boolean;
  approved: boolean;
  labs: LabEntry[];
}

export interface LabChain {
  enabled: boolean;            // false = no labs apply (department has none)
  started: boolean;            // false = `levels` is a preview of the hierarchy
  cleared: boolean;            // every lab approved -> request is with HOD
  total: number;
  approved: number;
  levels: LabLevel[];
  next_level: number | null;
  can_send: boolean;
}

export interface LabProgress {
  total: number;
  approved: number;
  started: boolean;
  cleared: boolean;
}

export interface HodLab {
  id: number;
  name: string;
  incharge_name: string;
  email: string;               // the in-charge's login
  level: number;
  is_active: boolean;
  waiting: number;             // students currently waiting on this lab
}

export interface ClearanceRequest {
  id: number;
  exit_type: ExitType;
  overall_status: 'IN_PROGRESS' | 'CLEARED';
  fund_us_amount: string;
  donation_locked: string;      // why the donation can no longer change ("" = it can)
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
  labs: LabChain;
  refund: RefundStatus;
  has_certificate: boolean;
}

// The refund Accounts pays once every section has approved. The request is
// cleared (certificate unlocked) only once it's recorded as sent, or not due.
export interface RefundStatus {
  status: 'waiting' | 'pending' | 'sent' | 'not_due';   // waiting = sections still approving
  amount: string;            // sent: what was paid; otherwise the expected amount
  mode: string;              // NEFT | IMPS | RTGS | UPI | CHEQUE
  reference: string;         // UTR / transaction reference
  paid_on: string | null;
  account: string;           // the student's account, masked (••••0001)
}

// A request with its refund, as the refund sender sees it.
export interface RefundRow {
  request_id: number;
  roll_no: string;
  name: string;
  department: string;
  fund_us_amount: string;
  suggested_amount: string;  // caution money less the Fund-Us donation
  bank: { account_holder: string; account_no: string; ifsc: string; bank_name: string };
  refund: { amount: string; mode: string; reference: string; paid_on: string | null;
            recorded_by: string | null; recorded_at: string } | null;
}

// The Refund column of the refund sender's Approved tab.
export interface RefundRowState extends RefundRow {
  state: 'waiting' | 'ready' | 'sent' | 'not_due';   // waiting = other sections still approving
  waiting_for: string[];                               // ... which ones
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
  labs?: LabProgress;    // HOD queue only
  level?: number;        // lab queue only
  // Sections with staff sent by hand (Library, LUCS, NAD): who the head sent it to; null = with the head.
  assigned_to?: { id: number; name: string } | null;
  assigned_at?: string | null;
  ready?: boolean;       // student submitted Page 1 — can be sent to staff in bulk
  // Sections with staff levels (Accounts): where the request is in the levels.
  stage?: StageInfo;
  checklist?: ChecklistEntry[];   // Administration
  refund?: RefundRowState;        // Accounts, Approved tab of whoever sends refunds
}

// Staff levels (Accounts): a ready request moves up them by itself; either
// person on a level may approve. After the last level it comes to the main
// account (accounts@), whose approval is final.
export interface StageInfo {
  levels: number[];            // the staff levels, in order (every level with someone on it)
  current: number | null;      // waiting at this level; null = not at a level
  ready: boolean;              // prerequisites approved + student's cheque details confirmed
  final: boolean;              // every level approved: waiting for the main account's final approval
  blocked_by: string[];        // not ready: earlier sections still pending ([] = cheque details)
  waiting_on: string[];        // staff on the current level
  approved: { level: number; by: string | null; at: string }[];
}

// A section staff member (Library / LUCS / NAD Cell), as their head sees them.
export interface StaffMember {
  id: number;
  name: string;
  email: string;         // their login
  is_active: boolean;
  level: number | null;  // Accounts (levels) only
  refund_manager: boolean;   // Accounts: also sends students' refunds (the main account always does)
  pending: number;       // waiting for them now (by level: at their level)
  decided: number;       // decisions they've made
}

export interface SectionQueue {
  role: RoleType;
  heading: string;
  students: QueueRow[];
  // Section head only (library@ / lucs@ / nad@ / accounts@): manage staff;
  // 'manual' = send work by hand, 'levels' = requests move up staff levels (Accounts).
  can_manage_staff?: boolean;
  staff_mode?: 'manual' | 'levels';
  staff?: StaffMember[];
  ready_to_assign?: number;
  can_record_refunds?: boolean;   // Accounts: this person sends refunds (from the Approved tab)
  refunds_pending?: number;       // ... how many are ready to send
  refund_modes?: string[];        // ... and how they can be paid
}

export interface SectionReview {
  request_id: number;
  student: { name: string; roll_no: string; department: string; hostel: string };
  vacant_room_no: string;
  section: SectionInfo;
  intake: SectionInfo[];           // Page-2 intake docs (Library/TPC) — shown to every officer
  prerequisites?: SectionInfo[];   // Administration only (every other section)
  labs?: LabLevel[];               // department lab chain — HOD, Administration, lab in-charges
  stage?: StageInfo;               // Accounts staff levels
  checklist?: ChecklistEntry[];    // Administration
}

export interface CertificateData {
  request_id: number;
  student: string;
  roll_no: string;
  exit_type: ExitType;
  fund_us_amount: string;
  generated_at: string;
  sections: { code: string; name: string; approved_by: string | null; decided_at: string | null }[];
  labs: { name: string; level: number; approved_by: string | null; decided_at: string | null }[];
  stages: { section: string; level: number; approved_by: string | null; approved_at: string }[];
  refund: RefundStatus;
}
