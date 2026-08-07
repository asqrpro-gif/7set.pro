import { wikiDictionary } from './wikiDictionary.js';

export function enrichReportText(text, brand, model, code, drivability) {
    if (!text) return '';
    
    // 1. Отрезаем старый футер (агрессивно, с учетом возможных эмодзи и старых названий)
    const oldFooterRegex = /###\s*(📚\s*)?(Полезные и правовые ресурсы|ПДД и полезные ресурсы|Глоссарий|Мини-справка)[\s\S]*$/i;
    text = text.replace(oldFooterRegex, '').trimEnd();
    
    // 2. Очищаем все ранее сгенерированные ссылки (защита от дублей и матрешек)
    const oldLinksRegex = /\[([^\]]+)\]\((https?:\/\/(ru\.wikipedia\.org|bmwfault\.codes|wiki\.ross-tech\.com|techinfo\.toyota\.com|www\.obd-codes\.com|pdd\.ru|pdd\.by|pdd\.kz|www\.gosuslugi\.ru|egov\.kz|mvd\.gov\.by)[^\)]*)\)/gi;
    let prev = "";
    while (text !== prev) {
        prev = text;
        text = text.replace(oldLinksRegex, '$1');
    }

    // 2.5. Удаляем любые старые блоки Глоссария, чтобы избежать дублирования
    const oldGlossaryRegex = /<div class="bg-blue-50[^>]*>[\s\S]*?Глоссарий терминов[\s\S]*?(?=(###|$))/gi;
    text = text.replace(oldGlossaryRegex, '');
    const markerGlossaryRegex = /<!--\s*GLOSSARY_START\s*-->[\s\S]*?<!--\s*GLOSSARY_END\s*-->\s*/gi;
    text = text.replace(markerGlossaryRegex, '');

    // 3. Расставляем ссылки по словарю и собираем термины
    const dictionaryTerms = [];
    for (const item of wikiDictionary) {
        let replaced = false;
        let firstMatch = '';
        text = text.replace(item.regex, (match) => {
            if (!replaced) {
                replaced = true;
                firstMatch = match;
                return `[${match}](${encodeURI(item.url)})`;
            }
            return match;
        });
        if (replaced && firstMatch) {
            let termStr = item.name;
            // Берем основу слова (первые 5 символов), чтобы игнорировать окончания (например, катализатор/катализатора)
            const matchBase = firstMatch.toLowerCase().substring(0, 5);
            // Если название термина не содержит основу найденного слова, значит это аббревиатура (типа K20A, V6)
            if (!item.name.toLowerCase().includes(matchBase)) {
                termStr = `${firstMatch} — ${item.name}`;
            }
            dictionaryTerms.push(termStr);
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

    // 6. Формируем подвал и Глоссарий
    // Ищем блок "Специфика" чтобы вставить глоссарий сразу после него
    if (dictionaryTerms.length > 0) {
        const dictSection = `\n\n<!-- GLOSSARY_START -->
<div class="not-prose my-8 premium-glow-card">
  <div class="relative flex items-center gap-3 mb-4">
    <div class="flex items-center justify-center w-9 h-9 rounded-xl bg-[#0077FF]/10 dark:bg-[#0077FF]/20 text-[#0077FF]">
      <i data-lucide="book-open" class="w-5 h-5"></i>
    </div>
    <div class="text-lg font-bold text-slate-800 dark:text-white">Глоссарий терминов</div>
  </div>
  <div class="relative flex flex-wrap gap-2">
${dictionaryTerms.map(t => `    <span class="inline-flex px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-700/80 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 text-[13px] font-medium leading-tight hover:border-[#0077FF]/40 transition-colors">${t}</span>`).join('\n')}
  </div>
</div>
<!-- GLOSSARY_END -->\n\n`;
        
        // Пытаемся найти конец секции "Специфика"
        const specRegex = /(###\s*(<i[^>]*>\s*<\/i>\s*)?(?:Специфика|Особенности).*?\n(?:(?!###).*\n*)*)/i;
        const specMatch = text.match(specRegex);
        
        if (specMatch) {
            // Вставляем сразу после секции Специфика
            const insertPos = specMatch.index + specMatch[0].length;
            text = text.substring(0, insertPos) + dictSection + text.substring(insertPos);
        } else {
            // Если секции нет, добавляем в конец основного текста
            text = text.trimEnd() + dictSection;
        }
    }

    const footer = `\n\n### ПДД и полезные ресурсы\n### ПДД и эксплуатация\n${pddText}\n\n### Полезные ссылки:\n- [${obdTitle}](${obdUrl})`;

    return text + footer;
}
