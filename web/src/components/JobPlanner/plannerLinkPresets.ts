export interface PlannerLinkPreset {
    name: string;
    url: string;
    icon: string;
}

/** One-click templates in the "new quick link" dialog (study portals of the HTW Dresden / TU Dresden). */
export const PLANNER_LINK_PRESETS: PlannerLinkPreset[] = [
    {
        name: 'OPAL',
        url: 'https://idp2.htw-dresden.de/idp/profile/SAML2/Redirect/SSO?execution=e1s2',
        icon: 'https://tu-dresden.de/studium/ressourcen/bilder/opal/opal-logo.png/@@images/86c7a1b3-ff1c-47e6-908b-75e13795183c.png',
    },
    {
        name: 'HTWD mobil',
        url: 'https://mobil.htw-dresden.de/',
        icon: 'https://www.designtagebuch.de/wp-content/uploads/mediathek//2023/04/htwd-logo.jpg',
    },
    {
        name: 'Groupware',
        url: 'https://groupware.htw-dresden.de/',
        icon: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTzM9l5SCxVlyy-y1akteoX2zi-y7y_Pk7D9Ms8Y9bRN9ivR1-7UGYl9WA&s=10',
    },
];
