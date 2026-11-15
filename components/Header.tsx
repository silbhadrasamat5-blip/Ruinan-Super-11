"use client";

import { Lock, Unlock, ShieldCheck } from "lucide-react";
import { APP_CONFIG } from "@/lib/config";

interface Props {
  isAdmin: boolean;
  onAdminPress: () => void;
}

export default function Header({ isAdmin, onAdminPress }: Props) {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-sm border-b border-gray-100 shadow-sm">
      <div className="max-w-md mx-auto flex items-center justify-between px-4 h-14">
        {/* Logo + name */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-emerald-500 rounded-xl flex items-center justify-center shadow-sm">
            <span className="text-white font-black text-xs leading-none">S11</span>
          </div>
          <span className="font-bold text-base tracking-tight truncate max-w-[180px]">
            {APP_CONFIG.appName}
          </span>
        </div>

        {/* Admin lock button */}
        <button
          onClick={onAdminPress}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all
            ${isAdmin
              ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300"
              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
        >
          {isAdmin ? (
            <>
              <ShieldCheck size={14} />
              Admin
            </>
          ) : (
            <>
              <Lock size={14} />
              Admin
            </>
          )}
        </button>
      </div>
    </header>
  );
}
