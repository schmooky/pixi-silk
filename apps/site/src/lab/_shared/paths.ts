/** Site-relative locations the lab pages link to (respects Astro's `base`). */
const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');

const home = typeof document === 'undefined' ? undefined : document.body.dataset;

/** The docs page this experiment deepens (set by the Lab layout), else the docs index. */
export const LAB_HOME: string = home?.home ?? `${BASE}docs/`;

/** Label of the back link: the page it returns to. */
export const LAB_HOME_LABEL: string = home?.homeLabel ? `Back to ${home.homeLabel}` : 'Back to the docs';

export const REFS = `${BASE}refs/`;
