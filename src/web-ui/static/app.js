const shell = document.querySelector(".app-shell");
const composer = document.querySelector(".composer");
const textarea = composer?.querySelector("textarea");

function closePanels() {
  shell?.setAttribute("data-left-open", "false");
  shell?.setAttribute("data-right-open", "false");
}

document.querySelector("[data-toggle-left]")?.addEventListener("click", () => {
  shell?.setAttribute("data-left-open", "true");
  shell?.setAttribute("data-right-open", "false");
});

document.querySelector("[data-toggle-right]")?.addEventListener("click", () => {
  shell?.setAttribute("data-right-open", "true");
  shell?.setAttribute("data-left-open", "false");
});

document.querySelector("[data-close-panels]")?.addEventListener("click", closePanels);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closePanels();
});

textarea?.addEventListener("input", () => {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
});

composer?.addEventListener("submit", (event) => {
  event.preventDefault();
  textarea?.focus();
});
