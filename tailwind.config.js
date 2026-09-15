/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
          // 体系A 点缀色（design.md token `accent` #0ea5e9）；
          // DEFAULT 保留 shadcn 悬停灰，勿混用
          blue: "#0ea5e9",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        // ===== 体系 A · 工作台蓝白（design.md §2.1）=====
        brand: {
          DEFAULT: "#1a56db",
          deep: "#0f3a9e",
          light: "#eff4ff",
        },
        success: "#10b981",
        warning: "#f59e0b",
        danger: "#ef4444",
        // 平台系列色
        deepseek: "#1a56db",
        doubao: "#0ea5e9",
        qwen: "#5e5ce6",
        // 灰阶快捷 token（与默认 gray 对齐）
        page: "#f9fafb",
        // ===== 体系 B · 诊断报告 Apple 风（design.md §2.2）=====
        rpt: {
          bg: "#f5f5f7",
          card: "#ffffff",
          blue: "#0071e3",
          purple: "#5e5ce6",
          orange: "#ff9f0a",
          green: "#30d158",
          red: "#ff3b30",
          title: "#1d1d1f",
          sub: "#6e6e73",
          weak: "#86868b",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Text"',
          '"PingFang SC"',
          '"HarmonyOS Sans SC"',
          '"Microsoft YaHei"',
          '"Helvetica Neue"',
          "Arial",
          "sans-serif",
        ],
        mono: [
          '"SF Mono"',
          "ui-monospace",
          '"JetBrains Mono"',
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      fontSize: {
        // design.md §3.2 工作台字号标尺
        display: ["28px", { lineHeight: "36px", fontWeight: "700" }],
        h1: ["22px", { lineHeight: "30px", fontWeight: "600" }],
        h2: ["17px", { lineHeight: "24px", fontWeight: "600" }],
        body: ["14px", { lineHeight: "22px", fontWeight: "400" }],
        small: ["13px", { lineHeight: "20px", fontWeight: "400" }],
        caption: ["12px", { lineHeight: "18px", fontWeight: "400" }],
        kpi: ["30px", { lineHeight: "38px", fontWeight: "700" }],
        score: ["40px", { lineHeight: "48px", fontWeight: "700" }],
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xs: "calc(var(--radius) - 6px)",
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        card: "0 1px 2px rgba(16,24,40,.06)",
        "card-hover": "0 4px 12px rgba(16,24,40,.10)",
        "rpt-card": "0 4px 24px rgba(0,0,0,.06)",
      },
      transitionTimingFunction: {
        // design.md §7 统一曲线
        geo: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "caret-blink": {
          "0%,70%,100%": { opacity: "1" },
          "20%,50%": { opacity: "0" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        pulseDot: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.55", transform: "scale(1.35)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "caret-blink": "caret-blink 1.25s ease-out infinite",
        shimmer: "shimmer 1.5s infinite",
        "pulse-dot": "pulseDot 1.2s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
