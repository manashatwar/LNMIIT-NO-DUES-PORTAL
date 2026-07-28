export type ExitType = 'GRADUATION' | 'NEP_EXIT' | 'WITHDRAWAL' | 'ADMISSION_CANCEL';

export type SectionCode = 
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
  | 'ADMINISTRATION';

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type RoleType = 
  | 'STUDENT'
  | 'LIBRARIAN'
  | 'TPC_STAFF'
  | 'WARDEN'
  | 'HOD'
  | 'ACCOUNTS'
  | 'ADMINISTRATION';

export interface StudentProfile {
  name: string;
  rollNo: string;
  dept: string;
  hostel: string;
  vacantRoom: string;
  email: string;
}

export interface OCRResult {
  title: string;
  author: string;
  plagiarism: number;
  publisher: string;
  year: number;
  detectedName: string;
  detectedRoll: string;
  status: 'SUCCESS' | 'WARNING' | 'FAILED';
  mismatchWarning?: string;
}

export interface SectionStatusItem {
  code: SectionCode;
  name: string;
  category: 'TRI_GATE' | 'ACADEMIC_FIELD' | 'FINANCIAL' | 'FINAL';
  status: ApprovalStatus;
  decidedBy?: string;
  decidedAt?: string;
  feedbackComment?: string;
  documentName?: string;
  documentUrl?: string;
  lucsLink?: string;
  isRequired: boolean;
}

export interface PendingStudentRequest {
  id: string;
  name: string;
  rollNo: string;
  dept: string;
  hostel: string;
  exitType: ExitType;
  submittedAt: string;
  documents: {
    name: string;
    type: string;
    size: string;
    url: string;
    ocrData?: OCRResult;
  }[];
  sectionStatuses: Record<SectionCode, ApprovalStatus>;
}

export interface RefundLedgerState {
  cautionMoney: number;
  totalDues: number;
  voluntaryDonation: number;
  netRefund: number;
}
