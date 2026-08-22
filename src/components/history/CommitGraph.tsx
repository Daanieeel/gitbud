import type { CommitEntry } from "@/lib/types";

const LANE_WIDTH = 14;
const DOT_RADIUS = 3.5;

const LANE_COLORS = [
  "var(--accent-blue)",
  "var(--accent-purple)",
  "var(--accent-green)",
  "var(--accent-yellow)",
  "var(--accent-pink)",
];

function laneColor(lane: number): string {
  return LANE_COLORS[lane % LANE_COLORS.length];
}

interface CommitGraphProps {
  commit: CommitEntry;
  prevActiveLanes: number[] | undefined;
  laneCount: number;
  rowHeight: number;
}

export function CommitGraph({ commit, prevActiveLanes, laneCount, rowHeight }: CommitGraphProps) {
  const width = Math.max(laneCount, commit.lane + 1) * LANE_WIDTH + LANE_WIDTH / 2;
  const midY = rowHeight / 2;
  const x = (lane: number) => lane * LANE_WIDTH + LANE_WIDTH / 2;

  // Lanes that were already live before this row and remain live after it — draw as a
  // continuous vertical line through the whole row (pass-through, doesn't touch this commit).
  const passThroughLanes = (prevActiveLanes ?? commit.active_lanes).filter(
    (l) => l !== commit.lane && commit.active_lanes.includes(l),
  );

  return (
    <svg width={width} height={rowHeight} className="shrink-0 overflow-visible">
      {passThroughLanes.map((lane) => (
        <line
          key={`pass-${lane}`}
          x1={x(lane)}
          y1={0}
          x2={x(lane)}
          y2={rowHeight}
          stroke={laneColor(lane)}
          strokeWidth={1.5}
          opacity={0.5}
        />
      ))}

      {/* Incoming edge from above into this commit's dot. */}
      {(prevActiveLanes ?? []).includes(commit.lane) && (
        <line
          x1={x(commit.lane)}
          y1={0}
          x2={x(commit.lane)}
          y2={midY}
          stroke={laneColor(commit.lane)}
          strokeWidth={1.5}
        />
      )}

      {/* Outgoing edges to each parent's lane. */}
      {commit.parent_lanes.map((parentLane, i) => (
        <path
          key={`edge-${i}`}
          d={
            parentLane === commit.lane
              ? `M ${x(commit.lane)} ${midY} L ${x(commit.lane)} ${rowHeight}`
              : `M ${x(commit.lane)} ${midY} C ${x(commit.lane)} ${rowHeight}, ${x(parentLane)} ${midY}, ${x(parentLane)} ${rowHeight}`
          }
          fill="none"
          stroke={laneColor(parentLane === commit.lane ? commit.lane : parentLane)}
          strokeWidth={1.5}
        />
      ))}

      <circle cx={x(commit.lane)} cy={midY} r={DOT_RADIUS} fill={laneColor(commit.lane)} />
    </svg>
  );
}
