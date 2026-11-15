"use client";

import { useState, useEffect, useCallback } from "react";
import { Trophy, Star, TrendingUp, Loader2, Swords } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { APP_CONFIG } from "@/lib/config";
import type { Match, Player, MatchPlayer } from "@/types";

type Filter = "all" | "official" | "friendly";

export default function StatsTab() {
  const [matches,      setMatches]      = useState<Match[]>([]);
  const [players,      setPlayers]      = useState<Player[]>([]);
  const [matchPlayers, setMatchPlayers] = useState<MatchPlayer[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [filter,       setFilter]       = useState<Filter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: m }, { data: p }, { data: mp }] = await Promise.all([
      supabase.from("matches").select("*").eq("status", "completed").order("match_date", { ascending: false }),
      supabase.from("players").select("*"),
      supabase.from("match_players").select("*"),
    ]);
    if (m)  setMatches(m as Match[]);
    if (p)  setPlayers(p as Player[]);
    if (mp) setMatchPlayers(mp as MatchPlayer[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ── Filtered completed matches ── */
  const completed = matches.filter((m) =>
    filter === "all" ? true : m.type === filter
  );

  /* ── Official stats ── */
  const officialMatches = completed.filter((m) => m.type === "official");
  const wins   = officialMatches.filter((m) => m.score_home > m.score_away).length;
  const losses = officialMatches.filter((m) => m.score_home < m.score_away).length;
  const draws  = officialMatches.filter((m) => m.score_home === m.score_away).length;
  const runsFor     = officialMatches.reduce((s, m) => s + m.score_home, 0);
  const runsAgainst = officialMatches.reduce((s, m) => s + m.score_away, 0);

  /* ── Friendly stats ── */
  const friendlyMatches = completed.filter((m) => m.type === "friendly");
  const teamAWins    = friendlyMatches.filter((m) => m.team_a_score > m.team_b_score).length;
  const teamBWins    = friendlyMatches.filter((m) => m.team_b_score > m.team_a_score).length;
  const friendlyDraws = friendlyMatches.filter((m) => m.team_a_score === m.team_b_score).length;

  /* ── MVP leaderboard ── */
  const mvpCounts: Record<string, number> = {};
  completed.forEach((m) => { if (m.mvp_player_id) mvpCounts[m.mvp_player_id] = (mvpCounts[m.mvp_player_id] ?? 0) + 1; });
  const mvpLeaderboard = Object.entries(mvpCounts)
    .map(([id, count]) => ({ player: players.find((p) => p.id === id), count }))
    .filter((x) => x.player)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  /* ── Top participants ── */
  const participantCounts: Record<string, number> = {};
  matchPlayers
    .filter((mp) => completed.some((m) => m.id === mp.match_id))
    .forEach((mp) => { participantCounts[mp.player_id] = (participantCounts[mp.player_id] ?? 0) + 1; });
  const topParticipants = Object.entries(participantCounts)
    .map(([id, count]) => ({ player: players.find((p) => p.id === id), count }))
    .filter((x) => x.player)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  if (loading) return <div className="flex justify-center items-center h-40"><Loader2 className="animate-spin text-emerald-500" size={28} /></div>;

  return (
    <div className="px-4 pt-4 pb-28 scroll-panel overflow-y-auto space-y-4">

      {/* Filter tabs */}
      <div className="flex gap-1.5 bg-gray-100 p-1 rounded-2xl">
        {(["all", "official", "friendly"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold capitalize transition-colors
              ${filter === f ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
          >
            {f === "all" ? "All" : f === "official" ? "🏏 Official" : "🤝 Friendly"}
          </button>
        ))}
      </div>

      {completed.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Swords size={48} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No completed matches yet</p>
        </div>
      ) : (
        <>
          {/* ── Official record ── */}
          {(filter === "all" || filter === "official") && officialMatches.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="bg-blue-500 px-4 py-3">
                <p className="text-white font-bold text-sm">🏏 Official Match Record</p>
                <p className="text-blue-100 text-xs">{officialMatches.length} matches played</p>
              </div>
              <div className="p-4">
                {/* W-D-L row */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <StatPill label="Wins"   value={wins}   color="emerald" />
                  <StatPill label="Draws"  value={draws}  color="gray"    />
                  <StatPill label="Losses" value={losses} color="red"     />
                </div>
                {/* Runs */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-emerald-50 rounded-xl p-3 text-center">
                    <p className="text-2xl font-black text-emerald-700">{runsFor}</p>
                    <p className="text-xs text-emerald-600 font-semibold">Runs Scored</p>
                  </div>
                  <div className="bg-red-50 rounded-xl p-3 text-center">
                    <p className="text-2xl font-black text-red-600">{runsAgainst}</p>
                    <p className="text-xs text-red-500 font-semibold">Runs Conceded</p>
                  </div>
                </div>
                {/* Win % bar */}
                {officialMatches.length > 0 && (
                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Win rate</span>
                      <span>{Math.round((wins / officialMatches.length) * 100)}%</span>
                    </div>
                    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all"
                        style={{ width: `${(wins / officialMatches.length) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Friendly bragging rights ── */}
          {(filter === "all" || filter === "friendly") && friendlyMatches.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="bg-purple-500 px-4 py-3">
                <p className="text-white font-bold text-sm">🤝 Friendly Bragging Rights</p>
                <p className="text-purple-100 text-xs">{friendlyMatches.length} friendlies played</p>
              </div>
              <div className="p-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1 text-center">
                    <p className="text-4xl font-black text-blue-600">{teamAWins}</p>
                    <p className="text-sm font-bold text-blue-500 mt-1">Team A</p>
                  </div>
                  <div className="text-center">
                    <div className="bg-gray-100 rounded-xl px-4 py-2">
                      <p className="text-xs text-gray-500 font-semibold">{friendlyDraws} draws</p>
                    </div>
                  </div>
                  <div className="flex-1 text-center">
                    <p className="text-4xl font-black text-red-500">{teamBWins}</p>
                    <p className="text-sm font-bold text-red-400 mt-1">Team B</p>
                  </div>
                </div>
                {/* Leader badge */}
                {teamAWins !== teamBWins && (
                  <div className="mt-3 bg-yellow-50 border border-yellow-100 rounded-xl py-2 text-center">
                    <p className="text-sm font-bold text-yellow-700">
                      🏆 {teamAWins > teamBWins ? "Team A" : "Team B"} leads!
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── MVP Leaderboard ── */}
          {mvpLeaderboard.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                <Star size={16} className="text-yellow-500" fill="currentColor" />
                <p className="font-bold text-sm">MVP Leaderboard</p>
              </div>
              <div className="divide-y divide-gray-50">
                {mvpLeaderboard.map(({ player, count }, i) => player && (
                  <div key={player.id} className="flex items-center gap-3 px-4 py-3">
                    <span className={`text-sm font-black w-6 text-center
                      ${i === 0 ? "text-yellow-500" : i === 1 ? "text-gray-400" : i === 2 ? "text-amber-700" : "text-gray-300"}`}>
                      {i + 1}
                    </span>
                    {player.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={player.avatar_url} alt={player.name} className="w-10 h-10 rounded-full object-cover object-top" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center font-black text-gray-400">
                        {player.name[0]}
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="font-semibold text-sm">{player.name}</p>
                      <p className="text-xs text-gray-400">{player.role}</p>
                    </div>
                    <div className="flex items-center gap-1 bg-yellow-50 px-3 py-1 rounded-full">
                      <Star size={11} className="text-yellow-500" fill="currentColor" />
                      <span className="text-sm font-black text-yellow-700">{count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Top participants ── */}
          {topParticipants.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                <TrendingUp size={16} className="text-emerald-500" />
                <p className="font-bold text-sm">Most Appearances</p>
              </div>
              <div className="divide-y divide-gray-50">
                {topParticipants.map(({ player, count }, i) => player && (
                  <div key={player.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-sm font-black w-6 text-center text-gray-300">{i + 1}</span>
                    {player.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={player.avatar_url} alt={player.name} className="w-10 h-10 rounded-full object-cover object-top" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center font-black text-gray-400">
                        {player.name[0]}
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="font-semibold text-sm">{player.name}</p>
                      <p className="text-xs text-gray-400">{player.role}</p>
                    </div>
                    <span className="text-sm font-black text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full">
                      {count} games
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Recent results ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="font-bold text-sm">Recent Results</p>
            </div>
            <div className="divide-y divide-gray-50">
              {completed.slice(0, 10).map((m) => {
                const isOfficial = m.type === "official";
                const homeWin = isOfficial && m.score_home > m.score_away;
                const draw    = isOfficial && m.score_home === m.score_away;
                const aWin    = !isOfficial && m.team_a_score > m.team_b_score;
                return (
                  <div key={m.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold">
                        {isOfficial ? `vs ${m.opponent_name}` : "Team A vs Team B"}
                      </p>
                      <p className="text-xs text-gray-400">{m.match_date}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black">
                        {isOfficial ? `${m.score_home}–${m.score_away}` : `${m.team_a_score}–${m.team_b_score}`}
                      </p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full
                        ${isOfficial
                          ? homeWin ? "bg-emerald-100 text-emerald-700" : draw ? "bg-gray-100 text-gray-500" : "bg-red-100 text-red-600"
                          : !isOfficial ? (aWin ? "bg-blue-100 text-blue-600" : m.team_a_score < m.team_b_score ? "bg-red-100 text-red-500" : "bg-gray-100 text-gray-500") : ""
                        }`}>
                        {isOfficial
                          ? (homeWin ? "W" : draw ? "D" : "L")
                          : (aWin ? "A Wins" : m.team_a_score < m.team_b_score ? "B Wins" : "Draw")}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Stat pill sub-component ── */
function StatPill({ label, value, color }: { label: string; value: number; color: "emerald"|"gray"|"red" }) {
  const styles = {
    emerald: "bg-emerald-50 text-emerald-700",
    gray:    "bg-gray-50 text-gray-600",
    red:     "bg-red-50 text-red-600",
  };
  return (
    <div className={`rounded-xl p-3 text-center ${styles[color]}`}>
      <p className="text-3xl font-black">{value}</p>
      <p className="text-xs font-semibold mt-0.5">{label}</p>
    </div>
  );
}
