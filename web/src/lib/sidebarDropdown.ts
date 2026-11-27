/** Only one dropdown (Plugins or Workspaces) may be open in the sidebar: opening one tells the other to close. */
const EVENT = 'tide:sidebar-dropdown';

export function announceSidebarDropdown(id: string): void {
    window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: id }));
}

/** Calls `close` when another dropdown than `self` announces that it opened. */
export function onOtherSidebarDropdown(self: string, close: () => void): () => void {
    const handler = (e: Event) => {
        if ((e as CustomEvent<string>).detail !== self) close();
    };
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
}
