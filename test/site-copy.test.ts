/**
 * The adapter between the marketing lead's authored JSON and the public pages. The three copy files
 * do not agree on shape (personas are objects in one and strings in another), so these tests pin the
 * rule that matters: whatever arrives, a page renders and nothing throws.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  bulletsToMarkdown,
  enablementToMarkdown,
  matchesProduct,
  proofToMarkdown,
  qandaToMarkdown,
  stepsToMarkdown,
  titledToMarkdown,
  toCapabilities,
  toLines,
  toPhases,
  toTitled,
} from "../src/services/site-copy.ts";

describe("shape tolerance", () => {
  test("toTitled accepts an object or a 'Title — body' string", () => {
    assert.deepEqual(toTitled({ title: "A", body: "B" }), { title: "A", body: "B" });
    assert.deepEqual(toTitled("AP Manager — measured on cost per invoice"), {
      title: "AP Manager",
      body: "measured on cost per invoice",
    });
    assert.deepEqual(toTitled("QA lead: owns the scorecard"), {
      title: "QA lead",
      body: "owns the scorecard",
    });
  });

  test("a string with no separator becomes body-only, and empties become null", () => {
    assert.deepEqual(toTitled("Just a sentence with no separator at all"), {
      title: "",
      body: "Just a sentence with no separator at all",
    });
    assert.equal(toTitled(undefined), null);
    assert.equal(toTitled(""), null);
    assert.equal(toTitled("   "), null);
    assert.equal(toTitled({ title: "", body: "" } as never), null);
  });

  test("a very long lead is not mistaken for a title", () => {
    const long = `${"word ".repeat(30)}— and then the body`;
    assert.equal(toTitled(long)?.title, "");
  });

  test("toLines accepts an array, a newline block or a bulleted block", () => {
    assert.deepEqual(toLines(["a", "b"]), ["a", "b"]);
    assert.deepEqual(toLines("a\nb"), ["a", "b"]);
    assert.deepEqual(toLines("- a\n- b"), ["a", "b"]);
    assert.deepEqual(toLines("1. a\n2) b"), ["a", "b"]);
    assert.deepEqual(toLines(undefined), []);
    assert.deepEqual(toLines(["", "  ", "x"]), ["x"]);
  });

  test("toCapabilities keeps only items that have a title to put on a card", () => {
    assert.deepEqual(toCapabilities([{ title: "A", body: "B" }, "no title here", ""]), [
      { title: "A", body: "B" },
    ]);
    assert.deepEqual(toCapabilities(undefined), []);
  });

  test("toPhases drops a phase with no items and normalises the items", () => {
    assert.deepEqual(
      toPhases([
        { phase: "Now", items: ["one", "two"] },
        { phase: "Empty", items: [] },
        { phase: "Later", items: "- three" as never },
      ]),
      [
        { phase: "Now", items: ["one", "two"] },
        { phase: "Later", items: ["three"] },
      ],
    );
    assert.deepEqual(toPhases(undefined), []);
  });
});

describe("markdown projections", () => {
  test("titled items become headed sections, plain strings become paragraphs", () => {
    const md = titledToMarkdown([{ title: "Persona", body: "Cares about X." }, "A bare line."]);
    assert.match(md, /^### Persona\n\nCares about X\./);
    assert.match(md, /A bare line\.$/);
    assert.equal(titledToMarkdown([]), "");
  });

  test("markdown control characters in an authored title cannot inject structure", () => {
    const md = titledToMarkdown([{ title: "# Not a heading *or* emphasis", body: "b" }]);
    assert.match(md, /^### \\# Not a heading \\\*or\\\* emphasis/);
  });

  test("questions and answers become bold questions with paragraphs", () => {
    assert.match(qandaToMarkdown([{ q: "Why?", a: "Because." }]), /^\*\*Why\?\*\*\n\nBecause\.$/);
    assert.equal(qandaToMarkdown([{ q: "x" } as never]), "");
    assert.equal(qandaToMarkdown(undefined), "");
  });

  test("steps become an ordered list and bullets an unordered one", () => {
    assert.equal(stepsToMarkdown(["a", "b"]), "1. a\n2. b");
    assert.equal(bulletsToMarkdown("a\nb"), "- a\n- b");
    assert.equal(stepsToMarkdown(undefined), "");
    assert.equal(bulletsToMarkdown([]), "");
  });

  test("proof points become a table, with pipes and newlines neutralised", () => {
    const md = proofToMarkdown([{ label: "Tests | all", value: "195\npassing", source: "STATUS.md" }]);
    assert.match(md, /^\| Measure \| Result \| Source \|/);
    assert.match(md, /\| Tests \\\| all \| 195 passing \| STATUS\.md \|/);
    assert.equal(proofToMarkdown([]), "");
    assert.equal(proofToMarkdown([{ label: "x" } as never]), "");
  });

  test("enablement becomes a labelled bullet list, skipping what was not written", () => {
    const md = enablementToMarkdown({ developerTrack: "A lab.", deploy: "A container." });
    assert.match(md, /- \*\*Developer track\.\*\* A lab\./);
    assert.match(md, /- \*\*Deployment\.\*\* A container\./);
    assert.equal(md.includes("Architect track"), false);
    assert.equal(enablementToMarkdown(undefined), "");
  });
});

describe("matching a copy file to a product", () => {
  const identifiers = {
    slug: "doc-processing",
    workingTitle: "Document Processing",
    recommendedName: "Fieldwork",
    repo: "arag-doc-processing",
  };

  test("matches on the marketing repo's own slug, the repo name or the display name", () => {
    assert.equal(matchesProduct({ slug: "document-processing" }, identifiers), false);
    assert.equal(matchesProduct({ workingTitle: "arag-doc-processing" }, identifiers), true);
    assert.equal(matchesProduct({ name: "Document Processing" }, identifiers), true);
    assert.equal(matchesProduct({ slug: "doc-processing" }, identifiers), true);
    assert.equal(matchesProduct({ name: "fieldwork" }, identifiers), true, "matching is case-insensitive");
  });

  test("does not match an unrelated product", () => {
    assert.equal(matchesProduct({ slug: "voicebridge", name: "GroundLine" }, identifiers), false);
    assert.equal(matchesProduct({}, identifiers), false);
  });
});
