import KodiMarkup from '../utils/KodiMarkup';
import EPGEvent from '../models/EPGEvent';

describe('KodiMarkup', () => {
    const description = '[COLOR tomato]Año:[/COLOR] 2010[CR][B]Sinopsis:[/B] Una [I]gran[/I] película[CR][CR]Fin';

    it('parses colors, bold, italic and line breaks', () => {
        const lines = KodiMarkup.parse(description);
        expect(lines.length).toBe(4);
        expect(lines[0]).toEqual([{ text: 'Año:', color: 'tomato' }, { text: ' 2010' }]);
        expect(lines[1]).toEqual([
            { text: 'Sinopsis:', bold: true },
            { text: ' Una ' },
            { text: 'gran', italic: true },
            { text: ' película' }
        ]);
        expect(lines[2]).toEqual([]);
        expect(lines[3]).toEqual([{ text: 'Fin' }]);
    });

    it('converts kodi ARGB colors and text case', () => {
        expect(KodiMarkup.toCssColor('FFFF0000')).toBe('rgba(255,0,0,1.00)');
        expect(KodiMarkup.toCssColor('Gold')).toBe('gold');
        expect(KodiMarkup.parse('[UPPERCASE]hola[/UPPERCASE] [CAPITALIZE]el tiempo[/CAPITALIZE]')[0]).toEqual([
            { text: 'HOLA' },
            { text: ' ' },
            { text: 'El Tiempo' }
        ]);
    });

    it('strips the codes for plain text', () => {
        expect(KodiMarkup.strip('[COLOR yellow]Fútbol[/COLOR]: [B]Liga[/B]')).toBe('Fútbol: Liga');
        expect(KodiMarkup.strip(description, true)).toBe('Año: 2010\nSinopsis: Una gran película\n\nFin');
        expect(KodiMarkup.strip('Sin [corchetes] de formato')).toBe('Sin [corchetes] de formato');
    });

    it('is used by the epg events', () => {
        const event = new EPGEvent(1, 0, 1, '[COLOR orange]Cine[/COLOR] de barrio', description, '[I]T1[/I]', 'c');
        expect(event.getTitle()).toBe('Cine de barrio');
        expect(event.getSubTitle()).toBe('T1');
        expect(event.getRawTitle()).toBe('[COLOR orange]Cine[/COLOR] de barrio');
        expect(event.getDescription()).toContain('Año: 2010\nSinopsis');
    });
});
