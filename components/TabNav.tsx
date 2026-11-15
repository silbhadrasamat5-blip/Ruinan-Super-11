"use client";

import { Users, Wallet, Swords, BarChart3 } from "lucide-react";
import type { TabId } from "@/types";

interface Props {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const TABS: { id: TabId; label: string; Icon: React.ElementType }[] = [
  { id: "squad",    label: "Squad",    Icon: Users      },
  { id: "payments", label: "Payments", Icon: Wallet     },
  { id: "matches",  label: "Matches",  Icon: Swords     },
  { id: "stats",    label: "Stats",    Icon: BarChart3  },
];

export default function TabNav({ activeTab, onTabChange }: Props) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-100 safe-area-inset-bottom shadow-lg">
      <div className="max-w-md mx-auto flex">
        {TABS.map(({ id, label, Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-3 transition-colors
                ${active ? "text-emerald-600" : "text-gray-400 hover:text-gray-600"}`}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
              <span className={`text-[10px] font-${active ? "700" : "500"} tracking-wide`}>
                {label}
              </span>
              {active && (
                <span className="absolute bottom-0 w-10 h-0.5 bg-emerald-500 rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
