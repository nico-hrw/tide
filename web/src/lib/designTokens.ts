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
};

export default DT;
