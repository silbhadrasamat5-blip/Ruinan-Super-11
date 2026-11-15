"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus, Shuffle, Star, Share2, Trash2,
  X, Loader2, Swords,
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

/* ─────────────────────────────────────────────
   Cricket helpers
───────────────────────────────────────────── */
interface CricketData {
  total_ovs?: number; // match overs limit e.g. 20 for T20
  // custom team names (no DB migration needed — stored in notes JSON)
  home_team?: string; // Team 1 name for official matches
  a_name?: string;    // Team A name for friendly matches
  b_name?: string;    // Team B name for friendly matches
  // innings data
  home_w?: number;    // home wickets fallen
  home_o?: string;    // home overs faced e.g. "12.0"
  away_w?: number;
  away_o?: string;
  a_w?: number;       // team a wickets (friendly)
  a_o?: string;
  b_w?: number;
  b_o?: string;
}

function parseCricket(notes: string | null): CricketData {
  try { return notes ? JSON.parse(notes) : {}; }
  catch { return {}; }
}

function formatCricketScore(runs: number, wickets = 0, overs = "0.0"): string {
  return `${runs}/${wickets} (${overs} Ov)`;
}

/** Increment overs: "12.4" → "12.5", "12.5" → "13.0" */
function nextOver(o: string): string {
  const [ov, bl] = (o || "0.0").split(".").map(Number);
  return bl >= 5 ? `${ov + 1}.0` : `${ov}.${bl + 1}`;
}

/** Resolve display names from match + parsed cricket data */
function resolveNames(match: Match, cric: CricketData): { home: string; away: string } {
  if (match.type === "official") {
    return {
      home: cric.home_team?.trim() || APP_CONFIG.appName,
      away: match.opponent_name ?? "Opponent",
    };
  }
  return {
    home: cric.a_name?.trim() || "Team A",
    away: cric.b_name?.trim() || "Team B",
  };
}

export default function MatchesTab({ isAdmin, onAdminRequired, onNavigate }: Props) {
  const [matches,      setMatches]      = useState<Match[]>([]);
  const [players,      setPlayers]      = useState<Player[]>([]);
  const [matchPlayers, setMatchPlayers] = useState<MatchPlayer[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [view,         setView]         = useState<MatchView>("list");
  const [activeMatch,  setActiveMatch]  = useState<Match | null>(null);
  const [showNew,      setShowNew]      = useState(false);
  const [showMVP,      setShowMVP]      = useState(false);
  const [deleting,     setDeleting]     = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [customRuns,   setCustomRuns]   = useState("");

  /* New match form state */
  const [form, setForm] = useState({
    type:            "official" as "official" | "friendly",
    team1Name:       APP_CONFIG.appName,   // editable "our" team name
    team2Name:       "",                   // opponent / Team B name
    teamAName:       "Team A",             // friendly Team A
    teamBName:       "Team B",             // friendly Team B
    date:            new Date().toISOString().split("T")[0],
    matchOvers:      "20",
    selectedPlayers: [] as string[],
    teamA:           [] as string[],
    teamB:           [] as string[],
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
    if (form.type === "official" && !form.team2Name.trim()) return;
    if (form.type === "friendly" && form.selectedPlayers.length < 2) return;

    setSaving(true);

    const initNotes: CricketData = {
      total_ovs: parseInt(form.matchOvers) || 20,
      // store custom team names in notes JSON (no DB migration needed)
      ...(form.type === "official"
        ? { home_team: form.team1Name.trim() || APP_CONFIG.appName }
        : { a_name: form.teamAName.trim() || "Team A", b_name: form.teamBName.trim() || "Team B" }),
    };

    const { data: match, error } = await supabase
      .from("matches")
      .insert({
        type:          form.type,
        opponent_name: form.type === "official" ? form.team2Name.trim() : null,
        match_date:    form.date,
        status:        "upcoming",
        notes:         JSON.stringify(initNotes),
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
    setForm((f) => ({
      ...f,
      team1Name: APP_CONFIG.appName,
      team2Name: "",
      teamAName: "Team A",
      teamBName: "Team B",
      date: new Date().toISOString().split("T")[0],
      matchOvers: "20",
      selectedPlayers: [],
      teamA: [],
      teamB: [],
    }));
  }

  /* ── Delete match (admin only) ── */
  async function deleteMatch(match: Match) {
    if (!isAdmin) { onAdminRequired(); return; }
    const cric  = parseCricket(match.notes);
    const names = resolveNames(match, cric);
    const label = match.type === "official"
      ? `${names.home} vs ${names.away} (${match.match_date})`
      : `Friendly: ${names.home} vs ${names.away} (${match.match_date})`;

    if (!confirm(`Delete this match?\n\n"${label}"\n\nThis cannot be undone.`)) return;

    setDeleting(true);
    // Delete related rows first (match_players & match_fees cascade is not guaranteed)
    await supabase.from("match_players").delete().eq("match_id", match.id);
    await supabase.from("match_fees").delete().eq("match_id", match.id);
    await supabase.from("matches").delete().eq("id", match.id);

    setMatches((prev) => prev.filter((m) => m.id !== match.id));
    setMatchPlayers((prev) => prev.filter((mp) => mp.match_id !== match.id));
    setDeleting(false);
    setView("list");
    setActiveMatch(null);
  }

  /* ── Update runs ── */
  async function addRuns(match: Match, side: "home" | "away" | "a" | "b", runs: number) {
    if (!isAdmin) { onAdminRequired(); return; }
    const runsField = side === "home" ? "score_home"
                    : side === "away" ? "score_away"
                    : side === "a"    ? "team_a_score"
                    :                   "team_b_score";
    const currentRuns = match[runsField as keyof Match] as number;
    const newRuns = Math.max(0, currentRuns + runs);
    const updated = { ...match, [runsField]: newRuns };
    setActiveMatch(updated);
    setMatches((prev) => prev.map((m) => (m.id === match.id ? updated : m)));
    await supabase.from("matches").update({ [runsField]: newRuns }).eq("id", match.id);
  }

  async function addWicket(match: Match, side: "home" | "away" | "a" | "b") {
    if (!isAdmin) { onAdminRequired(); return; }
    const cric = parseCricket(match.notes);
    const wKey = side === "home" ? "home_w" : side === "away" ? "away_w" : side === "a" ? "a_w" : "b_w";
    const current = (cric[wKey] ?? 0);
    if (current >= 10) return;
    cric[wKey] = current + 1;
    const newNotes = JSON.stringify(cric);
    const updated = { ...match, notes: newNotes };
    setActiveMatch(updated);
    setMatches((prev) => prev.map((m) => (m.id === match.id ? updated : m)));
    await supabase.from("matches").update({ notes: newNotes }).eq("id", match.id);
  }

  async function addBall(match: Match, side: "home" | "away" | "a" | "b") {
    if (!isAdmin) { onAdminRequired(); return; }
    const cric = parseCricket(match.notes);
    const oKey = side === "home" ? "home_o" : side === "away" ? "away_o" : side === "a" ? "a_o" : "b_o";
    cric[oKey] = nextOver(cric[oKey] ?? "0.0");
    const newNotes = JSON.stringify(cric);
    const updated = { ...match, notes: newNotes };
    setActiveMatch(updated);
    setMatches((prev) => prev.map((m) => (m.id === match.id ? updated : m)));
    await supabase.from("matches").update({ notes: newNotes }).eq("id", match.id);
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

  /* ── Cricket WhatsApp scorecard ── */
  function shareScorecard(match: Match) {
    const cric     = parseCricket(match.notes);
    const names    = resolveNames(match, cric);
    const mvpName  = match.mvp_player_id ? getPlayerById(match.mvp_player_id)?.name : null;
    const tag      = `#${APP_CONFIG.appName.replace(/\s+/g, "")}`;

    if (match.type === "official") {
      const homeScore = formatCricketScore(match.score_home, cric.home_w ?? 0, cric.home_o ?? "0.0");
      const awayScore = formatCricketScore(match.score_away, cric.away_w ?? 0, cric.away_o ?? "0.0");
      const diff = Math.abs(match.score_home - match.score_away);
      const result = match.score_home > match.score_away
        ? `🏆 WON by ${diff} runs!`
        : match.score_home < match.score_away
        ? `😞 LOST by ${diff} runs`
        : "🤝 Match Tied!";
      const lines = [
        `🏏 *${names.home}*`,
        `Match vs ${names.away} | ${match.match_date}`,
        ``,
        `🏏 SCORECARD`,
        `${names.home}: ${homeScore}`,
        `${names.away}: ${awayScore}`,
        ``,
        result,
        ...(mvpName ? [`⭐ MVP: ${mvpName}`] : []),
        ``,
        tag,
      ];
      const text = lines.join("\n");
      navigator.share?.({ text }).catch(() => { navigator.clipboard.writeText(text); alert("Scorecard copied!"); })
        ?? (navigator.clipboard.writeText(text), alert("Cricket scorecard copied to clipboard!"));
    } else {
      const aScore = formatCricketScore(match.team_a_score, cric.a_w ?? 0, cric.a_o ?? "0.0");
      const bScore = formatCricketScore(match.team_b_score, cric.b_w ?? 0, cric.b_o ?? "0.0");
      const result = match.team_a_score > match.team_b_score
        ? `🏆 ${names.home} Won!`
        : match.team_a_score < match.team_b_score
        ? `🏆 ${names.away} Won!`
        : "🤝 Match Tied!";
      const lines = [
        `🏏 *${APP_CONFIG.appName} — Friendly*`,
        match.match_date,
        ``,
        `🏏 SCORECARD`,
        `${names.home}: ${aScore}`,
        `${names.away}: ${bScore}`,
        ``,
        result,
        ...(mvpName ? [`⭐ MVP: ${mvpName}`] : []),
        ``,
        tag,
      ];
      const text = lines.join("\n");
      navigator.share?.({ text }).catch(() => { navigator.clipboard.writeText(text); alert("Scorecard copied!"); })
        ?? (navigator.clipboard.writeText(text), alert("Cricket scorecard copied to clipboard!"));
    }
  }

  if (loading) return (
    <div className="flex justify-center items-center h-40">
      <Loader2 className="animate-spin text-emerald-500" size={28} />
    </div>
  );

  /* ══════════════════════════════════════════
     SCOREBOARD VIEW
  ══════════════════════════════════════════ */
  if (view === "scoreboard" && activeMatch) {
    const isOfficial   = activeMatch.type === "official";
    const isLive       = activeMatch.status === "live";
    const isCompleted  = activeMatch.status === "completed";
    const cric         = parseCricket(activeMatch.notes);
    const names        = resolveNames(activeMatch, cric);
    const totalOvs     = cric.total_ovs ?? 20;

    const homeRuns = activeMatch.score_home;
    const awayRuns = activeMatch.score_away;
    const aRuns    = activeMatch.team_a_score;
    const bRuns    = activeMatch.team_b_score;

    const teamAPlayers = matchPlayers
      .filter((mp) => mp.match_id === activeMatch.id && mp.team_side === "team_a")
      .map((mp) => getPlayerById(mp.player_id)).filter(Boolean) as Player[];
    const teamBPlayers = matchPlayers
      .filter((mp) => mp.match_id === activeMatch.id && mp.team_side === "team_b")
      .map((mp) => getPlayerById(mp.player_id)).filter(Boolean) as Player[];
    const mvpPlayer = activeMatch.mvp_player_id ? getPlayerById(activeMatch.mvp_player_id) : null;

    const homeScoreStr = formatCricketScore(homeRuns, cric.home_w ?? 0, cric.home_o ?? "0.0");
    const awayScoreStr = formatCricketScore(awayRuns, cric.away_w ?? 0, cric.away_o ?? "0.0");
    const aScoreStr    = formatCricketScore(aRuns, cric.a_w ?? 0, cric.a_o ?? "0.0");
    const bScoreStr    = formatCricketScore(bRuns, cric.b_w ?? 0, cric.b_o ?? "0.0");

    return (
      <div className="px-4 pt-4 pb-28 scroll-panel overflow-y-auto">
        {/* Top bar: back + delete */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setView("list")}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
          >
            ← Back to Matches
          </button>
          {isAdmin && (
            <button
              onClick={() => deleteMatch(activeMatch)}
              disabled={deleting}
              className="flex items-center gap-1.5 text-xs font-semibold text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-full transition-colors"
            >
              {deleting
                ? <Loader2 size={12} className="animate-spin" />
                : <Trash2 size={12} />}
              Delete Match
            </button>
          )}
        </div>

        {/* Match header card */}
        <div className="bg-gray-900 rounded-3xl p-5 text-white mb-4 shadow-xl">
          <div className="flex items-center justify-between mb-1">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full
              ${isLive ? "bg-red-500 animate-pulse" : isCompleted ? "bg-gray-600" : "bg-blue-500"}`}>
              {isLive ? "🔴 LIVE" : isCompleted ? "FT" : "UPCOMING"}
            </span>
            <span className="text-xs text-gray-400">{activeMatch.match_date} · {totalOvs} Ov</span>
          </div>

          {/* Cricket Score display */}
          <div className="flex items-center justify-between mt-4">
            <div className="text-center flex-1">
              <p className="text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wider truncate">
                {names.home}
              </p>
              <p className="text-3xl font-black tabular-nums leading-tight">
                {isOfficial ? homeScoreStr : aScoreStr}
              </p>
            </div>
            <div className="text-gray-500 text-xl font-light mx-2">vs</div>
            <div className="text-center flex-1">
              <p className="text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wider truncate">
                {names.away}
              </p>
              <p className="text-3xl font-black tabular-nums leading-tight">
                {isOfficial ? awayScoreStr : bScoreStr}
              </p>
            </div>
          </div>

          {/* Admin cricket controls */}
          {!isCompleted && isAdmin && (
            <div className="mt-5 space-y-3">
              {(["left", "right"] as const).map((side) => {
                const inSide  = isOfficial
                  ? (side === "left" ? "home" : "away")
                  : (side === "left" ? "a"    : "b");
                const label   = side === "left" ? names.home : names.away;
                return (
                  <div key={side} className="bg-white/10 rounded-2xl p-3">
                    <p className="text-xs font-bold text-gray-300 mb-2 text-center truncate">{label}</p>
                    {/* Run buttons */}
                    <div className="flex gap-1.5 flex-wrap justify-center mb-2">
                      {[1, 2, 4, 6].map((r) => (
                        <button
                          key={r}
                          onClick={() => addRuns(activeMatch, inSide as "home"|"away"|"a"|"b", r)}
                          className={`rounded-xl px-3 py-2 text-sm font-black transition-colors
                            ${r === 4 ? "bg-blue-500 hover:bg-blue-400"
                            : r === 6 ? "bg-yellow-500 hover:bg-yellow-400 text-gray-900"
                            :           "bg-emerald-500 hover:bg-emerald-400"}`}
                        >
                          +{r}
                        </button>
                      ))}
                      <button
                        onClick={() => {
                          const v = parseInt(customRuns);
                          if (!isNaN(v) && v > 0) {
                            addRuns(activeMatch, inSide as "home"|"away"|"a"|"b", v);
                            setCustomRuns("");
                          }
                        }}
                        className="bg-gray-600 hover:bg-gray-500 rounded-xl px-3 py-2 text-sm font-black"
                      >
                        +?
                      </button>
                    </div>
                    {/* Wicket + Ball buttons */}
                    <div className="flex gap-1.5 justify-center">
                      <button
                        onClick={() => addWicket(activeMatch, inSide as "home"|"away"|"a"|"b")}
                        className="bg-red-600 hover:bg-red-500 rounded-xl px-3 py-2 text-xs font-bold flex-1"
                      >
                        🎯 Wicket
                      </button>
                      <button
                        onClick={() => addBall(activeMatch, inSide as "home"|"away"|"a"|"b")}
                        className="bg-purple-600 hover:bg-purple-500 rounded-xl px-3 py-2 text-xs font-bold flex-1"
                      >
                        ⚾ +Ball
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Custom runs input */}
              <div className="flex gap-2">
                <input
                  type="number"
                  min="1"
                  placeholder="Custom runs → tap +?"
                  value={customRuns}
                  onChange={(e) => setCustomRuns(e.target.value)}
                  className="flex-1 bg-white/10 border border-white/20 text-white placeholder-gray-500 rounded-xl px-3 py-2 text-sm outline-none"
                />
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
                  <Share2 size={15} /> WhatsApp
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
              <img src={mvpPlayer.avatar_url} alt={mvpPlayer.name}
                className="w-14 h-14 rounded-full object-cover object-top border-2 border-yellow-400" />
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
            {[
              { label: names.home, players: teamAPlayers },
              { label: names.away, players: teamBPlayers },
            ].map(({ label, players: pl }) => (
              <div key={label} className="bg-white rounded-2xl p-3 border border-gray-100 shadow-sm">
                <p className="font-bold text-sm mb-2 text-center truncate">{label}</p>
                <div className="flex flex-wrap gap-1">
                  {pl.map((p) => (
                    <div key={p.id} className="flex flex-col items-center gap-0.5">
                      {p.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.avatar_url} alt={p.name}
                          className="w-8 h-8 rounded-full object-cover object-top" />
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
            className="w-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold py-3 rounded-2xl text-sm flex items-center justify-center gap-2 mb-3"
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
                      ${activeMatch.mvp_player_id === p.id
                        ? "border-yellow-400 bg-yellow-50"
                        : "border-gray-100 hover:border-yellow-200"}`}
                  >
                    {p.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.avatar_url} alt={p.name}
                        className="w-14 h-14 rounded-full object-cover object-top" />
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

  /* ══════════════════════════════════════════
     MATCH LIST VIEW
  ══════════════════════════════════════════ */
  return (
    <div className="px-4 pt-4 pb-28 scroll-panel overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          <span className="font-semibold text-gray-800">{matches.length}</span> matches recorded
        </p>
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
            const cric       = parseCricket(match.notes);
            const names      = resolveNames(match, cric);
            const homeWin    = isOfficial && match.score_home > match.score_away;
            const draw       = isOfficial && match.score_home === match.score_away;
            const aWin       = !isOfficial && match.team_a_score > match.team_b_score;
            const participants = getMatchParticipants(match.id);
            const mvpP         = match.mvp_player_id ? getPlayerById(match.mvp_player_id) : null;

            return (
              <button
                key={match.id}
                onClick={() => { setActiveMatch(match); setView("scoreboard"); }}
                className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-left hover:border-emerald-200 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex flex-wrap gap-1">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full
                      ${match.type === "official" ? "bg-blue-100 text-blue-600" : "bg-purple-100 text-purple-600"}`}>
                      {match.type === "official" ? "🏏 Official" : "🤝 Friendly"}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full
                      ${match.status === "live"      ? "bg-red-100 text-red-600 animate-pulse"
                      : match.status === "completed" ? "bg-gray-100 text-gray-500"
                      :                                "bg-amber-100 text-amber-600"}`}>
                      {match.status === "live" ? "🔴 LIVE" : match.status === "completed" ? "FT" : "Upcoming"}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0 ml-1">{match.match_date}</span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1 mr-2">
                    {/* Custom team names displayed in list */}
                    <p className="font-bold text-base truncate">
                      {names.home} vs {names.away}
                    </p>
                    {match.status !== "upcoming" && (
                      <div className="mt-1 space-y-0.5">
                        <p className="text-sm font-black text-gray-800">
                          {isOfficial
                            ? formatCricketScore(match.score_home, cric.home_w ?? 0, cric.home_o ?? "0.0")
                            : formatCricketScore(match.team_a_score, cric.a_w ?? 0, cric.a_o ?? "0.0")}
                        </p>
                        <p className="text-xs text-gray-500">
                          {isOfficial
                            ? formatCricketScore(match.score_away, cric.away_w ?? 0, cric.away_o ?? "0.0")
                            : formatCricketScore(match.team_b_score, cric.b_w ?? 0, cric.b_o ?? "0.0")}
                        </p>
                      </div>
                    )}
                  </div>

                  {match.status === "completed" && isOfficial && (
                    <span className={`text-xs font-bold px-3 py-1 rounded-full shrink-0
                      ${homeWin ? "bg-emerald-100 text-emerald-700"
                      : draw    ? "bg-gray-100 text-gray-600"
                      :           "bg-red-100 text-red-600"}`}>
                      {homeWin ? "Won" : draw ? "Tied" : "Lost"}
                    </span>
                  )}
                  {match.status === "completed" && !isOfficial && (
                    <span className="text-xs font-bold px-3 py-1 rounded-full bg-purple-100 text-purple-700 shrink-0">
                      {aWin
                        ? `${names.home} ✓`
                        : match.team_a_score < match.team_b_score
                        ? `${names.away} ✓`
                        : "Tied"}
                    </span>
                  )}
                </div>

                {/* Participants avatars + MVP */}
                <div className="flex items-center justify-between mt-3">
                  <div className="flex -space-x-2">
                    {participants.slice(0, 6).map((p) => (
                      p.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={p.id} src={p.avatar_url} alt={p.name}
                          className="w-7 h-7 rounded-full border-2 border-white object-cover object-top" />
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

      {/* ── New Match bottom sheet ── */}
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
                  {t === "official" ? "🏏 Official" : "🤝 Friendly"}
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

            {/* Match Overs */}
            <div className="mb-4">
              <label className="text-xs text-gray-500 font-semibold mb-1 block">Match Overs</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white outline-none focus:border-emerald-400"
                value={form.matchOvers}
                onChange={(e) => setForm((f) => ({ ...f, matchOvers: e.target.value }))}
              >
                <option value="5">5 Overs</option>
                <option value="6">6 Overs</option>
                <option value="10">10 Overs</option>
                <option value="12">12 Overs</option>
                <option value="15">15 Overs</option>
                <option value="20">20 Overs (T20)</option>
                <option value="50">50 Overs (ODI)</option>
              </select>
            </div>

            {/* ── Official: both team names ── */}
            {form.type === "official" && (
              <div className="space-y-3 mb-4">
                <div>
                  <label className="text-xs text-gray-500 font-semibold mb-1 block">Team 1 Name (Your Team)</label>
                  <input
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-400"
                    placeholder={APP_CONFIG.appName}
                    value={form.team1Name}
                    onChange={(e) => setForm((f) => ({ ...f, team1Name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-semibold mb-1 block">Team 2 Name (Opponent) *</label>
                  <input
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-400"
                    placeholder="Opponent Team Name"
                    value={form.team2Name}
                    onChange={(e) => setForm((f) => ({ ...f, team2Name: e.target.value }))}
                  />
                </div>
              </div>
            )}

            {/* ── Friendly: team names + player selection ── */}
            {form.type === "friendly" && (
              <div className="mb-3 space-y-3">
                {/* Team name inputs */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500 font-semibold mb-1 block">Team A Name</label>
                    <input
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
                      placeholder="Team A"
                      value={form.teamAName}
                      onChange={(e) => setForm((f) => ({ ...f, teamAName: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 font-semibold mb-1 block">Team B Name</label>
                    <input
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
                      placeholder="Team B"
                      value={form.teamBName}
                      onChange={(e) => setForm((f) => ({ ...f, teamBName: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Player selection */}
                <div>
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
                                selectedPlayers: sel
                                  ? f.selectedPlayers.filter((id) => id !== p.id)
                                  : [...f.selectedPlayers, p.id],
                              }))
                            }
                            className="accent-emerald-500 w-4 h-4"
                          />
                          {p.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.avatar_url} alt={p.name}
                              className="w-7 h-7 rounded-full object-cover object-top" />
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
                      {[
                        { label: form.teamAName || "Team A", ids: form.teamA },
                        { label: form.teamBName || "Team B", ids: form.teamB },
                      ].map(({ label, ids }) => (
                        <div key={label} className="bg-gray-50 rounded-xl p-3">
                          <p className="text-xs font-bold mb-1.5 text-center truncate">{label} ({ids.length})</p>
                          {ids.map((id) => {
                            const p = getPlayerById(id);
                            return p ? <p key={id} className="text-xs text-gray-600 truncate">{p.name}</p> : null;
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-2">
              <button
                onClick={() => setShowNew(false)}
                className="flex-1 border border-gray-200 py-3 rounded-xl text-sm font-semibold text-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={createMatch}
                disabled={
                  saving ||
                  (form.type === "official" && !form.team2Name.trim()) ||
                  (form.type === "friendly" && form.selectedPlayers.length < 2)
                }
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
