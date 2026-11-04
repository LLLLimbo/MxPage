import { cleanCustomerDirection, confirmedAnswerCopyRules } from "./customer-copy";
import { ozonImageRole } from "@/lib/ozon/contract";
type Section = { order: number; visualPrompt: string };
type Direction = { sectionIndex: number; prompt: string; textBlocks: Array<{ text: string }> };
export type OzonImagePromptContext = {
  productRules: string;
  heroCount: number;
  concept?: string;
  palette?: string[];
  typography?: string;
};

const ozonRoleDirections = {
  catalog_main: "Listing hero: design a commercial e-commerce sales poster. Integrate product photography, the headline and supported selling-point text supplied in Exact copy, background and suitable graphic elements into one coherent composition. Give the title expressive, legible typography and a clear hierarchy while keeping the product and core buying reason recognizable at thumbnail size. Photography serves the complete poster design. Choose layout to suit the product and content, without fixed title positions or label counts; respect explicit text-free or user-edited directions.",
  catalog_aux: "Supporting catalog image: create an icon infographic poster combining product photography or a detail crop with concise labels, specification cards or dimension callouts as appropriate. Omit generic descriptive headlines and sentences that merely repeat visible details. Choose graphic forms for the information, without a fixed icon grid. Use only sourced values and units; respect text-free or user-edited directions.",
  rich_detail: "Rich-content detail image: create an icon infographic poster combining product photography or detail crops with short useful labels, specification cards or dimension callouts. Add explanations only when needed for understanding; omit generic descriptive headlines and redundant prose. Choose graphic forms for the information, without a fixed icon grid. Use only sourced values and units; respect text-free or user-edited directions.",
};

function ozonPrompt(direction: Direction, order: number, context: OzonImagePromptContext) {
  const copy = direction.textBlocks.map(block => block.text).join("\n");
  const style = [context.concept && `Concept: ${context.concept}`, context.palette?.length && `Palette: ${context.palette.join(", ")}`, context.typography && `Typography: ${context.typography}`].filter(Boolean).join("\n");
  return [
    "PRODUCT FACTS AND OUTPUT BOUNDARIES (instructions, not visible text):\n" + context.productRules,
    style && "SHARED VISUAL STYLE (instructions, not visible text):\n" + style,
    "CURRENT IMAGE ROLE:\n" + ozonRoleDirections[ozonImageRole(order, context.heroCount)],
    "CURRENT IMAGE DIRECTION (instructions, not visible text):\n" + direction.prompt,
    "Render only this one image. Shared style guides visual execution; it is not additional copy or a request for other images.",
    "Exact copy below is the sole source of NEW overlay text. Preserve the original text, patterns and logos physically present on the product. Do not render production instructions, section labels or source notes. Do not rephrase, omit or add overlay claims.",
    !copy.trim() && "No new overlay text: do not add titles, captions, labels or text panels. Preserve the product's original physical markings.",
    "Exact copy:\n" + copy,
  ].filter(Boolean).join("\n\n");
}

// Persistence and paid generation must consume the same finalized storyboard.
// Reading sections before saving the storyboard leaves stale planning prompts.
export function materializeImagePrompts<S extends Section, D extends Direction>(sections: S[], directions: D[], confirmedEstimates = false, ozon?: OzonImagePromptContext) {
  const byIndex = new Map(directions.map(direction => [direction.sectionIndex, confirmedEstimates ? cleanCustomerDirection(direction) : direction]));
  if (byIndex.size !== directions.length || directions.length !== sections.length) {
    throw new Error("视觉分镜编号重复或数量不匹配，未发起图片请求。");
  }
  return sections.map(section => {
    const artDirection = byIndex.get(section.order);
    if (!artDirection) throw new Error(`缺少第 ${section.order + 1} 张图片的视觉分镜，未发起图片请求。`);
    return {
      ...section,
      artDirection,
      visualPrompt: ozon ? ozonPrompt(artDirection, section.order, ozon) : `${artDirection.prompt}\n${confirmedEstimates ? `${confirmedAnswerCopyRules}\n` : ""}Use the following Exact copy as the sole source of visible text. It overrides any conflicting wording in the visual description; do not rephrase, omit or add claims.\nExact copy:\n${artDirection.textBlocks.map(block => block.text).join("\n")}`,
    };
  });
}
