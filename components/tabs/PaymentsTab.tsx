"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Lock, Plus, Copy, Check, ChevronDown, IndianRupee,
  TrendingUp, TrendingDown, Wallet, X, Loader2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { APP_CONFIG } from "@/lib/config";
import type { Match, MatchFee, KittyTransaction, Player } from "@/types";

interface Props {
  isAdmin: boolean;
  onAdminRequired: () => void;
}

export default function PaymentsTab({ isAdmin, onAdminRequired }: Props) {
  /* If not admin, show lock screen */
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] gap-4 px-8">
        <div className="bg-amber-100 rounded-full p-5">
          <Lock size={36} className="text-amber-500" />
        </div>
        <p className="text-lg font-bold text-center">Admin Access Required</p>
        <p className="text-sm text-gray-500 text-center">
          Payments & Kitty management is locked. Tap the Admin button in the header to enter your PIN.
        </p>
        <button
          onClick={onAdminRequired}
          className="mt-2 bg-emerald-500 text-white font-semibold px-6 py-3 rounded-2xl"
        >
          Enter Admin PIN
        </button>
      </div>
    );
  }

  return <PaymentsContent />;
}

/* ── Main content (shown only to admin) ── */
function PaymentsContent() {
  const [matches,     setMatches]     = useState<Match[]>([]);
  const [players,     setPlayers]     = useState<Player[]>([]);
  const [fees,        setFees]        = useState<MatchFee[]>([]);
  const [kitty,       setKitty]       = useState<KittyTransaction[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [copied,      setCopied]      = useState(false);
  const [showNewFee,  setShowNewFee]  = useState(false);
  const [showKitty,   setShowKitty]   = useState(false);
  const [kittyForm,   setKittyForm]   = useState({ type: "expense" as "income"|"expense", description: "", amount: "" });
  const [newFeeForm,  setNewFeeForm]  = useState({ matchId: "", amount: String(APP_CONFIG.defaultFeePerMatch), playerIds: [] as string[] });
  const [saving,      setSaving]      = useState(false);

  const selectedMatch = matches.find((m) => m.id === selectedMatchId) ?? null;
  const matchFees     = fees.filter((f) => f.match_id === selectedMatchId);
  const feePlayerMap  = Object.fromEntries(matchFees.map((f) => [f.player_id, f]));

  const totalCollected = matchFees.filter((f) => f.status === "paid").reduce((s, f) => s + Number(f.amount), 0);
  const totalPending   = matchFees.filter((f) => f.status === "pending").reduce((s, f) => s + Number(f.amount), 0);
  const kittyBalance   = kitty.reduce((s, t) => s + (t.type === "income" ? 1 : -1) * Number(t.amount), 0);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: m }, { data: p }, { data: f }, { data: k }] = await Promise.all([
      supabase.from("matches").select("*").order("match_date", { ascending: false }),
      supabase.from("players").select("*").order("name"),
      supabase.from("match_fees").select("*"),
      supabase.from("kitty_transactions").select("*").order("date", { ascending: false }),
    ]);
    if (m) { setMatches(m as Match[]); if (!selectedMatchId && m[0]) setSelectedMatchId(m[0].id); }
    if (p) setPlayers(p as Player[]);
    if (f) setFees(f as MatchFee[]);
    if (k) setKitty(k as KittyTransaction[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ── Toggle payment status ── */
  async function toggleStatus(fee: MatchFee) {
    const next = fee.status === "paid" ? "pending" : "paid";
    setFees((prev) => prev.map((f) => (f.id === fee.id ? { ...f, status: next } : f)));
    await supabase.from("match_fees").update({ status: next }).eq("id", fee.id);
  }

  /* ── Create fee entry ── */
  async function createFeeEntry() {
    if (!newFeeForm.matchId || newFeeForm.playerIds.length === 0) return;
    setSaving(true);
    const rows = newFeeForm.playerIds.map((pid) => ({
      match_id:  newFeeForm.matchId,
      player_id: pid,
      amount:    parseFloat(newFeeForm.amount) || APP_CONFIG.defaultFeePerMatch,
      status:    "pending" as const,
    }));
    const { data, error } = await supabase.from("match_fees").upsert(rows, { onConflict: "match_id,player_id" }).select();
    setSaving(false);
    if (!error && data) {
      setFees((prev) => {
        const updated = [...prev];
        (data as MatchFee[]).forEach((d) => {
          const idx = updated.findIndex((f) => f.id === d.id);
          if (idx >= 0) updated[idx] = d; else updated.push(d);
        });
        return updated;
      });
      setSelectedMatchId(newFeeForm.matchId);
      setShowNewFee(false);
      setNewFeeForm({ matchId: "", amount: String(APP_CONFIG.defaultFeePerMatch), playerIds: [] });
    }
  }

  /* ── Add kitty transaction ── */
  async function addKittyTransaction() {
    if (!kittyForm.description || !kittyForm.amount) return;
    setSaving(true);
    const { data, error } = await supabase.from("kitty_transactions").insert({
      type: kittyForm.type,
      description: kittyForm.description.trim(),
      amount: parseFloat(kittyForm.amount),
    }).select().single();
    setSaving(false);
    if (!error && data) {
      setKitty((prev) => [data as KittyTransaction, ...prev]);
      setKittyForm({ type: "expense", description: "", amount: "" });
      setShowKitty(false);
    }
  }

  /* ── WhatsApp copy ── */
  function copyForWhatsApp() {
    if (!selectedMatch) return;
    const matchLabel = selectedMatch.type === "official"
      ? `vs ${selectedMatch.opponent_name ?? "Opponent"}`
      : "Friendly Match";
    const paidList   = matchFees
      .filter((f) => f.status === "paid")
      .map((f) => `  ✅ ${players.find((p) => p.id === f.player_id)?.name ?? "?"} (${APP_CONFIG.currency}${f.amount})`)
      .join("\n");
    const pendingList = matchFees
      .filter((f) => f.status === "pending")
      .map((f) => `  ⏳ ${players.find((p) => p.id === f.player_id)?.name ?? "?"} (${APP_CONFIG.currency}${f.amount})`)
      .join("\n");
    const text = `🏆 *${APP_CONFIG.appName}*\n⚽ Match ${matchLabel} | ${selectedMatch.match_date}\n\n💰 *Payment Status*\n${paidList || "  (none)"}\n${pendingList || ""}\n\n✅ Collected: ${APP_CONFIG.currency}${totalCollected}\n⏳ Pending:   ${APP_CONFIG.currency}${totalPending}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-40">
        <Loader2 className="animate-spin text-emerald-500" size={28} />
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-28 scroll-panel overflow-y-auto space-y-4">

      {/* ── Kitty Balance Card ── */}
      <div className={`rounded-2xl p-4 text-white shadow-md ${kittyBalance >= 0 ? "bg-emerald-500" : "bg-red-500"}`}>
        <p className="text-xs font-semibold opacity-80 uppercase tracking-widest mb-1">Team Kitty Balance</p>
        <p className="text-4xl font-black">
          {APP_CONFIG.currency}{Math.abs(kittyBalance).toLocaleString()}
        </p>
        <p className="text-xs opacity-70 mt-1">{kittyBalance >= 0 ? "In surplus" : "In deficit"}</p>
        <button
          onClick={() => setShowKitty(true)}
          className="mt-3 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-4 py-1.5 rounded-full transition-colors"
        >
          + Add Transaction
        </button>
      </div>

      {/* ── Match selector & new fee button ── */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <select
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white appearance-none pr-8 outline-none focus:border-emerald-400"
            value={selectedMatchId ?? ""}
            onChange={(e) => setSelectedMatchId(e.target.value || null)}
          >
            <option value="">Select a match…</option>
            {matches.map((m) => (
              <option key={m.id} value={m.id}>
                {m.type === "official" ? `vs ${m.opponent_name}` : "Friendly"} — {m.match_date}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
        <button
          onClick={() => setShowNewFee(true)}
          className="flex items-center gap-1 bg-emerald-500 text-white text-sm font-semibold px-3 py-2.5 rounded-xl whitespace-nowrap"
        >
          <Plus size={15} /> Fee Entry
        </button>
      </div>

      {/* ── Totals ── */}
      {selectedMatchId && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-green-50 border border-green-100 rounded-2xl p-4">
            <p className="text-xs text-green-600 font-semibold mb-1">Collected</p>
            <p className="text-2xl font-black text-green-700">{APP_CONFIG.currency}{totalCollected}</p>
          </div>
          <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
            <p className="text-xs text-red-500 font-semibold mb-1">Pending</p>
            <p className="text-2xl font-black text-red-600">{APP_CONFIG.currency}{totalPending}</p>
          </div>
        </div>
      )}

      {/* ── Player payment list ── */}
      {selectedMatchId && matchFees.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="font-semibold text-sm">Player Payments</p>
            <button
              onClick={copyForWhatsApp}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors
                ${copied ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? "Copied!" : "WhatsApp"}
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {players
              .filter((p) => feePlayerMap[p.id])
              .map((player) => {
                const fee = feePlayerMap[player.id];
                const paid = fee.status === "paid";
                return (
                  <div key={player.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      {player.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={player.avatar_url} alt={player.name} className="w-9 h-9 rounded-full object-cover" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
                          <span className="text-sm font-bold text-gray-400">{player.name[0]}</span>
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-semibold">{player.name}</p>
                        <p className="text-xs text-gray-400">{APP_CONFIG.currency}{fee.amount}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => toggleStatus(fee)}
                      className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors
                        ${paid
                          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                          : "bg-red-100 text-red-600 hover:bg-red-200"}`}
                    >
                      {paid ? "Paid" : "Pending"}
                    </button>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {selectedMatchId && matchFees.length === 0 && (
        <p className="text-center text-sm text-gray-400 py-6">No payment entries for this match yet.</p>
      )}

      {/* ── Kitty transactions ── */}
      {kitty.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="font-semibold text-sm flex items-center gap-2"><Wallet size={15} /> Kitty Ledger</p>
          </div>
          <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
            {kitty.map((t) => (
              <div key={t.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2.5">
                  {t.type === "income"
                    ? <TrendingUp size={16} className="text-emerald-500 shrink-0" />
                    : <TrendingDown size={16} className="text-red-400 shrink-0" />}
                  <div>
                    <p className="text-sm font-medium">{t.description}</p>
                    <p className="text-xs text-gray-400">{t.date}</p>
                  </div>
                </div>
                <p className={`text-sm font-bold ${t.type === "income" ? "text-emerald-600" : "text-red-500"}`}>
                  {t.type === "income" ? "+" : "-"}{APP_CONFIG.currency}{t.amount}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── New Fee Entry bottom sheet ── */}
      {showNewFee && (
        <BottomSheet title="Create Fee Entry" onClose={() => setShowNewFee(false)}>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 font-semibold mb-1 block">Select Match</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white outline-none focus:border-emerald-400"
                value={newFeeForm.matchId}
                onChange={(e) => setNewFeeForm((f) => ({ ...f, matchId: e.target.value }))}
              >
                <option value="">Choose a match…</option>
                {matches.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.type === "official" ? `vs ${m.opponent_name}` : "Friendly"} — {m.match_date}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 font-semibold mb-1 block">Fee per Player ({APP_CONFIG.currency})</label>
              <input
                type="number"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-400"
                value={newFeeForm.amount}
                onChange={(e) => setNewFeeForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-semibold mb-1 block">Select Players ({newFeeForm.playerIds.length} selected)</label>
              <div className="border border-gray-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                {players.map((p) => {
                  const checked = newFeeForm.playerIds.includes(p.id);
                  return (
                    <label key={p.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setNewFeeForm((f) => ({
                            ...f,
                            playerIds: checked
                              ? f.playerIds.filter((id) => id !== p.id)
                              : [...f.playerIds, p.id],
                          }))
                        }
                        className="accent-emerald-500 w-4 h-4"
                      />
                      {p.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.avatar_url} alt={p.name} className="w-7 h-7 rounded-full object-cover" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-400">
                          {p.name[0]}
                        </div>
                      )}
                      <span className="text-sm">{p.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={() => setShowNewFee(false)} className="flex-1 border border-gray-200 py-3 rounded-xl text-sm font-semibold text-gray-600">Cancel</button>
            <button
              onClick={createFeeEntry}
              disabled={saving || !newFeeForm.matchId || newFeeForm.playerIds.length === 0}
              className="flex-1 bg-emerald-500 disabled:opacity-50 text-white py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
            >
              {saving && <Loader2 size={14} className="animate-spin" />} Create
            </button>
          </div>
        </BottomSheet>
      )}

      {/* ── Add Kitty transaction bottom sheet ── */}
      {showKitty && (
        <BottomSheet title="Add Kitty Transaction" onClose={() => setShowKitty(false)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {(["expense", "income"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setKittyForm((f) => ({ ...f, type: t }))}
                  className={`py-3 rounded-xl text-sm font-semibold capitalize transition-colors
                    ${kittyForm.type === t
                      ? t === "income" ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
                      : "bg-gray-100 text-gray-500"}`}
                >
                  {t === "income" ? "➕ Income" : "➖ Expense"}
                </button>
              ))}
            </div>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-400"
              placeholder="Description *"
              value={kittyForm.description}
              onChange={(e) => setKittyForm((f) => ({ ...f, description: e.target.value }))}
            />
            <input
              type="number"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-400"
              placeholder={`Amount (${APP_CONFIG.currency}) *`}
              value={kittyForm.amount}
              onChange={(e) => setKittyForm((f) => ({ ...f, amount: e.target.value }))}
            />
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={() => setShowKitty(false)} className="flex-1 border border-gray-200 py-3 rounded-xl text-sm font-semibold text-gray-600">Cancel</button>
            <button
              onClick={addKittyTransaction}
              disabled={saving || !kittyForm.description || !kittyForm.amount}
              className="flex-1 bg-emerald-500 disabled:opacity-50 text-white py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
            >
              {saving && <Loader2 size={14} className="animate-spin" />} Add
            </button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

/* ── Reusable bottom sheet ── */
function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
      <div className="bg-white w-full max-w-md rounded-t-3xl p-6 pb-8 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={22} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
