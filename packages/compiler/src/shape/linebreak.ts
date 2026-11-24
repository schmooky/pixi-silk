import { LineBreaker } from 'linebreak';

/** A break opportunity: a line may (or must) start at `position`, a UTF-16 offset. */
export interface BreakOpportunity {
    /** UTF-16 offset of the first character of the next line. */
    position: number;
    /** A mandatory break (after a newline). */
    required: boolean;
}

/**
 * UAX #14 break opportunities of a paragraph, end of text excluded. Compiler only: the results are
 * baked into the RUNS flags, so the runtime carries no line break tables.
 */
export function breakOpportunities(text: string): BreakOpportunity[] {
    const breaker = new LineBreaker(text);
    const out: BreakOpportunity[] = [];

    for (let bk = breaker.nextBreak(); bk; bk = breaker.nextBreak()) {
        if (bk.position < text.length) out.push({ position: bk.position, required: bk.required });
    }

    return out;
}
