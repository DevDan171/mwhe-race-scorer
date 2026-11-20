# Scoring rules

Implemented by `scoreRace` in `packages/core`. The demo fixture in `createDemoRace` exercises a duplicate punch, an unknown number, an over-limit punch, a penalty, a DNF, and a DQ.

## Which punches count

1. Dedupe by `uuid`. If any copy is voided, the punch is voided. An undo still wins when an older copy arrives later. Otherwise the first copy is kept.
2. Ignore voided punches.
3. Ignore a punch whose timestamp is before that rider's start. Warning: `punch_before_start`.
4. Ignore a punch whose `checkId` is not on the course. Warning: `unknown_check`.
5. On a timed race, and on a one-lap race, a punch at or before `start + minutes` counts when the race has a time limit. A punch after that is over-limit: it is shown on the row and it does not count as a check or toward total time. The minutes are counted from that rider's own start. A one-lap race and a timed race still count distinct checks. A blank lap count (`laps: null`) is neither a lap count nor a time limit. Scoring treats it like today's lap race (distinct checks, no clock limit) and the laptop warns that the race needs a mode.
6. The boundary is inclusive. A punch at the exact limit counts.
7. A race whose length is more than one lap assigns every pass in course order: lap 1 is check 1 through the finish, then lap 2, and so on. The finish is the last check on the course. Each check and the finish can be passed once per lap. A pass that arrives sooner than the minimum gap after the last counted pass of that same check is flagged `pass_too_soon` and is not counted. A pass that is not the next check in course order is flagged `pass_out_of_order` and is not counted. Both stay on the row. The default gap is 2 minutes (`DEFAULT_MIN_PASS_GAP_MS`). Zero turns that flag off.
8. Lap-count mode with more than one lap: once the rider has that many counted finishes, later passes are stored and shown with reason `after_lap_count` and are not scored. Time-limit mode, and a race set to exactly one lap, stay on the distinct-check path above. Passes after the rider's start plus the limit are recorded and not scored.

Checks on a timed or one-lap race are the distinct in-limit `checkId`s. A second punch at the same check does not add a check. On a multi-lap race, checks are the counted passes, including the finish.

The check row uses the earliest in-limit punch at that check for cumulative and segment time. If the only punches at that check are over-limit, the row shows the earliest of those and `overLimit: true`.

Segment time follows course order, not the order the rider punched. The first shown check's segment equals its cumulative time. Later segments are the difference from the previous shown check.

## Total time

Total time is the chronologically last in-limit punch minus the start, plus every penalty.

A later punch at an earlier check extends total time even though the check count stays the same and that check's cumulative time stays on the first arrival. This matches the written rule ("last valid punch"). It is an owner decision. See below.

Penalties are whole seconds. Check-scoped and overall penalties both add to total time. A check penalty is also shown on that check's row. It is not baked into the cumulative punch time, so the row still shows the clock.

A penalty whose check is not on the course still adds to the total, with warning `unknown_check_penalty`. A penalty for a course check the rider never punched still adds to the total, with warning `penalty_without_punch`.

If the rider has no scored punch, `elapsedSeconds` and `totalTimeSeconds` stay null. Penalties are listed and do not invent a time.

## Start rows

Row numbers run across the whole race. Pro can be row 1, class A rows 2 through 4, and +40A row 5. A class may be on more than one of those rows.

Row 1 leaves at the race's planned start. Row N leaves `(N - 1) * rowGapSeconds` later. The row number is used as written, so a missing number still leaves the gap. An empty row still holds its number. No planned start means the rows have no clock.

A start row is per race. `assignedRows` lists `{ raceId, row }` for the races that assigned one. An entry is used on a race when `raceId` matches and `row` is one of that class's rows on that race. A number stored for a different race is ignored here.

When this race did not assign a row, or the number is not one of this class's rows, the laptop places the rider by registration time:

1. Sort the unassigned riders in the class by `registeredAt`, earliest first. A missing time sorts after every known time.
2. The same timestamp, or two missing times, breaks by the lower rider number.
3. Split them into contiguous blocks, one block per row of that class, as evenly as possible.
4. Earlier rows get the extra rider when the count does not divide evenly. The earliest registrations go on the earliest row.
5. Riders who were assigned a row on this race stay there. They are not part of the split, so one assignment does not reshuffle everyone else.
6. Inside a row, riders line up in that same registration order.

`registeredAt` is the site's `created_date` on the row that was sent. When a roster rider also has a pre-entry, the earlier of the two `created_date` values is used. A rider added on the laptop uses the time of that change.

The clock a rider actually starts on is chosen in this order:

1. A start edited by hand on the laptop (`start_time`). The last edit wins. The changelog records who, the time before, and the time after.
2. An individual start from the start phone (late starter or wrong row). A voided copy does not count. The latest live one wins.
3. A row go. A laptop edit of that row (`source: "laptop"`) beats the phone tap. Otherwise the latest live tap wins. That time replaces the planned row clock for every rider on the row who has no better start.
4. The planned row clock: planned start plus the row gap.

A voided row go or individual start falls through to the next source. The time limit and the elapsed time are counted from the clock this list picks.

## No start time

The time limit and the elapsed time are both measured from the rider's start. Punches with no start are not scored. Warning: `missing_start_time`. That happens when the race has no planned start and nobody entered a start for the rider. Penalty seconds are recorded on the row and are not added into a total.

## Status

- `finished`: at least one in-limit check, and not DQ.
- `DNF`: registered, or otherwise in the result, with zero scoring checks. A start is not required. DNS is not a separate status. A rider who started and punched nothing, a rider who only has voided or over-limit punches, and a registered rider with no start are all `DNF`.
- `DQ`: set by the race director or an admin. DQ wins over finished and DNF. The row still shows checks and time. Positions are null.

An unknown number (punched, not registered) is named `UNKNOWN`, `class` is null, and `unknown` is true. They get an overall position and no class position.

## Ranking

There are no ties.

1. More scoring checks ranks higher.
2. Then lower total time. A null time sorts after any real time.
3. Then the earlier last in-limit punch. A missing punch sorts last.
4. Then the lower rider number.

DQ is not ranked. Everyone else, including DNF, gets an overall position and a class position. Unknown numbers are in the overall order only.

Class position is computed with the same sort, inside the class.

## Series points

Points come from class position, and only for `status: "finished"`.

| Place        | Points       |
| ------------ | ------------ |
| 1            | 25           |
| 2            | 22           |
| 3            | 20           |
| 4            | 18           |
| 5            | 16           |
| 6            | 15           |
| 7 through 20 | 14 down to 1 |
| 21+          | 0            |

DNF, DQ, and unknown numbers score 0. A DNF still has a place number in the race result. That place does not pay points.

`rankSeries` sums points per rider per class. A rider who switches classes has a standing in each class.

A points tie is broken by the better classified finish at the most recent event. Newer `YYYY-MM-DD` wins. Same-day events break by `eventId` ascending, which is only there so the order is stable. A classified finish beats no finish. DNF, DQ, and "not in that event" are all "no finish".

TODO(series-points-tiebreak): when neither rider has a classified finish at the most recent event, the owner has not decided the tie-break. The code walks back through older events with the same rule, then uses the lower rider number. `ClassStandings.usedOpenTieBreakFallback` is true when a tie actually takes that path. Whether a DNF should count as "raced" differently from a DNS or an absence is part of the open question.

## Protest window

`PROTEST_WINDOW_MINUTES` is 30. Scoring stores `provisional` or `official` as the caller asks. It does not watch the clock. The laptop publishes provisional results, then republishes `official` with a higher `version` after the window.

## Decisions for the owner

These are encoded so the tests have one answer. Change them in `packages/core` if the series wants a different rule.

1. Last punch means the latest in-limit timestamp, not the furthest check on the course. A re-punch can make total time longer.
2. Check cumulative time uses the first in-limit arrival at that check.
3. One result row per check. An in-limit punch hides a later over-limit punch at the same check.
4. DNS is DNF. A registered rider with no start is included as DNF.
5. DNF riders get place numbers and zero points.
6. DQ is unranked and scores zero points. Their checks and time stay on the row.
7. Unknown numbers are ranked overall, have no class, and score zero points.
8. The final race tie-break is lower rider number.
9. Both penalty scopes add to total time, including a penalty for a check that was not punched.
10. Penalties do not create a time for a rider with no scored punch, and they do not apply until a start exists.
11. Any voided copy of a uuid drops that punch.
12. The series-points fallback when neither rider has a finish at the latest event is still open. The walk-back is a placeholder.
13. A timed race counts its limit from each rider's own start. Precedence is hand-edited start, then individual start, then row go, then the planned row clock.
14. End mode is per race. A set lap count uses lap-count mode. Otherwise a time limit uses time-limit mode. A race with neither (`laps: null`) warns and still scores like a lap race with no clock limit: distinct checks, no enforced lap count. More than one lap assigns passes in course order. Later passes after the lap count, a too-soon repeat, and an out-of-order pass are shown and not scored. The minimum gap between counted passes of the same check defaults to 2 minutes.
15. Riders with no assigned start row on this race are split by registration time, earliest signup on the earliest row. A missing time sorts last. The same time breaks by the lower rider number.
16. Ranking on a multi-lap race is most counted passes (checks and finish), then lowest time from the rider's start to their last counted pass, plus penalties, then the earlier last counted pass, then the lower number. A timed race and a one-lap race keep the distinct-check ranking from before.
