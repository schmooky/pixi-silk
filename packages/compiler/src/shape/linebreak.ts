import { lineBreaks } from './uax14';

/** A break opportunity: a line may (or must) start at `position`, a UTF-16 offset. */
export interface BreakOpportunity {
    /** UTF-16 offset of the first character of the next line. */
    position: number;
    /** A mandatory break (after a newline). */
    required: boolean;
}

/**
 * UAX #14 break opportunities of a paragraph (Unicode 16.0.0, `uax14.ts`), end of text excluded.
 * Compiler only: the results are baked into the RUNS flags, so the runtime carries no line break
 * tables.
 */
export function breakOpportunities(text: string): BreakOpportunity[] {
    return lineBreaks(text);
}
