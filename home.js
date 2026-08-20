const fontToggle = document.getElementById("fontToggle");
fontToggle.addEventListener("click", () => {
  const isLarge = document.body.classList.toggle("font-large");
  fontToggle.setAttribute("aria-pressed", String(isLarge));
});
