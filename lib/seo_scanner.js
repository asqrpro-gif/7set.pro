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

  // 2. Детектор заглушек ИИ (max 15)
  const isStub = 
    fullText.includes('не зарегистрирован в официальных архивах') ||
    fullText.includes('информация по данному коду отсутствует') ||
    fullText.includes('к сожалению, я не могу найти информацию');
  
  if (!isStub) {
    score += 15;
    details.push({ label: "Заглушки ИИ", score: 15, max: 15, status: "success", text: "Шаблонные отказы ИИ не обнаружены." });
  } else {
    details.push({ label: "Заглушки ИИ", score: 0, max: 15, status: "danger", text: "Обнаружены стоп-фразы отказа (ИИ не нашел информацию). Текст бесполезен." });
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

  // 4. Структура Markdown (max 10)
  let mdScore = 0;
  let mdFound = [];
  if (fullText.includes('## ') || fullText.includes('### ')) {
    mdScore += 5;
    mdFound.push('заголовки');
  }
  if (fullText.includes('- ') || fullText.includes('* ')) {
    mdScore += 5;
    mdFound.push('списки');
  }
  score += mdScore;
  if (mdScore === 10) {
    details.push({ label: "Структура текста", score: 10, max: 10, status: "success", text: "Используются заголовки и списки (Markdown)." });
  } else {
    details.push({ label: "Структура текста", score: mdScore, max: 10, status: "warning", text: `Структура не идеальна (найдено: ${mdFound.join(', ') || 'ничего'}). Используйте ## Заголовки и - Списки.` });
  }

  // 5. Мета-теги (max 15)
  const title = report.seoTitle || '';
  const desc = report.seoDescription || '';
  let metaScore = 0;
  let metaTips = [];

  // Длина title
  if (title.length >= 40 && title.length <= 80) {
    metaScore += 5;
  } else {
    metaTips.push(`Длина Title (${title.length}) вне нормы (40-80)`);
  }
  
  // Длина description
  if (desc.length >= 110 && desc.length <= 160) {
    metaScore += 5;
  } else {
    metaTips.push(`Длина Desc (${desc.length}) вне нормы (110-160)`);
  }

  // Обязательное наличие кода и марки в Title
  const brandName = (report.brand || '').toLowerCase().replace(/[^a-zа-я0-9]/g, '');
  const errorCode = (report.code || '').toLowerCase().replace(/[^a-zа-я0-9]/g, '');
  const titleClean = title.toLowerCase().replace(/[^a-zа-я0-9]/g, '');
  
  if (titleClean.includes(brandName) && titleClean.includes(errorCode)) {
    metaScore += 5;
    score += metaScore;
    details.push({ label: "Мета-теги", score: metaScore, max: 15, status: metaScore === 15 ? "success" : "warning", text: metaScore === 15 ? "Идеальные мета-теги." : metaTips.join('. ') });
  } else {
    // Штраф, если в title нет хотя бы кода или марки
    score -= 20;
    details.push({ label: "Мета-теги", score: -20, max: 15, status: "danger", text: "ШТРАФ! В Title отсутствует марка или код ошибки." });
  }

  // 6. Детектор Дубликатов (Уникальность) (max 25)
  let uniquenessScore = 100; // Процент уникальности
  let uPoints = 0; // Баллы за уникальность
  
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
        uniquenessScore = 0;
        uPoints = 0;
        details.push({ label: "Уникальность (Дубликаты)", score: 0, max: 25, status: "danger", text: "Найден точный дубликат мета-тегов (Title или Description) у другой карточки этой марки (0% уникальности)." });
      } else {
        // Начисляем баллы с учетом специфики авто-текстов
        if (uniquenessScore >= 30) {
          uPoints = 25;
          details.push({ label: "Уникальность текста", score: uPoints, max: 25, status: "success", text: `Отлично! Текст уникален на ${uniquenessScore}%.` });
        } else if (uniquenessScore >= 10) {
          uPoints = 20;
          details.push({ label: "Уникальность текста", score: uPoints, max: 25, status: "warning", text: `Уникальность ${uniquenessScore}%. Идеальная норма для технических текстов про авто.` });
        } else if (uniquenessScore >= 5) {
          uPoints = 10;
          details.push({ label: "Уникальность текста", score: uPoints, max: 25, status: "warning", text: `Уникальность ${uniquenessScore}%. Низковато, но терпимо.` });
        } else {
          uPoints = 0;
          details.push({ label: "Уникальность текста", score: uPoints, max: 25, status: "danger", text: `КРИТИЧНО! Уникальность всего ${uniquenessScore}%. Текст почти 100% шаблон.` });
        }
        score += uPoints;

      }
    } catch (e) {
      console.error("[SEO Scanner] Ошибка проверки дубликатов:", e);
      details.push({ label: "Уникальность", score: 0, max: 25, status: "warning", text: "Проверка на дубликаты не выполнена из-за ошибки." });
    }
  } else {
     score += 25;
     details.push({ label: "Уникальность", score: 25, max: 25, status: "success", text: "Пропущено (нет Prisma)" });
  }

  // Защита от отрицательных баллов и превышения 100
  score = Math.max(0, Math.min(100, score));

  // Определение статуса (Risk Level)
  let risk = 'DANGER';
  // Принудительно DANGER если уникальность < 5%
  if (uniquenessScore < 5) {
    risk = 'DANGER';
  } else if (score >= 80) {
    risk = 'SAFE';
  } else if (score >= 50) {
    risk = 'WARNING';
  }

  return { score, risk, uniquenessScore, details };
}
