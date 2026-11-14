# Scoring rules

Implemented by `scoreRace` in `packages/core`. The demo fixture in `createDemoRace` exercises a duplicate punch, an unknown number, an over-limit punch, a penalty, a DNF, and a DQ.

## Which punches count

1. Dedupe by `uuid`. If any copy is voided, the punch is voided. An undo still wins when an older copy arrives later. Otherwise the first copy is kept.
2. Ignore voided punches.
3. Ignore a punch whose timestamp is before that rider's start. Warning: `punch_before_start`.
4. Ignore a punch whose `checkId` is not on the course. Warning: `unknown_check`.
5. A punch at or before `start + timeLimitMinutes` counts. A punch after that is over-limit: it is shown on the row and it does not count as a check or toward total time.
6. The boundary is inclusive. A punch at the exact limit counts.

Checks are the distinct in-limit `checkId`s. A second punch at the same check does not add a check.

The check row uses the earliest in-limit punch at that check for cumulative and segment time. If the only punches at that check are over-limit, the row shows the earliest of those and `overLimit: true`.

Segment time follows course order, not the order the rider punched. The first shown check's segment equals its cumulative time. Later segments are the difference from the previous shown check.

## Total time

Total time is the chronologically last in-limit punch minus the start, plus every penalty.

A later punch at an earlier check extends total time even though the check count stays the same and that check's cumulative time stays on the first arrival. This matches the written rule ("last valid punch"). It is an owner decision. See below.

Penalties are whole seconds. Check-scoped and overall penalties both add to total time. A check penalty is also shown on that check's row. It is not baked into the cumulative punch time, so the row still shows the clock.

A penalty whose check is not on the course still adds to the total, with warning `unknown_check_penalty`. A penalty for a course check the rider never punched still adds to the total, with warning `penalty_without_punch`.

If the rider has no scored punch, `elapsedSeconds` and `totalTimeSeconds` stay null. Penalties are listed and do not invent a time.

## No start time

The time limit and the elapsed time are both measured from the rider's start. Punches with no start are not scored. Warning: `missing_start_time`. The laptop has to enter a start before those punches count. Penalty seconds are recorded on the row and are not added into a total.

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
