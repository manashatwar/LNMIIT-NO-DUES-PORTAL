// ─── Types aligned to the existing Django backend (IIT-G section set) ─────────

export type RoleType =
  | 'Student'
  | 'BH1 Support'
  | 'BH2 Support'
  | 'BH3 Support'
  | 'BH5 Support'
  | 'Hostel Support'
  | 'Store Release'
  | 'LUCS'
  | 'Sports'
  | 'Medical Unit'
  | 'NAD Cell'
  | 'Library'
  | 'Faculty'
  | 'HOD'
  | 'Account';

// Keys returned by the backend for a student's clearance matrix
export type SectionKey =
  | 'department'
  | 'labs'
  | 'bh1_support'
  | 'bh2_support'
  | 'bh3_support'
  | 'bh5_support'
  | 'library'
  | 'store_release'
  | 'lucs'
  | 'sports'
  | 'medical_unit'
  | 'nad_cell'
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
  intake?: {
    submitted: boolean;
    hostel_block?: string;
    vacant_room_no?: string;
    btp_doc_title?: string;
    btp_form_no?: string;
    btp_plagiarism?: string;
    offer_letter_name?: string;
  };
  feedbacks?: Partial<Record<SectionKey, string>>;
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
  feedback?: string;
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
