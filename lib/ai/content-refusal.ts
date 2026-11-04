// Only explicit provider signals count as moderation. Empty or malformed replies remain interface failures.
export function hasContentRefusal(payload: any): boolean {
  const reasons = [payload?.promptFeedback?.blockReason, ...(payload?.candidates || []).map((candidate: any) => candidate.finishReason)];
  return reasons.some(reason => ["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "IMAGE_SAFETY", "RECITATION"].includes(reason))
    || payload?.stop_reason === "refusal"
    || payload?.choices?.some((choice: any) => choice.finish_reason === "content_filter" || Boolean(choice.message?.refusal))
    || payload?.output?.some((item: any) => item.type === "refusal" || item.content?.some((part: any) => part.type === "refusal"))
    || false;
}

export function contentRefusalError() {
  return Object.assign(new Error("上游模型的内容审核拒绝了本次请求，未自动重试。"), { code: "CONTENT_MODERATION_REFUSAL" });
}
