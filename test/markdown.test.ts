/** Unit tests for the zero-dependency Markdown renderer.
 *  Security-focused cases (sanitisation of raw HTML and dangerous URL schemes) are grouped under
 *  the "sanitisation" describe block; everything else is one feature per test. */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { escapeHtml, renderMarkdown, slugify } from "../src/markdown.ts";

describe("escapeHtml", () => {
  test("escapes the five HTML-significant characters", () => {
    assert.equal(escapeHtml(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });

  test("leaves plain text untouched", () => {
    assert.equal(escapeHtml("hello world 123"), "hello world 123");
  });
});

describe("slugify", () => {
  test("lowercases and dashes spaces", () => {
    assert.equal(slugify("Getting Started"), "getting-started");
  });

  test("strips punctuation", () => {
    assert.equal(slugify("What's New? (v2)"), "whats-new-v2");
  });

  test("falls back to a placeholder for empty/symbol-only input", () => {
    assert.equal(slugify("!!!"), "section");
  });
});

describe("headings", () => {
  test("renders h1..h6 with ids and an anchor link", () => {
    const { html } = renderMarkdown("# One\n\n###### Six");
    assert.match(
      html,
      /<h1 id="one">One <a class="hdr-anchor" href="#one" aria-label="Link to this section">#<\/a><\/h1>/,
    );
    assert.match(html, /<h6 id="six">/);
  });

  test("dedupes repeated heading ids", () => {
    const { headings } = renderMarkdown("# Intro\n\n# Intro\n\n# Intro");
    assert.deepEqual(
      headings.map((h) => h.id),
      ["intro", "intro-2", "intro-3"],
    );
  });

  test("applies idPrefix to anchor ids", () => {
    const { headings, html } = renderMarkdown("## Section", { idPrefix: "doc1-" });
    assert.equal(headings[0]?.id, "doc1-section");
    assert.match(html, /id="doc1-section"/);
  });

  test("collects headings with level and text", () => {
    const { headings } = renderMarkdown("# Top\n\n## Sub");
    assert.deepEqual(headings, [
      { level: 1, text: "Top", id: "top" },
      { level: 2, text: "Sub", id: "sub" },
    ]);
  });

  test("title is the first level-1 heading text", () => {
    const { title } = renderMarkdown("## Not this\n\n# This one\n\n# Not this either");
    assert.equal(title, "This one");
  });

  test("title is empty string when there is no h1", () => {
    const { title } = renderMarkdown("## Only h2");
    assert.equal(title, "");
  });

  test("heading text supporting inline markup still gets a clean slug", () => {
    const { headings } = renderMarkdown("# Hello **World**");
    assert.equal(headings[0]?.id, "hello-world");
  });
});

describe("paragraphs and line breaks", () => {
  test("blank-line separated paragraphs", () => {
    const { html } = renderMarkdown("First para.\n\nSecond para.");
    assert.equal(html, "<p>First para.</p>\n<p>Second para.</p>");
  });

  test("soft line break becomes a space", () => {
    const { html } = renderMarkdown("Line one\nLine two");
    assert.equal(html, "<p>Line one Line two</p>");
  });

  test("trailing double-space becomes a hard break", () => {
    const { html } = renderMarkdown("Line one  \nLine two");
    assert.equal(html, "<p>Line one<br />Line two</p>");
  });
});

describe("inline formatting", () => {
  test("**bold** and __bold__", () => {
    const { html } = renderMarkdown("**a** and __b__");
    assert.equal(html, "<p><strong>a</strong> and <strong>b</strong></p>");
  });

  test("*em* and _em_", () => {
    const { html } = renderMarkdown("*a* and _b_");
    assert.equal(html, "<p><em>a</em> and <em>b</em></p>");
  });

  test("`code` span is escaped and not further processed", () => {
    const { html } = renderMarkdown("`<b>*x*</b>`");
    assert.equal(html, "<p><code>&lt;b&gt;*x*&lt;/b&gt;</code></p>");
  });

  test("~~strikethrough~~", () => {
    const { html } = renderMarkdown("~~gone~~");
    assert.equal(html, "<p><del>gone</del></p>");
  });

  test("backslash escapes suppress markup", () => {
    const { html } = renderMarkdown("\\*not em\\*");
    assert.equal(html, "<p>*not em*</p>");
  });
});

describe("fenced code blocks", () => {
  test("backtick fence with a language tag", () => {
    const { html } = renderMarkdown("```ts\nconst x = 1;\n```");
    assert.equal(html, '<pre><code class="language-ts">const x = 1;</code></pre>');
  });

  test("tilde fence", () => {
    const { html } = renderMarkdown("~~~\nplain\n~~~");
    assert.equal(html, "<pre><code>plain</code></pre>");
  });

  test("code fence contents are escaped, not interpreted as markdown", () => {
    const { html } = renderMarkdown("```\n<b>**not bold**</b>\n```");
    assert.match(html, /&lt;b&gt;\*\*not bold\*\*&lt;\/b&gt;/);
  });

  test("unterminated fence consumes to end of input without throwing", () => {
    assert.doesNotThrow(() => renderMarkdown("```js\nconst x = 1;"));
  });
});

describe("mermaid", () => {
  test("mermaid fence renders as pre.mermaid and sets hasMermaid", () => {
    const { html, hasMermaid } = renderMarkdown("```mermaid\ngraph TD;\nA-->B;\n```");
    assert.equal(hasMermaid, true);
    assert.match(html, /<pre class="mermaid">graph TD;\nA--&gt;B;<\/pre>/);
  });

  test("hasMermaid is false when there is no mermaid block", () => {
    const { hasMermaid } = renderMarkdown("```js\nconsole.log(1);\n```");
    assert.equal(hasMermaid, false);
  });
});

describe("tables", () => {
  test("renders a GFM pipe table with alignment", () => {
    const src = ["| Left | Center | Right |", "|:---|:---:|---:|", "| a | b | c |"].join("\n");
    const { html } = renderMarkdown(src);
    assert.match(html, /<div class="md-table-wrap"><table class="arag-table">/);
    assert.match(html, /<th style="text-align:left">Left<\/th>/);
    assert.match(html, /<th style="text-align:center">Center<\/th>/);
    assert.match(html, /<th style="text-align:right">Right<\/th>/);
    assert.match(html, /<td style="text-align:left">a<\/td>/);
  });

  test("table without alignment markers has no style attribute", () => {
    const src = ["| A | B |", "|---|---|", "| 1 | 2 |"].join("\n");
    const { html } = renderMarkdown(src);
    assert.match(html, /<th>A<\/th>/);
  });
});

describe("lists", () => {
  test("unordered list with -, *, and +", () => {
    const { html } = renderMarkdown("- a\n* b\n+ c");
    assert.match(html, /<ul>\n<li>a<\/li>\n<li>b<\/li>\n<li>c<\/li>\n<\/ul>/);
  });

  test("ordered list starting at 1 has no start attribute", () => {
    const { html } = renderMarkdown("1. a\n2. b");
    assert.match(html, /^<ol>\n/);
  });

  test("ordered list starting above 1 emits start attribute", () => {
    const { html } = renderMarkdown("3. a\n4. b");
    assert.match(html, /<ol start="3">/);
  });

  test("ordered list accepts '1)' delimiter", () => {
    const { html } = renderMarkdown("1) a\n2) b");
    assert.match(html, /<ol>/);
  });

  test("nested unordered list by indentation", () => {
    const { html } = renderMarkdown("- Item 1\n  - Sub A\n  - Sub B\n- Item 2");
    assert.match(html, /<li>Item 1\n<ul>\n<li>Sub A<\/li>\n<li>Sub B<\/li>\n<\/ul>\n<\/li>/);
  });

  test("task list checkbox rendering", () => {
    const { html } = renderMarkdown("- [ ] todo\n- [x] done");
    assert.match(html, /<input type="checkbox" disabled \/> todo/);
    assert.match(html, /<input type="checkbox" disabled checked \/> done/);
  });
});

describe("blockquotes", () => {
  test("simple blockquote", () => {
    const { html } = renderMarkdown("> quoted text");
    assert.equal(html, "<blockquote>\n<p>quoted text</p>\n</blockquote>");
  });

  test("multi-line blockquote joins into one paragraph", () => {
    const { html } = renderMarkdown("> line one\n> line two");
    assert.equal(html, "<blockquote>\n<p>line one line two</p>\n</blockquote>");
  });

  test("blockquote can contain a list", () => {
    const { html } = renderMarkdown("> - a\n> - b");
    assert.match(html, /<blockquote>\n<ul>\n<li>a<\/li>\n<li>b<\/li>\n<\/ul>\n<\/blockquote>/);
  });
});

describe("thematic breaks", () => {
  test("---, ***, and ___ all render <hr />", () => {
    const { html } = renderMarkdown("---\n\n***\n\n___");
    assert.equal(html, "<hr />\n<hr />\n<hr />");
  });
});

describe("links", () => {
  test("external http(s) link gets target=_blank, rel, and the external badge", () => {
    const { html } = renderMarkdown("[go](https://example.com)");
    assert.match(
      html,
      /<a href="https:\/\/example\.com" target="_blank" rel="noopener noreferrer">go<span class="md-ext" aria-hidden="true">↗<\/span><\/a>/,
    );
  });

  test("mailto link has no target/blank badge", () => {
    const { html } = renderMarkdown("[email](mailto:a@example.com)");
    assert.match(html, /<a href="mailto:a@example\.com">email<\/a>/);
    assert.doesNotMatch(html, /target="_blank"/);
  });

  test("relative link is passed through resolveLink", () => {
    const { html } = renderMarkdown("[doc](../architecture/x.md)", {
      resolveLink: (href) => `/resolved${href.replace("..", "")}`,
    });
    assert.match(html, /<a href="\/resolved\/architecture\/x\.md">doc<\/a>/);
  });

  test("relative link with no resolveLink is emitted unchanged", () => {
    const { html } = renderMarkdown("[doc](./local.md)");
    assert.match(html, /<a href="\.\/local\.md">doc<\/a>/);
  });

  test("fragment links are emitted unchanged", () => {
    const { html } = renderMarkdown("[jump](#section-1)");
    assert.match(html, /<a href="#section-1">jump<\/a>/);
  });

  test("link with title attribute", () => {
    const { html } = renderMarkdown('[x](https://example.com "A title")');
    assert.match(html, /title="A title"/);
  });

  test("autolink <https://...>", () => {
    const { html } = renderMarkdown("<https://example.com/path>");
    assert.match(html, /<a href="https:\/\/example\.com\/path" target="_blank"/);
  });
});

describe("images", () => {
  test("basic image with lazy loading", () => {
    const { html } = renderMarkdown("![alt text](https://example.com/pic.png)");
    assert.match(html, /<img src="https:\/\/example\.com\/pic\.png" alt="alt text" loading="lazy" \/>/);
  });

  test("relative image src uses resolveImage", () => {
    const { html } = renderMarkdown("![a](./img.png)", {
      resolveLink: () => "/link-fallback",
      resolveImage: (src) => `/assets${src.slice(1)}`,
    });
    assert.match(html, /src="\/assets\/img\.png"/);
  });

  test("relative image src falls back to resolveLink when resolveImage is absent", () => {
    const { html } = renderMarkdown("![a](./img.png)", { resolveLink: (src) => `/via-link${src.slice(1)}` });
    assert.match(html, /src="\/via-link\/img\.png"/);
  });

  test("image alt text is escaped", () => {
    const { html } = renderMarkdown("![<script>x</script>](pic.png)");
    assert.match(html, /alt="&lt;script&gt;x&lt;\/script&gt;"/);
  });
});

describe("sanitisation: raw HTML in source is never emitted as markup", () => {
  test("a literal <script> tag is escaped, not executed as markup", () => {
    const { html } = renderMarkdown("<script>alert(1)</script>");
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  });

  test("an <img onerror> XSS payload is escaped as text, not rendered as an img tag", () => {
    const { html } = renderMarkdown('<img src=x onerror="alert(1)">');
    assert.doesNotMatch(html, /<img src=x/);
    assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  });

  test("a bare <div> block is escaped as literal text", () => {
    const { html } = renderMarkdown("<div>hello</div>");
    assert.match(html, /&lt;div&gt;hello&lt;\/div&gt;/);
    assert.doesNotMatch(html, /<div>/);
  });

  test("HTML inside a paragraph mixed with markdown is still escaped", () => {
    const { html } = renderMarkdown('Some **bold** text with <b onclick="x()">raw html</b> inline.');
    assert.match(html, /<strong>bold<\/strong>/);
    assert.match(html, /&lt;b onclick=&quot;x\(\)&quot;&gt;raw html&lt;\/b&gt;/);
  });
});

describe("sanitisation: dangerous URL schemes", () => {
  test("javascript: link is neutered to # with rel=nofollow", () => {
    const { html } = renderMarkdown("[click me](javascript:alert(1))");
    assert.match(html, /<a href="#" rel="nofollow">click me<\/a>/);
  });

  test("javascript: with mixed case and embedded whitespace is still caught", () => {
    const { html } = renderMarkdown("[x](jAvAsCriPt:alert(1))");
    assert.match(html, /href="#" rel="nofollow"/);
  });

  test("data: URI link is neutered", () => {
    const { html } = renderMarkdown("[x](data:text/html,<script>alert(1)</script>)");
    assert.match(html, /href="#" rel="nofollow"/);
  });

  test("vbscript: link is neutered", () => {
    const { html } = renderMarkdown("[x](vbscript:msgbox(1))");
    assert.match(html, /href="#" rel="nofollow"/);
  });

  test("percent-encoded colon trick (javascript%3Aalert) is caught", () => {
    const { html } = renderMarkdown("[x](javascript%3Aalert(1))");
    assert.match(html, /href="#" rel="nofollow"/);
  });

  test("dangerous scheme in an image src falls back to #", () => {
    const { html } = renderMarkdown("![x](javascript:alert(1))");
    assert.match(html, /<img src="#"/);
  });

  test("http and https schemes are never treated as dangerous", () => {
    const { html } = renderMarkdown("[x](https://example.com)");
    assert.doesNotMatch(html, /rel="nofollow"/);
  });
});

describe("robustness", () => {
  test("empty input produces empty output", () => {
    const result = renderMarkdown("");
    assert.equal(result.html, "");
    assert.deepEqual(result.headings, []);
    assert.equal(result.title, "");
    assert.equal(result.hasMermaid, false);
  });

  test("CRLF line endings are normalized", () => {
    const { html } = renderMarkdown("# Title\r\n\r\nPara one.\r\nPara one continued.");
    assert.match(html, /<h1 id="title">/);
    assert.match(html, /<p>Para one\. Para one continued\.<\/p>/);
  });

  test("a pathological run of asterisks completes without hanging", () => {
    const start = Date.now();
    assert.doesNotThrow(() => renderMarkdown("*".repeat(5000)));
    assert.ok(Date.now() - start < 5000, "should complete quickly, not hang");
  });

  test("a very long single line does not throw", () => {
    assert.doesNotThrow(() => renderMarkdown(`Word ${"x".repeat(20000)} end.`));
  });

  test("unbalanced emphasis markers render as literal characters, not throw", () => {
    assert.doesNotThrow(() => renderMarkdown("**bold without close and *em without close"));
  });

  test("unbalanced backtick renders literally", () => {
    const { html } = renderMarkdown("`unterminated code span");
    assert.match(html, /`unterminated code span/);
  });
});
