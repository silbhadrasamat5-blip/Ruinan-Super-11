"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Camera, Plus, Trash2, User, Phone, Loader2, X, Users } from "lucide-react";
import imageCompression from "browser-image-compression";
import { supabase } from "@/lib/supabase";
import type { Player } from "@/types";

interface Props {
  isAdmin: boolean;
  isPlayer?: boolean;
  onAdminRequired: () => void;
  onPlayerRequired?: () => void;
}

const ROLES = ["Batsman", "Bowler", "All-rounder", "Wicket-keeper", "Captain"];

const ROLE_COLORS: Record<string, string> = {
  Batsman:         "bg-blue-100 text-blue-700",
  Bowler:          "bg-red-100 text-red-700",
  "All-rounder":   "bg-emerald-100 text-emerald-700",
  "Wicket-keeper": "bg-amber-100 text-amber-700",
  Captain:         "bg-purple-100 text-purple-700",
};

export default function SquadTab({
  isAdmin,
  isPlayer = false,
  onAdminRequired,
  onPlayerRequired,
}: Props) {
  const [players, setPlayers]         = useState<Player[]>([]);
  const [loading, setLoading]         = useState(true);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [showAdd, setShowAdd]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [form, setForm]               = useState({
    name: "", role: "Batsman", jersey_number: "", phone: "",
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

  /* ── Add player (player or admin) ── */
  async function addPlayer() {
    if (!isAdmin && !isPlayer) {
      if (onPlayerRequired) onPlayerRequired();
      else onAdminRequired();
      return;
    }
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
      setForm({ name: "", role: "Batsman", jersey_number: "", phone: "" });
      setShowAdd(false);
    }
  }

  /* ── Delete player (admin only) ── */
  async function deletePlayer(id: string) {
    if (!isAdmin) { onAdminRequired(); return; }
    if (!confirm("Remove this player from the squad?")) return;
    await supabase.from("players").delete().eq("id", id);
    setPlayers((p) => p.filter((x) => x.id !== id));
  }

  const available = players.filter((p) => p.is_available).length;
  const skeletonItems = Array.from({ length: 4 }, (_, idx) => idx);

  return (
    <div className="px-4 pt-4 pb-28 scroll-panel overflow-y-auto">
      {/* Summary row */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          <span className="font-semibold text-gray-800">{players.length}</span> players ·{" "}
          <span className="font-semibold text-emerald-600">{available} available</span>
        </p>
        <button
          onClick={() => {
            if (!isAdmin && !isPlayer) {
              if (onPlayerRequired) onPlayerRequired();
              else onAdminRequired();
              return;
            }
            setShowAdd(true);
          }}
          className="flex items-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold px-3 py-2 rounded-full shadow-sm transition-colors"
        >
          <Plus size={15} /> Add Player
        </button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {skeletonItems.map((i) => (
            <div key={i} className="bg-white rounded-2xl h-64 animate-pulse border border-gray-100" />
          ))}
        </div>
      ) : players.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Users size={40} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium text-gray-500">No players yet</p>
          <p className="text-xs mt-1">Tap &ldquo;+ Add Player&rdquo; to build your squad</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {players.map((player) => (
            <PlayerCard
              key={player.id}
              player={player}
              isAdmin={isAdmin}
              uploading={uploadingId === player.id}
              onToggle={() => toggleAvailability(player)}
              onUpload={(file) => handleAvatarUpload(player, file)}
              onDelete={() => deletePlayer(player.id)}
            />
          ))}
        </div>
      )}

      {/* Add Player Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold">Add New Player</h3>
              <button onClick={() => setShowAdd(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                  Player Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Silbhadra Samat"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-500 outline-none text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                    Role
                  </label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="w-full px-3 py-3 rounded-xl border border-gray-200 focus:border-emerald-500 outline-none text-sm bg-white"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                    Jersey #
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 18"
                    value={form.jersey_number}
                    onChange={(e) => setForm({ ...form, jersey_number: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-500 outline-none text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                  Phone (Optional)
                </label>
                <input
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-500 outline-none text-sm"
                />
              </div>

              <button
                onClick={addPlayer}
                disabled={saving || !form.name.trim()}
                className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold text-sm shadow-sm transition-colors flex items-center justify-center gap-2"
              >
                {saving && <Loader2 size={16} className="animate-spin" />}
                {saving ? "Adding..." : "Add to Squad"}
              </button>
            </div>
          </div>
        </div>
)}
    </div>
  );
}

/* ── Player Card Component ── */
function PlayerCard({
  player,
  isAdmin,
  uploading,
  onToggle,
  onUpload,
  onDelete,
}: {
  player: Player;
  isAdmin: boolean;
  uploading: boolean;
  onToggle: () => void;
  onUpload: (file: File) => void;
  onDelete: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className={`bg-white rounded-2xl overflow-hidden shadow-sm border transition-colors ${
        player.is_available ? "border-emerald-100" : "border-gray-100"
      }`}
    >
      {/* Avatar */}
      <div className="relative aspect-square bg-gray-100">
        {player.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={player.avatar_url}
            alt={player.name}
            className="w-full h-full object-cover object-top"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
            <User size={44} className="text-gray-300" />
          </div>
        )}

        {/* Camera button */}
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="absolute bottom-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 shadow transition-colors"
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const fileList = e.target.files;
            const f = fileList && fileList.length > 0 ? fileList.item(0) : null;
            if (f) onUpload(f);
            e.target.value = "";
          }}
        />

        {/* Jersey badge */}
        {player.jersey_number != null && (
          <span className="absolute top-2 left-2 bg-black/60 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            #{player.jersey_number}
          </span>
        )}

        {/* Delete button (Admin only) */}
        {isAdmin && (
          <button
            onClick={onDelete}
            className="absolute top-2 right-2 bg-red-500/90 hover:bg-red-600 text-white rounded-full p-1.5 shadow transition-colors"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="font-bold text-gray-900 text-sm truncate">{player.name}</p>
        <span
          className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full mt-1 ${
            ROLE_COLORS[player.role] ?? "bg-gray-100 text-gray-600"
          }`}
        >
          {player.role}
        </span>

        {player.phone && (
          <p className="flex items-center gap-1 text-[11px] text-gray-400 mt-1.5 truncate">
            <Phone size={10} /> {player.phone}
          </p>
        )}

        <button
          onClick={onToggle}
          className={`w-full mt-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
            player.is_available
              ? "bg-emerald-500 text-white"
              : "bg-gray-100 text-gray-500"
          }`}
        >
          {player.is_available ? "IN (Available)" : "OUT"}
        </button>
      </div>
    </div>
  );
}
