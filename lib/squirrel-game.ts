// Screen-space coordinates, independent of the camera, viewport and React.
export type Point = { x: number; y: number };
export type GamePhase = "ready" | "waiting" | "entering" | "encounter" | "playing" | "escaping" | "escaped" | "caught";
export type Shot = { end: Point; elapsed: number; duration: number };
export type SquirrelGameState = {
  phase: GamePhase;
  seed: number;
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

// Each leg crosses the arena and advances to a different depth. Round just
// the corners so the squirrel plants, turns and runs down a readable diagonal.
function cornerHash(seed: number, index: number) {
  const hash = Math.imul(seed ^ index, 0x45d9f3b);
  return Math.imul(hash ^ (hash >>> 16), 0x45d9f3b) >>> 0;
}
function zigzagCorner(seed: number, index: number): Point {
  // Cross several diagonal lanes before changing depth direction. Each new
  // sweep gets its own turn, depths and sides, instead of repeating a lap.
  const sweep = Math.floor(index / 7), lane = index - 7 * sweep;
  const pattern = cornerHash(seed ^ 0x735a2d, sweep), corner = cornerHash(seed, index);
  const turn = 2 + (pattern % 4);
  const position = lane <= turn ? lane / turn : (7 - lane) / (7 - turn);
  const near = -.73 - .24 * ((pattern >>> 8) & 255) / 255;
  const far = .73 + .24 * ((pattern >>> 16) & 255) / 255;
  const variation = lane === 0 || lane === turn ? 0 : .12 * ((corner >>> 16) / 0xffff * 2 - 1);
  const width = .94 + .05 * (corner & 0xffff) / 0xffff;
  return {
    x: (index % 2 ? 1 : -1) * width,
    y: near + (far - near) * position + variation,
  };
}

export function squirrelZigzag(seed: number, progress: number): Point {
  const index = Math.floor(progress), time = progress - index;
  // A stride accelerates away from the planted foot on each change of direction.
  const fraction = time - .6 * Math.sin(2 * Math.PI * time) / (2 * Math.PI);
  const rounding = .12;
  const from = zigzagCorner(seed, index), to = zigzagCorner(seed, index + 1);
  if (fraction >= rounding && fraction <= 1 - rounding) {
    return { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction };
  }
  const atStart = fraction < rounding;
  const corner = atStart ? from : to;
  const previous = atStart ? zigzagCorner(seed, index - 1) : from;
  const next = atStart ? to : zigzagCorner(seed, index + 2);
  const t = ((atStart ? fraction : fraction - 1) + rounding) / (2 * rounding);
  const incoming = rounding * (1 - t) ** 2, outgoing = rounding * t ** 2;
  return {
    x: corner.x + incoming * (previous.x - corner.x) + outgoing * (next.x - corner.x),
    y: corner.y + incoming * (previous.y - corner.y) + outgoing * (next.y - corner.y),
  };
}

// Measure the same 300 × 340 sprite for both its runway and its collision ellipse.
export const practiceSprite = { widthPercent: 28, heightPercent: 30, maxWidth: 140, aspectHeight: 340 / 300, margin: 8 } as const;

export function practiceGeometry(width = 366, height = 516) {
  const spriteWidth = Math.min(width * practiceSprite.widthPercent / 100, height * practiceSprite.heightPercent / 100, practiceSprite.maxWidth);
  const spriteHeight = spriteWidth * practiceSprite.aspectHeight;
  // Include the animated tail, paws and shadow. Leave the launcher its own lane.
  const insetX = (spriteWidth / 2 + practiceSprite.margin) / width;
  const insetY = (spriteHeight / 2 + practiceSprite.margin) / height;
  const launcherRadius = Math.min(45, width * .10, height * .14);
  return {
    spriteWidth, launcherSize: 2 * launcherRadius, insetX, top: insetY, bottom: 1 - insetY,
    launcherTop: Math.max(insetY, launchPoint.y - (launcherRadius + 15) / height - insetY),
    launcherLane: (spriteWidth / 2 + launcherRadius + 8) / width,
    radiusX: .34 * spriteWidth / width,
    radiusY: .45 * spriteHeight / height,
  };
}

const portraitPractice = practiceGeometry();
type PracticeGeometry = ReturnType<typeof practiceGeometry>;

export function initialGame(seed = Math.floor(Math.random() * 0x100000000)): SquirrelGameState {
  return { phase: "ready", seed, elapsed: 0, playElapsed: 0, round: 0, balls: 3, catches: 0, score: 0, shot: null, feedback: "none", feedbackTime: 0 };
}

export function nextRound(state: SquirrelGameState): SquirrelGameState {
  return { ...state, phase: "waiting", seed: cornerHash(state.seed, state.round + 1), elapsed: 0, playElapsed: 0, round: state.round + 1, balls: 3, shot: null, feedback: "none", feedbackTime: 0 };
}

export function beginCatch(state: SquirrelGameState): SquirrelGameState {
  return state.phase === "encounter" ? { ...state, phase: "playing", elapsed: 0 } : state;
}

export function squirrelPosition(state: SquirrelGameState, reducedMotion = false, field = portraitPractice): Point {
  if (reducedMotion) return { x: .5, y: clamp(.43, field.top, field.bottom) };

  const path = squirrelZigzag(state.seed, 1.5 + state.playElapsed / 570);
  // The rounded corners end just inside ±.9. Use the available left and right lanes.
  const x = .5 - clamp(path.x / .9, -1, 1) * (.5 - field.insetX);
  // At the sides the full height is available. Across the middle pass above the ball.
  const besideLauncher = clamp((Math.abs(x - .5) - field.launcherLane) / .055, 0, 1);
  const bottom = field.launcherTop + (field.bottom - field.launcherTop) * besideLauncher ** 2 * (3 - 2 * besideLauncher);
  const y = field.top + (1 - path.y) / 2 * (bottom - field.top);
  if (state.phase === "entering") {
    const t = clamp(state.elapsed / gameTiming.entering, 0, 1);
    return { x: (1 - field.insetX) * (1 - t) + x * t, y: field.bottom * (1 - t) + y * t };
  }
  if (state.phase === "escaping") {
    const t = clamp(state.elapsed / gameTiming.escaping, 0, 1);
    const edge = x < .5 ? 1 - field.insetX : field.insetX;
    return { x: x + (edge - x) * t, y: y + (field.top - y) * t };
  }
  return { x, y };
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
function hitsTarget(from: Point, to: Point, targetFrom: Point, targetTo: Point, field: PracticeGeometry) {
  const a = { x: (from.x - targetFrom.x) / field.radiusX, y: (from.y - targetFrom.y) / field.radiusY };
  const b = { x: (to.x - targetTo.x) / field.radiusX, y: (to.y - targetTo.y) / field.radiusY };
  const dx = b.x - a.x, dy = b.y - a.y;
  const distance = dx * dx + dy * dy;
  const t = distance ? clamp(-(a.x * dx + a.y * dy) / distance, 0, 1) : 0;
  return (a.x + dx * t) ** 2 + (a.y + dy * t) ** 2 <= 1;
}

export function advanceGame(state: SquirrelGameState, delta: number, reducedMotion = false, field = portraitPractice): SquirrelGameState {
  if (!Number.isFinite(delta) || delta <= 0 || state.phase === "ready" || state.phase === "caught") return state;
  let next = { ...state, elapsed: state.elapsed + delta, feedbackTime: Math.max(0, state.feedbackTime - delta) };
  if (state.phase === "encounter") next.playElapsed += delta * .55;
  if (next.feedbackTime === 0) next.feedback = "none";
  if (state.phase === "playing") {
    next.playElapsed += delta;
    if (state.shot) {
      next.shot = { ...state.shot, elapsed: state.shot.elapsed + delta };
      if (hitsTarget(shotPosition(state.shot), shotPosition(next.shot), squirrelPosition(state, reducedMotion, field), squirrelPosition(next, reducedMotion, field), field)) {
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
