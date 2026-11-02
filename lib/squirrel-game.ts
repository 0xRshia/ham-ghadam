// Screen-space coordinates, independent of the camera, viewport and React.
export type Point = { x: number; y: number };
export type GamePhase = "ready" | "waiting" | "entering" | "encounter" | "playing" | "escaping" | "escaped" | "caught";
export type Shot = { end: Point; elapsed: number; duration: number };
export type SquirrelGameState = {
  phase: GamePhase;
  elapsed: number;
  playElapsed: number;
  round: number;
  balls: number;
  catches: number;
  score: number;
  shot: Shot | null;
  feedback: "none" | "short" | "miss";
  feedbackTime: number;
};

export const gameTiming = { waiting: 800, entering: 1000, encounter: 5000, playing: 20000, escaping: 850, escaped: 5000 } as const;
export const launchPoint: Point = { x: 0.5, y: 0.9 };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function initialGame(): SquirrelGameState {
  return { phase: "ready", elapsed: 0, playElapsed: 0, round: 0, balls: 3, catches: 0, score: 0, shot: null, feedback: "none", feedbackTime: 0 };
}

export function nextRound(state: SquirrelGameState): SquirrelGameState {
  return { ...state, phase: "waiting", elapsed: 0, playElapsed: 0, round: state.round + 1, balls: 3, shot: null, feedback: "none", feedbackTime: 0 };
}

export function beginCatch(state: SquirrelGameState): SquirrelGameState {
  return state.phase === "encounter" ? { ...state, phase: "playing", elapsed: 0, playElapsed: 0 } : state;
}

export function squirrelPosition(state: SquirrelGameState, reducedMotion = false): Point {
  if (state.phase !== "playing") return { x: 0.5, y: 0.43 };
  return { x: reducedMotion ? 0.5 : 0.5 + 0.22 * Math.sin(state.playElapsed / 1050), y: 0.28 };
}

export function planThrow(start: Point, end: Point, duration: number): Shot | null {
  const rise = start.y - end.y;
  if (![start.x, start.y, end.x, end.y, duration].every(Number.isFinite) || rise < 0.08 || duration > 1800 || duration < 20) return null;
  const range = Math.min(0.88, rise * 2.4);
  return {
    end: { x: clamp(launchPoint.x + (end.x - start.x) / rise * range, -0.5, 1.5), y: launchPoint.y - range },
    elapsed: 0,
    duration: clamp(1000 - rise / Math.max(60, duration) * 120000, 500, 850),
  };
}

export function throwBall(state: SquirrelGameState, shot: Shot | null): SquirrelGameState {
  if (state.phase !== "playing" || state.shot || state.balls <= 0) return state;
  if (!shot) return { ...state, feedback: "short", feedbackTime: 1400 };
  return { ...state, balls: state.balls - 1, shot, feedback: "none", feedbackTime: 0 };
}

export function shotPosition(shot: Shot): Point {
  const progress = clamp(shot.elapsed / shot.duration, 0, 1);
  return { x: launchPoint.x + (shot.end.x - launchPoint.x) * progress, y: launchPoint.y + (shot.end.y - launchPoint.y) * progress - 0.08 * Math.sin(Math.PI * progress) };
}

// Sweep the ball against the moving target, so a dropped frame cannot skip a hit.
function hitsTarget(from: Point, to: Point, targetFrom: Point, targetTo: Point) {
  const a = { x: (from.x - targetFrom.x) / 0.115, y: (from.y - targetFrom.y) / 0.12 };
  const b = { x: (to.x - targetTo.x) / 0.115, y: (to.y - targetTo.y) / 0.12 };
  const dx = b.x - a.x, dy = b.y - a.y;
  const distance = dx * dx + dy * dy;
  const t = distance ? clamp(-(a.x * dx + a.y * dy) / distance, 0, 1) : 0;
  return (a.x + dx * t) ** 2 + (a.y + dy * t) ** 2 <= 1;
}

export function advanceGame(state: SquirrelGameState, delta: number, reducedMotion = false): SquirrelGameState {
  if (!Number.isFinite(delta) || delta <= 0 || state.phase === "ready" || state.phase === "caught") return state;
  let next = { ...state, elapsed: state.elapsed + delta, feedbackTime: Math.max(0, state.feedbackTime - delta) };
  if (next.feedbackTime === 0) next.feedback = "none";
  if (state.phase === "playing") {
    next.playElapsed += delta;
    if (state.shot) {
      next.shot = { ...state.shot, elapsed: state.shot.elapsed + delta };
      if (hitsTarget(shotPosition(state.shot), shotPosition(next.shot), squirrelPosition(state, reducedMotion), squirrelPosition(next, reducedMotion))) {
        return { ...next, phase: "caught", elapsed: 0, shot: null, catches: state.catches + 1, score: state.score + 100 + state.balls * 25 };
      }
      if (next.shot.elapsed >= next.shot.duration) {
        next.shot = null;
        next.feedback = "miss";
        next.feedbackTime = 1200;
      }
    }
    if (next.elapsed >= gameTiming.playing || (!next.shot && next.balls === 0)) return { ...next, phase: "escaping", elapsed: 0, shot: null };
    return next;
  }
  const transitions: Partial<Record<GamePhase, GamePhase>> = { waiting: "entering", entering: "encounter", encounter: "escaping", escaping: "escaped" };
  if (state.phase === "escaped" && next.elapsed >= gameTiming.escaped) return nextRound(next);
  const duration = gameTiming[state.phase as keyof typeof gameTiming];
  if (transitions[state.phase] && next.elapsed >= duration) next = { ...next, phase: transitions[state.phase]!, elapsed: 0 };
  return next;
}
