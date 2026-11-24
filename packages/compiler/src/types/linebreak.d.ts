declare module 'linebreak' {
    export class LineBreaker {
        constructor(text: string);
        nextBreak(): { position: number; required: boolean } | null;
    }
}
