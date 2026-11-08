/** How the docs demo runner maps to a plain Pixi app. Said once per page before the first demo source. */
export declare const DEMO_RUNNER_NOTE: string;
export declare function mdxToMarkdown(
    body: string,
    demoSource: (name: string) => string | undefined,
    options?: { demoLink?: (name: string) => string },
): string;
