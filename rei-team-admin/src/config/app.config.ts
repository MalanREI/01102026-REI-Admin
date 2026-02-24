export const APP_NAME = "Alan's Workspace";

export type NavChild = { label: string; href: string };

export type NavItem =
  | { label: string; href: string; children?: never }
  | { label: string; href: string; children: NavChild[] };

export const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/home" },
  { label: "Meetings", href: "/meetings" },
  { label: "Media Posting", href: "/media-posting" },
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
