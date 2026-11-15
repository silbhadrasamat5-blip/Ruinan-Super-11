"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Camera, Plus, Trash2, Users, Phone, Loader2, X } from "lucide-react";
import imageCompression from "browser-image-compression";
import { supabase } from "@/lib/supabase";
import type { Player } from "@/types";

interface Props {
  isAdmin: boolean;
  onAdminRequired: () => void;
}

const ROLES = ["Goalkeeper", "Defender", "Midfielder", "Forward", "All-rounder"];

const ROLE_COLORS: Record<string, string> = {
  Goalkeeper:   "bg-yellow-100 text-yellow-700",
  Defender:     "bg-blue-100  text-blue-700",
  Midfielder:   "bg-purple-100 text-purple-700",
  Forward:      "bg-red-100   text-red-700",
  "All-rounder":"bg-gray-100  text-gray-600",
};

export default function SquadTab({ isAdmin, onAdminRequired }: Props) {
  const [players, setPlayers]       = useState<Player[]>([]);
  const [loading, setLoading]       = useState(true);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [showAdd, setShowAdd]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [form, setForm]             = useState({
    name: "", role: "Midfielder", jersey_number: "", phone: "",
  });

  const fetchPlayers = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("players")
      .select("*")
      .order("jersey_number", { ascending: true, nullsFirst: false });
    if (data) setPlayers(data as Player[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchPlayers(); }, [fetchPlayers]);

  /* ── Availability toggle (public) ── */
  async function toggleAvailability(player: Player) {
    const next = !player.is_available;
    setPlayers((p) => p.map((x) => (x.id === player.id ? { ...x, is_available: next } : x)));
    await supabase
      .from("players")
      .update({ is_available: next })
      .eq("id", player.id);
  }

  /* ── Avatar upload (public) ── */
  async function handleAvatarUpload(player: Player, file: File) {
    setUploadingId(player.id);
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.3,
        maxWidthOrHeight: 500,
        useWebWorker: true,
      });
      const ext  = file.name.split(".").pop() ?? "jpg";
      const path = `${player.id}-${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, compressed, { upsert: true, contentType: compressed.type });
      if (upErr) throw upErr;

      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(path);

      await supabase
        .from("players")
        .update({ avatar_url: publicUrl })
        .eq("id", player.id);

      setPlayers((p) =>
        p.map((x) => (x.id === player.id ? { ...x, avatar_url: publicUrl } : x))
      );
    } catch (err) {
      console.error("Avatar upload failed:", err);
      alert("Photo upload failed. Please try again.");
    } finally {
      setUploadingId(null);
    }
  }

  /* ── Add player (admin) ── */
  async function addPlayer() {
    if (!isAdmin) { onAdminRequired(); return; }
    if (!form.name.trim()) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("players")
      .insert({
        name:          form.name.trim(),
        role:          form.role,
        jersey_number: form.jersey_number ? parseInt(form.jersey_number) : null,
        phone:         form.phone.trim() || null,
      })
      .select()
      .single();
    setSaving(false);
    if (!error && data) {
      setPlayers((p) => [...p, data as Player]);
      setForm({ name: "", role: "Midfielder", jersey_number: "", phone: "" });
      setShowAdd(false);
    }
  }

  /* ── Delete player (admin) ── */
  async function deletePlayer(id: string) {
    if (!isAdmin) { onAdminRequired(); return; }
    if (!confirm("Remove this player from the squad?")) return;
    await supabase.from("players").delete().eq("id", id);
    setPlayers((p) => p.filter((x) => x.id !== id));
  }

  const available = players.filter((p) => p.is_available).length;

  return (
    <div className="px-4 pt-4 pb-28 scroll-panel overflow-y-auto">
      {/* Summary row */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          <span className="font-semibold text-gray-800">{players.length}</span> players ·{" "}
          <span className="font-semibold text-emerald-600">{available} available</span>
        </p>
        <button
          onClick={() => { if (!isAdmin) { onAdminRequired(); return; } setShowAdd(true); }}
          className="flex items-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold px-3 py-2 rounded-full shadow-sm transition-colors"
        >
          <Plus size={15} /> Add Player
        </button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-2xl overflow-hidden shadow-sm">
              <div className="aspect-square skeleton" />
              <div className="p-2.5 bg-white space-y-2">
                <div className="h-4 w-3/4 skeleton rounded" />
                <div className="h-3 w-1/2 skeleton rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : players.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Users size={48} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No players yet</p>
          <p className="text-sm">Ask admin to add the squad</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {players.map((p) => (
            <PlayerCard
              key={p.id}
              player={p}
              isAdmin={isAdmin}
              uploadingId={uploadingId}
              onToggle={toggleAvailability}
              onUpload={handleAvatarUpload}
              onDelete={deletePlayer}
            />
          ))}
        </div>
      )}

      {/* Add Player bottom sheet */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
          <div className="bg-white w-full max-w-md rounded-t-3xl p-6 pb-8 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold">Add New Player</h3>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600">
                <X size={22} />
              </button>
            </div>
            <div className="space-y-3">
              <input
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-400"
                placeholder="Full Name *"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
              <select
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white outline-none focus:border-emerald-400"
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              >
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <input
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-400"
                placeholder="Jersey Number"
                type="number"
                min="1"
                max="99"
                value={form.jersey_number}
                onChange={(e) => setForm((f) => ({ ...f, jersey_number: e.target.value }))}
              />
              <input
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-400"
                placeholder="Phone Number"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowAdd(false)}
                className="flex-1 border border-gray-200 py-3 rounded-xl text-sm font-semibold text-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={addPlayer}
                disabled={saving || !form.name.trim()}
                className="flex-1 bg-emerald-500 disabled:opacity-50 text-white py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                Add Player
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Player Card sub-component ── */
interface CardProps {
  player: Player;
  isAdmin: boolean;
  uploadingId: string | null;
  onToggle: (p: Player) => void;
  onUpload: (p: Player, f: File) => void;
  onDelete: (id: string) => void;
}

function PlayerCard({ player, isAdmin, uploadingId, onToggle, onUpload, onDelete }: CardProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const uploading = uploadingId === player.id;

  return (
    <div
      className={`bg-white rounded-2xl overflow-hidden shadow-sm border transition-colors
        ${player.is_available ? "border-emerald-100" : "border-gray-100"}`}
    >
      {/* Avatar */}
      <div className="relative aspect-square bg-gray-100">
        {player.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={player.avatar_url}
            alt={player.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
            <User size={44} className="text-gray-300" />
          </div>
        )}

        {/* Camera button (always visible — public action) */}
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="absolute bottom-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 shadow transition-colors"
        >
          {uploading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Camera size={14} />
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpload(player, file);
            e.target.value = "";
          }}
        />

        {/* Jersey number badge */}
        {player.jersey_number != null && (
          <div className="absolute top-2 left-2 bg-black/55 text-white text-[11px] font-black rounded-full w-7 h-7 flex items-center justify-center">
            {player.jersey_number}
          </div>
        )}

        {/* Admin delete */}
        {isAdmin && (
          <button
            onClick={() => onDelete(player.id)}
            className="absolute top-2 right-2 bg-red-500/80 hover:bg-red-600 text-white rounded-full p-1 shadow"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {/* Info */}
      <div className="p-2.5">
        <p className="font-semibold text-sm truncate leading-tight">{player.name}</p>
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full inline-block mt-1 font-medium
            ${ROLE_COLORS[player.role] ?? "bg-gray-100 text-gray-600"}`}
        >
          {player.role}
        </span>
        {player.phone && (
          <div className="flex items-center gap-1 mt-1.5">
            <Phone size={10} className="text-gray-400 shrink-0" />
            <span className="text-[11px] text-gray-500 truncate">{player.phone}</span>
          </div>
        )}

        {/* Availability toggle */}
        <button
          onClick={() => onToggle(player)}
          className={`mt-2.5 w-full py-2 rounded-xl text-xs font-bold tracking-wide transition-colors
            ${player.is_available
              ? "bg-emerald-500 hover:bg-emerald-600 text-white"
              : "bg-gray-100 hover:bg-gray-200 text-gray-500"}`}
        >
          {player.is_available ? "✓ IN" : "✗ OUT"}
        </button>
      </div>
    </div>
  );
}
