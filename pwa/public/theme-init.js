// Restore the same preference before either the landing or workspace hydrates.
try {
  const theme = localStorage.getItem("theme");
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
} catch { /* Storage can be unavailable; CSS follows the system theme. */ }
