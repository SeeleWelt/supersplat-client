import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import Backend from 'i18next-http-backend';

const getQueryLocale = () => {
    return new URLSearchParams(window.location.search).get('lng') ?? undefined;
};

const localizeInit = (preferredLocale = 'zh-CN') => {
    return i18next
    .use(Backend)
    .use(LanguageDetector)
    .init({
        lng: getQueryLocale() ?? preferredLocale,
        detection: {
            order: ['querystring']
        },
        backend: {
            loadPath: './static/locales/{{lng}}.json'
        },
        supportedLngs: ['de', 'en', 'es', 'fr', 'ja', 'ko', 'pt-BR', 'ru', 'zh-CN'],
        fallbackLng: 'en',
        interpolation: {
            escapeValue: false
        }
    });
};

interface LocalizeOptions {
    ellipsis?: boolean;
    [key: string]: unknown;
}

const localize = (key: string, options?: LocalizeOptions): string => {
    const { ellipsis, ...i18nextOptions } = options ?? {};
    let text = i18next.t(key, i18nextOptions);

    if (ellipsis) text += '...';

    return text;
};

const changeLocale = (locale: string) => {
    return i18next.changeLanguage(locale);
};

const getLocale = (): string => {
    return i18next.language || 'en';
};

const formatInteger = (value: number): string => {
    return new Intl.NumberFormat(getLocale(), {
        maximumFractionDigits: 0
    }).format(Math.round(value));
};

// Spaces inside "( … )" would otherwise allow awkward wraps (e.g. "Camera ("
// on one line and "V )" on the next). NBSP keeps the shortcut group intact;
// the normal space before '(' still allows a wrap before the parenthetical.
const formatTooltipWithShortcut = (label: string, shortcut: string): string => {
    if (!shortcut) {
        return label;
    }
    return `${label} (\u00A0${shortcut}\u00A0)`;
};

export { localizeInit, changeLocale, localize, formatInteger, formatTooltipWithShortcut };
export type { LocalizeOptions };
