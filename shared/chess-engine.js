// Self-contained chess rules engine: legal move generation, check/checkmate/
// stalemate detection, castling, en passant, promotion, FEN in/out. No
// external chess library — this is the entire rules implementation used by
// both chess.html's local/online games and the AI's search.
//
// Board representation: a flat 64-element array, index = rank * 8 + file,
// where rank 0 is rank 1 (White's back rank) and file 0 is the a-file — so
// index 0 is a1, index 7 is h1, index 63 is h8. Pieces are single chars,
// uppercase = White ('P','N','B','R','Q','K'), lowercase = Black, '' = empty.
// This matches FEN's own rank/file order closely enough that fenToState/
// stateToFen are direct, and keeps every offset calculation (±1 file, ±8
// rank) simple arithmetic instead of needing a coordinate object everywhere.
//
// This file is served with a long browser cache lifetime, so any content or
// behavior change needs its `?v=N` bumped on every
// `from './shared/chess-engine.js?v=N'` import across the site (grep for
// it) — otherwise visitors can sit on a stale cached copy for hours after a
// deploy.

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function fileOf(sq) { return sq % 8; }
export function rankOf(sq) { return Math.floor(sq / 8); }
export function squareName(sq) { return 'abcdefgh'[fileOf(sq)] + (rankOf(sq) + 1); }
export function squareFromName(name) {
  const file = 'abcdefgh'.indexOf(name[0]);
  const rank = Number(name[1]) - 1;
  if (file < 0 || rank < 0 || rank > 7) return -1;
  return rank * 8 + file;
}
function inBounds(file, rank) { return file >= 0 && file <= 7 && rank >= 0 && rank <= 7; }
export function isWhite(piece) { return !!piece && piece === piece.toUpperCase(); }
export function isBlack(piece) { return !!piece && piece === piece.toLowerCase() && piece !== piece.toUpperCase(); }
function colorOf(piece) { return !piece ? null : (isWhite(piece) ? 'w' : 'b'); }

export function fenToState(fen) {
  const [boardPart, turn, castling, epPart, halfmove, fullmove] = fen.trim().split(/\s+/);
  const board = new Array(64).fill('');
  const rows = boardPart.split('/'); // rows[0] is rank 8, rows[7] is rank 1
  for (let r = 0; r < 8; r++) {
    const rank = 7 - r;
    let file = 0;
    for (const ch of rows[r]) {
      if (/\d/.test(ch)) { file += Number(ch); }
      else { board[rank * 8 + file] = ch; file++; }
    }
  }
  return {
    board,
    turn: turn === 'b' ? 'b' : 'w',
    castling: {
      wK: castling.includes('K'), wQ: castling.includes('Q'),
      bK: castling.includes('k'), bQ: castling.includes('q'),
    },
    enPassant: epPart && epPart !== '-' ? squareFromName(epPart) : -1,
    halfmove: Number(halfmove) || 0,
    fullmove: Number(fullmove) || 1,
  };
}

export function stateToFen(state) {
  const rows = [];
  for (let rank = 7; rank >= 0; rank--) {
    let row = '', empty = 0;
    for (let file = 0; file < 8; file++) {
      const p = state.board[rank * 8 + file];
      if (!p) { empty++; continue; }
      if (empty) { row += empty; empty = 0; }
      row += p;
    }
    if (empty) row += empty;
    rows.push(row);
  }
  const c = state.castling;
  const castleStr = (c.wK ? 'K' : '') + (c.wQ ? 'Q' : '') + (c.bK ? 'k' : '') + (c.bQ ? 'q' : '') || '-';
  const epStr = state.enPassant >= 0 ? squareName(state.enPassant) : '-';
  return `${rows.join('/')} ${state.turn} ${castleStr} ${epStr} ${state.halfmove} ${state.fullmove}`;
}

export function initialState() { return fenToState(START_FEN); }

const KNIGHT_OFFSETS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING_OFFSETS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// True if `sq` is attacked by `byColor` ('w'/'b') in the given board array —
// used both for check detection and for verifying a king doesn't move
// through/into check while castling. Pawn attacks are computed directly
// (a pawn "attacks" diagonally regardless of whether it could actually
// legally advance there) rather than reusing pseudo-move generation, since
// the empty-square-only forward move isn't an attack at all.
function isSquareAttacked(board, sq, byColor) {
  const file = fileOf(sq), rank = rankOf(sq);
  const pawnDir = byColor === 'w' ? -1 : 1; // white pawns attack upward, so look one rank below for an attacker
  const pawnChar = byColor === 'w' ? 'P' : 'p';
  for (const df of [-1, 1]) {
    const f = file + df, r = rank + pawnDir;
    if (inBounds(f, r) && board[r * 8 + f] === pawnChar) return true;
  }
  const knightChar = byColor === 'w' ? 'N' : 'n';
  for (const [df, dr] of KNIGHT_OFFSETS) {
    const f = file + df, r = rank + dr;
    if (inBounds(f, r) && board[r * 8 + f] === knightChar) return true;
  }
  const kingChar = byColor === 'w' ? 'K' : 'k';
  for (const [df, dr] of KING_OFFSETS) {
    const f = file + df, r = rank + dr;
    if (inBounds(f, r) && board[r * 8 + f] === kingChar) return true;
  }
  const bishopChars = byColor === 'w' ? 'BQ' : 'bq';
  for (const [df, dr] of BISHOP_DIRS) {
    let f = file + df, r = rank + dr;
    while (inBounds(f, r)) {
      const p = board[r * 8 + f];
      if (p) { if (bishopChars.includes(p)) return true; break; }
      f += df; r += dr;
    }
  }
  const rookChars = byColor === 'w' ? 'RQ' : 'rq';
  for (const [df, dr] of ROOK_DIRS) {
    let f = file + df, r = rank + dr;
    while (inBounds(f, r)) {
      const p = board[r * 8 + f];
      if (p) { if (rookChars.includes(p)) return true; break; }
      f += df; r += dr;
    }
  }
  return false;
}

function findKing(board, color) {
  const king = color === 'w' ? 'K' : 'k';
  return board.indexOf(king);
}

export function isInCheck(state, color) {
  const kingSq = findKing(state.board, color);
  if (kingSq < 0) return false; // shouldn't happen in a real game, but don't blow up mid-search
  return isSquareAttacked(state.board, kingSq, color === 'w' ? 'b' : 'w');
}

// Pseudo-legal moves for the piece on `sq` — obeys how each piece type
// moves and can't capture its own color, but doesn't yet check whether the
// move leaves your own king in check (see legalMovesFrom, which filters
// these). Each move is { from, to, piece, captured, promotion, isEnPassant,
// isCastle: 'K'|'Q'|null, isDoublePawn }.
function pseudoMovesFrom(state, sq) {
  const { board } = state;
  const piece = board[sq];
  if (!piece) return [];
  const color = colorOf(piece);
  if (color !== state.turn) return [];
  const file = fileOf(sq), rank = rankOf(sq);
  const type = piece.toUpperCase();
  const moves = [];
  const push = (to, extra) => moves.push({ from: sq, to, piece, captured: board[to] || null, promotion: null, isEnPassant: false, isCastle: null, isDoublePawn: false, ...extra });

  if (type === 'P') {
    const dir = color === 'w' ? 1 : -1;
    const startRank = color === 'w' ? 1 : 6;
    const promoRank = color === 'w' ? 7 : 0;
    const oneStep = rank + dir;
    if (inBounds(file, oneStep) && !board[oneStep * 8 + file]) {
      if (oneStep === promoRank) {
        for (const promo of ['Q', 'R', 'B', 'N']) push(oneStep * 8 + file, { promotion: promo });
      } else {
        push(oneStep * 8 + file);
        const twoStep = rank + dir * 2;
        if (rank === startRank && !board[twoStep * 8 + file]) push(twoStep * 8 + file, { isDoublePawn: true });
      }
    }
    for (const df of [-1, 1]) {
      const f = file + df, r = rank + dir;
      if (!inBounds(f, r)) continue;
      const to = r * 8 + f;
      if (board[to] && colorOf(board[to]) !== color) {
        if (r === promoRank) { for (const promo of ['Q', 'R', 'B', 'N']) push(to, { promotion: promo }); }
        else push(to);
      } else if (to === state.enPassant) {
        push(to, { isEnPassant: true, captured: color === 'w' ? 'p' : 'P' });
      }
    }
  } else if (type === 'N') {
    for (const [df, dr] of KNIGHT_OFFSETS) {
      const f = file + df, r = rank + dr;
      if (!inBounds(f, r)) continue;
      const to = r * 8 + f;
      if (!board[to] || colorOf(board[to]) !== color) push(to);
    }
  } else if (type === 'K') {
    for (const [df, dr] of KING_OFFSETS) {
      const f = file + df, r = rank + dr;
      if (!inBounds(f, r)) continue;
      const to = r * 8 + f;
      if (!board[to] || colorOf(board[to]) !== color) push(to);
    }
    // Castling: rights still held, squares between king and rook empty, and
    // the king isn't currently in check, doesn't pass through, and doesn't
    // land on an attacked square (checked here rather than left to the
    // generic "does this leave my king in check" filter, since that filter
    // only re-checks the king's final square, not the square it passes
    // through mid-castle).
    const opp = color === 'w' ? 'b' : 'w';
    const backRank = color === 'w' ? 0 : 7;
    if (sq === backRank * 8 + 4 && !isSquareAttacked(board, sq, opp)) {
      const kSide = color === 'w' ? state.castling.wK : state.castling.bK;
      const qSide = color === 'w' ? state.castling.wQ : state.castling.bQ;
      if (kSide && !board[backRank * 8 + 5] && !board[backRank * 8 + 6]
        && !isSquareAttacked(board, backRank * 8 + 5, opp) && !isSquareAttacked(board, backRank * 8 + 6, opp)) {
        push(backRank * 8 + 6, { isCastle: 'K' });
      }
      if (qSide && !board[backRank * 8 + 1] && !board[backRank * 8 + 2] && !board[backRank * 8 + 3]
        && !isSquareAttacked(board, backRank * 8 + 3, opp) && !isSquareAttacked(board, backRank * 8 + 2, opp)) {
        push(backRank * 8 + 2, { isCastle: 'Q' });
      }
    }
  } else {
    const dirs = type === 'B' ? BISHOP_DIRS : type === 'R' ? ROOK_DIRS : [...BISHOP_DIRS, ...ROOK_DIRS];
    for (const [df, dr] of dirs) {
      let f = file + df, r = rank + dr;
      while (inBounds(f, r)) {
        const to = r * 8 + f;
        if (!board[to]) { push(to); }
        else { if (colorOf(board[to]) !== color) push(to); break; }
        f += df; r += dr;
      }
    }
  }
  return moves;
}

// Applies a move to produce a NEW state (the input is never mutated, so
// callers — including the AI's search, which applies and unapplies
// thousands of moves — can freely explore without needing to undo anything).
export function applyMove(state, move) {
  const board = state.board.slice();
  const color = colorOf(move.piece);
  board[move.from] = '';
  board[move.to] = move.promotion ? (color === 'w' ? move.promotion : move.promotion.toLowerCase()) : move.piece;
  if (move.isEnPassant) board[move.to + (color === 'w' ? -8 : 8)] = '';
  if (move.isCastle === 'K') {
    const backRank = rankOf(move.from);
    board[backRank * 8 + 5] = board[backRank * 8 + 7];
    board[backRank * 8 + 7] = '';
  } else if (move.isCastle === 'Q') {
    const backRank = rankOf(move.from);
    board[backRank * 8 + 3] = board[backRank * 8 + 0];
    board[backRank * 8 + 0] = '';
  }

  const castling = { ...state.castling };
  if (move.piece === 'K') { castling.wK = false; castling.wQ = false; }
  if (move.piece === 'k') { castling.bK = false; castling.bQ = false; }
  // Losing rights also fires when a rook is CAPTURED on its home square,
  // not just when it moves — e.g. capturing an untouched a1 rook must
  // permanently remove White's queenside castling even though White's own
  // king/rook never moved.
  for (const sq of [move.from, move.to]) {
    if (sq === 0) castling.wQ = false;
    if (sq === 7) castling.wK = false;
    if (sq === 56) castling.bQ = false;
    if (sq === 63) castling.bK = false;
  }

  return {
    board,
    turn: state.turn === 'w' ? 'b' : 'w',
    castling,
    enPassant: move.isDoublePawn ? (move.from + move.to) / 2 : -1,
    halfmove: (move.captured || move.piece.toUpperCase() === 'P') ? 0 : state.halfmove + 1,
    fullmove: state.turn === 'b' ? state.fullmove + 1 : state.fullmove,
  };
}

// Legal moves from one square: pseudo-legal moves, minus any that would
// leave your own king in check (simulated by actually applying the move to
// a scratch state and checking — simplest correct approach, and this
// engine never needs to be fast enough to justify a cleverer pinned-piece
// shortcut).
export function legalMovesFrom(state, sq) {
  const color = colorOf(state.board[sq]);
  return pseudoMovesFrom(state, sq).filter(move => !isInCheck(applyMove(state, move), color));
}

// Every legal move for whoever's turn it is — the AI's search and
// checkmate/stalemate detection both need the full set, not just one
// square's.
export function allLegalMoves(state) {
  const moves = [];
  for (let sq = 0; sq < 64; sq++) {
    if (state.board[sq] && colorOf(state.board[sq]) === state.turn) moves.push(...legalMovesFrom(state, sq));
  }
  return moves;
}

// Only counts bishops/knights (plus the two bare kings) as ever giving
// insufficient material for checkmate — doesn't attempt the harder same-
// color-bishops-only-draw edge case some rules engines add, since that's a
// rare enough case that either side can still just resign or agree a draw
// through the UI instead.
export function isInsufficientMaterial(state) {
  const pieces = state.board.filter(Boolean).map(p => p.toUpperCase());
  if (pieces.length > 4) return false;
  const nonKings = pieces.filter(p => p !== 'K');
  if (nonKings.length === 0) return true; // K vs K
  if (nonKings.length === 1 && (nonKings[0] === 'N' || nonKings[0] === 'B')) return true; // K+minor vs K
  if (nonKings.length === 2 && nonKings.every(p => p === 'B' || p === 'N')) {
    // K+minor vs K+minor is a draw for any combination except two knights
    // on the SAME side, which the "size <= 4 pieces" cap above already
    // keeps out of this branch (that's 3 non-king pieces, not 2).
    return true;
  }
  return false;
}

// 'active' | 'checkmate' | 'stalemate' | 'insufficientMaterial' | 'fiftyMove'.
// Doesn't detect threefold repetition — that needs hashing the full move
// history, which no caller here (a casual community-site game, not a rated
// ladder) has ever needed enough to justify the extra state-threading.
export function getGameStatus(state) {
  const moves = allLegalMoves(state);
  if (moves.length === 0) return isInCheck(state, state.turn) ? 'checkmate' : 'stalemate';
  if (isInsufficientMaterial(state)) return 'insufficientMaterial';
  if (state.halfmove >= 100) return 'fiftyMove';
  return 'active';
}

// Long algebraic notation ("e2e4", "e7e8q" for promotion) rather than full
// SAN — SAN's disambiguation rules (Nbd2 vs Nfd2, etc.) are a lot of extra
// code this UI's move list has no real need for; "e2 → e4" reads just as
// clearly to a casual player.
export function moveToLan(move) {
  return squareName(move.from) + squareName(move.to) + (move.promotion ? move.promotion.toLowerCase() : '');
}
