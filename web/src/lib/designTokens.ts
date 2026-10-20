export const DT = {
    radius: '8px',
    blur: '12px',
    glass: (isDark = false) => isDark ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.8)',
    chip: (active = false, isDark = false) => active 
        ? 'bg-blue-600 text-white' 
        : isDark ? 'bg-white/10 text-gray-300' : 'bg-gray-100 text-gray-700',
    accent: '#3b82f6',
    cardBg: (isDark = false) => isDark ? '#18181b' : '#ffffff',
    mutedText: (isDark = false) => isDark ? '#9ca3af' : '#6b7280',
    primaryText: (isDark = false) => isDark ? '#ffffff' : '#111827',

    // Modal tokens (Figma Design System)
    modal: {
        radius: '24px',
        controlRadius: '8px',
        closeRadius: '12px',
        shadow: '0px 24px 64px 0px rgba(17, 24, 39, 0.16)',
        scrim: 'rgba(17, 24, 39, 0.20)',
        maxWidth: '520px',
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

export default DT;
