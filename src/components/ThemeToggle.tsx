"use client";

import React, { useEffect, useState } from "react";
import { Sun, Moon, Laptop } from "lucide-react";

export type Theme = "system" | "light" | "dark";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("theme") as Theme | null;
    if (saved === "light" || saved === "dark" || saved === "system") {
      setTheme(saved);
    } else {
      setTheme("system");
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const applyTheme = () => {
      const isDark =
        theme === "dark" || (theme === "system" && mediaQuery.matches);

      if (isDark) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    };

    applyTheme();

    if (theme === "system") {
      localStorage.removeItem("theme");
      const listener = () => applyTheme();
      mediaQuery.addEventListener("change", listener);
      return () => mediaQuery.removeEventListener("change", listener);
    } else {
      localStorage.setItem("theme", theme);
    }
  }, [theme, mounted]);

  // Avoid hydration mismatch by rendering placeholder with same width before mount
  if (!mounted) {
    return (
      <div className="h-7 w-[88px] rounded-full bg-gray-100 dark:bg-white/[0.06] animate-pulse" />
    );
  }

  return (
    <div
      className="flex items-center p-0.5 bg-gray-200/60 dark:bg-white/[0.08] rounded-full border border-black/[0.04] dark:border-white/[0.08] text-xs transition-colors"
      role="radiogroup"
      aria-label="Theme selector"
    >
      <button
        type="button"
        onClick={() => setTheme("system")}
        className={`p-1.5 rounded-full transition-all duration-200 flex items-center justify-center hover:scale-110 active:scale-90 ${
          theme === "system"
            ? "bg-white dark:bg-[#2c2c2e] text-blue-600 dark:text-blue-400 shadow-sm"
            : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
        }`}
        title="Follow System OS Theme"
        aria-label="Follow System Theme"
      >
        <Laptop className="w-3.5 h-3.5 transition-transform duration-200 group-hover:rotate-6" />
      </button>

      <button
        type="button"
        onClick={() => setTheme("light")}
        className={`p-1.5 rounded-full transition-all duration-200 flex items-center justify-center hover:scale-110 active:scale-90 ${
          theme === "light"
            ? "bg-white dark:bg-[#2c2c2e] text-amber-500 shadow-sm"
            : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
        }`}
        title="Light Mode"
        aria-label="Light Mode"
      >
        <Sun className="w-3.5 h-3.5 transition-transform duration-300 hover:rotate-45" />
      </button>

      <button
        type="button"
        onClick={() => setTheme("dark")}
        className={`p-1.5 rounded-full transition-all duration-200 flex items-center justify-center hover:scale-110 active:scale-90 ${
          theme === "dark"
            ? "bg-white dark:bg-[#2c2c2e] text-indigo-500 dark:text-indigo-400 shadow-sm"
            : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
        }`}
        title="Dark Mode"
        aria-label="Dark Mode"
      >
        <Moon className="w-3.5 h-3.5 transition-transform duration-200 hover:-rotate-12" />
      </button>
    </div>
  );
}
