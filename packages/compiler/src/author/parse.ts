/**
 * The authoring syntax (brief sec. 3.1): `{name}` placeholders, `<tag>...</tag>` spans,
 * `<object/>` inline objects, backslash escapes (`\{ \} \< \> \\ \n`). Tags never take attributes.
 * `<nbsp/>` and `<zwj/>` are built-in tokens for intentional invisible characters.
 */

/** Limits applied while parsing. */
export interface ParseLimits {
    /** Deepest tag nesting. Default 4. */
    maxDepth: number;
    /** Longest message in characters, markup included. Default 2000. */
    maxLength: number;
    /** Most spans in one message. Default 64. */
    maxSpans: number;
    /** Most slots plus objects in one message. Default 32. */
    maxObjects: number;
}

/** Default parse limits. */
export const DEFAULT_LIMITS: ParseLimits = { maxDepth: 4, maxLength: 2000, maxSpans: 64, maxObjects: 32 };

/** One parse problem, at a character offset of the source. */
export interface ParseIssue {
    /** Stable code, such as `unclosed-tag`. */
    code: string;
    /** What is wrong, in one sentence. */
    message: string;
    /** Character offset in the source. */
    offset: number;
}

/** A hole in the flat text: a slot or an inline object, written as one U+FFFC. */
export interface Hole {
    /** Offset of its U+FFFC in `text`. */
    index: number;
    /** `slot` for `{name}`, `object` for `<name/>`. */
    kind: 'slot' | 'object';
    /** Slot or object name. */
    name: string;
}

/** A tag span over the flat text, end exclusive. */
export interface Span {
    /** Tag name. */
    tag: string;
    /** First offset in `text`. */
    start: number;
    /** Offset after the last character. */
    end: number;
    /** Nesting depth, 1 for an outermost tag. */
    depth: number;
}

/** A parsed message: flat text with holes, plus spans. */
export interface ParsedMessage {
    /** Static characters, escapes resolved, with one U+FFFC per hole. */
    text: string;
    /** Slots and objects, in text order. */
    holes: Hole[];
    /** Spans, ordered by start, outer before inner. */
    spans: Span[];
    /** Problems found. A message with issues should not be compiled. */
    issues: ParseIssue[];
}

/** The character every hole is written as. */
export const HOLE = '\ufffc';

const NAME = /^[a-z][a-zA-Z0-9_]*$/;
const TAG_NAME = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const TOKENS: Record<string, string> = { nbsp: '\u00a0', zwj: '\u200d' };
const ESCAPES: Record<string, string> = { '{': '{', '}': '}', '<': '<', '>': '>', '\\': '\\', n: '\n' };

/** Parses one message. Never throws: problems come back in `issues`. */
export function parseMessage(source: string, limits: ParseLimits = DEFAULT_LIMITS): ParsedMessage {
    const issues: ParseIssue[] = [];
    const holes: Hole[] = [];
    const spans: Span[] = [];
    const stack: { tag: string; start: number; offset: number }[] = [];
    let text = '';
    let i = 0;

    if (source.length > limits.maxLength) {
        issues.push({
            code: 'too-long',
            message: `message is ${source.length} characters, the limit is ${limits.maxLength}`,
            offset: limits.maxLength,
        });
    }
    if (/^[=+\-@]/.test(source)) {
        issues.push({
            code: 'formula-prefix',
            message: 'message starts with a character Excel reads as a formula (= + - @): escape it or reword',
            offset: 0,
        });
    }
    while (i < source.length) {
        const ch = source[i];

        if (ch === '\\') {
            const next = source[i + 1];
            const esc = next === undefined ? undefined : ESCAPES[next];

            if (esc === undefined) {
                issues.push({ code: 'bad-escape', message: `unknown escape "\\${next ?? ''}"`, offset: i });
                i += 2;
                continue;
            }
            text += esc;
            i += 2;
            continue;
        }
        if (ch === '}') {
            issues.push({
                code: 'stray-brace',
                message: 'a "}" without "{": write "\\}" for a literal brace',
                offset: i,
            });
            i++;
            continue;
        }
        if (ch === '>') {
            issues.push({
                code: 'stray-bracket',
                message: 'a ">" outside a tag: write "\\>" for a literal one',
                offset: i,
            });
            i++;
            continue;
        }
        if (ch === '{') {
            const close = source.indexOf('}', i);
            const name = close < 0 ? '' : source.slice(i + 1, close);

            if (close < 0) {
                issues.push({ code: 'unclosed-placeholder', message: 'a "{" without "}"', offset: i });
                break;
            }
            if (!NAME.test(name)) {
                issues.push({
                    code: 'bad-placeholder',
                    message: `"{${name}}" is not a placeholder name: use a lower-case letter, then letters, digits or _`,
                    offset: i,
                });
            } else {
                holes.push({ index: text.length, kind: 'slot', name });
                text += HOLE;
            }
            i = close + 1;
            continue;
        }
        if (ch === '<') {
            const close = source.indexOf('>', i);

            if (close < 0) {
                issues.push({
                    code: 'unclosed-tag',
                    message: 'a "<" without ">": write "\\<" for a literal one',
                    offset: i,
                });
                break;
            }
            const inner = source.slice(i + 1, close);
            const selfClosing = inner.endsWith('/');
            const closing = inner.startsWith('/');
            const name = inner.replace(/^\//, '').replace(/\/$/, '');

            i = close + 1;
            if (!TAG_NAME.test(name)) {
                issues.push({
                    code: /\s/.test(name) ? 'tag-attributes' : 'bad-tag',
                    message: /\s/.test(name)
                        ? `tags take no attributes: "<${inner}>"`
                        : `"<${inner}>" is not a tag: write "\\<" for a literal "<"`,
                    offset: i - inner.length - 2,
                });
                continue;
            }
            if (selfClosing) {
                if (TOKENS[name] !== undefined) {
                    text += TOKENS[name];
                } else {
                    holes.push({ index: text.length, kind: 'object', name });
                    text += HOLE;
                }
                continue;
            }
            if (closing) {
                const open = stack.pop();

                if (!open) {
                    issues.push({
                        code: 'unopened-tag',
                        message: `"</${name}>" closes nothing`,
                        offset: i - name.length - 3,
                    });
                } else if (open.tag !== name) {
                    issues.push({
                        code: 'crossed-tags',
                        message: `"</${name}>" closes "<${open.tag}>": tags must nest`,
                        offset: i - name.length - 3,
                    });
                } else {
                    spans.push({ tag: name, start: open.start, end: text.length, depth: stack.length + 1 });
                }
                continue;
            }
            stack.push({ tag: name, start: text.length, offset: i - name.length - 2 });
            if (stack.length > limits.maxDepth) {
                issues.push({
                    code: 'too-deep',
                    message: `tags nest ${stack.length} deep, the limit is ${limits.maxDepth}`,
                    offset: i - name.length - 2,
                });
            }
            continue;
        }
        text += ch;
        i++;
    }
    for (const open of stack) {
        issues.push({ code: 'unclosed-tag', message: `"<${open.tag}>" is never closed`, offset: open.offset });
    }
    if (spans.length > limits.maxSpans) {
        issues.push({
            code: 'too-many-spans',
            message: `${spans.length} spans, the limit is ${limits.maxSpans}`,
            offset: 0,
        });
    }
    if (holes.length > limits.maxObjects) {
        issues.push({
            code: 'too-many-objects',
            message: `${holes.length} slots and objects, the limit is ${limits.maxObjects}`,
            offset: 0,
        });
    }
    spans.sort((a, b) => a.start - b.start || b.end - a.end || a.depth - b.depth);

    return { text, holes, spans, issues };
}

/** The message as a reader sees it: holes shown as `{name}`, tags dropped. Used for `maxLen` and diagnostics. */
export function plainText(message: ParsedMessage): string {
    let out = '';
    let h = 0;

    for (let i = 0; i < message.text.length; i++) {
        if (message.text[i] === HOLE && message.holes[h]?.index === i) {
            const hole = message.holes[h++];

            out += hole.kind === 'slot' ? `{${hole.name}}` : '';
        } else {
            out += message.text[i];
        }
    }

    return out;
}
