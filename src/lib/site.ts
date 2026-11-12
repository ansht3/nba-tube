/**
 * The product name lives here and nowhere else, so that a rename before a
 * public launch is a one-line change.
 */
export const SITE_NAME = "NBATube";

export const SITE_TAGLINE = "Official NBA highlights and press conferences. No algorithm, no comments, no account.";

/** Set at build time for hosts that serve the site from a sub-path, such as GitHub Pages. */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const REPOSITORY_URL = "https://github.com/ansht3/nba-tube";

/**
 * Videos per page on long lists. It lives in a plain module on purpose: a
 * constant exported from a "use client" file reaches server components as a
 * client reference, not as a number.
 */
export const LIST_PAGE_SIZE = 48;
