import { z } from "zod";

import { isoTimestampSchema, riderNumberSchema } from "./common.js";
import { riderClassSchema } from "./race-package.js";

/**
 * A rider registered on the laptop during the event. Both the series list
 * and the event roster must already contain this series id. The publish
 * step sends this list so the site can create the rider.
 */
export const dayOfRegistrationSchema = z.strictObject({
  seriesId: z.string().min(1),
  name: z.string().min(1),
  number: riderNumberSchema,
  class: riderClassSchema,
  registeredAt: isoTimestampSchema,
});

export type DayOfRegistration = z.infer<typeof dayOfRegistrationSchema>;
