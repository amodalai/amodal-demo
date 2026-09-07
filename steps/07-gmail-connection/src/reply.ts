import { buildReply, replySubject } from "../amodal/_lib/reply.js";
import type { FindingRow, SubmissionRow } from "./types";

export const previewSubject = replySubject;

export function previewReply(s: SubmissionRow, finding: FindingRow): string {
  return buildReply(s, finding).body;
}
