"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus, Shuffle, Trophy, Star, Share2, ChevronDown,
  X, Loader2, Minus, Swords, Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { APP_CONFIG } from "@/lib/config";
import type { Match, Player, MatchPlayer, TabId } from "@/types";

interface Props {
  isAdmin: boolean;
  onAdminRequired: () => void;
  onNavigate?: (tab: TabId) => void;
}

type MatchView = "list" | "scoreboard";

export default function MatchesTab({ isAdmin, onAdminRequired, onNavigate }: Props) {
  const [matches,     setMatches]     = useState<Match[]>([]);
  const [players,     setPlayers]     = useState<Player[]>([]);
  const [matchPlayers,setMatchPlayers]= useState<MatchPlayer[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [view,        setView]        = useState<MatchView>("list");
  const [activeMatch, setActiveMatch] = useState<Match | null>(null);
  const [showNew,     setShowNew]     = useState(false);
  const [showMVP,     setShowMVP]     = useState(false);
  const [saving,      setSaving]      = useState(false);

  /* New match form state */
  const [form, setForm] = useState({
    type:          "official" as "official" | "friendly",
    opponent:      "",
    date:          new Date().toISOString().split("T")[0],
    selectedPlayers: [] as string[],
    teamA:         [] as string[],
    teamB:         [] as string[],
  });

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: m }, { data: p }, { data: mp }] = await Promise.all([
      supabase.from("matches").select("*").order("match_date", { ascending: false }),
      supabase.from("players").select("*").order("name"),
      supabase.from("match_players").select("*"),
    ]);
    if (m)  setMatches(m as Match[]);
    if (p)  setPlayers(p as Player[]);
    if (mp) setMatchPlayers(mp as MatchPlayer[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ── Helpers ── */
  function getPlayerById(id: string) { return players.find((p) => p.id === id); }

  function getMatchParticipants(matchId: string): Player[] {
    return matchPlayers
      .filter((mp) => mp.match_id === matchId)
      .map((mp) => getPlayerById(mp.player_id))
      .filter(Boolean) as Player[];
  }

  /* ── Shuffle friendly teams ── */
  function shuffleTeams() {
    const all = [...form.selectedPlayers];
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    const mid = Math.ceil(all.length / 2);
    setForm((f) => ({ ...f, teamA: all.slice(0, mid), teamB: all.slice(mid) }));
  }

  /* ── Create match ── */
  async function createMatch() {
    if (!isAdmin) { onAdminRequired(); return; }
    if (form.type === "official" && !form.opponent.trim()) return;
    if (form.type === "friendly" && form.selectedPlayers.length < 2) return;

    setSaving(true);
    const { data: match, error } = await supabase
      .from("matches")
      .insert({
        type:          form.type,
        opponent_name: form.type === "official" ? form.opponent.trim() : null,
        match_date:    form.date,
        status:        "upcoming",
      })
      .select()
      .single();

    if (error || !match) { setSaving(false); return; }

    // Insert match_players
    if (form.type === "friendly" && (form.teamA.length > 0 || form.teamB.length > 0)) {
      const rows = [
        ...form.teamA.map((pid) => ({ match_id: match.id, player_id: pid, team_side: "team_a" as const })),
        ...form.teamB.map((pid) => ({ match_id: match.id, player_id: pid, team_side: "team_b" as const })),
      ];
      await supabase.from("match_players").insert(rows);
      setMatchPlayers((prev) => [...prev, ...rows.map((r, i) => ({ ...r, id: `${match.id}-${i}`, created_at: new Date().toISOString() }))]);
    } else if (form.type === "official") {
      // mark all available players on "home" side
      const rows = players
        .filter((p) => p.is_available)
        .map((p) => ({ match_id: match.id, player_id: p.id, team_side: "home" as const }));
      if (rows.length) await supabase.from("match_players").insert(rows);
    }

    setMatches((prev) => [match as Match, ...prev]);
    setSaving(false);
    setShowNew(false);
    setActiveMatch(match as Match);
    setView("scoreboard");
    setForm({ type: "official", opponent: "", date: new Date().toISOString().split("T")[0], selectedPlayers: [], teamA: [], teamB: [] });
  }

  /* ── Update score ── */
  async function updateScore(match: Match, side: "home" | "away" | "a" | "b", delta: number) {
    if (!isAdmin) { onAdminRequired(); return; }
    const field = side === "home" ? "score_home" : side === "away" ? "score_away" : side === "a" ? "team_a_score" : "team_b_score";
    const current = match[field as keyof Match] as number;
    const next = Math.max(0, current + delta);
    const updated = { ...match, [field]: next };
    setActiveMatch(updated);
    setMatches((prev) => prev.map((m) => (m.id === match.id ? updated : m)));
    await supabase.from("matches").update({ [field]: next }).eq("id", match.id);
  }

  /* ── Set match status ── */
  async function setStatus(match: Match, status: Match["status"]) {
    if (!isAdmin) { onAdminRequired(); return; }
    const updated = { ...match, status };
    setActiveMatch(updated);
    setMatches((prev) => prev.map((m) => (m.id === match.id ? updated : m)));
    await supabase.from("matches").update({ status }).eq("id", match.id);
  }

  /* ── Set MVP ── */
  async function setMVP(match: Match, playerId: string) {
    if (!isAdmin) { onAdminRequired(); return; }
    const updated = { ...match, mvp_player_id: playerId };
    setActiveMatch(updated);
    setMatches((prev) => prev.map((m) => (m.id === match.id ? updated : m)));
    await supabase.from("matches").update({ mvp_player_id: playerId }).eq("id", match.id);
    setShowMVP(false);
  }

  /* ── Shareable scorecard text ── */
  function shareScorecard(match: Match) {
    const title = match.type === "official"
      ? `${APP_CONFIG.appName} vs ${match.opponent_name}`
      : `Friendly: Team A vs Team B`;
    const score = match.type === "official"
      ? `${match.score_home} – ${match.score_away}`
      : `${match.team_a_score} – ${match.team_b_score}`;
    const winner = match.type === "official"
      ? (match.score_home > match.score_away ? "🏆 We Won!" : match.score_home < match.score_away ? "😞 We Lost" : "🤝 Draw")
      : (match.team_a_score > match.team_b_score ? "🏆 Team A Wins!" : match.team_a_score < match.team_b_score ? "🏆 Team B Wins!" : "🤝 Draw");
    const mvp = match.mvp_player_id ? `⭐ MVP: ${getPlayerById(match.mvp_player_id)?.name}` : "";
    const text = `⚽ *${title}*\n📅 ${match.match_date}\n🔢 Final Score: *${score}*\n${winner}\n${mvp}\n\n#${APP_CONFIG.appName.replace(/\s+/g, "")}`;
    if (navigator.share) {
      navigator.share({ text }).catch(() => navigator.clipboard.writeText(text));
    } else {
      navigator.clipboard.writeText(text);
      alert("Scorecard copied to clipboard!");
    }
  }

  if (loading) return <div className="flex justify-center items-center h-40"><Loader2 className="animate-spin text-emerald-500" size={28} /></div>;

  /* ── Scoreboard view ── */
  if (view === "scoreboard" && activeMatch) {
    const isOfficial = activeMatch.type === "official";
    const homeScore  = activeMatch.score_home;
    const awayScore  = activeMatch.score_away;
    const aScore     = activeMatch.team_a_score;
    const bScore     = activeMatch.team_b_score;
    const isLive      = activeMatch.status === "live";
    const isCompleted = activeMatch.status === "completed";
    const teamAPlayers = matchPlayers.filter((mp) => mp.match_id === activeMatch.id && mp.team_side === "team_a").map((mp) => getPlayerById(mp.player_id)).filter(Boolean) as Player[];
    const teamBPlayers = matchPlayers.filter((mp) => mp.match_id === activeMatch.id && mp.team_side === "team_b").map((mp) => getPlayerById(mp.player_id)).filter(Boolean) as Player[];
    const mvpPlayer = activeMatch.mvp_player_id ? getPlayerById(activeMatch.mvp_player_id) : null;

    return (
      <div className="px-4 pt-4 pb-28 scroll-panel overflow-y-auto">
        <button onClick={() => setView("list")} className="flex items-center gap-1.5 text-sm text-gray-500 mb-4 hover:text-gray-700">
          ← Back to Matches
        </button>

        {/* Match header */}
        <div className="bg-gray-900 rounded-3xl p-5 text-white mb-4 shadow-xl">
          <div className="flex items-center justify-between mb-1">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isLive ? "bg-red-500 animate-pulse" : isCompleted ? "bg-gray-600" : "bg-blue-500"}`}>
              {isLive ? "🔴 LIVE" : isCompleted ? "FT" : "UPCOMING"}
            </span>
            <span className="text-xs text-gray-400">{activeMatch.match_date}</span>
          </div>

          {/* Score display */}
          <div className="flex items-center justify-between mt-4">
            <div className="text-center flex-1">
              <p className="text-xs text-gray-400 mb-1 font-semibold uppercase tracking-wider truncate">
                {isOfficial ? APP_CONFIG.appName : "Team A"}
              </p>
              <p className="text-6xl font-black tabular-nums">
                {isOfficial ? homeScore : aScore}
              </p>
            </div>
            <div className="text-gray-500 text-2xl font-light mx-2">–</div>
            <div className="text-center flex-1">
              <p className="text-xs text-gray-400 mb-1 font-semibold uppercase tracking-wider truncate">
                {isOfficial ? (activeMatch.opponent_name ?? "Opponent") : "Team B"}
              </p>
              <p className="text-6xl font-black tabular-nums">
                {isOfficial ? awayScore : bScore}
              </p>
            </div>
          </div>

          {/* Score controls (admin) */}
          {!isCompleted && (
            <div className="flex items-center justify-between mt-5 gap-2">
              {/* Home/A side */}
              <div className="flex gap-2 flex-1 justify-center">
                <button onClick={() => updateScore(activeMatch, isOfficial ? "home" : "a", -1)} className="bg-white/10 hover:bg-white/20 rounded-xl p-3 transition-colors">
                  <Minus size={18} />
                </button>
                <button onClick={() => updateScore(activeMatch, isOfficial ? "home" : "a", 1)} className="bg-emerald-500 hover:bg-emerald-400 rounded-xl px-5 py-3 font-bold transition-colors">
                  +Goal
                </button>
              </div>
              <div className="flex gap-2 flex-1 justify-center">
                <button onClick={() => updateScore(activeMatch, isOfficial ? "away" : "b", 1)} className="bg-emerald-500 hover:bg-emerald-400 rounded-xl px-5 py-3 font-bold transition-colors">
                  +Goal
                </button>
                <button onClick={() => updateScore(activeMatch, isOfficial ? "away" : "b", -1)} className="bg-white/10 hover:bg-white/20 rounded-xl p-3 transition-colors">
                  <Minus size={18} />
                </button>
              </div>
            </div>
          )}

          {/* Status controls */}
          <div className="flex gap-2 mt-4">
            {activeMatch.status === "upcoming" && (
              <button
                onClick={() => isAdmin ? setStatus(activeMatch, "live") : onAdminRequired()}
                className="flex-1 bg-red-500 hover:bg-red-400 py-2.5 rounded-xl text-sm font-bold transition-colors"
              >
                🔴 Start Match
              </button>
            )}
            {activeMatch.status === "live" && (
              <button
                onClick={() => isAdmin ? setStatus(activeMatch, "completed") : onAdminRequired()}
                className="flex-1 bg-gray-600 hover:bg-gray-500 py-2.5 rounded-xl text-sm font-bold transition-colors"
              >
                Full Time
              </button>
            )}
            {isCompleted && (
              <>
                <button
                  onClick={() => isAdmin ? setShowMVP(true) : onAdminRequired()}
                  className="flex-1 bg-yellow-500 hover:bg-yellow-400 py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-1.5"
                >
                  <Star size={15} /> {activeMatch.mvp_player_id ? "Change MVP" : "Pick MVP"}
                </button>
                <button
                  onClick={() => shareScorecard(activeMatch)}
                  className="flex-1 bg-blue-500 hover:bg-blue-400 py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-1.5"
                >
                  <Share2 size={15} /> Share
                </button>
              </>
            )}
          </div>
        </div>

        {/* MVP display */}
        {mvpPlayer && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 flex items-center gap-4 mb-4">
            {mvpPlayer.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mvpPlayer.avatar_url} alt={mvpPlayer.name} className="w-14 h-14 rounded-full object-cover border-2 border-yellow-400" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-yellow-200 flex items-center justify-center text-xl font-black text-yellow-600">
                {mvpPlayer.name[0]}
              </div>
            )}
            <div>
              <p className="text-xs font-bold text-yellow-600 uppercase tracking-wider">⭐ MVP</p>
              <p className="text-lg font-black">{mvpPlayer.name}</p>
              <p className="text-xs text-gray-500">{mvpPlayer.role}</p>
            </div>
          </div>
        )}

        {/* Teams (friendly) */}
        {!isOfficial && (teamAPlayers.length > 0 || teamBPlayers.length > 0) && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            {[{ label: "Team A", players: teamAPlayers }, { label: "Team B", players: teamBPlayers }].map(({ label, players: pl }) => (
              <div key={label} className="bg-white rounded-2xl p-3 border border-gray-100 shadow-sm">
                <p className="font-bold text-sm mb-2 text-center">{label}</p>
                <div className="flex flex-wrap gap-1">
                  {pl.map((p) => (
                    <div key={p.id} className="flex flex-col items-center gap-0.5">
                      {p.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.avatar_url} alt={p.name} className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-400">
                          {p.name[0]}
                        </div>
                      )}
                      <span className="text-[9px] text-gray-500 leading-tight text-center w-10 truncate">{p.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* One-click fee link */}
        {activeMatch.status === "completed" && (
          <button
            onClick={() => { onNavigate?.("payments"); }}
            className="w-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold py-3 rounded-2xl text-sm flex items-center justify-center gap-2"
          >
            💰 Create Payment Split for this Match
          </button>
        )}

        {/* MVP picker modal */}
        {showMVP && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
            <div className="bg-white w-full max-w-md rounded-t-3xl p-6 pb-8 shadow-2xl max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold">⭐ Pick MVP</h3>
                <button onClick={() => setShowMVP(false)} className="text-gray-400"><X size={22} /></button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {getMatchParticipants(activeMatch.id).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setMVP(activeMatch, p.id)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-colors
                      ${activeMatch.mvp_player_id === p.id ? "border-yellow-400 bg-yellow-50" : "border-gray-100 hover:border-yellow-200"}`}
                  >
                    {p.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.avatar_url} alt={p.name} className="w-14 h-14 rounded-full object-cover" />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center text-lg font-black text-gray-400">
                        {p.name[0]}
                      </div>
                    )}
                    <p className="text-xs font-semibold text-center leading-tight">{p.name}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ── Match list view ── */
  return (
    <div className="px-4 pt-4 pb-28 scroll-panel overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500"><span className="font-semibold text-gray-800">{matches.length}</span> matches recorded</p>
        <button
          onClick={() => { if (!isAdmin) { onAdminRequired(); return; } setShowNew(true); }}
          className="flex items-center gap-1 bg-emerald-500 text-white text-sm font-semibold px-3 py-2 rounded-full shadow-sm"
        >
          <Plus size={15} /> New Match
        </button>
      </div>

      {/* Match cards */}
      {matches.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Swords size={48} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No matches yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {matches.map((match) => {
            const isOfficial = match.type === "official";
            const homeWin = isOfficial && match.score_home > match.score_away;
            const draw    = isOfficial && match.score_home === match.score_away;
            const aWin    = !isOfficial && match.team_a_score > match.team_b_score;
            const participants = getMatchParticipants(match.id);
            const mvpP = match.mvp_player_id ? getPlayerById(match.mvp_player_id) : null;

            return (
              <button
                key={match.id}
                onClick={() => { setActiveMatch(match); setView("scoreboard"); }}
                className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-left hover:border-emerald-200 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full mr-2
                      ${match.type === "official" ? "bg-blue-100 text-blue-600" : "bg-purple-100 text-purple-600"}`}>
                      {match.type === "official" ? "Official" : "Friendly"}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full
                      ${match.status === "live" ? "bg-red-100 text-red-600 animate-pulse" : match.status === "completed" ? "bg-gray-100 text-gray-500" : "bg-amber-100 text-amber-600"}`}>
                      {match.status === "live" ? "🔴 LIVE" : match.status === "completed" ? "FT" : "Upcoming"}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">{match.match_date}</span>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-base">
                      {isOfficial ? `vs ${match.opponent_name}` : "Team A vs Team B"}
                    </p>
                    {match.status !== "upcoming" && (
                      <p className="text-2xl font-black mt-0.5">
                        {isOfficial ? `${match.score_home} – ${match.score_away}` : `${match.team_a_score} – ${match.team_b_score}`}
                      </p>
                    )}
                  </div>

                  {match.status === "completed" && isOfficial && (
                    <span className={`text-xs font-bold px-3 py-1 rounded-full
                      ${homeWin ? "bg-emerald-100 text-emerald-700" : draw ? "bg-gray-100 text-gray-600" : "bg-red-100 text-red-600"}`}>
                      {homeWin ? "Won" : draw ? "Draw" : "Lost"}
                    </span>
                  )}
                  {match.status === "completed" && !isOfficial && (
                    <span className="text-xs font-bold px-3 py-1 rounded-full bg-purple-100 text-purple-700">
                      {aWin ? "Team A" : match.team_a_score < match.team_b_score ? "Team B" : "Draw"}
                    </span>
                  )}
                </div>

                {/* Participants avatars + MVP */}
                <div className="flex items-center justify-between mt-3">
                  <div className="flex -space-x-2">
                    {participants.slice(0, 6).map((p) => (
                      p.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={p.id} src={p.avatar_url} alt={p.name} className="w-7 h-7 rounded-full border-2 border-white object-cover" />
                      ) : (
                        <div key={p.id} className="w-7 h-7 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-500">
                          {p.name[0]}
                        </div>
                      )
                    ))}
                    {participants.length > 6 && (
                      <div className="w-7 h-7 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-500">
                        +{participants.length - 6}
                      </div>
                    )}
                  </div>
                  {mvpP && (
                    <span className="text-xs text-yellow-600 font-semibold flex items-center gap-1">
                      <Star size={11} fill="currentColor" /> {mvpP.name}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* New Match bottom sheet */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
          <div className="bg-white w-full max-w-md rounded-t-3xl p-6 pb-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold">New Match</h3>
              <button onClick={() => setShowNew(false)} className="text-gray-400"><X size={22} /></button>
            </div>

            {/* Match type toggle */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              {(["official", "friendly"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setForm((f) => ({ ...f, type: t }))}
                  className={`py-3 rounded-xl text-sm font-semibold capitalize transition-colors
                    ${form.type === t ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-500"}`}
                >
                  {t === "official" ? "⚽ Official" : "🤝 Friendly"}
                </button>
              ))}
            </div>

            {/* Date */}
            <input
              type="date"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm mb-3 outline-none focus:border-emerald-400"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />

            {/* Official: opponent name */}
            {form.type === "official" && (
              <input
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm mb-3 outline-none focus:border-emerald-400"
                placeholder="Opponent Team Name *"
                value={form.opponent}
                onChange={(e) => setForm((f) => ({ ...f, opponent: e.target.value }))}
              />
            )}

            {/* Friendly: player selection + team generator */}
            {form.type === "friendly" && (
              <div className="mb-3">
                <p className="text-xs text-gray-500 font-semibold mb-2">
                  Select Present Players ({form.selectedPlayers.length} selected)
                </p>
                <div className="border border-gray-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto mb-3">
                  {players.map((p) => {
                    const sel = form.selectedPlayers.includes(p.id);
                    return (
                      <label key={p.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0">
                        <input
                          type="checkbox"
                          checked={sel}
                          onChange={() =>
                            setForm((f) => ({
                              ...f,
                              selectedPlayers: sel ? f.selectedPlayers.filter((id) => id !== p.id) : [...f.selectedPlayers, p.id],
                            }))
                          }
                          className="accent-emerald-500 w-4 h-4"
                        />
                        {p.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.avatar_url} alt={p.name} className="w-7 h-7 rounded-full object-cover" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-400">{p.name[0]}</div>
                        )}
                        <span className="text-sm">{p.name}</span>
                      </label>
                    );
                  })}
                </div>

                {form.selectedPlayers.length >= 2 && (
                  <button
                    onClick={shuffleTeams}
                    className="w-full bg-purple-50 border border-purple-200 text-purple-700 font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 mb-3"
                  >
                    <Shuffle size={15} /> Auto-Shuffle Teams
                  </button>
                )}

                {(form.teamA.length > 0 || form.teamB.length > 0) && (
                  <div className="grid grid-cols-2 gap-2">
                    {[{ label: "Team A", ids: form.teamA }, { label: "Team B", ids: form.teamB }].map(({ label, ids }) => (
                      <div key={label} className="bg-gray-50 rounded-xl p-3">
                        <p className="text-xs font-bold mb-1.5 text-center">{label} ({ids.length})</p>
                        {ids.map((id) => {
                          const p = getPlayerById(id);
                          return p ? <p key={id} className="text-xs text-gray-600 truncate">{p.name}</p> : null;
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 mt-2">
              <button onClick={() => setShowNew(false)} className="flex-1 border border-gray-200 py-3 rounded-xl text-sm font-semibold text-gray-600">Cancel</button>
              <button
                onClick={createMatch}
                disabled={saving || (form.type === "official" && !form.opponent.trim()) || (form.type === "friendly" && form.selectedPlayers.length < 2)}
                className="flex-1 bg-emerald-500 disabled:opacity-50 text-white py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
              >
                {saving && <Loader2 size={14} className="animate-spin" />} Create Match
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
