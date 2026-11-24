/**
 * The Unicode Line Breaking Algorithm (UAX #14) for Unicode 16.0.0, rules LB1 to LB31, tested
 * against every case of LineBreakTest.txt 16.0.0. In the rule comments `x` means no break and `/`
 * a break, the two signs of UAX #14. Compiler only: its results are baked into the
 * RUNS flags, so the runtime carries no line break tables.
 */
import { EA_RANGES, LB_CLASSES, LB_KINDS, LB_STARTS } from './linebreak-data';

const STARTS = LB_STARTS.split(',').map((s) => Number.parseInt(s, 36));
const EA = EA_RANGES.split(',').map((r) => r.split('-').map((s) => Number.parseInt(s, 36)) as [number, number]);

/** Line break class of a code point (Line_Break property, before LB1). */
export function lineBreakClass(cp: number): string {
    let lo = 0;
    let hi = STARTS.length - 1;

    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;

        if (STARTS[mid] <= cp) lo = mid;
        else hi = mid - 1;
    }
    return LB_CLASSES[Number.parseInt(LB_KINDS.slice(lo * 2, lo * 2 + 2), 36)];
}

/** East Asian Width F, W or H. */
function eastAsian(cp: number): boolean {
    let lo = 0;
    let hi = EA.length - 1;

    while (lo <= hi) {
        const mid = (lo + hi) >> 1;

        if (cp < EA[mid][0]) hi = mid - 1;
        else if (cp > EA[mid][1]) lo = mid + 1;
        else return true;
    }
    return false;
}

const PI = /\p{Pi}/u;
const PF = /\p{Pf}/u;
const MARK = /\p{Mn}|\p{Mc}/u;
const PICT_UNASSIGNED = /^(?=\p{Extended_Pictographic})\p{Cn}$/u;
const DOTTED_CIRCLE = 0x25cc;

/** A break opportunity before the character at `position`, a UTF-16 offset. */
export interface UaxBreak {
    /** UTF-16 offset of the first character of the next line. */
    position: number;
    /** A mandatory break (after a line or paragraph separator). */
    required: boolean;
}

const set = (...names: string[]) => new Set(names);
const HARD = set('BK', 'CR', 'LF', 'NL');
const NO_BASE = set('BK', 'CR', 'LF', 'NL', 'SP', 'ZW');
const LB15A_BEFORE = set('BK', 'CR', 'LF', 'NL', 'OP', 'QU', 'GL', 'SP', 'ZW');
const LB15B_AFTER = set('SP', 'GL', 'WJ', 'CL', 'QU', 'CP', 'EX', 'IS', 'SY', 'BK', 'CR', 'LF', 'NL', 'ZW');
const LB20A_BEFORE = set('BK', 'CR', 'LF', 'NL', 'SP', 'ZW', 'CB', 'GL');
const HANGUL = set('JL', 'JV', 'JT', 'H2', 'H3');
const AKSARA = (cls: string, cp: number) => cls === 'AK' || cls === 'AS' || cp === DOTTED_CIRCLE;

/**
 * Break opportunities of a text, the end of text excluded (rule LB3 always breaks there).
 * Positions are UTF-16 offsets.
 */
export function lineBreaks(text: string): UaxBreak[] {
    const cps: number[] = [];
    const offsets: number[] = [];

    for (let i = 0; i < text.length; ) {
        const cp = text.codePointAt(i) ?? 0;

        cps.push(cp);
        offsets.push(i);
        i += cp > 0xffff ? 2 : 1;
    }
    const n = cps.length;
    // LB1: resolve ambiguous, surrogate, unknown, complex-context and conditional Japanese starters
    const raw = cps.map((cp) => {
        const c = lineBreakClass(cp);

        if (c === 'AI' || c === 'SG' || c === 'XX') return 'AL';
        if (c === 'SA') return MARK.test(String.fromCodePoint(cp)) ? 'CM' : 'AL';
        if (c === 'CJ') return 'NS';
        return c;
    });
    // LB9 and LB10: combining marks and joiners take the class of their base, or become AL
    const cls = [...raw];
    const base = cps.map((_, i) => i);
    const absorbed = new Array<boolean>(n).fill(false);

    for (let i = 0; i < n; i++) {
        if (raw[i] !== 'CM' && raw[i] !== 'ZWJ') continue;
        if (i > 0 && !NO_BASE.has(cls[i - 1])) {
            absorbed[i] = true;
            base[i] = base[i - 1];
            cls[i] = cls[i - 1];
        } else cls[i] = 'AL';
    }
    // elements: indices of the characters that start one (not absorbed)
    const elementOf = new Array<number>(n);
    const elements: number[] = [];

    for (let i = 0; i < n; i++) {
        if (!absorbed[i]) elements.push(i);
        elementOf[i] = elements.length - 1;
    }
    const E = (k: number) => (k >= 0 && k < elements.length ? cls[elements[k]] : null);
    const C = (k: number) => cps[elements[k]];
    const ea = (k: number) => k >= 0 && k < elements.length && eastAsian(C(k));
    const out: UaxBreak[] = [];

    for (let i = 1; i < n; i++) {
        const a = raw[i - 1];
        const b = raw[i];
        let decision: boolean | 'required' | null = null;

        // LB4, LB5: hard breaks
        if (a === 'BK') decision = 'required';
        else if (a === 'CR' && b === 'LF') decision = false;
        else if (a === 'CR' || a === 'LF' || a === 'NL') decision = 'required';
        // LB6: no break before hard breaks
        else if (HARD.has(b)) decision = false;
        // LB7: no break before spaces or zero width space
        else if (b === 'SP' || b === 'ZW') decision = false;
        if (decision === null) {
            // LB8: break after a zero width space and the spaces after it
            let j = i - 1;

            while (j >= 0 && raw[j] === 'SP') j--;
            if (j >= 0 && raw[j] === 'ZW') decision = true;
        }
        // LB8a: no break after a zero width joiner
        if (decision === null && a === 'ZWJ') decision = false;
        // LB9: no break inside a combining sequence
        if (decision === null && absorbed[i]) decision = false;
        if (decision === null) decision = pair(elementOf[i - 1], elementOf[i]);
        if (decision) out.push({ position: offsets[i], required: decision === 'required' });
    }

    return out;

    /** Rules LB11 to LB31 between element k-1 (A) and element k (B). */
    function pair(ka: number, kb: number): boolean {
        const A = E(ka) as string;
        const B = E(kb) as string;
        const skipBack = (k: number, skip: Set<string>) => {
            let j = k;

            while (j >= 0 && skip.has(E(j) as string)) j--;
            return j;
        };
        const SP = set('SP');

        // LB11
        if (B === 'WJ' || A === 'WJ') return false;
        // LB12, LB12a
        if (A === 'GL') return false;
        if (B === 'GL' && !set('SP', 'BA', 'HY').has(A)) return false;
        // LB13
        if (set('CL', 'CP', 'EX', 'SY').has(B)) return false;
        // LB14: OP SP* x
        if (E(skipBack(ka, SP)) === 'OP') return false;
        // LB15a: (sot | BK CR LF NL OP QU GL SP ZW) [QU & Pi] SP* x
        {
            const q = skipBack(ka, SP);

            if (
                q >= 0 &&
                E(q) === 'QU' &&
                PI.test(String.fromCodePoint(C(q))) &&
                (q === 0 || LB15A_BEFORE.has(E(q - 1) as string))
            ) {
                return false;
            }
        }
        // LB15b: x [QU & Pf] (SP GL WJ CL QU CP EX IS SY BK CR LF NL ZW | eot)
        if (
            B === 'QU' &&
            PF.test(String.fromCodePoint(C(kb))) &&
            (kb + 1 >= elements.length || LB15B_AFTER.has(E(kb + 1) as string))
        ) {
            return false;
        }
        // LB15c: SP / IS NU
        if (A === 'SP' && B === 'IS' && E(kb + 1) === 'NU') return true;
        // LB15d: x IS
        if (B === 'IS') return false;
        // LB16: (CL | CP) SP* x NS
        if (B === 'NS' && set('CL', 'CP').has(E(skipBack(ka, SP)) as string)) return false;
        // LB17: B2 SP* x B2
        if (B === 'B2' && E(skipBack(ka, SP)) === 'B2') return false;
        // LB18: break after spaces
        if (A === 'SP') return true;
        // LB19: x [QU - Pi], [QU - Pf] x
        if (B === 'QU' && !PI.test(String.fromCodePoint(C(kb)))) return false;
        if (A === 'QU' && !PF.test(String.fromCodePoint(C(ka)))) return false;
        // LB19a: unless East Asian on both sides, no break around quotation marks
        if (B === 'QU' && (!ea(ka) || kb + 1 >= elements.length || !ea(kb + 1))) return false;
        if (A === 'QU' && (!ea(kb) || ka === 0 || !ea(ka - 1))) return false;
        // LB20
        if (B === 'CB' || A === 'CB') return true;
        // LB20a: (sot | BK CR LF NL SP ZW CB GL) (HY | U+2010) x AL
        if ((A === 'HY' || C(ka) === 0x2010) && B === 'AL' && (ka === 0 || LB20A_BEFORE.has(E(ka - 1) as string))) {
            return false;
        }
        // LB21
        if (set('BA', 'HY', 'NS').has(B) || A === 'BB') return false;
        // LB21a: HL (HY | [BA - East Asian]) x [^HL]
        if ((A === 'HY' || (A === 'BA' && !ea(ka))) && E(ka - 1) === 'HL' && B !== 'HL') return false;
        // LB21b
        if (A === 'SY' && B === 'HL') return false;
        // LB22
        if (B === 'IN') return false;
        // LB23, LB23a, LB24
        if ((A === 'AL' || A === 'HL') && B === 'NU') return false;
        if (A === 'NU' && (B === 'AL' || B === 'HL')) return false;
        if (A === 'PR' && set('ID', 'EB', 'EM').has(B)) return false;
        if (set('ID', 'EB', 'EM').has(A) && B === 'PO') return false;
        if ((A === 'PR' || A === 'PO') && (B === 'AL' || B === 'HL')) return false;
        if ((A === 'AL' || A === 'HL') && (B === 'PR' || B === 'PO')) return false;
        // LB25: numbers
        {
            const SYIS = set('SY', 'IS');

            if ((A === 'CL' || A === 'CP') && (B === 'PO' || B === 'PR') && E(skipBack(ka - 1, SYIS)) === 'NU')
                return false;
            if ((B === 'PO' || B === 'PR') && E(skipBack(ka, SYIS)) === 'NU') return false;
            if (A === 'PO' || A === 'PR') {
                if (B === 'NU') return false;
                if (B === 'OP' && E(kb + 1) === 'NU') return false;
                if (B === 'OP' && E(kb + 1) === 'IS' && E(kb + 2) === 'NU') return false;
            }
            if ((A === 'HY' || A === 'IS') && B === 'NU') return false;
            if (B === 'NU' && E(skipBack(ka, SYIS)) === 'NU') return false;
        }
        // LB26, LB27: Korean syllables
        if (A === 'JL' && set('JL', 'JV', 'H2', 'H3').has(B)) return false;
        if ((A === 'JV' || A === 'H2') && (B === 'JV' || B === 'JT')) return false;
        if ((A === 'JT' || A === 'H3') && B === 'JT') return false;
        if (HANGUL.has(A) && B === 'PO') return false;
        if (A === 'PR' && HANGUL.has(B)) return false;
        // LB28
        if ((A === 'AL' || A === 'HL') && (B === 'AL' || B === 'HL')) return false;
        // LB28a: Brahmic orthographic syllables
        {
            const ak = (k: number) => k >= 0 && k < elements.length && AKSARA(E(k) as string, C(k));

            if (A === 'AP' && ak(kb)) return false;
            if (ak(ka) && (B === 'VF' || B === 'VI')) return false;
            if (A === 'VI' && ak(ka - 1) && (B === 'AK' || C(kb) === DOTTED_CIRCLE)) return false;
            if (ak(ka) && ak(kb) && E(kb + 1) === 'VF') return false;
        }
        // LB29
        if (A === 'IS' && (B === 'AL' || B === 'HL')) return false;
        // LB30: no break between letters or numbers and non-East Asian brackets
        if ((A === 'AL' || A === 'HL' || A === 'NU') && B === 'OP' && !ea(kb)) return false;
        if (A === 'CP' && !ea(ka) && (B === 'AL' || B === 'HL' || B === 'NU')) return false;
        // LB30a: regional indicators pair up
        if (A === 'RI' && B === 'RI') {
            let count = 0;

            for (let j = ka; j >= 0 && E(j) === 'RI'; j--) count++;
            if (count % 2 === 1) return false;
        }
        // LB30b: emoji modifiers
        if (B === 'EM' && (A === 'EB' || PICT_UNASSIGNED.test(String.fromCodePoint(C(ka))))) return false;
        // LB31
        return true;
    }
}
