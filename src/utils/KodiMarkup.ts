/**
 * Kodi text formatting as used by many xmltv guides, e.g.
 * "[COLOR tomato]Año:[/COLOR] 2010[CR][B]Sinopsis[/B] ..."
 *
 * Supported: [COLOR name|AARRGGBB]..[/COLOR], [B]..[/B], [I]..[/I], [UPPERCASE], [LOWERCASE],
 * [CAPITALIZE] (with closing tags), [CR] (line break). [LIGHT] and unknown tags in brackets
 * that look like formatting are removed.
 */
export interface TextSegment {
    text: string;
    color?: string;
    bold?: boolean;
    italic?: boolean;
}

/** a line of text with formatted segments */
export type RichLine = TextSegment[];

type TextCase = 'upper' | 'lower' | 'capitalize' | undefined;

interface FormatState {
    colors: string[];
    bold: number;
    italic: number;
    cases: TextCase[];
}

const TAG_REGEX = /\[(\/?)(COLOR|B|I|UPPERCASE|LOWERCASE|CAPITALIZE|LIGHT)(?:\s+([^\]]*))?\]|\[CR\]/gi;

export default class KodiMarkup {
    /**
     * Kodi colors are css color names or AARRGGBB hex values
     */
    static toCssColor(color: string): string {
        const value = (color || '').trim();
        if (/^[0-9a-f]{8}$/i.test(value)) {
            const alpha = parseInt(value.substring(0, 2), 16) / 255;
            const red = parseInt(value.substring(2, 4), 16);
            const green = parseInt(value.substring(4, 6), 16);
            const blue = parseInt(value.substring(6, 8), 16);
            return 'rgba(' + red + ',' + green + ',' + blue + ',' + alpha.toFixed(2) + ')';
        }
        if (/^[0-9a-f]{6}$/i.test(value)) {
            return '#' + value;
        }
        return value.toLowerCase();
    }

    static hasMarkup(text?: string) {
        return !!text && text.indexOf('[') >= 0 && new RegExp(TAG_REGEX.source, 'i').test(text);
    }

    /**
     * Split the text into lines of formatted segments
     */
    static parse(text?: string): RichLine[] {
        const lines: RichLine[] = [[]];
        if (!text) {
            return lines;
        }
        const state: FormatState = { colors: [], bold: 0, italic: 0, cases: [] };
        const regex = new RegExp(TAG_REGEX.source, 'gi');
        let lastIndex = 0;
        let match: RegExpExecArray | null;

        const addText = (part: string) => {
            // plain line breaks also start a new line
            part.split(/\r?\n/).forEach((linePart, index) => {
                if (index > 0) {
                    lines.push([]);
                }
                if (linePart.length > 0) {
                    lines[lines.length - 1].push(KodiMarkup.createSegment(linePart, state));
                }
            });
        };

        while ((match = regex.exec(text)) !== null) {
            addText(text.substring(lastIndex, match.index));
            lastIndex = regex.lastIndex;

            const isClosing = match[1] === '/';
            const tag = (match[2] || 'CR').toUpperCase();
            switch (tag) {
                case 'CR':
                    lines.push([]);
                    break;
                case 'COLOR':
                    isClosing ? state.colors.pop() : state.colors.push(KodiMarkup.toCssColor(match[3]));
                    break;
                case 'B':
                    state.bold = Math.max(0, state.bold + (isClosing ? -1 : 1));
                    break;
                case 'I':
                    state.italic = Math.max(0, state.italic + (isClosing ? -1 : 1));
                    break;
                case 'UPPERCASE':
                case 'LOWERCASE':
                case 'CAPITALIZE': {
                    const textCase: TextCase =
                        tag === 'UPPERCASE' ? 'upper' : tag === 'LOWERCASE' ? 'lower' : 'capitalize';
                    isClosing ? state.cases.pop() : state.cases.push(textCase);
                    break;
                }
                default:
                // [LIGHT] has no equivalent and is just removed
            }
        }
        addText(text.substring(lastIndex));
        return lines;
    }

    /**
     * Text without formatting. Line breaks become spaces, unless keepLineBreaks is set.
     */
    static strip(text: string | undefined, keepLineBreaks = false): string {
        if (!text) {
            return text || '';
        }
        if (!KodiMarkup.hasMarkup(text)) {
            return text;
        }
        return KodiMarkup.parse(text)
            .map((line) => line.map((segment) => segment.text).join(''))
            .join(keepLineBreaks ? '\n' : ' ')
            .replace(/ {2,}/g, ' ')
            .trim();
    }

    private static createSegment(text: string, state: FormatState): TextSegment {
        const segment: TextSegment = { text: KodiMarkup.applyCase(text, state.cases[state.cases.length - 1]) };
        if (state.colors.length > 0) segment.color = state.colors[state.colors.length - 1];
        if (state.bold > 0) segment.bold = true;
        if (state.italic > 0) segment.italic = true;
        return segment;
    }

    private static applyCase(text: string, textCase: TextCase) {
        switch (textCase) {
            case 'upper':
                return text.toUpperCase();
            case 'lower':
                return text.toLowerCase();
            case 'capitalize':
                return text.replace(
                    /(^|\s)(\S)/g,
                    (all, space: string, letter: string) => space + letter.toUpperCase()
                );
            default:
                return text;
        }
    }
}
