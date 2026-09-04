import { useEffect, useState } from "react";

/**
 * Isometric container yard for the login screen.
 *
 * Everything here is plain DOM in a CSS `preserve-3d` scene -- no canvas, no
 * WebGL, no extra dependency in the bundle. The ground plane is tilted once on
 * `.auth-yard`; each box below is positioned on that plane in flat x/y and
 * stacked upward with `translateZ`, so the whole yard stays consistent.
 *
 * Styles live in `src/styles/auth.css`.
 */

type BoxProps = {
  x: number;
  y: number;
  /** Height off the ground, for stacked boxes. */
  z?: number;
  /** Length, depth and height of the box itself. */
  w?: number;
  d?: number;
  h?: number;
  color?: string;
  className?: string;
  /**
   * Draw the lid. Only the topmost box in a stack needs one: CSS 3D has no
   * depth buffer, and a box has no back or left face to hide the lid of the
   * box underneath it, so lower lids poke out as a shelf. Top + front + end
   * is already the complete visible hull of a stack.
   */
  capped?: boolean;
};

const boxVars = (w: number, d: number, h: number, color: string) =>
  ({
    ["--w" as string]: `${w}px`,
    ["--d" as string]: `${d}px`,
    ["--h" as string]: `${h}px`,
    ["--c" as string]: color,
  }) as React.CSSProperties;

/** One shipping container. Faces are drawn back-to-front for correct overlap. */
function Box({
  x,
  y,
  z = 0,
  w = 78,
  d = 34,
  h = 30,
  color = "#315EF6",
  className,
  capped = true,
}: BoxProps) {
  return (
    <div
      className={`ctr${className ? ` ${className}` : ""}`}
      style={{
        ...boxVars(w, d, h, color),
        left: x,
        top: y,
        transform: `translateZ(${z}px)`,
      }}
    >
      <i className="f-side" />
      <i className="f-end" />
      {capped && <i className="f-top" />}
    </div>
  );
}

/** Ground shadow, kept separate from the box so stacked boxes don't each cast one. */
function Shadow({
  x,
  y,
  w = 78,
  d = 34,
  className,
}: BoxProps & { className?: string }) {
  return (
    <div
      className={`ctr${className ? ` ${className}` : ""}`}
      style={{ ...boxVars(w, d, 30, "#315EF6"), left: x, top: y }}
    >
      <i className="f-shadow" />
    </div>
  );
}

const BLUE = "#315EF6";
const NAVY = "#1E293B";
const TEAL = "#0D9488";
const RUST = "#EA580C";
const STEEL = "#64748B";
const RED = "#DC2626";

/** Static stacks either side of the lane. [x, y, colors bottom-to-top] */
const STACKS: Array<[number, number, string[]]> = [
  [86, 46, [NAVY, BLUE, TEAL]],
  [200, 96, [RUST, STEEL]],
  [318, 44, [BLUE, NAVY]],
  [92, 310, [TEAL, RED, BLUE]],
  [250, 348, [STEEL, NAVY]],
  [376, 294, [RUST]],
];

/** Containers riding the lane. [y, colour, duration, delay] */
const MOVERS: Array<[number, string, number, number]> = [
  [187, BLUE, 13, 0],
  [187, RUST, 13, -3.3],
  [187, TEAL, 13, -6.5],
  [187, NAVY, 13, -9.8],
];

const STAGES = ["Booked", "Loaded", "In transit", "Delivered"];

export default function ContainerYard() {
  const [stage, setStage] = useState(2);

  useEffect(() => {
    // The CSS animations are already disabled by the global reduced-motion
    // rule; this interval has to opt out on its own.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(
      () => setStage((s) => (s + 1) % STAGES.length),
      2600,
    );
    return () => clearInterval(id);
  }, []);

  return (
    <div className="auth-stage" aria-hidden="true">
      <div className="auth-hud">
        <span className="auth-live">In transit</span>
        <span className="auth-hud-stat">
          ETA <b>04:05</b>
        </span>
        <span className="auth-hud-stat">
          UNITS ON HAND <b>768</b>
        </span>
      </div>

      <div className="auth-scene">
        <div className="auth-yard">
          <div className="auth-ground" />
          <div className="auth-lane" />

          {/* Yard stacks */}
          {STACKS.map(([x, y, colors], i) => (
            <div className="auth-stack" key={i}>
              <Shadow x={x} y={y} />
              {colors.map((color, level) => (
                <Box
                  key={level}
                  x={x}
                  y={y}
                  z={level * 30}
                  color={color}
                  capped={level === colors.length - 1}
                />
              ))}
            </div>
          ))}

          {/* Gantry crane: lifts one container out of the yard and onto the lane.
            Built from the same box primitive as the containers so it shares the
            scene's projection instead of being a flat plank. */}
          <div className="auth-crane">
            <Box
              x={152}
              y={256}
              w={11}
              d={11}
              h={110}
              color={STEEL}
              className="steel"
            />
            <Box
              x={424}
              y={256}
              w={11}
              d={11}
              h={110}
              color={STEEL}
              className="steel"
            />
            <Box
              x={146}
              y={256}
              z={110}
              w={296}
              d={13}
              h={12}
              color={STEEL}
              className="steel"
            />

            <Shadow x={168} y={262} className="auth-hook-shadow" />
            <div className="auth-hook" style={{ left: 168, top: 262 }}>
              <Box x={0} y={0} color={RED} />
              <div
                className="auth-spreader"
                style={{
                  left: -4,
                  top: 12,
                  width: 86,
                  height: 9,
                  transform: "translateZ(33px)",
                }}
              />
            </div>
          </div>

          {/* Containers moving down the lane */}
          {MOVERS.map(([y, color, dur, delay], i) => (
            <div
              className="auth-mover"
              key={i}
              style={
                {
                  left: 0,
                  top: y,
                  ["--dur" as string]: `${dur}s`,
                  ["--delay" as string]: `${delay}s`,
                } as React.CSSProperties
              }
            >
              <Box x={0} y={0} color={color} />
            </div>
          ))}
        </div>
      </div>

      <div className="auth-stages">
        <div className="auth-track">
          {STAGES.map((name, i) => (
            <div key={name} style={{ display: "contents" }}>
              {i > 0 && (
                <div className={`auth-rail${i <= stage ? " done" : ""}`} />
              )}
              <div
                className={`auth-dot${i === stage ? " active" : i < stage ? " done" : ""}`}
              />
            </div>
          ))}
        </div>
        <div className="auth-stage-label">{STAGES[stage]}</div>
      </div>
    </div>
  );
}
