// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

window.addEventListener("keydown", (e) => {
  if (
    e.key === "Escape" ||
    e.key === "F11" ||
    (e.ctrlKey && e.key === "w") ||
    (e.ctrlKey && e.shiftKey && e.key === "I") ||
    (e.altKey && e.key === "Tab")
  ) {
    e.preventDefault();
  }
});