import Rect from '../models/Rect';
import { RichLine } from './KodiMarkup';

export interface WriteTextOptions {
    fontSize?: number;
    fillStyle?: string | CanvasGradient | CanvasPattern;
    fontFace?: string;
    textAlign?: CanvasTextAlign;
    textBaseline?: CanvasTextBaseline;
    isBold?: boolean;
    maxWidth?: number;
}

export default class CanvasUtils {
    static MEASURE_STRING = 'One interesting Measure String';
    // measureText is expensive on tv hardware, so the approximation is cached per font
    private static widthPerCharacterCache = CanvasUtils.createWidthPerCharacterCache();

    private static createWidthPerCharacterCache() {
        const cache = new Map<string, number>();
        // measurements taken with a fallback font are invalid as soon as the web fonts are loaded
        const fonts = (document as Document & { fonts?: EventTarget }).fonts;
        fonts?.addEventListener && fonts.addEventListener('loadingdone', () => cache.clear());
        return cache;
    }

    /**
     * Return character width approximation of current font
     */
    static getWidthPerCharacter(canvas: CanvasRenderingContext2D) {
        const font = canvas.font;
        let widthPerCharacter = this.widthPerCharacterCache.get(font);
        if (widthPerCharacter === undefined) {
            widthPerCharacter =
                canvas.measureText(CanvasUtils.MEASURE_STRING).width / CanvasUtils.MEASURE_STRING.length;
            this.widthPerCharacterCache.set(font, widthPerCharacter);
        }
        return widthPerCharacter;
    }

    /**
     * Faster shortened function with a complexity of 2
     */
    static getShortenedText(canvas: CanvasRenderingContext2D, text: string, maxWidth: number) {
        let result = text;
        // use test character to measure width per character
        const widthPerCharacter = this.getWidthPerCharacter(canvas);
        const textLength = canvas.measureText(result).width;
        if (textLength > maxWidth) {
            const overLength = textLength - maxWidth;
            // if(text.startsWith('Hitler und Luden')) {
            //     console.log('text: "%s" maxWidth: %d, textWidth: %d, deltaWidth: %d, widthPerCharacter: %d, textLength: %d, textOverLength: %d', text, maxWidth, textLength, overLength, widthPerCharacter, result.length, overLength/widthPerCharacter);
            // }
            result = result.substring(0, result.length - 1 - overLength / widthPerCharacter);
            if (result.length <= 3) {
                return '...'.substring(0, result.length);
            }
            result = result.substring(0, result.length - 3) + '...';
        }
        return result;
    }

    /**
     * Wraps a text inside a given area
     */
    static wrapText(
        canvas: CanvasRenderingContext2D,
        text: string,
        x: number,
        y: number,
        maxWidth: number,
        lineHeight: number
    ) {
        let line = '';
        const widthPerCharacter = this.getWidthPerCharacter(canvas);
        const maxCharactersPerLine = maxWidth / widthPerCharacter - 1;
        let index = 0;
        let newIndex = 0;
        while (index < text.length - 1) {
            newIndex = index + maxCharactersPerLine > text.length ? text.length : index + maxCharactersPerLine;
            line = text.substring(index, newIndex);
            index = newIndex;
            // cutoff leading space
            if (line.startsWith(' ')) {
                line = line.substring(1, line.length - 1);
            }
            // if we reached the end print out the line
            if (index === text.length) {
                canvas.fillText(line, x, y);
                break;
            }
            // lucky we sliced at a space
            if (line.endsWith(' ')) {
                canvas.fillText(line, x, y);
                y += lineHeight;
                continue;
            }
            // go back to find space first space
            for (let i = line.length - 1; i >= 0; i--) {
                if (line[i] === ' ') {
                    canvas.fillText(line.substring(0, i), x, y);
                    y += lineHeight;
                    break;
                }
                index -= 1;
            }
        }
    }

    /**
     * Writes formatted text (e.g. parsed kodi markup) word wrapped into the given width.
     * Drawing stops when maxY is reached.
     */
    static wrapRichText(
        canvas: CanvasRenderingContext2D,
        lines: RichLine[],
        x: number,
        y: number,
        maxWidth: number,
        lineHeight: number,
        options: { fontSize: number; fontFace?: string; fillStyle: string; maxY?: number }
    ) {
        const fontFace = options.fontFace || 'Moonstone';
        const oldTextAlign = canvas.textAlign;
        canvas.textAlign = 'left';
        let currentY = y;
        const isBelowMax = () => options.maxY !== undefined && currentY > options.maxY;

        for (let l = 0; l < lines.length && !isBelowMax(); l++) {
            let currentX = x;
            const line = lines[l];
            for (let s = 0; s < line.length && !isBelowMax(); s++) {
                const segment = line[s];
                canvas.font =
                    (segment.italic ? 'italic ' : '') +
                    (segment.bold ? 'bold ' : '') +
                    options.fontSize +
                    'px ' +
                    fontFace;
                // an unknown color name is ignored by the canvas, so the default is set first
                canvas.fillStyle = options.fillStyle;
                if (segment.color) {
                    canvas.fillStyle = segment.color;
                }
                // words and the whitespace between them
                const words = segment.text.split(/(\s+)/);
                for (let w = 0; w < words.length; w++) {
                    const word = words[w];
                    if (!word) continue;
                    const width = canvas.measureText(word).width;
                    if (/^\s+$/.test(word)) {
                        // no whitespace at the beginning of a line
                        if (currentX > x) currentX += width;
                        continue;
                    }
                    if (currentX + width > x + maxWidth && currentX > x) {
                        currentY += lineHeight;
                        currentX = x;
                        if (isBelowMax()) break;
                    }
                    canvas.fillText(word, currentX, currentY);
                    currentX += width;
                }
            }
            currentY += lineHeight;
        }
        canvas.textAlign = oldTextAlign;
    }

    /**
     * Writes a text to a specific position without changing the canvas context
     */
    static writeText(
        canvas: CanvasRenderingContext2D,
        text: string,
        x: number,
        y: number,
        options: WriteTextOptions = {}
    ) {
        // set default options
        options.fontFace = options.fontFace || 'Moonstone';
        options.textAlign = options.textAlign || 'left';
        options.textBaseline = options.textBaseline || 'middle';
        options.fillStyle = options.fillStyle || '#cccccc';
        options.fontSize = options.fontSize || 20;
        options.isBold = options.isBold !== undefined || false;
        options.maxWidth = options.maxWidth || undefined;

        // remember old text style
        const oldFont = canvas.font;
        const oldFillStyle = canvas.fillStyle;
        const oldTextAlign = canvas.textAlign;
        const oldTextBaseline = canvas.textBaseline;

        // set new text style
        canvas.font = options.fontSize + 'px ' + options.fontFace;
        if (options.isBold) {
            canvas.font = 'bold ' + canvas.font;
        }
        canvas.fillStyle = options.fillStyle;
        canvas.textAlign = options.textAlign;
        canvas.textBaseline = options.textBaseline;

        if (options.maxWidth) {
            // fix negative width
            if (options.maxWidth <= 0) {
                options.maxWidth = 0;
                text = '';
            } else {
                text = this.getShortenedText(canvas, text, options.maxWidth);
            }
        }
        canvas.fillText(text, x, y);

        // reset text style
        canvas.font = oldFont;
        canvas.fillStyle = oldFillStyle;
        canvas.textAlign = oldTextAlign;
        canvas.textBaseline = oldTextBaseline;
    }

    static drawDebugRect(canvas: CanvasRenderingContext2D, drawingRect: Rect) {
        canvas.strokeStyle = '#FF0000';
        canvas.strokeRect(drawingRect.left, drawingRect.top, drawingRect.width, drawingRect.height);
    }
}
