(() => {
  const yearEl = document.getElementById("js-year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  const updatedEl = document.getElementById("js-updated");
  if (updatedEl) updatedEl.textContent = new Date().toISOString().slice(0, 10);
})();

