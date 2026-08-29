/**
 * lib/acquisition/negotiation/channel.ts — Channel differences and mandatory keywords.
 *
 * Email and SMS are not the same medium wearing different clothes. SMS has hard length
 * limits, no subject line, a different register, and — the part that matters most —
 * legally mandated keyword handling.
 *
 * STOP AND HELP ARE HANDLED IN CODE, NEVER BY A MODEL.
 *
 * Honouring an opt-out is a legal obligation with statutory damages attached, so it
 * cannot depend on a classifier being right. checkMandatoryKeywords() runs BEFORE any
 * model call and short-circuits the entire pipeline. A classifier that misreads "STOP"
 * as a question is a lawsuit; a regex that matches it is not.
 */

export type Channel = "email" | "sms"

/**
 * Standard opt-out keywords. CTIA guidance and every major carrier treat these as
 * universal — recognised regardless of what your own terms say.
 */
const STOP_KEYWORDS = new Set([
  "stop", "stopall", "unsubscribe", "cancel", "end", "quit", "revoke", "optout", "opt-out",
])

const HELP_KEYWORDS = new Set(["help", "info"])

export type KeywordVerdict =
  | { kind: "STOP" }
  | { kind: "HELP" }
  | { kind: "NONE" }

/**
 * Deterministic keyword check. Applies to SMS always; also applied to email, where a
 * one-word "unsubscribe" reply deserves the same treatment.
 *
 * Matches only when the keyword is essentially the entire message — a normal reply
 * that happens to contain "stop by the property tomorrow" must not opt anyone out.
 */
export function checkMandatoryKeywords(body: string): KeywordVerdict {
  // Strip punctuation and collapse whitespace; carriers treat "STOP." as STOP.
  const normalized = body.trim().toLowerCase().replace(/[.!?,;:'"]/g, "").replace(/\s+/g, " ")

  if (STOP_KEYWORDS.has(normalized)) return { kind: "STOP" }
  if (HELP_KEYWORDS.has(normalized)) return { kind: "HELP" }

  // Two-word forms carriers also honour, e.g. "stop all", "opt out".
  const collapsed = normalized.replace(/\s/g, "")
  if (STOP_KEYWORDS.has(collapsed)) return { kind: "STOP" }

  return { kind: "NONE" }
}

/** Fixed reply to HELP. Never model-generated — it must be stable and accurate. */
export function helpResponse(companyName: string, phone: string): string {
  return `${companyName} — cash property offers. Reply STOP to opt out.${phone ? ` Questions: ${phone}` : ""}`
}

/** Per-channel drafting constraints, injected into the prompt and enforced after. */
export type ChannelSpec = {
  channel: Channel
  hasSubject: boolean
  /** Hard character ceiling. Drafts over this are rejected, not truncated. */
  maxChars: number
  styleGuidance: string
}

export function specFor(channel: Channel): ChannelSpec {
  if (channel === "sms") {
    return {
      channel,
      hasSubject: false,
      // ~2 GSM-7 segments. Longer costs more, reads worse, and gets skimmed.
      maxChars: 320,
      styleGuidance: `This is a TEXT MESSAGE to a licensed agent's mobile. Write one short paragraph, at most 320 characters. No greeting line, no signature block, no subject. Plain sentences — an agent reads this on a phone between showings. Include the price if you were given one. Do not use links, emoji, or ALL CAPS.`,
    }
  }
  return {
    channel,
    hasSubject: true,
    maxChars: 4000,
    styleGuidance: `This is an EMAIL continuing an existing thread. At most three short paragraphs, with a brief signature block.`,
  }
}
