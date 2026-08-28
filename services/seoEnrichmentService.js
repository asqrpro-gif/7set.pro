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

        if (enrichmentMode === 'seo_only') {
          prompt = `
Ты — автоэксперт и SEO-специалист. Твоя задача — исправить SEO-теги для страницы об ошибке ${report.code} для ${report.brand} ${report.model}.

Текущий текст статьи (для контекста):
${report.full_analysis_markdown || report.summary}

ЖЕСТКАЯ СТРУКТУРА (верни JSON):
1. new_seo_title: SEO-заголовок (от 30 до 75 символов). ОБЯЗАТЕЛЬНО включи название конкретного узла, датчика или детали, с которым связана ошибка, чтобы заголовок был уникальным (например: Ошибка P0010 Chevrolet Cobalt: клапан фазорегулятора VVT). КАТЕГОРИЧЕСКИ ЗАПРЕЩАЮ использовать слова: ремонт, своими руками, причин, диагностик, проблем, устранени, исправить, что значит.
2. new_seo_description: SEO-описание (СТРОГО от 120 до 160 символов, плотно). КАТЕГОРИЧЕСКИ ЗАПРЕЩАЮ использовать слова: ремонт, своими руками, причин, диагностик, проблем, устранени, исправить, что значит.
          `.trim();

          responseSchema = {
            type: "OBJECT",
            properties: {
              new_seo_title: { type: "STRING" },
              new_seo_description: { type: "STRING" }
            },
            required: ["new_seo_title", "new_seo_description"]
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
7. new_seo_title: SEO-заголовок (от 30 до 75 символов). ОБЯЗАТЕЛЬНО включи название конкретного узла, датчика или детали, с которым связана ошибка, чтобы заголовок был уникальным (например: Ошибка P0010 Chevrolet Cobalt: клапан фазорегулятора VVT). КАТЕГОРИЧЕСКИ ЗАПРЕЩАЮ использовать слова: ремонт, своими руками, причин, диагностик, проблем, устранени, исправить, что значит. ИСПОЛЬЗУЙ живой авто-сленг, если это уместно (например: троит, жрет масло, пинается АКПП, лямбда, ДМРВ, ЭБУ).
8. new_seo_description: SEO-описание (СТРОГО от 120 до 160 символов, плотно). КАТЕГОРИЧЕСКИ ЗАПРЕЩАЮ использовать слова: ремонт, своими руками, причин, диагностик, проблем, устранени, исправить, что значит.
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
              new_seo_title: { type: "STRING" },
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
        if (!enrichedData.new_seo_title || enrichedData.new_seo_title.length < 30 || enrichedData.new_seo_title.length > 75) {
          throw new Error(`Длина SEO-заголовка не в рамках 30-75 символов (Текущая: ${enrichedData.new_seo_title?.length || 0})`);
        }
        
        if (!enrichedData.new_seo_description || enrichedData.new_seo_description.length < 120 || enrichedData.new_seo_description.length > 160) {
          throw new Error(`Длина SEO-описания не в рамках 120-160 символов (Текущая: ${enrichedData.new_seo_description?.length || 0})`);
        }

        const forbiddenWords = ['ремонт', 'своими руками', 'причин', 'диагностик', 'проблем', 'устранени', 'исправить', 'что значит'];
        const titleLower = enrichedData.new_seo_title.toLowerCase();
        const descLower = enrichedData.new_seo_description.toLowerCase();
        
        const foundForbidden = forbiddenWords.find(w => titleLower.includes(w) || descLower.includes(w));
        if (foundForbidden) {
          throw new Error(`Найдено запрещенное шаблонное слово в SEO-тегах: "${foundForbidden}"`);
        }

        let updatedReport;

        if (enrichmentMode === 'full') {
          // --- ДОП. ВАЛИДАЦИЯ ДЛЯ FULL ---
          if (!enrichedData.new_full_analysis_markdown || enrichedData.new_full_analysis_markdown.length < 600) {
            throw new Error(`Слишком короткая статья (обрыв генерации? Длина: ${enrichedData.new_full_analysis_markdown?.length || 0})`);
          }

          if (/(?:^|\n)\s*\d+\.\s*$/.test(enrichedData.new_full_analysis_markdown)) {
              throw new Error(`Обнаружен обрыв текста (висячая цифра в конце markdown)`);
          }
          
          const newMarkdown = enrichReportText(enrichedData.new_full_analysis_markdown, report.brand, report.model, report.code, report.drivability);

          updatedReport = await prisma.diagnosticReport.update({
            where: { id: report.id },
            data: {
              seoTitle: enrichedData.new_seo_title,
              seoDescription: enrichedData.new_seo_description,
              tools_table_md: enrichedData.tools_table_md,
              oem_parts_table_md: enrichedData.oem_parts_table_md,
              pro_tips_md: enrichedData.pro_tips_md,
              driving_risks_md: enrichedData.driving_risks_md,
              diagnostic_data_md: enrichedData.diagnostic_data_md,
              full_analysis_markdown: newMarkdown, 
              seoScore: 95,
              seoRisk: 'SAFE',
              uniquenessScore: 100
            }
          });
        } else {
          // --- СОХРАНЕНИЕ ТОЛЬКО ДЛЯ SEO ---
          updatedReport = await prisma.diagnosticReport.update({
            where: { id: report.id },
            data: {
              seoTitle: enrichedData.new_seo_title,
              seoDescription: enrichedData.new_seo_description,
              seoScore: 95,
              seoRisk: 'SAFE' // Считаем безопасным (следующий скан найдет ошибки в markdown, если они есть)
            }
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
