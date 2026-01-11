export const APP_NAME = "REI Team Admin";

export const NAV_ITEMS = [
  { label: "Home", href: "/home" },
  { label: "Meetings", href: "/meetings" },
  { label: "Media Posting", href: "/media-posting" },
  { label: "Sales Funnel", href: "/sales-funnel" },
] as const;

export type NavItem = typeof NAV_ITEMS[number];
