import 'dotenv/config';

export async function analyzeCarError(brand, model, code, baseDescription) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('CRITICAL_ERROR: GEMINI_API_KEY не найден в переменных окружения сервера!');
  }

  const cleanKey = apiKey.trim();

  console.log('--- ДИАГНОСТИКА КЛЮЧА ---');
  console.log(`Используется Google API ключ: ${cleanKey.substring(0, 5)}...`);

  const prompt = `Ты — топовый автодиагност из СНГ и SEO-специалист. Твоя задача — детально расшифровать ошибку ${code} для автомобиля ${brand} ${model}.
СТРОГОЕ ПРАВИЛО 1 (Суть ошибки): Официальная техническая суть этого кода: '${baseDescription}'. Опирайся строго на эту базу, не выдумывай посторонних неисправностей.
СТРОГОЕ ПРАВИЛО 2 (Глубокая уникализация и вариативность): Текст должен быть на 100% уникален именно для связки ${brand} ${model} и конкретного узла этой ошибки. Обязательно укажи 1-2 популярных индекса двигателей для этой модели, на которых характерен этот сбой. Меняй структуру подачи в зависимости от типа неисправности (электрика, топливная система, датчики или механика), чтобы текст не выглядел шаблонным. Используй маркеры рынка СНГ: "СТО", "официалы", "разборка", "контрактная запчасть", "морозы".
СТРОГОЕ ПРАВИЛО 3 (Цены): Все цены на запчасти и работу строго в USD ($).
СТРОГОЕ ПРАВИЛО 4 (SEO Метатеги и защита от дублей): 
- seoTitle: Максимум 60 символов. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО делать шаблонные заголовки вроде "причины и ремонт". Обязательно вплетай в Title название конкретного неисправного узла или симптома (например: "Ошибка ${code} ${brand} ${model}: сбой Valvetronic" или "Код ${code} ${brand} ${model}: ремонт проводки").
- seoDescription: Строго до 150 символов! Емко включи код ошибки, модель, НАЗВАНИЕ УЗЛА и короткий призыв к действию (CTA). Текст не должен обрываться.

Формирование полей (используй Markdown):
- 'full_analysis_markdown': Дай глубокий технический разбор причин и симптомов именно для этого мотора. При генерации Markdown-текста используй для главных разделов заголовки второго уровня (##), а для подразделов — третьего (###). КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО использовать любые эмодзи (смайлики). Если требуются технические обозначения или иконки, используй стандартные классы иконной библиотеки системы вместо эмодзи.
- 'sto_protection_tips': Напиши 2-3 конкретных совета, как механики могут обмануть клиента при данной неисправности.
- 'diy_instructions': Пошаговая инструкция по диагностике и ремонту своими руками с двойными переносами строк.
- 'faq_items': Сгенерируй 3 частых вопроса пользователей по этой ошибке и ответы на них. Это нужно для микроразметки FAQPage.
- Остальные поля заполни коротко по старым правилам.`;

  const url = `https://aged-tree-edb7carcode-proxy.asqr-pro.workers.dev/v1beta/models/gemini-flash-lite-latest:generateContent?key=${cleanKey}`;

  const googleResponse = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            severity: { type: 'STRING' },
            summary: { type: 'STRING' },
            teaser_text: { type: 'STRING' },
            full_analysis_markdown: { type: 'STRING' },
            sto_protection_tips: { type: 'STRING' }, // Поле возвращено для Prisma
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
            popular_engine_codes: {
              type: 'ARRAY',
              items: { type: 'STRING' },
              description: "Названия двигателей, например ['2AR-FE', '3GR-FSE']"
            },
            related_obd_codes: {
              type: 'ARRAY',
              items: { type: 'STRING' },
              description: "Коды ошибок, которые часто сопутствуют текущей, например ['P0172', 'P0300']"
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
            'popular_engine_codes', 'related_obd_codes', 'faq_items'
          ]
        }
      }
    })
  });

  const data = await googleResponse.json();

  if (!googleResponse.ok) {
    throw new Error(`Google API Error: ${JSON.stringify(data.error || data)}`);
  }

  const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textContent) {
    throw new Error('Получен пустой ответ от ИИ');
  }

  return JSON.parse(textContent);
}
