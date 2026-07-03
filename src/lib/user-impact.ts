// User impact explanations — safe for both client and server.
// Maps accessibility violations to plain-language descriptions of how
// real users are affected.

export type UserImpact = {
  /** Short heading for the impact panel (e.g. "Low vision readability") */
  heading: string;
  /** One or two sentences explaining how users are affected */
  body: string;
  /** The primary user group impacted */
  affectedGroup: string;
};

type UserImpactInput = {
  impact: string | null;
  help: string;
  section: string | null;
  isLargeText?: boolean;
  hasBackgroundImage?: boolean;
};

/**
 * Returns a human-readable explanation of how a contrast violation
 * affects real users. Contextualized by severity, page section, and
 * element characteristics.
 */
export function getUserImpact(input: UserImpactInput): UserImpact {
  const { impact, help, section, isLargeText, hasBackgroundImage } = input;
  const isSerious = impact === "serious";
  const isModerate = impact === "moderate";

  // Hero / banner text over images
  if (hasBackgroundImage && section === "hero") {
    return {
      heading: "Critical hero content may be unreadable",
      body: isSerious
        ? "Users with low vision, older adults, and people in bright environments (sunlight, glare) may be completely unable to read the hero text. Hero sections often contain the primary call-to-action — if it can't be read, users cannot engage with the product."
        : "Users with reduced contrast sensitivity may struggle to read text placed over a background image. Critical messaging in hero sections should always be readable without effort.",
      affectedGroup: "Low-vision users · Older adults (1 in 3 over 65 have vision impairment) · Users in bright environments",
    };
  }

  // Navigation elements
  if (section === "navigation") {
    return {
      heading: "Navigation links may be hard to find",
      body: isSerious
        ? "Users with low vision or color blindness may not be able to distinguish navigation links from surrounding text. If users can't find the navigation, they can't move through the site — effectively locking them out of key sections."
        : "Low-contrast navigation text makes it harder for users with visual impairments to orient themselves and find their way around the site.",
      affectedGroup: "Low-vision users · Color-blind users (1 in 12 men, 1 in 200 women) · Older adults",
    };
  }

  // Form elements
  if (section === "form") {
    return {
      heading: "Form labels and inputs may be illegible",
      body: isSerious
        ? "Users with visual impairments may be unable to read form labels, input text, or error messages. This can prevent them from completing essential tasks like signing up, making purchases, or submitting applications."
        : "Reduced contrast on form elements can slow down task completion and increase error rates for users with vision impairments.",
      affectedGroup: "Low-vision users · Users with cognitive disabilities · Older adults",
    };
  }

  // Main content
  if (section === "main-content") {
    return {
      heading: "Body text may be difficult to read",
      body: isSerious
        ? "Users with low vision (approximately 2.2 billion people globally per WHO) may be unable to read the main content. This excludes users from consuming information, understanding services, or completing tasks."
        : "Low-contrast body text causes eye strain and reading fatigue. Users may abandon the page rather than struggle through difficult-to-read content.",
      affectedGroup: "Low-vision users · Users with reading disabilities · All users in non-ideal conditions",
    };
  }

  // Footer
  if (section === "footer") {
    return {
      heading: "Footer content may be overlooked",
      body: "Footer text (copyright, legal links, contact info) rendered in low contrast may be effectively invisible to users with visual impairments. While typically lower priority, inaccessible legal links can create compliance risk.",
      affectedGroup: "Low-vision users · Users relying on footer navigation",
    };
  }

  // Header
  if (section === "header") {
    return {
      heading: "Brand and identity text may be illegible",
      body: "Low-contrast header text — including brand names, taglines, and utility links — may be missed by users with visual impairments, reducing brand recognition and site orientation.",
      affectedGroup: "Low-vision users · Color-blind users",
    };
  }

  // Sidebar
  if (section === "sidebar") {
    return {
      heading: "Supplementary content may be inaccessible",
      body: "Sidebar content (filters, related links, calls-to-action) rendered in low contrast may be skipped or unreadable for users with visual impairments, reducing discoverability of related content.",
      affectedGroup: "Low-vision users · Screen magnification users",
    };
  }

  // Small text specific (not large text)
  if (!isLargeText) {
    return {
      heading: "Small text is hard to read at low contrast",
      body: isSerious
        ? "Small text with insufficient contrast is one of the most common accessibility barriers. Users with low vision, older adults, and people in sub-optimal lighting conditions may be completely unable to read this text. Increasing font size to at least 18px bold (or 24px regular) would lower the contrast threshold needed."
        : "Small text at low contrast can cause reading fatigue even for users without diagnosed vision impairments, especially during extended use.",
      affectedGroup: "Low-vision users · Older adults · Users with screen magnification · All users on mobile devices outdoors",
    };
  }

  // Generic serious contrast failure
  if (isSerious) {
    return {
      heading: "Severe contrast barrier for visually impaired users",
      body: "This element fails WCAG AA contrast requirements, making it difficult or impossible for users with low vision to perceive. An estimated 2.2 billion people globally have some form of vision impairment. Insufficient contrast is consistently ranked as one of the top accessibility barriers in web accessibility lawsuits.",
      affectedGroup: "Low-vision users · Older adults · Color-blind users · All users in bright environments",
    };
  }

  // Generic moderate contrast failure
  if (isModerate) {
    return {
      heading: "Reduced readability for visually impaired users",
      body: "This element has borderline contrast that may cause difficulty for users with mild to moderate vision impairments. While it may be usable with effort, accessible design should not require users to struggle.",
      affectedGroup: "Low-vision users · Older adults · Users with screen magnification",
    };
  }

  // Pass / minor — informational
  return {
    heading: "Meets minimum contrast requirements",
    body: "This element passes WCAG AA contrast requirements. Users with mild to moderate vision impairments should be able to perceive this content under normal conditions.",
    affectedGroup: "No specific user group blocked",
  };
}
