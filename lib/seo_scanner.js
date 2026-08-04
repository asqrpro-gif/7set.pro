/**
 * SEO Scanner Core Logic
 * Оценивает контент карточки ошибки на предмет качества (Thin Content),
 * SEO-оптимизации, наличия Rich Snippets и LSI слов.
 * А также проверяет текст на дубликаты (Similarity Check).
 */

function getBigrams(string) {
    const s = string.toLowerCase();
    const v = new Array(Math.max(0, s.length - 1));
    for (let i = 0; i < v.length; i++) {
        v[i] = s.slice(i, i + 2);
    }
    return v;
}

function stringSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 1;
    const pairs1 = getBigrams(str1);
    const pairs2 = getBigrams(str2);
    if (pairs1.length === 0 || pairs2.length === 0) return 0;
    
    let intersection = 0;
    for (let i = 0; i < pairs1.length; i++) {
        for (let j = 0; j < pairs2.length; j++) {
            if (pairs1[i] === pairs2[j]) {
                intersection++;
                pairs2[j] = ''; // to avoid counting same bigram again
                break;
            }
        }
    }
    return (2.0 * intersection) / (pairs1.length + pairs2.length);
}

export async function calculateSeoScore(report, prisma) {
  let score = 0;
  const details = [];

  // 1. Объем текста (max 20)
  // Берем весь основной текст
  const fullText = (
    (report.summary || '') + ' ' + 
    (report.teaser_text || '') + ' ' + 
    (report.full_analysis_markdown || '') + ' ' + 
    (report.sto_protection_tips || '') + ' ' + 
    (report.diy_instructions || '')
  ).trim();

  const textLength = fullText.length;
  if (textLength >= 2500) {
    score += 20;
    details.push({ label: "Объем текста", score: 20, max: 20, status: "success", text: `Отлично, текст достаточно объемный (${textLength} симв.)` });
  } else if (textLength >= 1500) {
    score += 10;
    details.push({ label: "Объем текста", score: 10, max: 20, status: "warning", text: `Средний объем (${textLength} симв.). Желательно более 2500.` });
  } else {
    details.push({ label: "Объем текста", score: 0, max: 20, status: "danger", text: `Мало текста (${textLength} симв.). Риск пессимизации (Thin Content).` });
  }

  // 2. Детектор заглушек ИИ (max 20)
  const isStub = 
    fullText.includes('указывает на проблему в соответствующем электронном контуре') ||
    fullText.includes('сбой по коду') ||
    fullText.includes('не зарегистрирован в официальных архивах');
  
  if (!isStub) {
    score += 20;
    details.push({ label: "Заглушки ИИ", score: 20, max: 20, status: "success", text: "Шаблонные фразы ИИ не обнаружены." });
  } else {
    details.push({ label: "Заглушки ИИ", score: 0, max: 20, status: "danger", text: "Обнаружены стоп-фразы («сбой по коду», «указывает на проблему...»). Текст выглядит шаблонно." });
  }

  // 3. LSI-плотность (max 15)
  const lsiKeywords = ["сто", "своими руками", "мультиметр", "проверка", "замена", "двигатель", "датчик"];
  let lsiScore = 0;
  const lowerText = fullText.toLowerCase();
  const foundWords = [];

  for (const word of lsiKeywords) {
    if (lowerText.includes(word)) {
      lsiScore += 3;
      foundWords.push(word);
    }
  }
  
  const finalLsiScore = Math.min(lsiScore, 15);
  score += finalLsiScore;
  
  if (finalLsiScore === 15) {
    details.push({ label: "LSI-слова", score: 15, max: 15, status: "success", text: `Отличная плотность LSI (${foundWords.join(', ')}).` });
  } else if (finalLsiScore > 0) {
    details.push({ label: "LSI-слова", score: finalLsiScore, max: 15, status: "warning", text: `Найдено ${foundWords.length} LSI слов. Желательно добавить: СТО, своими руками, проверка, замена.` });
  } else {
    details.push({ label: "LSI-слова", score: 0, max: 15, status: "danger", text: "LSI слова не найдены. Текст недостаточно экспертный." });
  }

  // 4. Структура Markdown (max 15)
  let mdScore = 0;
  let mdFound = [];
  if (fullText.includes('## ') || fullText.includes('### ')) {
    mdScore += 10;
    mdFound.push('заголовки');
  }
  if (fullText.includes('- ') || fullText.includes('* ')) {
    mdScore += 5;
    mdFound.push('списки');
  }
  score += mdScore;
  if (mdScore === 15) {
    details.push({ label: "Структура текста", score: 15, max: 15, status: "success", text: "Используются заголовки и списки (Markdown)." });
  } else {
    details.push({ label: "Структура текста", score: mdScore, max: 15, status: "warning", text: `Структура не идеальна (найдено: ${mdFound.join(', ') || 'ничего'}). Используйте ## Заголовки и - Списки.` });
  }

  // 5. Мета-теги (max 15)
  const title = report.seoTitle || '';
  const desc = report.seoDescription || '';
  let metaScore = 0;
  let metaTips = [];

  // Длина title
  if (title.length >= 40 && title.length <= 70) {
    metaScore += 5;
  } else {
    metaTips.push(`Длина Title (${title.length}) вне нормы (40-70)`);
  }
  
  // Длина description
  if (desc.length >= 120 && desc.length <= 160) {
    metaScore += 5;
  } else {
    metaTips.push(`Длина Desc (${desc.length}) вне нормы (120-160)`);
  }

  // Обязательное наличие кода и марки в Title
  const brandName = (report.brand || '').toLowerCase();
  const errorCode = (report.code || '').toLowerCase();
  
  if (title.toLowerCase().includes(brandName) && title.toLowerCase().includes(errorCode)) {
    metaScore += 5;
    score += metaScore;
    details.push({ label: "Мета-теги", score: metaScore, max: 15, status: metaScore === 15 ? "success" : "warning", text: metaScore === 15 ? "Идеальные мета-теги." : metaTips.join('. ') });
  } else {
    // Штраф, если в title нет хотя бы кода или марки
    score -= 20;
    details.push({ label: "Мета-теги", score: -20, max: 15, status: "danger", text: "ШТРАФ! В Title отсутствует марка или код ошибки." });
  }

  // 6. Rich Snippets / Полнота (max 15)
  let richScore = 0;
  let missingRich = [];
  if (report.diy_difficulty_score && report.diy_difficulty_score.trim() !== '') {
    richScore += 5;
  } else {
    missingRich.push('Сложность ремонта');
  }
  if (report.price_parts && report.price_parts.trim() !== '' && report.price_parts !== 'Уточняется') {
    richScore += 5;
  } else {
    missingRich.push('Цены');
  }
  if (report.schema_faq && report.schema_faq.trim() !== '') {
    richScore += 5;
  } else {
    missingRich.push('FAQ');
  }
  const finalRichScore = Math.min(richScore, 15);
  score += finalRichScore;
  
  if (finalRichScore === 15) {
    details.push({ label: "Rich Snippets", score: 15, max: 15, status: "success", text: "Все микроразметки заполнены (Цены, Сложность, FAQ)." });
  } else {
    details.push({ label: "Rich Snippets", score: finalRichScore, max: 15, status: "warning", text: `Отсутствуют данные: ${missingRich.join(', ')}` });
  }

  // 7. Детектор Дубликатов (Similarity Check)
  let uniquenessScore = 100;
  
  if (prisma) {
    try {
      // Ищем другие карточки этой же марки
      const otherReports = await prisma.diagnosticReport.findMany({
        where: { 
          brand: report.brand,
          id: { not: report.id } // Исключаем текущую карточку
        },
        select: {
          id: true,
          seoTitle: true,
          seoDescription: true,
          summary: true,
          full_analysis_markdown: true
        }
      });

      let maxSimilarity = 0;
      let exactMetaDuplicate = false;

      for (const other of otherReports) {
        // Абсолютные дубли: проверка точного совпадения Title или Description
        if (
          (report.seoTitle && other.seoTitle && report.seoTitle.toLowerCase() === other.seoTitle.toLowerCase()) ||
          (report.seoDescription && other.seoDescription && report.seoDescription.toLowerCase() === other.seoDescription.toLowerCase())
        ) {
          exactMetaDuplicate = true;
          break; // Сразу прерываем, это критично
        }

        // Смысловые дубли (Текст)
        const otherText = ((other.summary || '') + ' ' + (other.full_analysis_markdown || '')).trim();
        const currentTextToCompare = ((report.summary || '') + ' ' + (report.full_analysis_markdown || '')).trim();
        
        const similarity = stringSimilarity(currentTextToCompare, otherText);
        if (similarity > maxSimilarity) {
          maxSimilarity = similarity;
        }
      }

      uniquenessScore = Math.max(0, Math.round((1 - maxSimilarity) * 100));

      if (exactMetaDuplicate) {
        score -= 50;
        uniquenessScore = 0; // Сбрасываем уникальность в 0 для наглядности
        details.push({ label: "Уникальность (Дубликаты)", score: -50, max: 0, status: "danger", text: "ШТРАФ! Найден точный дубликат мета-тегов (Title или Description) у другой карточки этой марки." });
      } else {
        if (maxSimilarity > 0.75) { // < 25% уникальности
          score -= 40;
          details.push({ label: "Уникальность текста", score: -40, max: 0, status: "danger", text: `КРИТИЧНО! Текст похож на другую карточку на ${Math.round(maxSimilarity * 100)}%. Слишком много шаблонов.` });
        } else if (maxSimilarity >= 0.50) { // 26% - 50% уникальности
          score -= 15;
          details.push({ label: "Уникальность текста", score: -15, max: 0, status: "warning", text: `ПРЕДУПРЕЖДЕНИЕ. Текст похож на другую карточку на ${Math.round(maxSimilarity * 100)}%. Желательно переписать.` });
        } else {
          details.push({ label: "Уникальность текста", score: 0, max: 0, status: "success", text: `Отлично! Максимальная схожесть с другими текстами всего ${Math.round(maxSimilarity * 100)}% (Уникальность ${uniquenessScore}%).` });
        }
      }
    } catch (e) {
      console.error("[SEO Scanner] Ошибка проверки дубликатов:", e);
      details.push({ label: "Уникальность", score: 0, max: 0, status: "warning", text: "Проверка на дубликаты не выполнена из-за ошибки." });
    }
  }

  // Защита от отрицательных баллов и превышения 100
  score = Math.max(0, Math.min(100, score));

  // Определение статуса (Risk Level)
  let risk = 'DANGER';
  // Принудительно DANGER если точный дубль мета-тегов или похожесть > 75%
  if (details.some(d => d.label.includes("Уникальность") && d.score <= -40)) {
    risk = 'DANGER';
  } else if (score >= 80) {
    risk = 'SAFE';
  } else if (score >= 50) {
    risk = 'WARNING';
  }

  return { score, risk, uniquenessScore, details };
}
