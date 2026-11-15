export type PlayerRole =
  | "Goalkeeper"
  | "Defender"
  | "Midfielder"
  | "Forward"
  | "All-rounder";

export type MatchType = "official" | "friendly";
export type MatchStatus = "upcoming" | "live" | "completed";
export type TeamSide = "home" | "away" | "team_a" | "team_b";
export type PaymentStatus = "paid" | "pending";
export type TransactionType = "income" | "expense";

export interface Player {
  id: string;
  name: string;
  role: string;
  jersey_number: number | null;
  phone: string | null;
  avatar_url: string | null;
  is_available: boolean;
  created_at: string;
}

export interface Match {
  id: string;
  type: MatchType;
  opponent_name: string | null;
  match_date: string;
  status: MatchStatus;
  score_home: number;
  score_away: number;
  team_a_score: number;
  team_b_score: number;
  mvp_player_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface MatchPlayer {
  id: string;
  match_id: string;
  player_id: string;
  team_side: TeamSide;
  created_at: string;
}

export interface MatchFee {
  id: string;
  match_id: string;
  player_id: string;
  amount: number;
  status: PaymentStatus;
  created_at: string;
}

export interface KittyTransaction {
  id: string;
  type: TransactionType;
  description: string;
  amount: number;
  match_id: string | null;
  date: string;
  created_at: string;
}

export type TabId = "squad" | "payments" | "matches" | "stats";
