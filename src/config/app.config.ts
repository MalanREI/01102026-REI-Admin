export const APP_NAME = "Alan's Workspace";

export type NavItem = {
  label: string;
  href: string;
  children?: NavItem[];
  dynamic?: 'workspaces';
  icon?: string;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/home" },
  { label: "Meetings", href: "/meetings" },
  { label: "Sales Funnel", href: "/sales-funnel" },
  {
    label: "Social Media",
    href: "/social-media",
    children: [
      { label: "Dashboard", href: "/social-media" },
      { label: "Content Studio", href: "/social-media/content-studio" },
      { label: "Content Library", href: "/social-media/library" },
      { label: "Calendar", href: "/social-media/calendar" },
      { label: "Analytics", href: "/social-media/analytics" },
      { label: "Inbox", href: "/social-media/inbox" },
      { label: "Settings", href: "/social-media/settings" },
    ],
  },
];
