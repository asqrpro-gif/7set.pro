import fetch from 'node-fetch';
import { enrichReportText } from '../lib/seoEnricher.js';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function enrichSeoCard(report, prisma, enrichmentMode = 'full') {
  try {
    console.log(`[pSEO] Запуск обогащения для: ${report.brand} ${report.model} ${report.code} (Режим: ${enrichmentMode})`);

    const API_URL = `https://aged-tree-edb7carcode-proxy.asqr-pro.workers.dev/v1beta/models/gemini-flash-lite-latest:generateContent?key=${process.env.GEMINI_API_KEY}`;

    let lastError = null;

    // Retry-карусель (до 3 попыток на идеальную генерацию)
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        if (attempt > 1) {
          console.log(`[pSEO] Повторная попытка ${attempt}/3 для ${report.code}...`);
        }

        let prompt = '';
        let responseSchema = {};

        if (enrichmentMode === 'seo_title_only') {
          prompt = `
Ты — автоэксперт и SEO-специалист. Твоя задача — исправить ТОЛЬКО SEO-заголовок для страницы об ошибке ${report.code} для ${report.brand} ${report.model}.

Текущий текст статьи (для контекста):
${report.full_analysis_markdown || report.summary}

Текущее (хорошее) SEO-описание:
${report.seoDescription}

ЖЕСТКАЯ СТРУКТУРА (верни JSON):
1. title_char_count: Посчитай точное количество символов в заголовке, который ты напишешь.
2. new_seo_title: SEO-заголовок (КРИТИЧЕСКОЕ ТРЕБОВАНИЕ: СТРОГО от 30 до 75 символов, ни символом больше или меньше!). ОБЯЗАТЕЛЬНО включи название конкретного узла, датчика или детали, с которым связана ошибка. ПРАВИЛО УНИКАЛЬНОСТИ: ЗАПРЕЩЕНО начинать заголовок со слова "Ошибка". Начинай с названия детали, симптома или марки авто. КАТЕГОРИЧЕСКИ ЗАПРЕЩАЮ использовать слова: ремонт, своими руками, причин, диагностик, проблем, устранени, исправить, что значит.
          `.trim();

          responseSchema = {
            type: "OBJECT",
            properties: {
              title_char_count: { type: "INTEGER" },
              new_seo_title: { type: "STRING" }
            },
            required: ["new_seo_title"]
          };
        } else if (enrichmentMode === 'seo_desc_only') {
          prompt = `
Ты — автоэксперт и SEO-специалист. Твоя задача — исправить ТОЛЬКО SEO-описание для страницы об ошибке ${report.code} для ${report.brand} ${report.model}.

Текущий текст статьи (для контекста):
${report.full_analysis_markdown || report.summary}

Текущий (хороший) SEO-заголовок:
${report.seoTitle}

ЖЕСТКАЯ СТРУКТУРА (верни JSON):
1. description_char_count: Посчитай точное количество символов в описании, которое ты напишешь.
2. new_seo_description: SEO-описание (КРИТИЧЕСКОЕ ТРЕБОВАНИЕ: СТРОГО от 140 до 160 символов, ни символом больше или меньше!). КАТЕГОРИЧЕСКИ ЗАПРЕЩАЮ использовать слова: ремонт, своими руками, причин, диагностик, проблем, устранени, исправить, что значит.
          `.trim();

          responseSchema = {
            type: "OBJECT",
            properties: {
              description_char_count: { type: "INTEGER" },
              new_seo_description: { type: "STRING" }
            },
            required: ["new_seo_description"]
          };
        } else if (enrichmentMode === 'seo_only') {
          prompt = `
Ты — автоэксперт и SEO-специалист. Твоя задача — исправить SEO-теги для страницы об ошибке ${report.code} для ${report.brand} ${report.model}.

Текущий текст статьи (для контекста):
${report.full_analysis_markdown || report.summary}

ЖЕСТКАЯ СТРУКТУРА (верни JSON):
1. title_char_count: Посчитай точное количество символов в заголовке, который ты напишешь.
2. new_seo_title: SEO-заголовок (КРИТИЧЕСКОЕ ТРЕБОВАНИЕ: СТРОГО от 30 до 75 символов, ни символом больше или меньше!). ОБЯЗАТЕЛЬНО включи название конкретного узла, датчика или детали, с которым связана ошибка. ПРАВИЛО УНИКАЛЬНОСТИ: ЗАПРЕЩЕНО начинать заголовок со слова "Ошибка". Начинай с названия детали, симптома или марки авто. КАТЕГОРИЧЕСКИ ЗАПРЕЩАЮ использовать слова: ремонт, своими руками, причин, диагностик, проблем, устранени, исправить, что значит.
3. description_char_count: Посчитай точное количество символов в описании, которое ты напишешь.
4. new_seo_description: SEO-описание (КРИТИЧЕСКОЕ ТРЕБОВАНИЕ: СТРОГО от 140 до 160 символов, ни символом больше или меньше!). КАТЕГОРИЧЕСКИ ЗАПРЕЩАЮ использовать слова: ремонт, своими руками, причин, диагностик, проблем, устранени, исправить, что значит.
          `.trim();

          responseSchema = {
            type: "OBJECT",
            properties: {
              title_char_count: { type: "INTEGER" },
              new_seo_title: { type: "STRING" },
              description_char_count: { type: "INTEGER" },
              new_seo_description: { type: "STRING" }
            },
            required: ["new_seo_title", "new_seo_description"]
          };
        } else if (enrichmentMode === 'content_only') {
          prompt = `
Ты — автоэксперт и опытный шеф-механик. Твоя задача — переписать техническую статью по коду ошибки ${report.code} для ${report.brand} ${report.model} так, чтобы она была полезна и обычным водителям, и крутым диагностам.

Текущий текст:
${report.full_analysis_markdown || report.summary}

ЖЕСТКАЯ СТРУКТУРА И РОЛИ (каждый пункт — это отдельное поле в JSON, пиши в формате Markdown, без воды):

1. new_full_analysis_markdown (РОЛЬ: Опытный, дружелюбный механик):
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

4. pro_tips_md (РОЛЬ: Узкий специалист по ${report.brand}):
Специфика ремонта ИМЕННО ЭТОЙ марки (болячки кузова и мотора). 
СТРОГОЕ ПРАВИЛО: КАТЕГОРИЧЕСКИ ЗАПРЕЩАЮ ИСПОЛЬЗОВАТЬ цифры и списки (никаких "1." или "-"). Формируй текст так:
**Совет: [Название совета]**

[Здесь обычный текст абзаца с подробным описанием]

**Совет: [Название следующего совета]**

[Здесь текст следующего абзаца]
5. tools_table_md: Markdown-таблица (Инструмент | Назначение).
6. oem_parts_table_md: Markdown-таблица (Деталь | Тип/Артикул).
          `.trim();

          responseSchema = {
            type: "OBJECT",
            properties: {
              new_full_analysis_markdown: { type: "STRING" },
              driving_risks_md: { type: "STRING" },
              diagnostic_data_md: { type: "STRING" },
              pro_tips_md: { type: "STRING" },
              tools_table_md: { type: "STRING" },
              oem_parts_table_md: { type: "STRING" }
            },
            required: ["new_full_analysis_markdown", "driving_risks_md", "diagnostic_data_md", "pro_tips_md", "tools_table_md", "oem_parts_table_md"]
          };
        } else {
          prompt = `
Ты — автоэксперт и опытный шеф-механик. Твоя задача — переписать техническую статью по коду ошибки ${report.code} для ${report.brand} ${report.model} так, чтобы она была полезна и обычным водителям, и крутым диагностам.

Текущий текст:
${report.full_analysis_markdown || report.summary}

ЖЕСТКАЯ СТРУКТУРА И РОЛИ (каждый пункт — это отдельное поле в JSON, пиши в формате Markdown, без воды):

1. new_full_analysis_markdown (РОЛЬ: Опытный, дружелюбный механик):
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

4. pro_tips_md (РОЛЬ: Узкий специалист по ${report.brand}):
Специфика ремонта ИМЕННО ЭТОЙ марки (болячки кузова и мотора). 
СТРОГОЕ ПРАВИЛО: КАТЕГОРИЧЕСКИ ЗАПРЕЩАЮ ИСПОЛЬЗОВАТЬ цифры и списки (никаких "1." или "-"). Формируй текст так:
**Совет: [Название совета]**

[Здесь обычный текст абзаца с подробным описанием]

**Совет: [Название следующего совета]**

[Здесь текст следующего абзаца]
5. tools_table_md: Markdown-таблица (Инструмент | Назначение).
6. oem_parts_table_md: Markdown-таблица (Деталь | Тип/Артикул).
7. title_char_count: Посчитай количество символов для заголовка.
8. new_seo_title: SEO-заголовок (КРИТИЧЕСКОЕ ТРЕБОВАНИЕ: СТРОГО от 30 до 75 символов!). ОБЯЗАТЕЛЬНО включи название конкретного узла, датчика или детали. ПРАВИЛО УНИКАЛЬНОСТИ: ЗАПРЕЩЕНО начинать заголовок со слова "Ошибка". Начинай с названия детали, симптома или марки авто. КАТЕГОРИЧЕСКИ ЗАПРЕЩАЮ использовать слова: ремонт, своими руками, причин, диагностик, проблем, устранени, исправить, что значит. ИСПОЛЬЗУЙ живой авто-сленг, если это уместно.
9. description_char_count: Посчитай количество символов для описания.
10. new_seo_description: SEO-описание (КРИТИЧЕСКОЕ ТРЕБОВАНИЕ: СТРОГО от 140 до 160 символов, плотно!). КАТЕГОРИЧЕСКИ ЗАПРЕЩАЮ использовать слова: ремонт, своими руками, причин, диагностик, проблем, устранени, исправить, что значит.
          `.trim();

          responseSchema = {
            type: "OBJECT",
            properties: {
              new_full_analysis_markdown: { type: "STRING" },
              driving_risks_md: { type: "STRING" },
              diagnostic_data_md: { type: "STRING" },
              pro_tips_md: { type: "STRING" },
              tools_table_md: { type: "STRING" },
              oem_parts_table_md: { type: "STRING" },
              title_char_count: { type: "INTEGER" },
              new_seo_title: { type: "STRING" },
              description_char_count: { type: "INTEGER" },
              new_seo_description: { type: "STRING" }
            },
            required: ["new_full_analysis_markdown", "driving_risks_md", "diagnostic_data_md", "pro_tips_md", "tools_table_md", "oem_parts_table_md", "new_seo_title", "new_seo_description"]
          };
        }

        const requestBody = {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
            responseSchema: responseSchema
          }
        };

        const response = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(120000)
        });

        const responseText = await response.text();
        if (!response.ok) {
          throw new Error(`Ошибка API Gemini: ${response.status} ${responseText}`);
        }

        const data = JSON.parse(responseText);
        const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!resultText) {
          throw new Error('Пустой ответ от Gemini API');
        }

        const enrichedData = JSON.parse(resultText);
        
        if (enrichedData.new_seo_title) enrichedData.new_seo_title = enrichedData.new_seo_title.trim();
        if (enrichedData.new_seo_description) enrichedData.new_seo_description = enrichedData.new_seo_description.trim();

        // --- ОБЩАЯ ВАЛИДАЦИЯ SEO ---
        if (enrichmentMode !== 'seo_desc_only' && enrichmentMode !== 'content_only') {
            if (!enrichedData.new_seo_title || enrichedData.new_seo_title.length < 30 || enrichedData.new_seo_title.length > 75) {
              throw new Error(`Длина SEO-заголовка не в рамках 30-75 символов (Текущая: ${enrichedData.new_seo_title?.length || 0})`);
            }
        }
        
        if (enrichmentMode !== 'seo_title_only' && enrichmentMode !== 'content_only') {
            if (!enrichedData.new_seo_description || enrichedData.new_seo_description.length < 140 || enrichedData.new_seo_description.length > 160) {
              throw new Error(`Длина SEO-описания не в рамках 140-160 символов (Текущая: ${enrichedData.new_seo_description?.length || 0})`);
            }
        }

        const forbiddenWords = ['ремонт', 'своими руками', 'причин', 'диагностик', 'проблем', 'устранени', 'исправить', 'что значит'];
        
        if (enrichmentMode !== 'seo_desc_only' && enrichmentMode !== 'content_only') {
            const titleLower = enrichedData.new_seo_title.toLowerCase();
            const foundForbiddenTitle = forbiddenWords.find(w => titleLower.includes(w));
            if (foundForbiddenTitle) {
              throw new Error(`Найдено запрещенное шаблонное слово в SEO-заголовке: "${foundForbiddenTitle}"`);
            }
        }

        if (enrichmentMode !== 'seo_title_only' && enrichmentMode !== 'content_only') {
            const descLower = enrichedData.new_seo_description.toLowerCase();
            const foundForbiddenDesc = forbiddenWords.find(w => descLower.includes(w));
            if (foundForbiddenDesc) {
              throw new Error(`Найдено запрещенное шаблонное слово в SEO-описании: "${foundForbiddenDesc}"`);
            }
        }

        let updatedReport;

        if (enrichmentMode === 'full' || enrichmentMode === 'content_only') {
          // --- ДОП. ВАЛИДАЦИЯ ДЛЯ FULL ---
          if (!enrichedData.new_full_analysis_markdown || enrichedData.new_full_analysis_markdown.length < 600) {
            throw new Error(`Слишком короткая статья (обрыв генерации? Длина: ${enrichedData.new_full_analysis_markdown?.length || 0})`);
          }

          if (/(?:^|\n)\s*\d+\.\s*$/.test(enrichedData.new_full_analysis_markdown)) {
              throw new Error(`Обнаружен обрыв текста (висячая цифра в конце markdown)`);
          }
          
          const newMarkdown = enrichReportText(enrichedData.new_full_analysis_markdown, report.brand, report.model, report.code, report.drivability);

          const dataToUpdate = {
              tools_table_md: enrichedData.tools_table_md,
              oem_parts_table_md: enrichedData.oem_parts_table_md,
              pro_tips_md: enrichedData.pro_tips_md,
              driving_risks_md: enrichedData.driving_risks_md,
              diagnostic_data_md: enrichedData.diagnostic_data_md,
              full_analysis_markdown: newMarkdown, 
              seoScore: 95,
              seoRisk: 'SAFE',
              uniquenessScore: 100
          };

          if (enrichmentMode === 'full') {
              dataToUpdate.seoTitle = enrichedData.new_seo_title;
              dataToUpdate.seoDescription = enrichedData.new_seo_description;
          }

          updatedReport = await prisma.diagnosticReport.update({
            where: { id: report.id },
            data: dataToUpdate
          });
        } else {
          // --- СОХРАНЕНИЕ ТОЛЬКО ДЛЯ SEO ---
          const dataToUpdate = {
              seoScore: 95,
              seoRisk: 'SAFE' // Считаем безопасным (следующий скан найдет ошибки в markdown, если они есть)
          };
          
          if (enrichedData.new_seo_title) {
            dataToUpdate.seoTitle = enrichedData.new_seo_title;
          }
          if (enrichedData.new_seo_description) {
            dataToUpdate.seoDescription = enrichedData.new_seo_description;
          }

          updatedReport = await prisma.diagnosticReport.update({
            where: { id: report.id },
            data: dataToUpdate
          });
        }

        console.log(`[pSEO] ✅ Успешно обогащена карточка ${report.code} (Попытка ${attempt})`);
        return { success: true, report: updatedReport };

      } catch (err) {
        lastError = err;
        console.log(`[pSEO] ⚠️ Провал на попытке ${attempt}: ${err.message}`);
        
        // Прерываем цикл только при фатальных ошибках (Quota, 429), чтобы сразу выйти
        const errStr = err.message.toLowerCase();
        if (errStr.includes('quota') || errStr.includes('429')) {
          break;
        }
        
        if (attempt < 3) {
          await sleep(5000); // 5 секунд перед новой попыткой
        }
      }
    }

    // Если мы вышли из цикла, значит все 3 попытки провалились
    throw lastError;

  } catch (error) {
    console.error(`[pSEO] ❌ Итоговая ошибка обогащения карточки ${report?.code}:`, error.message);
    return { success: false, error: error.message };
  }
}
