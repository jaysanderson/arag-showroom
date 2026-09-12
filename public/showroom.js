/**
 * Progressive enhancement only. Every page works with this file blocked: these handlers add
 * reveal/copy affordances for secrets and keep the docs navigation open on the page you are
 * reading. Listeners are attached here rather than inline so the Content-Security-Policy never
 * needs 'unsafe-inline' for behaviour.
 */
const byId = (id) => document.getElementById(id);

function flash(button, text) {
  const original = button.textContent;
  button.textContent = text;
  button.disabled = true;
  setTimeout(() => {
    button.textContent = original;
    button.disabled = false;
  }, 1400);
}

document.addEventListener("click", async (event) => {
  const target =
    event.target instanceof Element ? event.target.closest("button[data-copy], button[data-reveal]") : null;
  if (!target) return;
  const id = target.getAttribute("data-copy") ?? target.getAttribute("data-reveal");
  const el = id ? byId(id) : null;
  if (!el) return;
  const secret = el.getAttribute("data-secret") ?? el.textContent ?? "";
  if (target.hasAttribute("data-reveal")) {
    const hidden = el.textContent !== secret;
    el.textContent = hidden ? secret : "•".repeat(16);
    target.textContent = hidden ? "Hide" : "Reveal";
    return;
  }
  try {
    await navigator.clipboard.writeText(secret);
    flash(target, "Copied");
  } catch {
    flash(target, "Press ⌘C");
  }
});

// Keep the collapsed docs navigation open when it contains the current page.
for (const details of document.querySelectorAll(".sr-docnav-toggle")) {
  if (details.querySelector('[aria-current="page"]')) details.open = true;
}
