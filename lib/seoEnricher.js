import { wikiDictionary } from './wikiDictionary.js';

export function enrichReportText(text, brand, model, code, drivability) {
    if (!text) return '';
    
    // 1. Отрезаем старый футер (агрессивно, с учетом всех возможных старых заголовков)
    const oldFooterRegex = /###\s*(📚\s*)?(Полезные и правовые ресурсы|ПДД и полезные ресурсы|ПДД и эксплуатация|Глоссарий|Мини-справка)[\s\S]*$/i;
    text = text.replace(oldFooterRegex, '').trimEnd();
    
    // 2. Очищаем все ранее сгенерированные ссылки (защита от дублей и матрешек)
    // Очищаем Markdown-ссылки
    const oldLinksRegex = /\[([^\]]+)\]\((https?:\/\/(ru\.wikipedia\.org|bmwfault\.codes|wiki\.ross-tech\.com|techinfo\.toyota\.com|www\.obd-codes\.com|pdd\.ru|pdd\.by|pdd\.kz|www\.gosuslugi\.ru|egov\.kz|mvd\.gov\.by)[^\s>]*)\)/gi;
    let prev = "";
    while (text !== prev) {
        prev = text;
        text = text.replace(oldLinksRegex, '$1');
    }
    // Очищаем HTML-ссылки (на случай если мы генерировали <a>)
    const oldHtmlLinksRegex = /<a[^>]*href=["'](https?:\/\/(ru\.wikipedia\.org|bmwfault\.codes|wiki\.ross-tech\.com|techinfo\.toyota\.com|www\.obd-codes\.com|pdd\.ru|pdd\.by|pdd\.kz|www\.gosuslugi\.ru|egov\.kz|mvd\.gov\.by)[^"']*)["'][^>]*>(.*?)<\/a>/gi;
    text = text.replace(oldHtmlLinksRegex, '$3');

    // 2.5. Удаляем любые старые блоки Глоссария, чтобы избежать дублирования
    const oldGlossaryRegex = /<div class="(?:bg-blue-50|not-prose|seo-glossary)[^>]*>[\s\S]*?Глоссарий терминов[\s\S]*?(?=(###|$))/gi;
    text = text.replace(oldGlossaryRegex, '');
    const markerGlossaryRegex = /<!--\s*GLOSSARY_START\s*-->[\s\S]*?<!--\s*GLOSSARY_END\s*-->\s*/gi;
    text = text.replace(markerGlossaryRegex, '');

    // 3. Расставляем ссылки по словарю и собираем термины
    const dictionaryTerms = new Set(); // Используем Set для защиты от дублей
    for (const item of wikiDictionary) {
        let replaced = false;
        let firstMatch = '';
        text = text.replace(item.regex, (...args) => {
            const match = args[0];
            const string = args[args.length - 1];
            const offset = args[args.length - 2];

            if (!replaced) {
                // ЗАЩИТА ОТ МАТРЕШЕК: Проверяем, не находимся ли мы уже внутри ссылки
                const before = string.substring(0, offset);
                
                // 1. Проверяем Markdown ссылки `[`
                const openBrackets = (before.match(/\[/g) || []).length;
                const closeBrackets = (before.match(/\]/g) || []).length;
                if (openBrackets > closeBrackets) return match;
                
                // 2. Проверяем HTML ссылки `<a>`
                const openA = (before.match(/<a\b/gi) || []).length;
                const closeA = (before.match(/<\/a>/gi) || []).length;
                if (openA > closeA) return match;

                replaced = true;
                firstMatch = match;
                // Генерируем чистый HTML с nofollow для SEO
                return `<a href="${encodeURI(item.url)}" target="_blank" rel="nofollow noopener">${match}</a>`;
            }
            return match;
        });
        if (replaced && firstMatch) {
            let termStr = item.name;
            // Берем основу слова (первые 5 символов), чтобы игнорировать окончания
            const matchBase = firstMatch.toLowerCase().substring(0, 5);
            // Если название термина не содержит основу найденного слова, значит это аббревиатура
            if (!item.name.toLowerCase().includes(matchBase)) {
                termStr = `${firstMatch} — ${item.name}`;
            }
            dictionaryTerms.add(termStr);
        }
    }

    // 4. Логика статуса по ПДД
    const codeUpper = code ? code.toUpperCase() : '';
    let pddText = 'Правила дорожного движения не запрещают ехать с данной ошибкой, однако длительная езда в аварийном режиме может стать причиной отказа в выплате ОСАГО при ДТП из-за неисправности ТС.';
    if (codeUpper.startsWith('C')) {
        pddText = 'Ошибка ходовой части или тормозной системы. Эксплуатация транспортного средства **ЗАПРЕЩЕНА**. Возможны штрафы и эвакуация на спецстоянку.';
    } else if (codeUpper.startsWith('P04')) {
        pddText = 'Ошибка связана с системами снижения токсичности. Эксплуатация разрешена, но возможны проблемы при прохождении техосмотра по нормам экологии ЕАЭС.';
    } else if (drivability === 'stop') {
        pddText = 'ПДД не запрещает движение, однако дальнейшая поездка грозит критическими повреждениями ДВС (аварийный режим). Рекомендуется эвакуатор.';
    }
    
    // 5. Официальные базы OBD
    let obdUrl = `https://www.obd-codes.com/${codeUpper.toLowerCase()}`;
    let obdTitle = `Официальная информация Код ошибки ${codeUpper} ${(brand || '').toUpperCase()} ${(model || '').toUpperCase()}`.trim();
    
    if (codeUpper.length >= 2 && (codeUpper[1] === '1' || codeUpper[1] === '3')) {
        const b = (brand || '').toLowerCase();
        if (b === 'bmw') {
            obdUrl = 'https://bmwfault.codes/';
            obdTitle = `Официальная база кодов BMW (Код ${codeUpper})`;
        } else if (['volkswagen', 'audi', 'skoda', 'seat'].includes(b)) {
            obdUrl = `http://wiki.ross-tech.com/wiki/index.php/${codeUpper}`;
            obdTitle = `Официальная база VAG Ross-Tech (Код ${codeUpper})`;
        } else if (b === 'toyota' || b === 'lexus') {
            obdUrl = 'https://techinfo.toyota.com/';
            obdTitle = 'Официальная база Toyota Techinfo';
        }
    }

    // 6. Формируем подвал
    // (Глоссарий отключен по просьбе пользователя, но очистка старого глоссария в начале файла работает)

    const footer = `\n\n### Полезные ссылки:\n- <a href="${obdUrl}" target="_blank" rel="nofollow noopener">${obdTitle}</a>`;

    return text + footer;
}
