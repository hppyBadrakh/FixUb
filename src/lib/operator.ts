// Who runs this deployment of FixUB, as shown on the privacy and terms pages.
//
// Fill this in before real use. While `name` or `contactEmail` is empty, or `reviewed` is false,
// both pages carry a "draft" banner: the texts were written from what the software does, and
// have not been checked by a lawyer.
export const OPERATOR = {
  /** The legal entity responsible for the service and the personal data in it. */
  name: "",
  /** Where people send questions and requests about their data. */
  contactEmail: "",
  /** Set to true once a lawyer has reviewed src/components/pages/legal.tsx for Mongolian law. */
  reviewed: false,
  /** The date the texts last changed, shown on the pages. */
  updated: "2026-11-23",
} as const;

export const legalTextsAreFinal = (): boolean => OPERATOR.reviewed && !!OPERATOR.name && !!OPERATOR.contactEmail;
