import type { PlatformName } from "@/src/lib/types/social-media";

export interface PlatformConfig {
  name: string;
  icon: string;
  /** Tailwind gradient classes for card accent bar */
  gradient: string;
  /** Tailwind text color for the platform name */
  textColor: string;
  /** Tailwind border color class */
  borderColor: string;
  /** Tailwind bg color for the icon badge */
  iconBg: string;
  /** Default platform home URL (fallback for quick-launch) */
  defaultUrl: string;
  permissions: string[];
  enables: string[];
}

export const PLATFORM_CONFIGS: Record<PlatformName, PlatformConfig> = {
  instagram: {
    name: "Instagram",
    icon: "📸",
    gradient: "from-purple-500 via-pink-500 to-orange-400",
    textColor: "text-pink-400",
    borderColor: "border-pink-500/30",
    iconBg: "bg-pink-500/10",
    defaultUrl: "https://www.instagram.com/",
    permissions: [
      "Read posts, stories, and media",
      "Publish photos and videos",
      "View audience insights and analytics",
      "Manage comments and replies",
    ],
    enables: [
      "Automated post scheduling and publishing",
      "Instagram analytics tracking",
      "Comment management and AI replies",
    ],
  },
  facebook: {
    name: "Facebook",
    icon: "👤",
    gradient: "from-blue-600 to-blue-400",
    textColor: "text-blue-400",
    borderColor: "border-blue-500/30",
    iconBg: "bg-blue-500/10",
    defaultUrl: "https://www.facebook.com/",
    permissions: [
      "Manage Pages and posts",
      "Publish content on behalf of Pages",
      "Read Page insights and analytics",
      "Manage comments, messages, and reviews",
    ],
    enables: [
      "Automated Facebook Page posting",
      "Facebook analytics and reach tracking",
      "Review and comment management",
    ],
  },
  linkedin: {
    name: "LinkedIn",
    icon: "💼",
    gradient: "from-sky-700 to-sky-500",
    textColor: "text-sky-400",
    borderColor: "border-sky-500/30",
    iconBg: "bg-sky-500/10",
    defaultUrl: "https://www.linkedin.com/",
    permissions: [
      "Post on behalf of your LinkedIn profile or Company Page",
      "Read follower and engagement analytics",
      "Manage comments and interactions",
    ],
    enables: [
      "Professional content publishing on LinkedIn",
      "LinkedIn follower and engagement analytics",
      "Thought leadership post automation",
    ],
  },
  tiktok: {
    name: "TikTok",
    icon: "🎵",
    gradient: "from-slate-900 via-pink-600 to-cyan-400",
    textColor: "text-pink-400",
    borderColor: "border-pink-500/30",
    iconBg: "bg-pink-500/10",
    defaultUrl: "https://www.tiktok.com/",
    permissions: [
      "Upload and publish videos",
      "Read video analytics and performance metrics",
      "Manage comments on your videos",
    ],
    enables: [
      "TikTok video scheduling and publishing",
      "Short-form video analytics",
      "Trending content monitoring",
    ],
  },
  youtube: {
    name: "YouTube",
    icon: "▶️",
    gradient: "from-red-600 to-red-400",
    textColor: "text-red-400",
    borderColor: "border-red-500/30",
    iconBg: "bg-red-500/10",
    defaultUrl: "https://www.youtube.com/",
    permissions: [
      "Upload and manage videos",
      "Read channel analytics and subscriber data",
      "Manage comments and community posts",
      "Access YouTube Studio insights",
    ],
    enables: [
      "YouTube video scheduling and publishing",
      "Channel analytics and subscriber tracking",
      "Community post management",
    ],
  },
  google_business: {
    name: "Google Business Profile",
    icon: "🏢",
    gradient: "from-blue-500 via-red-500 via-yellow-400 to-green-500",
    textColor: "text-green-400",
    borderColor: "border-green-500/30",
    iconBg: "bg-green-500/10",
    defaultUrl: "https://business.google.com/",
    permissions: [
      "Manage Business Profile posts and updates",
      "Read reviews and Q&A",
      "Respond to reviews on your behalf",
      "Access local search performance data",
    ],
    enables: [
      "Google Business Profile post scheduling",
      "Review monitoring and AI-powered responses",
      "Local SEO performance analytics",
    ],
  },
};

export const ALL_PLATFORMS: PlatformName[] = [
  "instagram",
  "facebook",
  "linkedin",
  "tiktok",
  "youtube",
  "google_business",
];
