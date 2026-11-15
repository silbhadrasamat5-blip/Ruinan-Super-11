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
const PLAYER_SESSION_KEY = "rs11_player";

export default function Home() {
  const [activeTab,   setActiveTab]   = useState<TabId>("squad");
  const [isAdmin,     setIsAdmin]     = useState(false);
  const [isPlayer,    setIsPlayer]    = useState(false);
  const [pinMode,     setPinMode]     = useState<"admin" | "player" | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsAdmin(sessionStorage.getItem(ADMIN_SESSION_KEY) === "1");
      setIsPlayer(sessionStorage.getItem(PLAYER_SESSION_KEY) === "1");
    }
  }, []);

  function handlePinSuccess(role: "admin" | "player") {
    if (role === "admin") {
      setIsAdmin(true);
      setIsPlayer(true);
      sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
      sessionStorage.setItem(PLAYER_SESSION_KEY, "1");
    } else {
      setIsPlayer(true);
      sessionStorage.setItem(PLAYER_SESSION_KEY, "1");
    }
    setPinMode(null);
  }

  function handleAdminToggle() {
    if (isAdmin) {
      setIsAdmin(false);
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
    } else {
      setPinMode("admin");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto relative">
      <Header isAdmin={isAdmin} onAdminPress={handleAdminToggle} />

      <main className="pt-14">
        <div className={activeTab === "squad"    ? "block" : "hidden"}>
          <SquadTab
            isAdmin={isAdmin}
            isPlayer={isPlayer}
            onAdminRequired={() => setPinMode("admin")}
            onPlayerRequired={() => setPinMode("player")}
          />
        </div>
        <div className={activeTab === "payments" ? "block" : "hidden"}>
          <PaymentsTab
            isAdmin={isAdmin}
            onAdminRequired={() => setPinMode("admin")}
          />
        </div>
        <div className={activeTab === "matches"  ? "block" : "hidden"}>
          <MatchesTab
            isAdmin={isAdmin}
            onAdminRequired={() => setPinMode("admin")}
            onNavigate={(tab) => setActiveTab(tab)}
          />
        </div>
        <div className={activeTab === "stats"    ? "block" : "hidden"}>
          <StatsTab />
        </div>
      </main>

      <TabNav activeTab={activeTab} onTabChange={setActiveTab} />

      {pinMode && (
        <AdminPinModal
          mode={pinMode}
          onSuccess={handlePinSuccess}
          onClose={() => setPinMode(null)}
        />
      )}
    </div>
  );
}
