export const DT = {
    // Typography
    fontSans: "'Inter', system-ui, -apple-system, sans-serif",

    // Radii
    radiusSm: '6px',
    radius: '8px',
    radiusUi: '8px',
    cardRadius: '14px',
    radiusLg: '14px',
    radiusModal: '24px',

    blur: '12px',
    glass: (isDark = false) => isDark ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.8)',
    chip: (active = false, isDark = false) => active 
        ? 'bg-blue-600 text-white' 
        : isDark ? 'bg-white/10 text-gray-300' : 'bg-gray-100 text-gray-700',
    accent: '#3b82f6',
    cardBg: (isDark = false) => isDark ? '#18181b' : '#ffffff',
    mutedText: (isDark = false) => isDark ? '#9ca3af' : '#6b7280',
    primaryText: (isDark = false) => isDark ? '#ffffff' : '#111827',

    // Elevation & Shadows
    shadowSm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    shadowFloat: '0px 8px 24px rgba(0, 0, 0, 0.08)',
    shadowE1: '0px 4px 16px 0px rgba(17, 24, 39, 0.06)',
    shadowE2: '0px 24px 64px 0px rgba(17, 24, 39, 0.16)',
    shadowModal: '0px 24px 64px rgba(0, 0, 0, 0.16)',

    // Surfaces & Boxes
    surface: {
        card: 'var(--surface-card, var(--sidebar-bg))',
        cardBorder: 'var(--surface-card-border, var(--border-color))',
        modal: 'var(--surface-modal, var(--background))',
        modalBorder: 'var(--surface-modal-border, var(--border-color))',
    },

    // Highlights / Markierungen
    highlights: {
        yellow: { bg: 'var(--highlight-yellow)', text: 'var(--highlight-yellow-text)', hex: '#fef08a' },
        green: { bg: 'var(--highlight-green)', text: 'var(--highlight-green-text)', hex: '#bbf7d0' },
        blue: { bg: 'var(--highlight-blue)', text: 'var(--highlight-blue-text)', hex: '#bfdbfe' },
        purple: { bg: 'var(--highlight-purple)', text: 'var(--highlight-purple-text)', hex: '#e9d5ff' },
        pink: { bg: 'var(--highlight-pink)', text: 'var(--highlight-pink-text)', hex: '#fbcfe8' },
    },

    // Semantic Status Pairs (Kapitel 02)
    status: {
        success: { fg: '#2E7D32', bg: '#E8F5E9' },
        warning: { fg: '#8A4B00', bg: '#FFF3E0' },
        danger: { fg: '#FFFFFF', bg: '#B42318' },
        info: { fg: '#111827', bg: '#F3F4F6' },
    },

    // Modal tokens (Figma Design System)
    modal: {
        radius: '24px',
        controlRadius: '8px',
        closeRadius: '12px',
        shadow: '0px 24px 64px 0px rgba(17, 24, 39, 0.16)',
        scrim: 'rgba(17, 24, 39, 0.20)',
        maxWidth: '520px',
        bg: (isDark = false) => isDark ? '#18181b' : '#ffffff',
        border: (isDark = false) => isDark ? '#27272a' : '#e5e7eb',
    },

    // Colors & Typography tokens (Figma Design System)
    foreground: '#111827',
    textBody: '#2c2c2c',
    textMuted: '#596170',
    borderColor: '#e5e7eb',
    borderControl: '#7c8493',
    sidebarBg: '#f9fafb',
    hoverBg: '#f5f5f5',
    danger: '#b42318',
};

export const glass = DT.glass;
export const chip = DT.chip;
export const tokens = DT;
export default DT;
