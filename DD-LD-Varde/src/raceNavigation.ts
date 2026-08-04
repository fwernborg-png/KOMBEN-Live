export type RaceNavigationTrack = {
  id: number;
  name: string;
};

export type RaceNavigationRace = {
  id: string;
  raceNumber: number;
  startTime?: string;
  finishOrder: number[];
};

export type NextUpcomingRace = {
  trackId: number;
  trackName: string;
  raceId: string;
  raceNumber: number;
  startTime: string;
  startTimeMs: number;
};

export function isRaceFinished(
  race: Pick<RaceNavigationRace, "finishOrder">,
): boolean {
  return race.finishOrder.length > 0;
}

export function findNextUpcomingRace(args: {
  tracks: RaceNavigationTrack[];
  racesByTrack: Record<number, RaceNavigationRace[]>;
  nowMs: number;
}): NextUpcomingRace | null {
  const candidates: NextUpcomingRace[] = [];

  for (const track of args.tracks) {
    const races = args.racesByTrack[track.id] ?? [];

    for (const race of races) {
      if (isRaceFinished(race) || !race.startTime) {
        continue;
      }

      const startTimeMs = Date.parse(race.startTime);

      if (!Number.isFinite(startTimeMs) || startTimeMs <= args.nowMs) {
        continue;
      }

      candidates.push({
        trackId: track.id,
        trackName: track.name,
        raceId: race.id,
        raceNumber: race.raceNumber,
        startTime: race.startTime,
        startTimeMs,
      });
    }
  }

  candidates.sort((left, right) => {
    if (left.startTimeMs !== right.startTimeMs) {
      return left.startTimeMs - right.startTimeMs;
    }

    if (left.trackId !== right.trackId) {
      return left.trackId - right.trackId;
    }

    return left.raceNumber - right.raceNumber;
  });

  return candidates[0] ?? null;
}
