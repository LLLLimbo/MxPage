import { resolveImageModel, type ImageModelSettings } from "@/lib/ai/image-protocol";
import { isOzonRatio } from "./contract";

export function ozonImageParameters(provider: { baseUrl: string; imageModelSettings?: Record<string, ImageModelSettings> }, modelId: string, size = "auto") {
  if (size !== "auto") {
    const [width, height] = size.split("x").map(Number);
    if (!isOzonRatio(width, height)) throw Object.assign(new Error("Ozon 图片尺寸必须为精确的 3:4。"), { code: "OZON_RATIO_UNSUPPORTED" });
  }
  const settings = resolveImageModel(provider.baseUrl, modelId, provider);
  if (settings.protocol === "evolink_tasks") {
    const prop = settings.contract?.properties.size;
    const supported = prop?.ratios?.includes("3:4") || prop?.enum?.some(value => value === "3:4" || typeof value === "string" && isOzonRatio(...value.split("x").map(Number) as [number, number]));
    if (supported && settings.contract?.properties.image_urls) return { aspectRatio: "3:4" as const, ...(size !== "auto" ? { size } : {}) };
  } else if (settings.protocol === "gemini_native" || settings.protocol === "gemini_proxy") {
    return { aspectRatio: "3:4" as const };
  } else if (/(?:^|\/)gpt-image-2(?:[.-]|$)/i.test(modelId)) {
    return { aspectRatio: "3:4" as const, size: size === "auto" ? "1152x1536" : size };
  }
  throw Object.assign(new Error(`当前模型 ${modelId} 无法确认支持带参考图的精确 3:4 输出，请在 AI 配置中选择支持的已发现模型。`), { code: "OZON_RATIO_UNSUPPORTED" });
}

export function imageFailureCode(error: unknown): string {
  const value = error as { code?: string; status?: number; name?: string; message?: string; cause?: unknown } | null;
  if (!value) return "IMAGE_REQUEST_FAILED";
  const code = value.code || "";
  if (/content_policy_violation|moderation_blocked|safety_blocked|CONTENT_MODERATION_REFUSAL/i.test(code) || /content_policy_violation|blocked by (?:the )?(?:safety|content)|finishReason["':\s]+(?:SAFETY|PROHIBITED_CONTENT)|content (?:policy|moderation).*(?:reject|block|violation)/i.test(value.message || "") || value.name === "ModelRefusalError") return "CONTENT_MODERATION_REFUSAL";
  if (["IMAGE_DOWNLOAD_FAILED", "IMAGE_RESULT_QUERY_FAILED", "IMAGE_TASK_PENDING", "OZON_RATIO_UNSUPPORTED"].includes(code)) return code;
  if (value.status === 401 || value.status === 403) return "PROVIDER_AUTH_ERROR";
  if (value.status === 429) return "PROVIDER_RATE_LIMIT";
  if (/TIMEOUT|ETIMEDOUT/.test(code) || /timeout|timed out/i.test(value.message || "")) return "PROVIDER_TIMEOUT";
  if (/ECONN|ENOTFOUND|UND_ERR|fetch failed|network/i.test(`${code} ${value.message || ""}`)) return "PROVIDER_NETWORK_ERROR";
  if (code && code !== "IMAGE_REQUEST_FAILED") return code;
  if (value.cause) return imageFailureCode(value.cause);
  return value.status ? "PROVIDER_HTTP_ERROR" : "IMAGE_REQUEST_FAILED";
}
