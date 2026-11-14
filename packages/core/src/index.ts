export { RIDER_CLASSES, type RiderClass } from "./classes.js";
export { SCHEMA_VERSION, PROTEST_WINDOW_MINUTES } from "./version.js";

export {
  checkSchema,
  eventSchema,
  seriesRiderSchema,
  eventRegistrationSchema,
  racePackageSchema,
  riderClassSchema,
  type Check,
  type Event,
  type SeriesRider,
  type EventRegistration,
  type RacePackage,
} from "./schemas/race-package.js";

export {
  phoneRosterRiderSchema,
  phoneRosterSchema,
  type PhoneRosterRider,
  type PhoneRoster,
} from "./schemas/rider.js";

export { punchSchema, type Punch } from "./schemas/punch.js";
export { startTimeSchema, type StartTime } from "./schemas/start-time.js";

export {
  penaltySchema,
  penaltyScopeSchema,
  disqualificationSchema,
  appliedBySchema,
  type Penalty,
  type PenaltyScope,
  type Disqualification,
  type AppliedBy,
} from "./schemas/penalty.js";

export {
  changelogEntrySchema,
  createChangelogEntry,
  type ChangelogEntry,
  type ChangelogAction,
  type ChangelogEntity,
} from "./schemas/changelog.js";

export {
  resultsPayloadSchema,
  resultRowSchema,
  checkResultSchema,
  resultStatusSchema,
  resultsPublicationStatusSchema,
  type ResultsPayload,
  type ResultRow,
  type CheckResult,
  type ResultStatus,
  type ResultsPublicationStatus,
} from "./schemas/results.js";

export {
  syncMessageSchema,
  pushPunchesMessageSchema,
  rosterDeltaMessageSchema,
  qrCheckpointExportSchema,
  importQrCheckpointExport,
  type SyncMessage,
  type PushPunchesMessage,
  type RosterDeltaMessage,
  type QrCheckpointExport,
} from "./schemas/sync.js";

export { projectPhoneRoster } from "./roster/project.js";
export { applyRosterDelta } from "./sync/apply-delta.js";

export { scoreRace, type ScoreRaceResult } from "./scoring/engine.js";
export {
  scoreRaceInputSchema,
  type ScoreRaceInput,
  type ScoringWarning,
} from "./scoring/types.js";
export {
  pointsForPlace,
  pointsForResult,
  rankSeries,
  type SeriesEventResult,
  type SeriesStanding,
  type ClassStandings,
} from "./scoring/points.js";

export { createDemoRace } from "./fixtures/demo-race.js";
