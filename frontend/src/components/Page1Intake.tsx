import React, { useState } from 'react';
import { StudentProfile, OCRResult } from '../types';
import { 
  Upload, 
  FileText, 
  CheckCircle2, 
  Download, 
  Mail, 
  Briefcase, 
  Sparkles
} from 'lucide-react';

interface Page1Props {
  studentProfile: StudentProfile;
  setStudentProfile: React.Dispatch<React.SetStateAction<StudentProfile>>;
  ocrResult: OCRResult | null;
  setOcrResult: React.Dispatch<React.SetStateAction<OCRResult | null>>;
  onNext: () => void;
}

export const Page1Intake: React.FC<Page1Props> = ({
  studentProfile,
  setStudentProfile,
  ocrResult,
  setOcrResult,
  onNext
}) => {
  const [libraryFileName, setLibraryFileName] = useState<string>('BTP_Form_Signed.pdf');
  const [tpcFileName, setTpcFileName] = useState<string>('Offer_Letter.pdf');
  const [isSimulatingOcr, setIsSimulatingOcr] = useState<boolean>(false);

  const handleLibraryUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setLibraryFileName(file.name);
      
      // Simulate OCR Extraction
      setIsSimulatingOcr(true);
      setTimeout(() => {
        setOcrResult({
          title: 'Advanced Computer Networks & Security Protocols',
          author: studentProfile.name,
          plagiarism: 8.5,
          publisher: 'LNMIIT Technical Publications',
          year: 2026,
          detectedName: studentProfile.name,
          detectedRoll: studentProfile.rollNo,
          status: 'SUCCESS'
        });
        setIsSimulatingOcr(false);
      }, 1200);
    }
  };

  const handleTpcUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setTpcFileName(e.target.files[0].name);
    }
  };

  const getWardenEmail = (hostel: string) => {
    const code = hostel.toLowerCase();
    return `${code}-support@lnmiit.ac.in`;
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fadeIn">
      {/* Top Header Card */}
      <div className="glass-panel p-6 sm:p-8 rounded-2xl relative overflow-hidden border border-cyan-500/20">
        <div className="flex items-center gap-3 mb-2">
          <span className="px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-400 text-xs font-bold uppercase tracking-wider border border-cyan-500/30">
            Page 1 • Intake & Uploads
          </span>
          <span className="text-xs text-slate-400">Offline Verification Submissions</span>
        </div>

        <h2 className="text-2xl sm:text-3xl font-extrabold text-white font-heading">
          Student Intake & <span className="text-gradient">Verification Uploads</span>
        </h2>
        <p className="mt-2 text-sm text-slate-300 max-w-2xl">
          Submit required physical verification forms, hostel vacancy details, and placement offer letters. Documents are auto-analyzed via OCR before routing to respective section officers.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Forms & Uploads (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Section 1: Library BTP Submission */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-700/80 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs font-mono">
                  1
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-heading">Library BTP Document Submission</h3>
                  <p className="text-xs text-slate-400">Upload signed BTP clearance form</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => alert('Downloading official LNMIIT BTP Clearance Form PDF...')}
                className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-semibold bg-blue-500/10 px-3 py-1.5 rounded-lg border border-blue-500/20 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Form</span>
              </button>
            </div>

            {/* Drag and drop uploader */}
            <div className="border-2 border-dashed border-slate-700 hover:border-blue-500/50 rounded-2xl p-6 text-center transition-all bg-slate-900/40 relative group">
              <input
                type="file"
                accept=".pdf,.jpg,.png"
                onChange={handleLibraryUpload}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
              />
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-200">
                    <span className="text-blue-400">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Supports: PDF, JPG, PNG (Strict limit: <span className="text-amber-400 font-bold font-mono">Max 10 KB - 50 KB</span>)
                  </p>
                </div>
                {libraryFileName && (
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs border border-blue-500/30 font-mono">
                    <FileText className="w-3.5 h-3.5" />
                    <span>{libraryFileName}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Hostel Details & Routing */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-700/80 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs font-mono">
                2
              </div>
              <div>
                <h3 className="text-base font-bold text-white font-heading">Hostel Details & Automated Routing</h3>
                <p className="text-xs text-slate-400">Room vacancy verification</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1.5">Hostel Block</label>
                <select
                  value={studentProfile.hostel}
                  onChange={(e) => setStudentProfile({ ...studentProfile, hostel: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="BH1">Boys Hostel 1 (BH1)</option>
                  <option value="BH2">Boys Hostel 2 (BH2)</option>
                  <option value="BH3">Boys Hostel 3 (BH3)</option>
                  <option value="BH4">Boys Hostel 4 (BH4)</option>
                  <option value="BH5">Boys Hostel 5 (BH5)</option>
                  <option value="GH1">Girls Hostel 1 (GH1)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1.5">Vacant Room Number</label>
                <input
                  type="text"
                  value={studentProfile.vacantRoom}
                  onChange={(e) => setStudentProfile({ ...studentProfile, vacantRoom: e.target.value })}
                  placeholder="e.g. 123"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Warden Routing badge (Annotated CONF in image.png) */}
            <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/30 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-amber-400" />
                <span className="text-slate-300 font-medium">Warden Routing:</span>
              </div>
              <span className="font-mono text-amber-300 font-bold bg-amber-500/20 px-2.5 py-1 rounded border border-amber-500/30">
                {getWardenEmail(studentProfile.hostel)}
              </span>
            </div>
          </div>

          {/* Section 3: TPC Placement Section */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-700/80 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-xs font-mono">
                3
              </div>
              <div>
                <h3 className="text-base font-bold text-white font-heading">TPC Placement Section</h3>
                <p className="text-xs text-slate-400">Upload official placement offer letter</p>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl bg-slate-950/60 border border-slate-800">
              <div className="flex items-center gap-3">
                <Briefcase className="w-5 h-5 text-cyan-400" />
                <div>
                  <p className="text-xs font-semibold text-white">Upload Offer Letter</p>
                  <p className="text-[11px] text-slate-400">PDF, JPG, PNG (Max 10MB)</p>
                </div>
              </div>

              <label className="px-4 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 text-xs font-bold cursor-pointer transition-colors">
                <span>{tpcFileName ? 'Change File' : 'Browse'}</span>
                <input type="file" onChange={handleTpcUpload} className="hidden" />
              </label>
            </div>
            {tpcFileName && (
              <p className="text-xs text-emerald-400 font-mono flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Attached: {tpcFileName}</span>
              </p>
            )}
          </div>
        </div>

        {/* Right Column: OCR Auto-Detection Live Review Card (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="glass-panel p-6 rounded-2xl border border-blue-500/30 relative overflow-hidden bg-gradient-to-b from-slate-900/90 to-blue-950/20">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-400 animate-pulse" />
                <h3 className="text-base font-bold text-white font-heading">OCR Review (Auto-detected)</h3>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold font-mono">
                {isSimulatingOcr ? 'Analyzing...' : 'Processing Complete ✓'}
              </span>
            </div>

            {isSimulatingOcr ? (
              <div className="py-12 text-center space-y-3">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs text-slate-400">Extracting text & matching metadata via Tesseract OCR...</p>
              </div>
            ) : ocrResult ? (
              <div className="space-y-4 text-xs animate-fadeIn">
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                  <div>
                    <span className="text-slate-500 font-medium block">Title of Document</span>
                    <span className="text-white font-semibold">{ocrResult.title}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-900">
                    <div>
                      <span className="text-slate-500 font-medium block">Author Name</span>
                      <span className="text-slate-200">{ocrResult.author}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-medium block">Plagiarism %</span>
                      <span className="text-emerald-400 font-mono font-bold">{ocrResult.plagiarism}%</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-900">
                    <div>
                      <span className="text-slate-500 font-medium block">Publisher</span>
                      <span className="text-slate-200">{ocrResult.publisher}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-medium block">Year of Publication</span>
                      <span className="text-slate-200 font-mono">{ocrResult.year}</span>
                    </div>
                  </div>
                </div>

                {/* Identity Verification Advisory */}
                <div className="p-3 rounded-xl bg-blue-950/50 border border-blue-500/30 space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">OCR Student Name Match:</span>
                    <span className="text-emerald-400 font-bold">100% Match ({ocrResult.detectedName})</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">OCR Roll No Match:</span>
                    <span className="text-emerald-400 font-bold font-mono">24UCC174 Verified</span>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-6 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={onNext}
                className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-all shadow-lg shadow-blue-500/20"
              >
                Confirm & Submit All Intake Uploads
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
