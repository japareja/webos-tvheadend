/**
 * Minimal translation helper. The english text is used as key and as fallback,
 * so untranslated texts simply stay english.
 */
import es from './es';

type Translations = { [text: string]: string };

const translations: { [language: string]: Translations } = {
    es: es
};

const toLanguage = (locale: string) => (locale || 'en').split(/[-_]/)[0].toLowerCase();

let language = toLanguage(typeof navigator !== 'undefined' ? navigator.language : 'en');

/**
 * set the ui language from a locale like 'es-ES'
 */
export const setLocale = (locale: string) => {
    language = toLanguage(locale);
};

export const getLanguage = () => language;

/**
 * translate a text, placeholders like {0}, {1} are replaced with the given arguments
 */
export const t = (text: string, ...args: (string | number)[]) => {
    const languageTranslations = translations[language];
    let result = (languageTranslations && languageTranslations[text]) || text;
    args.forEach((arg, index) => {
        result = result.replace('{' + index + '}', String(arg));
    });
    return result;
};
