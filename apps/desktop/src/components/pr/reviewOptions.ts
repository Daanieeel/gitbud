export type ReviewEvent = "APPROVE" | "REQUEST_CHANGES" | "COMMENT";

/** The three verdicts GitHub's own review UI offers — shared by the Conversation tab's inline
 * review box and the Files tab's "Finish review" popover so both match GitHub's real "Finish
 * your review" panel (a single radio choice, not one button per verdict) instead of drifting
 * into two different shapes for the same action. */
export const REVIEW_OPTIONS: {
  value: ReviewEvent;
  label: string;
  description: string;
  disabledDescription: string;
}[] = [
  {
    value: "COMMENT",
    label: "Comment",
    description: "Submit general feedback without explicit approval.",
    disabledDescription: "Submit general feedback without explicit approval.",
  },
  {
    value: "APPROVE",
    label: "Approve",
    description: "Submit feedback approving these changes.",
    disabledDescription: "Pull request authors can't approve their own pull requests.",
  },
  {
    value: "REQUEST_CHANGES",
    label: "Request changes",
    description: "Submit feedback that must be addressed before merging.",
    disabledDescription: "Pull request authors can't request changes on their own pull requests.",
  },
];
