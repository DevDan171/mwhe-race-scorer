export type RegistrationErrorCode =
  | "number_taken"
  | "rider_not_found"
  | "already_registered"
  | "not_registered"
  | "missing_field"
  | "invalid_number"
  | "duplicate_series_id"
  | "race_not_found"
  | "check_not_found"
  | "start_row_not_found"
  | "no_change"
  | "duplicate_entry"
  | "roster_version";

export class RegistrationError extends Error {
  readonly code: RegistrationErrorCode;

  constructor(code: RegistrationErrorCode, message: string) {
    super(message);
    this.name = "RegistrationError";
    this.code = code;
  }
}
