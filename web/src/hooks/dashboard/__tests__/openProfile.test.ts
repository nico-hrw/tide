import { describe, expect, it, vi } from 'vitest';
import { routeOpenProfile } from '../openProfile';

describe('routeOpenProfile', () => {
    it('desktop: opens a profile tab', () => {
        const switchTab = vi.fn();
        expect(routeOpenProfile({ userId: 'u1', username: 'anna' }, { switchTab })).toBe('tab');
        expect(switchTab).toHaveBeenCalledWith('profile:u1', 'profile', 'anna');
    });

    it('mobile: opens the overlay and creates no profile tab', () => {
        const switchTab = vi.fn();
        const openOverlay = vi.fn();
        expect(routeOpenProfile({ userId: 'u1', username: 'anna' }, { switchTab, openOverlay })).toBe('overlay');
        expect(openOverlay).toHaveBeenCalledWith('u1', 'anna');
        expect(switchTab).not.toHaveBeenCalled();
    });

    it('ignores events without a userId', () => {
        const switchTab = vi.fn();
        const openOverlay = vi.fn();
        expect(routeOpenProfile({}, { switchTab, openOverlay })).toBe('ignored');
        expect(routeOpenProfile(undefined, { switchTab })).toBe('ignored');
        expect(switchTab).not.toHaveBeenCalled();
        expect(openOverlay).not.toHaveBeenCalled();
    });
});
