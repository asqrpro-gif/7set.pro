import 'dotenv/config';
import fs from 'fs';
import path from 'path';

// Загрузка локальной базы OBD2 для обеспечения ИИ реальными фактами
let obdDatabase = {};
try {
  const codesPath = path.resolve(process.cwd(), 'codes.json');
  if (fs.existsSync(codesPath)) {
    obdDatabase = JSON.parse(fs.readFileSync(codesPath, 'utf8'));
  } else {
    console.warn('⚠️ Файл codes.json не найден. ИИ работает без локальной базы.');
  }
} catch (e) {
  console.error('⚠️ Ошибка чтения codes.json:', e.message);
}

// Единый статический шаблон-заглушка для ВСЕХ несуществующих/ложных кодов
const UNSUPPORTED_ERROR_TEMPLATE = {
  severity: "Информация",
  summary: "Данный код ошибки не зарегистрирован в официальных архивах или не поддерживается ЭБУ данной модели автомобиля.",
  teaser_text: "Код ошибки не найден в заводских спецификациях. Узнайте, почему диагностические сканеры выдают неизвестные коды и как проверить ЭБУ.",
  full_analysis_markdown: "## Что означает этот код ошибки?\n\nВ официальной технической документации и протоколах самодиагностики (OBD-II) указанный код не имеет расшифровки для данной марки и модели автомобиля. Чаще всего это свидетельствует о следующих факторах:\n\n- Ошибка считывания бюджетным адаптером (например, дешевыми клонами ELM327);\n- Случайная опечатка при вводе символов кода пользователем;\n- Особенность комплектации, при которой данный электронный узел физически отсутствует на вашем автомобиле.\n\n## Как действовать в такой ситуации?\n\n1. Перепроверьте правильность набора символов кода ошибки.\n2. Проведите повторную диагностику с помощью профессионального дилерского сканера.\n3. Оцените общее поведение автомобиля: если нет аварийного режима и чеков, вероятнее всего, это ложное срабатывание.",
  sto_protection_tips: "Недобросовестные мастера на СТО могут воспользоваться отсутствием кода в справочниках и попытаться навязать дорогостоящий ремонт несуществующей неисправности. Всегда требуйте официальный скриншот или отчет со сканера дилерского уровня.",
  drivability: "Эксплуатация автомобиля возможна, если двигатель работает стабильно и отсутствуют критические симптомы.",
  diy_difficulty_text: "Базовый",
  diy_difficulty_score: "1/5",
  diy_time: "10 минут",
  diy_tools: "Мультиметр, OBD-II сканер",
  price_parts: "0 $",
  price_labor: "0 $",
  diy_instructions: "1. Перезагрузите диагностическое приложение и переподключите сканер.\n\n2. Очистите коды ошибок в памяти ЭБУ и проверьте, появится ли ошибка вновь.",
  seoTitle: "Неизвестный код ошибки OBD-II: расшифровка и диагностика",
  seoDescription: "Код ошибки не найден в архивах. Узнайте, почему сканеры выдают неизвестные коды и как проверить ЭБУ без лишних затрат.",
  is_unsupported_error: true,
  popular_engine_codes: [],
  related_obd_codes: [],
  faq_items: [
    {
      question: "Что делать, если сканер выдает неизвестный код?",
      answer: "Перепроверить правильность ввода символов и провести повторную диагностику дилерским сканером."
    },
    {
      question: "Опасно ли ездить с неофициальным кодом ошибки?",
      answer: "Если автомобиль ведет себя стабильно и нет аварийных индикаторов, критической опасности обычно нет."
    }
  ]
};

// Вспомогательные функции
const formatTitleCase = (str) => (str || '').split(/[\s-]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

export function getFactFromDB(code) {
  if (Array.isArray(obdDatabase)) {
    const found = obdDatabase.find(item => item.Code === code || item.code === code);
    return found ? (found.Description || found.description || found.desc || "") : "";
  }
  return obdDatabase[code] || "";
}

// ============================================================================
// 🟢 ЭТАП 1: БЫСТРАЯ ГЕНЕРАЦИЯ (Скелет страницы для мгновенной отдачи)
// ============================================================================
export async function analyzeCarErrorFast(brand, model, code, baseDescription = '', apiKey = process.env.GEMINI_API_KEY) {
  const cleanKey = apiKey ? apiKey.trim() : '';
  const displayCode = code ? code.trim().toUpperCase() : '';
  const displayBrand = formatTitleCase(brand);
  const displayModel = formatTitleCase(model);

  const obdRegex = /^[PBUC][0-9A-F]{4}$/i;
  if (!obdRegex.test(displayCode) || (baseDescription || '').toLowerCase().includes('не существует')) {
    console.log(`[FAST-PATH] Код "${displayCode}" отклонен мгновенно.`);
    return UNSUPPORTED_ERROR_TEMPLATE;
  }

  const exactObdFact = getFactFromDB(displayCode);
  const finalDescription = exactObdFact || baseDescription || "Спецификация недоступна";

  console.log(`⚡ [AI FAST REQ] Быстрая генерация базы для ${displayBrand} ${displayModel} ${displayCode}...`);

  const prompt = `Сделай БЫСТРУЮ базовую сводку для кода ${displayCode} (${displayBrand} ${displayModel}).
БАЗА: '${finalDescription}'. ОБЯЗАТЕЛЬНО переведи суть на русский язык.

ПОЛЯ:
- seoTitle: Уникальный, технически грамотный заголовок. 
  Строгий формат: "Ошибка ${displayCode} ${displayBrand} ${displayModel}: [Краткое тех. описание]".
  Пример: "Ошибка P0158 Toyota Camry: Высокое напряжение датчика кислорода".
  СТРОГИЙ ЗАПРЕТ: Никаких кликбейтов, вопросов или эмоций. Только сухой диагноз. Описание должно быть максимально емким (3-5 слов), чтобы весь заголовок укладывался в 65-70 символов.
- seoDescription: Суть, симптомы, призыв к действию (макс 150 симв). Обязательно упомяни ${displayBrand} ${displayModel}.
- summary: 2-3 предложения. Четкая расшифровка кода без воды.
- teaser_text: Краткий лид с симптомами (рывки, расход и т.д.).
- drivability: Поведение машины (например: "Можно ехать, но возможны рывки").
- severity: "low", "medium", "high" или "critical".
is_unsupported_error: всегда false.`;

  const url = `https://aged-tree-edb7carcode-proxy.asqr-pro.workers.dev/v1beta/models/gemini-flash-lite-latest:generateContent?key=${cleanKey}`;
  const payload = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          severity: { type: 'STRING' },
          summary: { type: 'STRING' },
          teaser_text: { type: 'STRING' },
          drivability: { type: 'STRING' },
          seoTitle: { type: 'STRING' },
          seoDescription: { type: 'STRING' },
          is_unsupported_error: { type: 'BOOLEAN' }
        },
        required: ['severity', 'summary', 'teaser_text', 'drivability', 'seoTitle', 'seoDescription', 'is_unsupported_error']
      }
    }
  });

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const googleResponse = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        signal: AbortSignal.timeout(15000) // УВЕЛИЧИЛИ ТАЙМАУТ ДО 15 СЕКУНД
      });
      const responseText = await googleResponse.text();
      if (googleResponse.ok && responseText.trim().startsWith('{')) {
        const data = JSON.parse(responseText);
        let textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textContent) {
          // Защита от маркдауна ```json ... ```
          textContent = textContent.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
          const parsed = JSON.parse(textContent);
          parsed.is_unsupported_error = false;
          return parsed;
        }
      } else {
        console.error(`⚠️ [AI FAST ERROR] Попытка ${attempt}: Прокси вернул ошибку или HTML.`);
      }
    } catch (error) {
      console.error(`⚠️ [AI FAST ERROR] Попытка ${attempt} Таймаут или сбой: ${error.message}`);
    }
  }

  // УМНЫЙ РЕЗЕРВНЫЙ ОТВЕТ (Если ИИ все-таки отвалился)
  return {
    severity: "medium",
    summary: `Код ${displayCode} на ${displayBrand} ${displayModel} официально расшифровывается как: ${finalDescription}. Данная ошибка указывает на отклонение параметров в работе связанного датчика или электронного контура.`,
    teaser_text: `Что означает ошибка ${displayCode} на ${displayBrand} ${displayModel}? Узнайте точный перевод, возможные причины и методы базовой диагностики.`,
    drivability: "Эксплуатация возможна с ограничениями.",
    seoTitle: `Ошибка ${displayCode} ${displayBrand} ${displayModel}: расшифровка и причины`,
    seoDescription: `Расшифровка кода ошибки ${displayCode} для ${displayBrand} ${displayModel} (${finalDescription}). Основные симптомы и базовая диагностика системы.`,
    is_unsupported_error: false
  };
}

// ============================================================================
// 🟣 ЭТАП 2: ФОНОВАЯ ГЕНЕРАЦИЯ (Глубокий анализ, DIY, Цены)
// ============================================================================
export async function analyzeCarErrorDeep(brand, model, code, baseDescription = '', apiKey = process.env.GEMINI_API_KEY) {
  const cleanKey = apiKey ? apiKey.trim() : '';
  const displayCode = code ? code.trim().toUpperCase() : '';
  const displayBrand = formatTitleCase(brand);
  const displayModel = formatTitleCase(model);

  const exactObdFact = getFactFromDB(displayCode);
  const finalDescription = exactObdFact || baseDescription || "Спецификация недоступна";

  console.log(`⏳ [AI DEEP REQ] Запуск глубокого фонового анализа для ${displayBrand} ${displayModel} ${displayCode}...`);

// ХИРУРГИЧЕСКИ ВЫВЕРЕННЫЙ ПРОМПТ
  const prompt = `Сделай ГЛУБОКИЙ технический разбор для кода ${displayCode} (${displayBrand} ${displayModel}).
БАЗА: '${finalDescription}'.
ТРЕБОВАНИЯ: Используй LSI ("СТО", "официалы", "разборка"). Цены в USD ($). В markdown обязательно делай пустые строки между абзацами и заголовками.

ПОЛЯ:
- full_analysis_markdown: Красивый Markdown. Сначала выведи заголовок "### Основные технические причины" и дай 3-4 стандартные общие причины МАРКИРОВАННЫМ списком (только через дефис "- "). Категорически запрещено использовать цифры для списков здесь. Затем сделай заголовок "### Специфика ${displayBrand} ${displayModel}" и подробно опиши 1-2 уникальные «болячки» именно этой модели (укажи индексы моторов). В конце заголовок "### Как не лохануться на СТО" и 2 совета против обмана списком.
- sto_protection_tips: 2 коротких совета по защите от обмана (просто текст).
- diy_instructions: Пошаговая инструкция. Каждый шаг начинай с подзаголовка, например: "### Шаг 1. Осмотр". Затем с новой строки пиши текст шага.
- faq_items: 3 вопроса и ответа по этой ошибке.
- tools_table_md: Markdown-таблица (столбцы "Инструмент" и "Назначение") с необходимыми для диагностики и ремонта инструментами.
- oem_parts_table_md: Markdown-таблица (столбцы "Деталь", "Тип/Артикул (или аналог)") с запчастями, которые могут понадобиться.
- pro_tips_md: Специфика ремонта ИМЕННО ЭТОЙ марки (2-3 абзаца, глубокие нюансы, болячки ${displayBrand}, на что обратить внимание). Не используй общие фразы.
- seo_title: Идеальный SEO-заголовок (40-75 символов). Обязательно включи код, марку, модель и название сломанного узла (например: "Ошибка P0340 Toyota Camry: датчик распредвала — симптомы").
- seo_description: Идеальное SEO-описание (110-155 символов). Начни с главного: суть ошибки на ${displayBrand} ${displayModel}, симптомы и последствия. Пиши плотно и без воды.
Остальные поля (цены, сложность, инструменты) заполни реалистично. Обязательно используй LSI-слова: сто, своими руками, мультиметр, проверка, замена, двигатель, датчик.`;

  const url = `https://aged-tree-edb7carcode-proxy.asqr-pro.workers.dev/v1beta/models/gemini-flash-lite-latest:generateContent?key=${cleanKey}`;
  const payload = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.25,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          full_analysis_markdown: { type: 'STRING' },
          sto_protection_tips: { type: 'STRING' },
          diy_difficulty_text: { type: 'STRING' },
          diy_difficulty_score: { type: 'STRING' },
          diy_time: { type: 'STRING' },
          diy_tools: { type: 'STRING' },
          price_parts: { type: 'STRING' },
          price_labor: { type: 'STRING' },
          diy_instructions: { type: 'STRING' },
          popular_engine_codes: { type: 'ARRAY', items: { type: 'STRING' } },
          related_obd_codes: { type: 'ARRAY', items: { type: 'STRING' } },
          tools_table_md: { type: 'STRING' },
          oem_parts_table_md: { type: 'STRING' },
          pro_tips_md: { type: 'STRING' },
          seo_title: { type: 'STRING' },
          seo_description: { type: 'STRING' },
          faq_items: {
            type: 'ARRAY', items: { type: 'OBJECT', properties: { question: { type: 'STRING' }, answer: { type: 'STRING' } } }
          }
        },
        required: [
          'full_analysis_markdown', 'sto_protection_tips', 'diy_difficulty_text', 'diy_difficulty_score',
          'diy_time', 'diy_tools', 'price_parts', 'price_labor', 'diy_instructions',
          'popular_engine_codes', 'related_obd_codes', 'faq_items',
          'tools_table_md', 'oem_parts_table_md', 'pro_tips_md', 'seo_title', 'seo_description'
        ]
      }
    }
  });

  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const googleResponse = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, signal: AbortSignal.timeout(20000)
      });
      const responseText = await googleResponse.text();
      if (googleResponse.ok && responseText.trim().startsWith('{')) {
        const data = JSON.parse(responseText);
        const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textContent) {
            const parsedData = JSON.parse(textContent);
            // Автоматическая зачистка от галлюцинаций ИИ (одиночные цифры типа "2." на пустой строке)
            if (parsedData.full_analysis_markdown) {
                parsedData.full_analysis_markdown = parsedData.full_analysis_markdown
                    .replace(/^\s*\d+\.\s*$/gm, '') // Удаляет висячие "1.", "2." и т.д.
                    .replace(/\n{3,}/g, '\n\n') // Убирает лишние пустые строки
                    .trim();
            }
            return parsedData;
        }
      }
    } catch (error) {
      if (attempt === maxAttempts) console.error(`⚠️ [AI DEEP ERROR] Фоновая генерация не удалась: ${error.message}`);
    }
  }

  // УМНЫЙ РЕЗЕРВНЫЙ FALLBACK ДЛЯ ТЯЖЕЛОЙ ЧАСТИ
  return {
    full_analysis_markdown: `## Специфика ошибки ${displayCode} на ${displayBrand} ${displayModel}\n\nКод **${displayCode}** означает: **${finalDescription}**.\n\n### <i data-lucide='alert-triangle' class='inline-block w-5 h-5 text-amber-500 mr-1.5 align-text-bottom'></i> Основные технические причины\n- Сбой в работе измеряющего датчика или его цепи;\n- Повреждение проводки, окисление контактов в фишке;\n- Механический износ контролируемого узла.\n\n### <i data-lucide='wrench' class='inline-block w-5 h-5 text-brand mr-1.5 align-text-bottom'></i> Специфика ${displayBrand} ${displayModel}\nНа автомобилях этой марки данная ошибка (${displayCode}) чаще всего вызвана старением элементов системы после длительной эксплуатации или попаданием влаги в электропроводку.\n\n### <i data-lucide='shield-alert' class='inline-block w-5 h-5 text-red-500 mr-1.5 align-text-bottom'></i> Как не лохануться на СТО\n1. Требуйте проверки мультиметром цепи датчика ДО его дорогостоящей замены.\n2. Сравнивайте цены на запчасти с популярными интернет-магазинами.`,
    sto_protection_tips: `Начинайте диагностику с визуального осмотра разъемов и проверки проводки мультиметром.`,
    diy_difficulty_text: "Средний",
    diy_difficulty_score: "3/5",
    diy_time: "30-60 минут",
    diy_tools: "Мультиметр, OBD-II сканер",
    price_parts: "20 - 150 $",
    price_labor: "20 - 80 $",
    diy_instructions: `### <i data-lucide='cpu' class='inline-block w-5 h-5 text-brand mr-1.5 align-text-bottom'></i> Шаг 1. Электронная диагностика\n\nПодключите OBD2-сканер, считайте стоп-кадр (Freeze Frame) и сотрите ошибку.\n\n### <i data-lucide='eye' class='inline-block w-5 h-5 text-brand mr-1.5 align-text-bottom'></i> Шаг 2. Визуальный осмотр\n\nОсмотрите проводку проблемного узла на предмет обрывов и окислов.`,
    popular_engine_codes: [],
    related_obd_codes: [],
    faq_items: [
      { question: `Что значит ошибка ${displayCode}?`, answer: `Официальная расшифровка: ${finalDescription}.` }
    ]
  };
}

// ============================================================================
// Генерация ТО (Без изменений)
// ============================================================================
export async function analyzeCarConsumables(brand, model, engine, year) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('CRITICAL_ERROR: GEMINI_API_KEY не найден!');

  const cleanKey = apiKey.trim();
  const prompt = `Ты топовый механик. Составь список базовых расходников для: ${brand} ${model}, двигатель ${engine}, ${year} года. Верни строго валидный JSON.
  {
    "wipers": { "driver_mm": 600, "passenger_mm": 400, "rear_mm": 300 },
    "oil": { "type": "5W-30", "volume_liters": 4.5, "spec": "API SN" },
    "fuel": { "type": "АИ-95" },
    "coolant": { "type": "G12+", "color": "красный", "volume_liters": 6.5 }
  }`;

  const url = `https://aged-tree-edb7carcode-proxy.asqr-pro.workers.dev/v1beta/models/gemini-flash-lite-latest:generateContent?key=${cleanKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, responseMimeType: "application/json" }
    }),
    signal: AbortSignal.timeout(15000)
  });

  const responseText = await response.text();
  if (!response.ok || !responseText.trim().startsWith('{')) throw new Error(`Ошибка API расходников: ${response.status}`);

  const data = JSON.parse(responseText);
  const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!resultText) throw new Error('Пустой ответ расходников');

  return JSON.parse(resultText);
}