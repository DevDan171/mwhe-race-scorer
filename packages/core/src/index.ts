export { RIDER_CLASSES, type RiderClass } from "./classes.js";
export { SCHEMA_VERSION, PROTEST_WINDOW_MINUTES } from "./version.js";

export {
  checkSchema,
  eventSchema,
  seriesRiderSchema,
  eventRegistrationSchema,
  racePackageSchema,
  raceSchema,
  raceLengthSchema,
  startRowSchema,
  assignedRowSchema,
  riderClassSchema,
  PRIVATE_RIDER_FIELDS,
  defaultRace,
  primaryRace,
  sameRaceLength,
  type Check,
  type Event,
  type SeriesRider,
  type AssignedRow,
  type EventRegistration,
  type Race,
  type RaceLength,
  type StartRow,
  type RacePackage,
} from "./schemas/race-package.js";

export { dayOfRegistrationSchema, type DayOfRegistration } from "./schemas/day-of.js";

export {
  phoneRosterRiderSchema,
  phoneRosterSchema,
  type PhoneRosterRider,
  type PhoneRoster,
} from "./schemas/rider.js";

export { punchSchema, type Punch } from "./schemas/punch.js";
export { startTimeSchema, type StartTime } from "./schemas/start-time.js";
export {
  riderStartSchema,
  rowStartSchema,
  startRowBriefSchema,
  stationRoleSchema,
  type RiderStart,
  type RowStart,
  type StartRowBrief,
  type StationRole,
} from "./schemas/starts.js";

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
  qrRosterExportSchema,
  stationPairingSchema,
  stationHelloSchema,
  stationHelloAckSchema,
  syncResultSchema,
  rosterSyncSchema,
  syncErrorSchema,
  importQrCheckpointExport,
  type SyncMessage,
  type PushPunchesMessage,
  type RosterDeltaMessage,
  type QrCheckpointExport,
  type QrRosterExport,
  type StationPairing,
  type StationHello,
  type StationHelloAck,
  type SyncResult,
  type RosterSync,
  type SyncError,
} from "./schemas/sync.js";

export { projectPhoneRoster } from "./roster/project.js";
export { applyRosterDelta } from "./sync/apply-delta.js";
export {
  DEFAULT_CLOCK_OFFSET_WARN_MS,
  DEFAULT_DOUBLE_TAP_WINDOW_MS,
  DEFAULT_MIN_PASS_GAP_MS,
  MIN_ANDROID_API,
  QR_CHUNK_MAX_CHARS,
  SYNC_PORT,
} from "./sync/defaults.js";
export {
  clockOffsetMs,
  clockOffsetWarning,
  findDoubleTap,
  formatClockOffset,
  isUnknownRiderNumber,
  mergePunches,
  normalizeAppVersion,
  versionsMatch,
  worstClockOffset,
  type PunchMerge,
} from "./sync/punches.js";
export {
  assembleCheckpointFrames,
  assembleRosterFrames,
  assembleStartFrames,
  checkpointProgress,
  encodeCheckpointQr,
  encodeRosterQr,
  encodeStartQr,
  readStartFrames,
  parseQrPayload,
  readCheckpointFrames,
  readRosterFrames,
  rosterProgress,
  type CheckpointQrInput,
  type FrameProgress,
  type RosterQrInput,
} from "./sync/qr.js";
export {
  addPunches,
  applyHello,
  applyPunchPush,
  createPairing,
  emptySyncHub,
  handleSyncRequest,
  hubFromStored,
  newPairingSecret,
  pairingFromStation,
  secretsMatch,
  setManualStart,
  setRoster,
  setRowClock,
  storedFromHub,
  storedSyncStateSchema,
  stationRecordSchema,
  syncHubSchema,
  updateClockWarnMs,
  voidPunch,
  voidRiderStart,
  voidRowStart,
  type PairingInput,
  type StationRecord,
  type StoredSyncState,
  type SyncHttpRequest,
  type SyncHttpResponse,
  type SyncHub,
  type SyncSettings,
} from "./sync/hub.js";

export {
  raceDayStateSchema,
  packageCounts,
  searchSeriesRiders,
  isRiderNumberTaken,
  importRacePackage,
  rosterChangesSince,
  addSeriesRiderToEvent,
  registerNewRider,
  changeRiderNumber,
  changeRiderClass,
  setRaceLength,
  setRowGapSeconds,
  setPlannedStart,
  renameCheck,
  moveCheck,
  renameStartRow,
  moveClassToStartRow,
  addClassToStartRow,
  removeClassFromStartRow,
  addStartRow,
  removeStartRow,
  assignRiderToRow,
  clearRiderRow,
  setRiderPlacements,
  registerRider,
  raceOffersClass,
  racesOfferingClass,
  racesForRegistration,
  unassignedInRace,
  rowPlannedStart,
  type RaceDayState,
  type ChangeAudit,
  type RacePackageCounts,
  type RacePlacement,
  type NewRiderInput,
} from "./registration/service.js";
export {
  applyReimport,
  previewReimport,
  contactSecrets,
} from "./registration/reimport.js";
export type {
  ReimportPreview,
  ReimportRaceLine,
  ReimportRiderLine,
} from "./registration/reimport.js";
export {
  SAFETY_ACKNOWLEDGEMENT,
  SAFETY_CHECKBOX_LABEL,
  collectPrivateRecords,
  contactFrom,
  exportPublicRacePackage,
  hasEmergencyContact,
  privateValues,
  restorePrivateRecords,
  textContainsPrivateValue,
} from "./privacy.js";
export type { RiderContact, RiderPrivateRecord } from "./privacy.js";
export { RegistrationError, type RegistrationErrorCode } from "./registration/errors.js";

export {
  assertHubAccess,
  exchangeSignInCode,
  getRacePackage,
  getRacePackageResponseSchema,
  getSignedInUser,
  HUB_ROLES,
  isHubRole,
  listEvents,
  signInWithPassword,
  siteAccountSchema,
  siteErrorSchema,
  SiteApiError,
  uploadSeriesRiders,
  eventSummarySchema,
  seriesRiderUploadSchema,
  type EventSummary,
  type ExchangeSignInCodeOptions,
  type GetRacePackageOptions,
  type GetRacePackageResponse,
  type GetSignedInUserOptions,
  type HubRole,
  type ListEventsOptions,
  type SeriesRiderUpload,
  type SignedInSession,
  type SignInOptions,
  type SiteAccount,
  type SiteErrorBody,
  type UploadSeriesRidersOptions,
} from "./site/client.js";
export { LIVE_APP_ID, LIVE_SITE_ORIGIN } from "./site/live.js";
export {
  buildLaptopSignInPageUrl,
  createSignInState,
  formatSignInCode,
  isAllowedSignInCallback,
  isSignInState,
  LAPTOP_SIGN_IN_PATH,
  loopbackCallbackUrl,
  normalizeSignInCode,
  readSignInCallback,
  SIGN_IN_CODE_TTL_SECONDS,
} from "./site/google-sign-in.js";
export {
  authOriginFor,
  BASE44_AUTH_ORIGIN,
  MOCK_ACCOUNTS,
  MOCK_ADMIN,
  MOCK_APP_ID,
  MOCK_DIRECTOR,
  MOCK_GOOGLE_DIRECTOR,
  MOCK_RIDER,
  MOCK_SITE_ORIGIN,
  type MockAccount,
} from "./site/mock-accounts.js";
export {
  createSampleRacePackage,
  SAMPLE_EVENT_ID,
} from "./fixtures/sample-race-package.js";
export {
  SCORING_TEST_EVENT_ID,
  mockCatalog,
  touchRacePackage,
} from "./site/mock-catalog.js";

export { scoreRace, type ScoreRaceResult } from "./scoring/engine.js";
export {
  GITHUB_STATION_UPDATE_NAME,
  bytesToBase64,
  checksumMatches,
  chooseStationUpdate,
  compareAppVersions,
  downloadVerifiedApk,
  githubLatestStationManifestUrl,
  githubStationManifestUrl,
  hubStationManifest,
  isNewerRelease,
  parseStationUpdateManifest,
  resolveStationApkUrl,
  sha256Hex,
  stationApkFileName,
  stationUpdateIsAllowed,
  stationUpdateManifestSchema,
  type StationUpdateManifest,
} from "./updates/station-update.js";
export { raceEndWarning, multiLapCount } from "./scoring/end-mode.js";
export { assignLapPasses, type AssignedPass } from "./scoring/laps.js";
export {
  dedupeRiderStarts,
  dedupeRowStarts,
  riderClockFromTaps,
  rowClockFromTaps,
} from "./scoring/start-capture.js";
export {
  planStartOrder,
  rowStartedAt,
  type PlannedRider,
  type PlannedRow,
  type StartPlan,
  type StartRowWarning,
} from "./scoring/start-order.js";
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
