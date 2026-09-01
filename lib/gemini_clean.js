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
      if (!googleResponse.ok) {
        const errStr = responseText.toLowerCase();
        if (errStr.includes('quota') || errStr.includes('retrydelay') || errStr.includes('429') || errStr.includes('too many') || errStr.includes('exhausted')) {
          throw new Error(`API_LIMIT_REACHED: ${responseText}`);
        }
      }

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
      if (error.message.includes('API_LIMIT_REACHED')) throw error;
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

// --- ЭТАП 1: ИЗВЛЕЧЕНИЕ ФАКТОВ (Температура 0.1) ---
  const promptFacts = `Сделай сухую техническую справку для кода ${displayCode} (${displayBrand} ${displayModel}).
БАЗА: '${finalDescription}'.
ТРЕБОВАНИЯ: Выдай ТОЛЬКО сухие технические факты, никакой воды и художественных текстов. Цены в USD ($).

ПОЛЯ:
- causes: массив из 3-4 главных причин возникновения ошибки (строки).
- diagnostics_steps: массив из 2-3 шагов диагностики (строки).
- brand_specific_issue: 1-2 уникальные «болячки» именно этой модели (строка).
- diy_difficulty_text: "Базовый", "Средний" или "Сложный".
- diy_difficulty_score: например "3/5".
- diy_time: например "30-60 минут".
- diy_tools: перечень инструментов через запятую.
- price_parts: например "20 - 150 $".
- price_labor: например "20 - 80 $".
- popular_engine_codes: массив частых двигателей (строки).
- related_obd_codes: массив сопутствующих ошибок (строки).
- tools_table_md: Markdown-таблица (столбцы "Инструмент" и "Назначение") с необходимыми инструментами.
- oem_parts_table_md: Markdown-таблица (столбцы "Деталь", "Тип/Артикул") с запчастями.`;

  const url = `https://aged-tree-edb7carcode-proxy.asqr-pro.workers.dev/v1beta/models/gemini-flash-lite-latest:generateContent?key=${cleanKey}`;
  
  let factsData = null;
  const maxAttempts = 2;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const googleResponse = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptFacts }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                causes: { type: 'ARRAY', items: { type: 'STRING' } },
                diagnostics_steps: { type: 'ARRAY', items: { type: 'STRING' } },
                brand_specific_issue: { type: 'STRING' },
                diy_difficulty_text: { type: 'STRING' },
                diy_difficulty_score: { type: 'STRING' },
                diy_time: { type: 'STRING' },
                diy_tools: { type: 'STRING' },
                price_parts: { type: 'STRING' },
                price_labor: { type: 'STRING' },
                popular_engine_codes: { type: 'ARRAY', items: { type: 'STRING' } },
                related_obd_codes: { type: 'ARRAY', items: { type: 'STRING' } },
                tools_table_md: { type: 'STRING' },
                oem_parts_table_md: { type: 'STRING' }
              },
              required: ['causes', 'diagnostics_steps', 'brand_specific_issue', 'diy_difficulty_text', 'diy_difficulty_score', 'diy_time', 'diy_tools', 'price_parts', 'price_labor', 'tools_table_md', 'oem_parts_table_md']
            }
          }
        }),
        signal: AbortSignal.timeout(120000)
      });
      const responseText = await googleResponse.text();
      if (!googleResponse.ok) {
        const errStr = responseText.toLowerCase();
        if (errStr.includes('quota') || errStr.includes('retrydelay') || errStr.includes('429') || errStr.includes('too many') || errStr.includes('exhausted')) {
          throw new Error(`API_LIMIT_REACHED: ${responseText}`);
        }
      }

      if (googleResponse.ok && responseText.trim().startsWith('{')) {
        const data = JSON.parse(responseText);
        const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textContent) {
            factsData = JSON.parse(textContent);
            break;
        }
      }
    } catch (error) {
      if (error.message.includes('API_LIMIT_REACHED')) throw error;
      if (attempt === maxAttempts) console.error(`⚠️ [AI DEEP ERROR] Этап 1 (Факты) не удался: ${error.message}`);
    }
  }

  // --- ЭТАП 2: SEO РЕРАЙТИНГ (Температура 0.75) ---
  let seoData = null;
  
  if (factsData) {
    console.log(`🎭 [AI DEEP REQ] Запуск SEO-генерации (Мульти-персоны)...`);

    const promptSeo = `Напиши экспертную SEO-статью про ошибку ${displayCode} (${displayBrand} ${displayModel}).
СТРОГОЕ ПРАВИЛО: Запрещено придумывать новые технические факты, которых нет в исходных данных. Используй ТОЛЬКО следующие проверенные факты (но переписывай их своими словами):
${JSON.stringify(factsData, null, 2)}

ЖЕСТКАЯ СТРУКТУРА И РОЛИ (каждый пункт — это отдельное поле в JSON, пиши в формате Markdown, без воды):

1. full_analysis_markdown (РОЛЬ: Опытный, дружелюбный механик):
Объясни суть поломки "на пальцах", через метафоры, для водителя-новичка. Почему это произошло? 
ЗАПРЕЩЕНО писать сюда технические данные (пины, вольты, сопротивления). Только суть и механика процесса.
Используй двойной перенос строки для абзацев. Не используй списки.
В САМОМ КОНЦЕ текста ОБЯЗАТЕЛЬНО добавь заголовок "### Как не лохануться на СТО" и напиши под ним 1-2 абзаца о том, как могут обмануть в автосервисе с этой ошибкой (что могут лишнего "приговорить"). Оформляй эти советы строго как абзацы. Перед каждым абзацем делай жирный заголовок "**Внимание:**", затем пустую строку, а затем пиши текст. Никаких списков и цифр!

2. driving_risks_md (РОЛЬ: Строгий мастер-приемщик):
Напиши ровно 3 абзаца без списков и маркеров. Каждый абзац начинай с жирного заголовка:
**Технический риск:** Что сломается следующим, если продолжить ездить?
**Безопасность и ПДД:** Чем опасна езда в аварийном режиме (например, при обгоне) и возможные проблемы с ПДД.
**Риски для ОСАГО/КАСКО:** Возможен ли отказ в страховой выплате при ДТП из-за неисправности.
ЗАПРЕЩАЕТСЯ писать про "Финансовый прогноз" и цены.

3. diagnostic_data_md (РОЛЬ: Суровый диагност):
Только сухая выжимка: эталонные значения вольтажа (например 4.5В-5.0В на конкретных пинах), сопротивление обмотки, PID-параметры для сканера, осциллограммы.
Оформляй как абзацы или используй жирные заголовки. КАТЕГОРИЧЕСКИ ЗАПРЕЩАЮ ИСПОЛЬЗОВАТЬ маркированные или нумерованные списки (никаких - или 1.).

4. pro_tips_md (РОЛЬ: Узкий специалист по ${displayBrand}):
Специфика ремонта ИМЕННО ЭТОЙ марки (болячки кузова и мотора). 
СТРОГОЕ ПРАВИЛО: КАТЕГОРИЧЕСКИ ЗАПРЕЩАЮ ИСПОЛЬЗОВАТЬ цифры и списки (никаких "1." или "-"). Формируй текст так:
**Совет: [Название совета]**

[Здесь обычный текст абзаца с подробным описанием]

5. diy_instructions (РОЛЬ: Инженер-диагност):
Пошаговая инструкция. Строгий технический язык. Важно: Распиши каждый шаг максимально подробно. ЖЕСТКОЕ ПРАВИЛО ФОРМАТИРОВАНИЯ: Каждый шаг ДОЛЖЕН быть оформлен строго как подзаголовок (три решетки). Например: "### Шаг 1. Визуальный осмотр". КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО использовать стандартные нумерованные списки. ОБЯЗАТЕЛЬНО: Последним подзаголовком должен быть "### Шаг N. Сборка, сброс ошибки и тест-драйв".

6. faq_items: 3 вопроса и ответа по этой ошибке. Написано простым и понятным языком.

SEO-МЕТА-ТЕГИ (Строгий, экспертный стиль):
- title_char_count: Посчитай точное количество символов в заголовке, который ты напишешь.
- seo_title: SEO-заголовок (КРИТИЧЕСКОЕ ТРЕБОВАНИЕ: СТРОГО от 30 до 75 символов!). ОБЯЗАТЕЛЬНО включи название конкретного узла, датчика или детали. ПРАВИЛО УНИКАЛЬНОСТИ: ЗАПРЕЩЕНО начинать заголовок со слова "Ошибка". Начинай с названия детали, симптома или марки авто. КАТЕГОРИЧЕСКИ ЗАПРЕЩАЮ использовать слова: ремонт, своими руками, причин, диагностик, проблем, устранени, исправить, что значит. ИСПОЛЬЗУЙ живой авто-сленг, если это уместно.
- description_char_count: Посчитай точное количество символов в описании, которое ты напишешь.
- seo_description: SEO-описание (КРИТИЧЕСКОЕ ТРЕБОВАНИЕ: СТРОГО от 140 до 160 символов, плотно!). КАТЕГОРИЧЕСКИ ЗАПРЕЩАЮ использовать слова: ремонт, своими руками, причин, диагностик, проблем, устранени, исправить, что значит.`;

    const maxAttemptsSeo = 3;
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    for (let attempt = 1; attempt <= maxAttemptsSeo; attempt++) {
      try {
        const googleResponse = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptSeo }] }],
            generationConfig: {
              temperature: 0.3, // Снижена для высокой достоверности и скорости
              maxOutputTokens: 8192,
              responseMimeType: 'application/json',
              responseSchema: {
                type: 'OBJECT',
                properties: {
                  full_analysis_markdown: { type: 'STRING' },
                  driving_risks_md: { type: 'STRING' },
                  diagnostic_data_md: { type: 'STRING' },
                  diy_instructions: { type: 'STRING' },
                  pro_tips_md: { type: 'STRING' },
                  title_char_count: { type: 'INTEGER' },
                  seo_title: { type: 'STRING' },
                  description_char_count: { type: 'INTEGER' },
                  seo_description: { type: 'STRING' },
                  faq_items: {
                    type: 'ARRAY', items: { type: 'OBJECT', properties: { question: { type: 'STRING' }, answer: { type: 'STRING' } } }
                  }
                },
                required: ['full_analysis_markdown', 'driving_risks_md', 'diagnostic_data_md', 'diy_instructions', 'pro_tips_md', 'seo_title', 'seo_description', 'faq_items']
              }
            }
          }),
          signal: AbortSignal.timeout(120000)
        });
        const responseText = await googleResponse.text();
        if (!googleResponse.ok) {
          const errStr = responseText.toLowerCase();
          if (errStr.includes('quota') || errStr.includes('retrydelay') || errStr.includes('429') || errStr.includes('too many') || errStr.includes('exhausted')) {
            throw new Error(`API_LIMIT_REACHED: ${responseText}`);
          }
        }

        if (googleResponse.ok && responseText.trim().startsWith('{')) {
          const data = JSON.parse(responseText);
          const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (textContent) {
              let parsedTemp = JSON.parse(textContent);
              
              if (!parsedTemp.seo_title || parsedTemp.seo_title.length < 30 || parsedTemp.seo_title.length > 75) {
                throw new Error(`Длина SEO-заголовка не в рамках 30-75 символов (Текущая: ${parsedTemp.seo_title?.length || 0})`);
              }
              if (!parsedTemp.seo_description || parsedTemp.seo_description.length < 120 || parsedTemp.seo_description.length > 160) {
                throw new Error(`Длина SEO-описания не в рамках 120-160 символов (Текущая: ${parsedTemp.seo_description?.length || 0})`);
              }
              if (!parsedTemp.full_analysis_markdown || parsedTemp.full_analysis_markdown.length < 400) {
                throw new Error(`Слишком короткая статья: ${parsedTemp.full_analysis_markdown?.length || 0} символов`);
              }

              const forbiddenWords = ['ремонт', 'своими руками', 'причин', 'диагностик', 'проблем', 'устранени', 'исправить', 'что значит'];
              const checkString = (parsedTemp.seo_title + ' ' + parsedTemp.seo_description).toLowerCase();
              for (const word of forbiddenWords) {
                if (checkString.includes(word)) {
                  throw new Error(`Найдено запрещенное шаблонное слово в SEO-тегах: "${word}"`);
                }
              }

              seoData = parsedTemp;
              if (seoData.full_analysis_markdown) {
                  seoData.full_analysis_markdown = seoData.full_analysis_markdown
                      .replace(/^\s*\d+\.\s*$/gm, '')
                      .replace(/\n{3,}/g, '\n\n')
                      .trim();
              }
              break;
          }
        }
      } catch (error) {
        if (error.message.includes('API_LIMIT_REACHED')) throw error;
        if (attempt === maxAttemptsSeo) console.error(`⚠️ [AI DEEP ERROR] Этап 2 (SEO) не удался: ${error.message}`);
        else await sleep(5000); // 5 секунд перед новой попыткой
      }
    }
  }

  // --- ОБЪЕДИНЕНИЕ И ВОЗВРАТ ---
  if (factsData && seoData) {
    return {
      ...factsData, // Сложность, цены, инструменты, таблицы, коды
      ...seoData    // Markdown, советы, SEO, FAQ
    };
  }

  // УМНЫЙ РЕЗЕРВНЫЙ FALLBACK ДЛЯ ТЯЖЕЛОЙ ЧАСТИ (если любой из этапов упал)
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
    driving_risks_md: `**Технический риск:** Возможен износ сопутствующих деталей.\n**Безопасность и ПДД:** Снижение динамики и проблемы при обгоне.\n**Риски для ОСАГО/КАСКО:** Не влияет напрямую, если не стало причиной ДТП.`,
    diagnostic_data_md: `Отклонения параметров в цепи датчика от эталонных значений завода изготовителя. Требуется детальная проверка вольтажа и осциллограмм.`,
    popular_engine_codes: [],
    related_obd_codes: [],
    tools_table_md: "| Инструмент | Назначение |\n|---|---|\n| Мультиметр | Проверка напряжения и сопротивления |\n| OBD2 Сканер | Считывание и сброс ошибок |",
    oem_parts_table_md: "| Деталь | Тип/Артикул |\n|---|---|\n| Датчик | Уточняйте по VIN |",
    pro_tips_md: `На ${displayBrand} ${displayModel} стоит обратить особое внимание на состояние проводки в местах перегибов и контактов с горячими элементами двигателя.`,
    seo_title: `Ошибка ${displayCode} ${displayBrand} ${displayModel}: параметры и последствия`,
    seo_description: `Расшифровка ошибки ${displayCode} на ${displayBrand} ${displayModel}. Основные симптомы, технические данные узлов и спецификация.`,
    faq_items: [
      { question: `Что значит ошибка ${displayCode}?`, answer: `Официальная расшифровка: ${finalDescription}.` }
    ],
    is_fallback: true
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