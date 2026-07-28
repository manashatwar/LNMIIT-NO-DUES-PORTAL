import React from 'react';
import { StudentProfile, RefundLedgerState, ExitType } from '../types';
import { GraduationCap, ShieldCheck, Download, X } from 'lucide-react';
import confetti from 'canvas-confetti';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface CertificateModalProps {
  studentProfile: StudentProfile;
  exitType: ExitType;
  refundLedger: RefundLedgerState;
  onClose: () => void;
}

export const CertificateModal: React.FC<CertificateModalProps> = ({
  studentProfile,
  exitType,
  refundLedger,
  onClose
}) => {
  const issueDate = new Date().toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const handleDownloadPDF = async () => {
    confetti({
      particleCount: 120,
      spread: 80,
      origin: { y: 0.6 }
    });

    const element = document.getElementById('certificate-print-area');
    if (element) {
      try {
        const canvas = await html2canvas(element, { scale: 2 });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const imgWidth = 210;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
        pdf.save(`LNMIIT_NoDues_Certificate_${studentProfile.rollNo}.pdf`);
      } catch (err) {
        window.print();
      }
    } else {
      window.print();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-lg flex items-center justify-center p-4 overflow-y-auto">
      <div className="max-w-3xl w-full glass-panel rounded-3xl border border-slate-700 shadow-2xl relative overflow-hidden my-8">
        
        {/* Modal Toolbar Header */}
        <div className="flex items-center justify-between p-4 px-6 bg-slate-900 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <span className="text-sm font-bold text-white font-heading">
              Official Digital No-Dues Certificate
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPDF}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-500/20 transition-all"
            >
              <Download className="w-4 h-4" />
              <span>Download Official PDF</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Certificate Layout (Printable) */}
        <div id="certificate-print-area" className="p-8 sm:p-12 bg-white text-slate-900 font-body relative space-y-8">
          
          {/* Watermark / Seal Background */}
          <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none">
            <GraduationCap className="w-96 h-96 text-slate-900" />
          </div>

          {/* Header */}
          <div className="text-center border-b-2 border-slate-900/10 pb-6">
            <div className="w-16 h-16 rounded-2xl bg-slate-900 text-white flex items-center justify-center mx-auto mb-3 shadow-md">
              <GraduationCap className="w-10 h-10" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight uppercase font-heading text-slate-900">
              The LNM Institute of Information Technology
            </h1>
            <p className="text-xs text-slate-600 font-semibold tracking-widest uppercase mt-1">
              Deemed University • Jaipur, Rajasthan, India
            </p>
            <div className="mt-4 inline-block px-4 py-1.5 rounded-full bg-slate-900 text-white text-xs font-bold tracking-wider uppercase font-mono">
              OFFICIAL NO-DUES CLEARANCE CERTIFICATE
            </div>
          </div>

          {/* Certificate Content Statement */}
          <div className="space-y-4 text-sm text-slate-700 leading-relaxed">
            <p>
              This is to certify that <strong>{studentProfile.name}</strong> (Roll No:{' '}
              <strong className="font-mono text-slate-900">{studentProfile.rollNo}</strong>), student of{' '}
              <strong>Department of {studentProfile.dept}</strong> (Hostel:{' '}
              <strong>{studentProfile.hostel}</strong>), has successfully completed exit formalities for{' '}
              <strong className="uppercase">{exitType.replace('_', ' ')}</strong>.
            </p>
            <p>
              All institutional clearance sections including Central Library, TPC Placement Cell, Warden Desk, Department HOD, Store, LUCS, Sports Council, Medical Cell, NAD Cell, Accounts Section, and Administration Office have verified and cleared all outstanding obligations.
            </p>
          </div>

          {/* Financial Refund Ledger Summary Table */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-2 text-xs">
            <h4 className="font-bold text-slate-900 uppercase tracking-wider font-heading mb-2">
              Financial Clearance & Caution Refund Ledger
            </h4>
            <div className="grid grid-cols-2 gap-2 text-slate-700">
              <span>Caution Money (Refundable):</span>
              <span className="font-mono font-bold text-right text-slate-900">
                + ₹{refundLedger.cautionMoney.toLocaleString('en-IN')}
              </span>
              <span>Total Outstanding Dues:</span>
              <span className="font-mono font-bold text-right text-rose-600">
                - ₹{refundLedger.totalDues.toLocaleString('en-IN')}
              </span>
              <span>Voluntary Welfare Fund Donation:</span>
              <span className="font-mono font-bold text-right text-amber-600">
                - ₹{refundLedger.voluntaryDonation.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="pt-2 border-t border-slate-300 flex justify-between font-bold text-slate-900 text-sm">
              <span>Net Refundable Amount:</span>
              <span className="font-mono text-emerald-700 text-base">
                ₹{refundLedger.netRefund.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {/* Signatures & Stamps */}
          <div className="grid grid-cols-3 gap-4 pt-12 text-center text-xs">
            <div>
              <div className="h-10 border-b border-slate-400 mb-1 flex items-end justify-center font-serif italic text-slate-700">
                Digitally Signed
              </div>
              <span className="font-bold text-slate-900 block">Section Officers</span>
              <span className="text-[10px] text-slate-500">Library / Warden / TPC</span>
            </div>
            <div>
              <div className="h-10 border-b border-slate-400 mb-1 flex items-end justify-center font-serif italic text-slate-700">
                Approved (CSE HOD)
              </div>
              <span className="font-bold text-slate-900 block">Head of Department</span>
              <span className="text-[10px] text-slate-500">Academic Unit</span>
            </div>
            <div>
              <div className="h-10 border-b border-slate-400 mb-1 flex items-end justify-center font-serif italic text-slate-700">
                Verified & Released
              </div>
              <span className="font-bold text-slate-900 block">Registrar / Administration</span>
              <span className="text-[10px] text-slate-500">LNMIIT Jaipur</span>
            </div>
          </div>

          {/* Footer Metadata */}
          <div className="pt-6 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-500 font-mono">
            <span>Issue Date: {issueDate}</span>
            <span>Certificate Verification ID: LNMIIT-ND-2026-948271</span>
          </div>
        </div>
      </div>
    </div>
  );
};
