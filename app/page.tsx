"use client";

import { useState, useEffect } from "react";
import Header from "@/components/Header";
import TabNav from "@/components/TabNav";
import AdminPinModal from "@/components/AdminPinModal";
import SquadTab from "@/components/tabs/SquadTab";
import PaymentsTab from "@/components/tabs/PaymentsTab";
import MatchesTab from "@/components/tabs/MatchesTab";
import StatsTab from "@/components/tabs/StatsTab";
import type { TabId } from "@/types";

const ADMIN_SESSION_KEY = "rs11_admin";

export default function Home() {
  const [activeTab,   setActiveTab]   = useState<TabId>("squad");
  const [isAdmin,     setIsAdmin]     = useState(false);
  const [showPin,     setShowPin]     = useState(false);

  /* Restore admin state within the same browser session */
  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsAdmin(sessionStorage.getItem(ADMIN_SESSION_KEY) === "1");
    }
  }, []);

  function handlePinSuccess() {
    setIsAdmin(true);
    sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
    setShowPin(false);
  }

  function handleAdminToggle() {
    if (isAdmin) {
      setIsAdmin(false);
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
    } else {
      setShowPin(true);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto relative">
      <Header isAdmin={isAdmin} onAdminPress={handleAdminToggle} />

      {/* Tab content — padded top (header) + bottom (tab nav) */}
      <main className="pt-14">
        <div className={activeTab === "squad"    ? "block" : "hidden"}>
          <SquadTab
            isAdmin={isAdmin}
            onAdminRequired={() => setShowPin(true)}
          />
        </div>
        <div className={activeTab === "payments" ? "block" : "hidden"}>
          <PaymentsTab
            isAdmin={isAdmin}
            onAdminRequired={() => setShowPin(true)}
          />
        </div>
        <div className={activeTab === "matches"  ? "block" : "hidden"}>
          <MatchesTab
            isAdmin={isAdmin}
            onAdminRequired={() => setShowPin(true)}
            onNavigate={(tab) => setActiveTab(tab)}
          />
        </div>
        <div className={activeTab === "stats"    ? "block" : "hidden"}>
          <StatsTab />
        </div>
      </main>

      <TabNav activeTab={activeTab} onTabChange={setActiveTab} />

      {showPin && (
        <AdminPinModal
          onSuccess={handlePinSuccess}
          onClose={() => setShowPin(false)}
        />
      )}
    </div>
  );
}
