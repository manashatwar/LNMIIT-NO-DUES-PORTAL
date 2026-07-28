import React from 'react';
import { RoleType } from '../types';
import { 
  GraduationCap, 
  ShieldCheck, 
  UserCheck, 
  RotateCcw
} from 'lucide-react';

interface NavbarProps {
  activeRole: RoleType;
  setActiveRole: (role: RoleType) => void;
  activePage: number;
  setActivePage: (page: number) => void;
  clearedCount: number;
  totalSections: number;
  onResetData: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeRole,
  setActiveRole,
  activePage,
  setActivePage,
  clearedCount,
  totalSections,
  onResetData
}) => {
  const pages = [
    { id: 0, label: 'Page 0: Initiation & Gate', short: 'P0: Gate' },
    { id: 1, label: 'Page 1: Intake & Uploads', short: 'P1: Uploads' },
    { id: 2, label: 'Page 2: Tri-Gate Verification', short: 'P2: Tri-Gate' },
    { id: 3, label: 'Page 3: Department & Field', short: 'P3: Dept' },
    { id: 4, label: 'Page 4: Accounts & Release', short: 'P4: Release' },
  ];

  const roles: { type: RoleType; label: string; badge: string }[] = [
    { type: 'STUDENT', label: 'Student View', badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    { type: 'LIBRARIAN', label: 'Librarian Desk', badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
    { type: 'TPC_STAFF', label: 'TPC Officer', badge: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
    { type: 'WARDEN', label: 'BH1 Warden', badge: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
    { type: 'HOD', label: 'HOD | CSE', badge: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' },
    { type: 'ACCOUNTS', label: 'Accounts Officer', badge: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
    { type: 'ADMINISTRATION', label: 'Administration', badge: 'bg-rose-500/20 text-rose-400 border-rose-500/30' },
  ];

  return (
    <header className="sticky top-0 z-50 glass-panel border-b border-slate-700/50 bg-slate-900/90 backdrop-blur-xl">
      {/* Top Banner */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <GraduationCap className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white font-heading">
                LNMIIT <span className="text-gradient">No Dues Portal</span>
              </h1>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                v2026.2
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Student Exit Clearance & Automated Hierarchy Verification Engine
            </p>
          </div>
        </div>

        {/* Global Progress & Actions */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Progress Indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-medium text-slate-300">Progress:</span>
            <span className="text-xs font-bold text-emerald-400 font-mono">
              {clearedCount} / {totalSections} Cleared
            </span>
          </div>

          {/* Active Role Dropdown / Selector */}
          <div className="flex items-center gap-2 bg-slate-800/90 p-1 rounded-xl border border-slate-700">
            <UserCheck className="w-4 h-4 ml-2 text-slate-400" />
            <select
              value={activeRole}
              onChange={(e) => setActiveRole(e.target.value as RoleType)}
              className="bg-transparent text-xs font-semibold text-white focus:outline-none cursor-pointer pr-3 py-1"
            >
              {roles.map((r) => (
                <option key={r.type} value={r.type} className="bg-slate-900 text-white">
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {/* Reset simulation */}
          <button
            onClick={onResetData}
            title="Reset Simulation State"
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors border border-slate-700"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stepper Tabs Navigation */}
      <div className="border-t border-slate-800 bg-slate-950/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex overflow-x-auto no-scrollbar">
          {pages.map((p) => {
            const isActive = activePage === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setActivePage(p.id)}
                className={`flex items-center gap-2 py-3 px-4 border-b-2 text-xs font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    isActive
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {p.id}
                </span>
                <span className="hidden sm:inline">{p.label}</span>
                <span className="sm:hidden">{p.short}</span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
