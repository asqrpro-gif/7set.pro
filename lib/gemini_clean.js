import 'dotenv/config';

// Единый статический шаблон-заглушка для ВСЕХ несуществующих или не поддерживаемых кодов ошибок
const UNSUPPORTED_ERROR_TEMPLATE = {
  severity: "Информация",
  summary: "Данный код ошибки не зарегистрирован в официальных каталогах или не поддерживается ЭБУ данной модели автомобиля.",
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
  diy_instructions: "1. Перезагрузите диагностическое приложение и переподключите сканер.\n\n2. Очистите коды ошибок в памяти ЭБУ и проверьте, появится ли ошибка вновь."
};

export async function analyzeCarError(brand, model, code, baseDescription = '', apiKey = process.env.GEMINI_API_KEY) {
  const cleanKey = apiKey ? apiKey.trim() : '';
  const trimmedCode = code ? code.trim().toUpperCase() : '';
  const descLower = baseDescription ? baseDescription.toLowerCase() : '';

  const formatTitleCase = (str) => (str || '').split(/[\s-]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const displayBrand = formatTitleCase(brand);
  const displayModel = formatTitleCase(model);
  const displayCode = trimmedCode;

  // 1. СТРОГИЙ МОЛНИЕНОСНЫЙ FAST-PATH (Проверка формата OBD-II)
  const obdRegex = /^[PBUC][0-9A-F]{4}$/i;
  const isInvalidFormat = !obdRegex.test(trimmedCode);
  const isUnsupportedDescription =
    descLower === 'не существует' ||
    descLower === 'код не существует';

  // Если код фейковый (например, P9999) или невалидный, отдаем заглушку мгновенно без запроса к сети
  if (isInvalidFormat || isUnsupportedDescription) {
    console.log(`[FAST-PATH] Код "${displayCode}" отклонен мгновенно. Запрос к ИИ не производился.`);
    return UNSUPPORTED_ERROR_TEMPLATE;
  }

  console.log('--- ДИАГНОСТИКА КЛЮЧА ---');
  console.log(`Используется Google API ключ: ${cleanKey.substring(0, 5)}...`);

  const descVariants = [
    "Вариант А (Акцент на самостоятельную диагностику): Укажи код, авто, конкретный неисправный узел и призыв к проверке своими руками (DIY) без визита на сервис.",
    "Вариант Б (Акцент на защиту от обмана на СТО и цены): Укажи код, авто, суть сбоя, примерные расходы на ремонт в USD ($) и призыв узнать, как не переплатить в автосервисе.",
    "Вариант В (Акцент на симптомы и поведение авто): Укажи код, авто, явные признаки (например, расход топлива, провалы оборотов, троение, аварийный режим) и призыв к решению проблемы."
  ];
  const selectedDescRule = descVariants[Math.floor(Math.random() * descVariants.length)];

  const prompt = `Ты — топовый автодиагност из СНГ и SEO-специалист. Твоя задача — детально, но максимально емко расшифровать ошибку ${displayCode} для автомобиля ${displayBrand} ${displayModel}.

СТРОГОЕ ПРАВИЛО 0 (Проверка адекватности): Если этот код ошибки (${displayCode}) представляет собой очевидный бессмысленный набор букв и цифр или не существующий в природе формат (например P9999 или Z0000), только в таком крайнем случае установи флаг 'is_unsupported_error' в true. Во всех остальных случаях для реальных стандартизированных (SAE) и заводских (manufacturer-specific) кодов устанавливай 'is_unsupported_error' в false и подробно объясняй неисправность и методы диагностики для ${displayBrand} ${displayModel}.

СТРОГОЕ ПРАВИЛО 1 (Суть ошибки): Если код прошел проверку применимости, официальная техническая суть этого кода: '${baseDescription}'. Опирайся строго на эту базу, не выдумывай посторонних неисправностей.

СТРОГОЕ ПРАВИЛО 2 (Глубокая уникализация и вариативность): Каждая статья должна быть на 100% уникальна именно для связки ${displayBrand} ${displayModel} и конкретного узла этой ошибки, чтобы при генерации миллионов страниц они были максимально непохожими друг на друга. Обязательно укажи 1-2 популярных индекса двигателей для этой модели, на которых характерен этот сбой. Варьируй структуру и слог подачи в зависимости от типа неисправности (электрика, топливная система, датчики или механика). Используй маркеры рынка СНГ: "СТО", "официалы", "разборка", "контрактная запчасть", "морозы", "реагенты".

СТРОГОЕ ПРАВИЛО 3 (Цены): Все цены на запчасти и работу строго в USD ($).

СТРОГОЕ ПРАВИЛО 4 (SEO Метатеги и защита от дублей в контенте карточки): 
- seoTitle: Строго в пределах 50–60 символов! КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО делать мертвые шаблонные заголовки вроде "причины и ремонт", "расшифровка ошибки", "ошибка двигателя". Ты ОБЯЗАН динамически менять хвост заголовка в зависимости от категории ошибки (электрика, топливная система, датчики, трансмиссия или механика ГРМ) и внедрить специфику конкретного узла или характер проблемы.
  Примеры правильных заголовков:
  * Для датчиков/электрики: "Ошибка P0172 Lada Largus: почему богатит смесь и как проверить ДМРВ" (58 символов)
  * Для механики/ГРМ: "Код P1022 BMW X3: неисправность системы Valvetronic и ремонт" (58 символов)
  * Для трансмиссии/АКПП: "Ошибка P0700 Kia Rio: сбой контроллера трансмиссии и диагностика" (59 символов)
- seoDescription: Строго до 150 символов! Не используй кальки и повторы. Для текущей генерации применяй следующую матрицу вариативности:
  ${selectedDescRule}
  Текст должен быть лаконичным, законченным по смыслу и ни в коем случае не обрываться на середине фразы.
- summary: Строго 2-3 предложения. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНЫ шаблонные вводные фразы вроде "Данный код указывает на...", "Ошибка обозначает...", "Код P0xxx свидетельствует о...". Сразу начинай с конкретной технической сути сбоя именно на двигателях модели ${displayBrand} ${displayModel} и того, какой конкретно узел или датчик вышел из строя!
- teaser_text: Интригующий и живой лид-абзац (до 3-4 предложений) без канцелярщины и шаблонизации. Обязательно вплети реальные симптомы, характерные для ${displayBrand} ${displayModel} (например, поведение коробки, расход топлива, провалы при разгоне, запуск на холодную) и укажи, почему проблему опасно откладывать.
- full_analysis_markdown: Технически емкий, глубокий, на 100% уникальный для ${displayBrand} ${displayModel} разбор без вводных фраз и повторений (до 200-250 слов). Сразу переходи к сути неисправности на данном моторе. Используй ## для главных разделов и ### для подразделов. Обязательно указывай конкретные места расположения датчиков, слабые места проводки или фирменные болячки двигателей данной марки. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО использовать любые эмодзи и одинаковые списки причин!
- sto_protection_tips: Напиши 2 конкретных, коротких совета (до 1-2 предложений каждый), опирающихся на конструктивную особенность именно этого узла и марки (как мастера на СТО пытаются развести на замену исправных деталей или дорогостоящую диагностику).
- drivability: Конкретно укажи, как машина поведет себя на ходу (аварийный режим, ограничение оборотов, рывки или нормальная езда) и сколько км можно проехать до сервиса.
- diy_instructions: 3-4 четких практических шага по диагностике и устранению своими руками без лишней лирики (с двойными переносами строк). Пиши конкретно: где померять сопротивление мультиметром, какой разъем визуально проверить на окислы, где искать подсос воздуха или обрыв.
- faq_items: Сгенерируй 3 уникальных частых вопроса пользователей и лаконичные ответы на них именно по этой ошибке и модели авто для микроразметки FAQPage.
- Остальные поля (severity, diy_difficulty_text, diy_difficulty_score, diy_time, diy_tools, price_parts, price_labor) заполняй точно и реалистично для модели ${displayBrand} ${displayModel}, экономя токены.`;

  const url = `https://aged-tree-edb7carcode-proxy.asqr-pro.workers.dev/v1beta/models/gemini-flash-lite-latest:generateContent?key=${cleanKey}`;

  const payload = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          severity: { type: 'STRING' },
          summary: { type: 'STRING' },
          teaser_text: { type: 'STRING' },
          full_analysis_markdown: { type: 'STRING' },
          sto_protection_tips: { type: 'STRING' },
          drivability: { type: 'STRING' },
          diy_difficulty_text: { type: 'STRING' },
          diy_difficulty_score: { type: 'STRING' },
          diy_time: { type: 'STRING' },
          diy_tools: { type: 'STRING' },
          price_parts: { type: 'STRING' },
          price_labor: { type: 'STRING' },
          diy_instructions: { type: 'STRING' },
          seoTitle: { type: 'STRING' },
          seoDescription: { type: 'STRING' },
          is_unsupported_error: {
            type: 'BOOLEAN',
            description: "True, если данный код ошибки технически не существует или не применим"
          },
          popular_engine_codes: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: "Названия двигателей, например ['2AR-FE', '3GR-FSE']"
          },
          related_obd_codes: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: "Коды ошибок, которые часто сопутствуют текущей"
          },
          faq_items: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                question: { type: 'STRING' },
                answer: { type: 'STRING' }
              }
            },
            description: "Вопросы и ответы для микроразметки FAQPage"
          }
        },
        required: [
          'severity', 'summary', 'teaser_text', 'full_analysis_markdown',
          'sto_protection_tips', 'drivability', 'diy_difficulty_text',
          'diy_difficulty_score', 'diy_time', 'diy_tools', 'price_parts',
          'price_labor', 'diy_instructions', 'seoTitle', 'seoDescription',
          'is_unsupported_error', 'popular_engine_codes', 'related_obd_codes', 'faq_items'
        ]
      }
    }
  });

  const maxAttempts = 2; // Основная попытка + 1 быстрый перезапрос
  const timeoutMs = 15000; // 15 секунд на попытку

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`📡 [AI REQ] Попытка ${attempt}/${maxAttempts} (Таймаут: ${timeoutMs / 1000}с)...`);
      const googleResponse = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: payload,
        signal: AbortSignal.timeout(timeoutMs)
      });

      const responseText = await googleResponse.text();

      if (!googleResponse.ok || responseText.trim().startsWith('<')) {
        console.error(`[PROXY ERROR] Попытка ${attempt}/${maxAttempts}: Прокси вернул ошибку или HTML-страницу вместо JSON.`);
        if (attempt < maxAttempts) {
          console.log(`🔄 [RETRY] Повторяем запрос к ИИ...`);
          continue;
        }
        break;
      }

      const data = JSON.parse(responseText);
      const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!textContent) {
        throw new Error('Получен пустой ответ от ИИ');
      }

      const parsedResult = JSON.parse(textContent);

      // Принудительно сбрасываем флаг is_unsupported_error, так как код прошёл валидацию формата
      parsedResult.is_unsupported_error = false;
      return parsedResult;

    } catch (error) {
      const isTimeout = error.name === 'TimeoutError' || error.name === 'AbortError' || error.message.includes('timeout') || error.message.includes('aborted');
      console.error(`⚠️ [AI ERROR] Попытка ${attempt}/${maxAttempts}: ${isTimeout ? 'Превышено время ожидания (15 сек)' : error.message}`);
      if (attempt < maxAttempts) {
        console.log(`🔄 [RETRY] Мгновенно переподключаемся и отправляем повторный запрос...`);
        continue;
      }
    }
  }

  console.log(`⚠️ [AI FALLBACK] Включаем резервную генерацию карточки для ${displayBrand} ${displayModel} ${displayCode}...`);
  return {
    severity: "Средняя",
    summary: `На двигателях ${displayBrand} ${displayModel} сбой по коду ${displayCode} (${baseDescription}) напрямую связан с нарушением работы соответствующего электронного контура или датчика. Для точной локализации неисправности требуется проверка параметров сигнала и целостности проводки.`,
    teaser_text: `Специфика проявления ошибки ${displayCode} на моделях ${displayBrand} ${displayModel}: характерные симптомы поведения автомобиля на ходу, первичная проверка электрической цепи своими руками и рекомендации по защите от навязанных услуг в автосервисе.`,
    full_analysis_markdown: `## Специфика сбоя ${displayCode} на ${displayBrand} ${displayModel}\n\nФиксация кода **${displayCode}** (${baseDescription}) блоком управления **${displayBrand}** свидетельствует о выходе параметров контрольного узла за пределы заводских допусков.\n\n### Главные точки дефектовки:\n- **Контакты и косы проводки:** Проверьте разъемы на предмет окислов, влаги, надлома пинов или перетирания жгута;\n- **Показания датчиков:** Измерьте рабочее сопротивление и напряжение сигнала мультиметром;\n- **Потоковые данные (Live Data):** Сравните реальные параметры узла с нормами дилерской документации **${displayBrand}**.\n\n## Рекомендация по ремонту\nПосле устранения причины сбоя обязательно выполните сброс адаптаций в ЭБУ, чтобы блок перестроился на корректный режим работы.`,
    sto_protection_tips: `При диагностике ${displayCode} на ${displayBrand} не позволяйте мастерам менять дорогостоящие узлы вслепую. Всегда требуйте начинать с проверки проводки и разъемов, где чаще всего теряется контакт.`,
    drivability: "caution",
    diy_difficulty_text: "Средний",
    diy_difficulty_score: "3/5",
    diy_time: "30-60 минут",
    diy_tools: "OBD-II сканер, мультиметр, набор базовых ключей",
    price_parts: "20 - 150 $",
    price_labor: "20 - 80 $",
    diy_instructions: `1. Подключите сканер OBD-II и сохраните стоп-кадр (Freeze Frame).\n\n2. Проверьте надежность соединений в цепи неисправного узла.\n\n3. Очистите память ошибок ЭБУ и проведите тестовую поездку.`
  };
}

/**
 * Генерация регламента ТО и расходников для авто в Гараже
 */
export async function analyzeCarConsumables(brand, model, engine, year) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('CRITICAL_ERROR: GEMINI_API_KEY не найден в переменных окружения!');
  }

  const cleanKey = apiKey.trim();
  console.log(`--- ГЕНЕРАЦИЯ РАСХОДНИКОВ: ${brand} ${model} ${engine} (${year}) ---`);

  const prompt = `Ты — топовый автомеханик и эксперт по подбору запчастей. Твоя задача — составить точный список базовых расходных материалов для автомобиля: ${brand} ${model}, двигатель ${engine}, ${year} года выпуска.
  
  $СТРОГОЕ ПРАВИЛО 1$: Верни ответ ИСКЛЮЧИТЕЛЬНО в формате валидного JSON. Никакого текста до или после JSON. Никаких тегов \`\`\`json. Только фигурные скобки и данные.
  $СТРОГОЕ ПРАВИЛО 2$: Данные должны быть максимально точными для указанного двигателя и кузова.

  Шаблон возвращаемого JSON:
  {
    "wipers": {
      "driver_mm": 600,
      "passenger_mm": 400,
      "rear_mm": 300
    },
    "oil": {
      "type": "5W-30",
      "volume_liters": 4.5,
      "spec": "API SN / ILSAC GF-5"
    },
    "fuel": {
      "type": "АИ-95"
    },
    "coolant": {
      "type": "G12+",
      "color": "красный",
      "volume_liters": 6.5
    }
  }`;

  const url = `https://aged-tree-edb7carcode-proxy.asqr-pro.workers.dev/v1beta/models/gemini-flash-lite-latest:generateContent?key=${cleanKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1, // Низкая температура для максимальной технической точности и отсутствия фантазий
          responseMimeType: "application/json", // Заставляем ИИ отдавать строгий JSON
          response_mime_type: "application/json"
        }
      }),
      signal: AbortSignal.timeout(15000)
    });

    const responseText = await response.text();

    if (!response.ok || responseText.trim().startsWith('<')) {
      throw new Error(`Ошибка API или прокси: ${response.status} - ${responseText.substring(0, 100)}`);
    }

    const data = JSON.parse(responseText);
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!resultText) {
      throw new Error('Пустой ответ от ИИ при подборе расходников');
    }

    // Парсим результат в объект, чтобы убедиться, что ИИ не сломал структуру
    return JSON.parse(resultText);

  } catch (error) {
    console.error("Ошибка при подборе расходников:", error.message);
    throw error;
  }
}
