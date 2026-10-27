/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: 'class',
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                background: "var(--background)",
                foreground: "var(--foreground)",
                surface: {
                    DEFAULT: 'var(--background)',
                    card: 'var(--surface-card, var(--sidebar-bg))',
                    hover: 'var(--hover-bg)',
                    modal: 'var(--surface-modal, var(--background))',
                },
                border: {
                    DEFAULT: 'var(--border-color)',
                    ui: 'var(--border-ui)',
                    grid: 'var(--border-grid)',
                },
                highlight: {
                    yellow: 'var(--highlight-yellow)',
                    green: 'var(--highlight-green)',
                    blue: 'var(--highlight-blue)',
                    purple: 'var(--highlight-purple)',
                    pink: 'var(--highlight-pink)',
                },
                'glass-white': 'rgba(255, 255, 255, 0.6)',
                'glass-border': 'var(--glass-border)',
                'accent-peach': 'var(--accent-peach)',
                'accent-pink': 'var(--accent-pink)',
                'accent-green': 'var(--accent-green)',
                'accent-purple': 'var(--accent-purple)',
            },
            boxShadow: {
                float: 'var(--shadow-float)',
                modal: 'var(--shadow-modal)',
                'float-hover': '25px 25px 40px #D1D9E6, -20px -20px 40px #ffffff',
                'float-sm': '10px 10px 20px #D1D9E6, -10px -10px 20px #ffffff',
                'inner-cushion': 'inset 4px 4px 8px rgba(209, 217, 230, 0.5), inset -4px -4px 8px rgba(255, 255, 255, 0.9)',
                'inner-input': 'inset 6px 6px 10px rgba(209, 217, 230, 0.6), inset -6px -6px 10px rgba(255, 255, 255, 0.9)',
                'inner-input-focus': 'inset 8px 8px 12px rgba(209, 217, 230, 0.7), inset -8px -8px 12px rgba(255, 255, 255, 1)',
            },
            borderRadius: {
                card: 'var(--radius-lg, 14px)',
                modal: 'var(--radius-modal, 24px)',
                ui: 'var(--radius, 8px)',
                '4xl': '2rem',
                '5xl': '2.5rem',
            }
        },
    },
    plugins: [],
};
