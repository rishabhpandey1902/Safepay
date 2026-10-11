const known: { selector: string; name: string; text: string }[] = [
  { selector: "d5fd2558", name: "OutstandingMilestone", text: "A milestone is waiting for review or in dispute. Approve it, let it release, or resolve the dispute first, then cancel." },
  { selector: "7b3bf522", name: "ApprovalWindowNotElapsed", text: "The approval window has not ended yet. The client can still approve." },
  { selector: "69d37595", name: "ApprovalWindowElapsed", text: "The approval window has ended. The payment can now be released." },
  { selector: "c45bd9b1", name: "DisputeWindowNotElapsed", text: "The dispute window is still open." },
  { selector: "cc8c324b", name: "DisputeWindowElapsed", text: "The dispute window has ended, so a dispute can no longer be raised." },
  { selector: "8e4a23d6", name: "Unauthorized", text: "This wallet is not allowed to do that on this agreement." },
  { selector: "33f36cb5", name: "InvalidAgreementStatus", text: "The agreement is not in the right state for this action." },
  { selector: "30f89c93", name: "InvalidMilestoneStatus", text: "This milestone is not in the right state for this action." },
  { selector: "eb8bf73b", name: "EvidenceRequired", text: "Add an evidence note or link before submitting." },
  { selector: "e215cd53", name: "DisputeReasonRequired", text: "Add a reason before raising a dispute." },
  { selector: "5274afe7", name: "SafeERC20FailedOperation", text: "The token transfer failed. Check the token balance and approval." },
];

export function friendlyChainError(message: string): string {
  const lower = message.toLowerCase();
  for (const item of known) {
    if (lower.includes(item.selector) || message.includes(item.name)) return item.text;
  }
  return message;
}