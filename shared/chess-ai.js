// A small, honest chess AI — negamax with alpha-beta pruning over
// chess-engine.js's move generator, plus material + piece-square-table
// evaluation. Not a real engine (no transposition table, no quiescence
// search, no opening book) — it's meant to be a fun, beatable opponent for
// a casual community site, not a rated-play-strength bot. Search depth is
// the only difficulty knob: deeper sees further but takes longer, since
// this is a from-scratch full-width search with no time-based cutoff.
//
// This file is served with a long browser cache lifetime, so any content or
// behavior change needs its `?v=N` bumped on every
// `from './shared/chess-ai.js?v=N'` import across the site (grep for it) —
// otherwise visitors can sit on a stale cached copy for hours after a
// deploy.

import { allLegalMoves, applyMove, isInCheck } from './chess-engine.js?v=1';

export const DIFFICULTIES = { easy: 1, medium: 2, hard: 3 };

const PIECE_VALUE = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };

// Standard "where does this piece type want to be" bonus tables, indexed
// a1..h8 (rank-major, matching the engine's own square numbering) from
// WHITE's point of view — flipped vertically for Black at lookup time,
// since these tables encode "toward the opponent's side is good", which is
// "up" for White and "down" for Black.
const PAWN_TABLE = [
  0, 0, 0, 0, 0, 0, 0, 0,
  5, 10, 10, -20, -20, 10, 10, 5,
  5, -5, -10, 0, 0, -10, -5, 5,
  0, 0, 0, 20, 20, 0, 0, 0,
  5, 5, 10, 25, 25, 10, 5, 5,
  10, 10, 20, 30, 30, 20, 10, 10,
  50, 50, 50, 50, 50, 50, 50, 50,
  0, 0, 0, 0, 0, 0, 0, 0,
];
const KNIGHT_TABLE = [
  -50, -40, -30, -30, -30, -30, -40, -50,
  -40, -20, 0, 5, 5, 0, -20, -40,
  -30, 5, 10, 15, 15, 10, 5, -30,
  -30, 0, 15, 20, 20, 15, 0, -30,
  -30, 5, 15, 20, 20, 15, 5, -30,
  -30, 0, 10, 15, 15, 10, 0, -30,
  -40, -20, 0, 0, 0, 0, -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50,
];
const BISHOP_TABLE = [
  -20, -10, -10, -10, -10, -10, -10, -20,
  -10, 5, 0, 0, 0, 0, 5, -10,
  -10, 10, 10, 10, 10, 10, 10, -10,
  -10, 0, 10, 10, 10, 10, 0, -10,
  -10, 5, 5, 10, 10, 5, 5, -10,
  -10, 0, 5, 10, 10, 5, 0, -10,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -20, -10, -10, -10, -10, -10, -10, -20,
];
const ROOK_TABLE = [
  0, 0, 0, 5, 5, 0, 0, 0,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  5, 10, 10, 10, 10, 10, 10, 5,
  0, 0, 0, 0, 0, 0, 0, 0,
];
const QUEEN_TABLE = [
  -20, -10, -10, -5, -5, -10, -10, -20,
  -10, 0, 5, 0, 0, 0, 0, -10,
  -10, 5, 5, 5, 5, 5, 0, -10,
  0, 0, 5, 5, 5, 5, 0, -5,
  -5, 0, 5, 5, 5, 5, 0, -5,
  -10, 0, 5, 5, 5, 5, 0, -10,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -20, -10, -10, -5, -5, -10, -10, -20,
];
const KING_TABLE = [
  20, 30, 10, 0, 0, 10, 30, 20,
  20, 20, 0, 0, 0, 0, 20, 20,
  -10, -20, -20, -20, -20, -20, -20, -10,
  -20, -30, -30, -40, -40, -30, -30, -20,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
];
const TABLES = { P: PAWN_TABLE, N: KNIGHT_TABLE, B: BISHOP_TABLE, R: ROOK_TABLE, Q: QUEEN_TABLE, K: KING_TABLE };

// Score from White's perspective (positive = good for White) — negamax
// negates this per side when it recurses, rather than each side needing
// its own signed table.
function evaluate(state) {
  let score = 0;
  for (let sq = 0; sq < 64; sq++) {
    const piece = state.board[sq];
    if (!piece) continue;
    const type = piece.toUpperCase();
    const white = piece === type;
    const tableIdx = white ? sq : (sq ^ 56); // ^56 flips the rank (mirrors the table vertically) for Black
    const value = PIECE_VALUE[type] + TABLES[type][tableIdx];
    score += white ? value : -value;
  }
  return score;
}

// Captures searched before quiet moves — a cheap, well-known ordering
// heuristic that lets alpha-beta prune far more of the tree than
// evaluating moves in board order would, since a good capture is likely to
// raise alpha (or trigger a beta cutoff) immediately.
function orderMoves(moves) {
  return moves.slice().sort((a, b) => (b.captured ? PIECE_VALUE[b.captured.toUpperCase()] : 0) - (a.captured ? PIECE_VALUE[a.captured.toUpperCase()] : 0));
}

const MATE_SCORE = 1000000;

// Negamax: returns the best score for the side to move, from that side's
// own perspective (so a caller always maximizes what this returns,
// regardless of color) — `sign` is +1 for White's turn, -1 for Black's,
// converting evaluate()'s White-relative score into "good for whoever's
// moving now" at the leaves.
function negamax(state, depth, alpha, beta, sign) {
  if (depth === 0) return sign * evaluate(state);
  const moves = orderMoves(allLegalMoves(state));
  if (moves.length === 0) {
    if (isInCheck(state, state.turn)) return -MATE_SCORE - depth; // checkmate — worse the sooner it happens, so prefer delaying it if already lost, and prefer the fastest mate if winning
    return 0; // stalemate
  }
  let best = -Infinity;
  for (const move of moves) {
    const next = applyMove(state, move);
    const score = -negamax(next, depth - 1, -beta, -alpha, -sign);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break; // beta cutoff
  }
  return best;
}

// Picks a move for the side to move at `state`, searching `depth` ply
// (see DIFFICULTIES). Returns null if there are no legal moves (game
// already over — callers should check getGameStatus() before calling this
// rather than relying on a null return to mean that).
export function pickAiMove(state, depth) {
  const moves = orderMoves(allLegalMoves(state));
  if (moves.length === 0) return null;
  const sign = state.turn === 'w' ? 1 : -1;
  let best = null, bestScore = -Infinity;
  let alpha = -Infinity;
  const beta = Infinity;
  for (const move of moves) {
    const next = applyMove(state, move);
    const score = -negamax(next, depth - 1, -beta, -alpha, -sign);
    if (score > bestScore) { bestScore = score; best = move; }
    if (bestScore > alpha) alpha = bestScore;
  }
  return best;
}
