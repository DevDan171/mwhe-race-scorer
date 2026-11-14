/**
 * Official Midwest Hard Enduro classes, in the order results and series
 * standings are grouped. An event package must carry this exact list.
 */
export const RIDER_CLASSES = [
  "Pro",
  "A",
  "B",
  "C",
  "+40A",
  "+40B",
  "+40C",
  "Womens",
  "Womens Pro",
  "Electric Sportsman",
  "Electric Pro",
  "65/85",
  "50cc",
] as const;

export type RiderClass = (typeof RIDER_CLASSES)[number];
