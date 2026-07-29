// ─── Types aligned to the existing Django backend (IIT-G section set) ─────────

export type RoleType =
  | 'Student'
  | 'Caretaker'
  | 'Warden'
  | 'Gymkhana'
  | 'OnlineCC'
  | 'CC'
  | 'Thesis Manager'
  | 'Library'
  | 'Assistant Registrar'
  | 'Faculty'
  | 'Lab'
  | 'HOD'
  | 'Account';

// Keys returned by the backend for a student's clearance matrix
export type SectionKey =
  | 'caretaker'
  | 'gymkhana'
  | 'online_cc'
  | 'department'
  | 'labs'
  | 'warden'
  | 'library'
  | 'cc'
  | 'thesis'
  | 'assistant_registrar'
  | 'hod'
  | 'account';

export interface CurrentUser {
  username: string;
  role: RoleType;
  name: string;
  dept?: string;
  hostel?: string;
}

export interface StudentStatus {
  id: number;
  name: string;
  roll: number;
  webmail: string;
  dept: string;
  hostel: string;
  sections: Record<SectionKey, boolean>;
}

export interface QueueStudent {
  id: number;
  roll: number;
  name: string;
  webmail: string;
  approved: boolean;
  hostel?: string;
  vacant_room_no?: string;
  btp_doc_title?: string;
  btp_form_no?: string;
  btp_plagiarism?: string;
  offer_letter_name?: string;
}

export interface SectionQueue {
  role: RoleType;
  heading: string;
  students: QueueStudent[];
}

export interface DetailItem {
  name: string;
  approved: boolean;
}

export interface DeptDetail {
  dept: string;
  items: DetailItem[];
}

export interface LabDetail {
  items: DetailItem[];
}
