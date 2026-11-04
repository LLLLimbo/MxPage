import assert from "node:assert/strict";
import test from "node:test";
import { materializeImagePrompts } from "../lib/detail-runs/image-prompts-v4";

test("paid image input uses finalized art direction and exact copy, not an earlier planning prompt", () => {
  const savedBeforeArt = [{ id: "hero", order: 0, visualPrompt: "stale planning objective" }];
  const [generation] = materializeImagePrompts(savedBeforeArt, [{ sectionIndex: 0, prompt: "Cream background; product on the right.", textBlocks: [{ text: "浅棕马克杯" }, { text: "数字：350 ml（示例）" }] }]);
  assert.equal(generation.id, "hero");
  assert.match(generation.visualPrompt, /Cream background/);
  assert.ok(generation.visualPrompt.endsWith("浅棕马克杯\n数字：350 ml（示例）"));
  assert.ok(!generation.visualPrompt.includes("stale planning"));
});

test("out-of-order storyboard entries bind to the matching section index", () => {
  const output = materializeImagePrompts([{ order: 0, visualPrompt: "" }, { order: 1, visualPrompt: "" }], [
    { sectionIndex: 1, prompt: "Detail closeup", textBlocks: [] },
    { sectionIndex: 0, prompt: "Hero composition", textBlocks: [] },
  ]);
  assert.match(output[0].visualPrompt, /^Hero composition/);
  assert.match(output[1].visualPrompt, /^Detail closeup/);
});

test("duplicate or missing storyboard indices stop before paid requests", () => {
  const sections = [{ order: 0, visualPrompt: "" }, { order: 1, visualPrompt: "" }];
  const direction = (sectionIndex: number) => ({ sectionIndex, prompt: "test", textBlocks: [] });
  assert.throws(() => materializeImagePrompts(sections, [direction(0), direction(0)]), /编号重复/);
  assert.throws(() => materializeImagePrompts(sections, [direction(1), direction(2)]), /缺少第 1/);
});

test("Ozon prompts carry shared style and their own role, direction and overlay copy only", () => {
  const style = { productRules: "Keep the original brown product and confirmed quantity.", heroCount: 2, concept: "Warm winter commercial photography", palette: ["cream", "pine green"], typography: "Readable Cyrillic headings and small labels" };
  const result = materializeImagePrompts([0, 1, 2].map(order => ({ order, visualPrompt: "Stale planning copy and composition" })), [0, 1, 2].map(sectionIndex => ({ sectionIndex, prompt: `Unique scene ${sectionIndex} with soft side light.`, textBlocks: [{ text: `Видимый текст ${sectionIndex}` }] })), false, style);
  for (const [index, section] of result.entries()) {
    const prompt = section.visualPrompt;
    assert.equal(prompt.split(style.productRules).length - 1, 1);
    assert.equal(prompt.split(style.concept).length - 1, 1);
    assert.ok(prompt.includes("cream, pine green"));
    assert.ok(prompt.includes(style.typography));
    assert.ok(prompt.indexOf(style.productRules) < prompt.indexOf(style.concept));
    assert.ok(prompt.indexOf(style.typography) < prompt.indexOf(`Unique scene ${index}`));
    assert.equal(prompt.split("Exact copy:\n").length, 2);
    assert.equal(prompt.split("Exact copy:\n")[1], `Видимый текст ${index}`);
    assert.ok(!prompt.includes("Stale planning"));
    for (const other of [0, 1, 2].filter(value => value !== index)) {
      assert.ok(!prompt.includes(`Unique scene ${other}`));
      assert.ok(!prompt.includes(`Видимый текст ${other}`));
    }
  }
  assert.match(result[0].visualPrompt, /Listing hero:.*thumbnail/);
  assert.match(result[0].visualPrompt, /commercial e-commerce sales poster/);
  assert.match(result[0].visualPrompt, /headline and supported selling-point text supplied in Exact copy/);
  assert.match(result[1].visualPrompt, /Supporting catalog image:/);
  assert.match(result[2].visualPrompt, /Rich-content detail image:/);
  for (const section of result.slice(1)) {
    assert.match(section.visualPrompt, /icon infographic poster/);
    assert.match(section.visualPrompt, /specification cards or dimension callouts/);
    assert.match(section.visualPrompt, /generic descriptive headlines/);
    assert.match(section.visualPrompt, /without a fixed icon grid/);
  }
  assert.ok(!result[1].visualPrompt.includes("commercial e-commerce sales poster"));
  assert.ok(!result[2].visualPrompt.includes("commercial e-commerce sales poster"));
});

test("Ozon text-free images keep overlay copy empty and preserve physical product markings", () => {
  const [section] = materializeImagePrompts([{ order: 0, visualPrompt: "Old title" }], [{ sectionIndex: 0, prompt: "A single product in a calm home setting.", textBlocks: [] }], false, { productRules: "First reference anchors identity.", heroCount: 1 });
  assert.match(section.visualPrompt, /No new overlay text/);
  assert.match(section.visualPrompt, /original text, patterns and logos physically present on the product/);
  assert.equal(section.visualPrompt.split("Exact copy:\n")[1], "");
  assert.ok(!section.visualPrompt.includes("undefined"));
  assert.ok(!section.visualPrompt.includes("Old title"));
  assert.match(section.visualPrompt, /respect explicit text-free or user-edited directions/);
});
