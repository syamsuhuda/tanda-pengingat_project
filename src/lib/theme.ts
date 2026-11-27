export const THEME_STORAGE_KEY = "pj_theme";

export type ThemeMode = "dark" | "light";

export const THEME_INIT_SCRIPT = `(function () {
  try {
    var saved = window.localStorage.getItem("${THEME_STORAGE_KEY}");
    var theme = saved === "light" ? "light" : "dark";
    var root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.setAttribute("data-theme", theme);
    root.style.colorScheme = theme;
  } catch (e) {
    var root = document.documentElement;
    root.classList.add("dark");
    root.setAttribute("data-theme", "dark");
    root.style.colorScheme = "dark";
  }
})();`;
