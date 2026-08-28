/**
 * SEO Scanner Core Logic (Modernized for 2026 E-E-A-T Standards)
 * Оценивает контент карточки ошибки на предмет качества (Helpful Content),
 * E-E-A-T, уникальности мета-тегов и наличия штрафов (Thin Content, AI Stubs).
 */

export async function calculateSeoScore(report, prisma) {
  let score = 0;
  const details = [];
  const penaltyReasons = [];

  // Базовые тексты для анализа
  const summary = report.summary || '';
  const fullMarkdown = report.full_analysis_markdown || '';
  const diy = report.diy_instructions || '';
  const teaser = report.teaser_text || '';
  const stoTips = report.sto_protection_tips || '';

  const fullText = (summary + ' ' + teaser + ' ' + fullMarkdown + ' ' + stoTips + ' ' + diy).trim();
  const lowerText = fullText.toLowerCase();
  const textLength = fullText.length;

  // ==========================================
  // 1. Оценка полезности (Helpful Content) - max 40
  // ==========================================
  let structureScore = 0;
  let structureFound = [];
  
  if (lowerText.includes('симптом') || lowerText.includes('признак') || summary.length > 50) {
    structureScore += 15;
    structureFound.push('Симптомы/Описание');
  }
  if (lowerText.includes('причин') || lowerText.includes('из-за')) {
    structureScore += 10;
    structureFound.push('Причины');
  }
  if (diy.length > 50 || lowerText.includes('ремонт') || lowerText.includes('замен') || lowerText.includes('устранени')) {
    structureScore += 15;
    structureFound.push('Инструкция/Ремонт');
  }
  
  score += structureScore;
  if (structureScore >= 40) {
    details.push({ label: "Полнота ответа", score: 40, max: 40, status: "success", text: "Отлично. Присутствуют все смысловые блоки." });
  } else {
    details.push({ label: "Полнота ответа", score: structureScore, max: 40, status: "warning", text: `Найдены блоки: ${structureFound.join(', ')}. Желательно добавить симптомы, причины и ремонт.` });
  }

  // ==========================================
  // 2. Объем текста - max 10
  // ==========================================
  if (textLength >= 1500) {
    score += 10;
    details.push({ label: "Объем текста", score: 10, max: 10, status: "success", text: `Достаточный объем (${textLength} симв.).` });
  } else if (textLength >= 800) {
    score += 5;
    details.push({ label: "Объем текста", score: 5, max: 10, status: "warning", text: `Средний объем (${textLength} симв.).` });
  } else {
    details.push({ label: "Объем текста", score: 0, max: 10, status: "warning", text: `Короткий текст (${textLength} симв.).` });
  }

  // ==========================================
  // 3. E-E-A-T (Тематические термины) - max 30
  // ==========================================
  const eeatKeywords = [
    "сто", "своими руками", "мультиметр", "проверка", "замена", "двигатель", 
    "датчик", "эбу", "пины", "прозвонка", "кз", "короткое замыкание", "ремонт", 
    "диагностика", "сканер", "obd", "ошибка", "код", "проводка", "контакт"
  ];
  
  let foundTerms = new Set();
  
  for (const word of eeatKeywords) {
    const regex = new RegExp(`(^|[^а-яёa-z])(${word})([^а-яёa-z]|$)`, 'iu');
    if (regex.test(fullText)) {
      foundTerms.add(word);
    }
  }

  const eeatScore = Math.min(foundTerms.size * 3, 30);
  score += eeatScore;

  if (eeatScore >= 24) {
    details.push({ label: "E-E-A-T Термины", score: eeatScore, max: 30, status: "success", text: `Отличная лексика (${foundTerms.size} терминов).` });
  } else if (eeatScore > 0) {
    details.push({ label: "E-E-A-T Термины", score: eeatScore, max: 30, status: "warning", text: `Найдено ${foundTerms.size} проф. терминов. Желательно больше.` });
  } else {
    details.push({ label: "E-E-A-T Термины", score: 0, max: 30, status: "danger", text: "Отсутствует профессиональная лексика." });
  }

  // Сохраняем E-E-A-T Score как uniquenessScore для обратной совместимости базы данных (в %)
  const uniquenessScore = eeatScore > 0 ? Math.round((eeatScore / 30) * 100) : 0;

  // ==========================================
  // 4. Мета-теги - max 20
  // ==========================================
  const title = report.seoTitle || '';
  const desc = report.seoDescription || '';
  let metaScore = 0;
  let metaTips = [];

  if (title.length >= 40 && title.length <= 80) {
    metaScore += 10;
  } else {
    metaTips.push(`Длина Title (${title.length}) вне нормы`);
  }
  
  if (desc.length >= 110 && desc.length <= 160) {
    metaScore += 10;
  } else {
    metaTips.push(`Длина Desc (${desc.length}) вне нормы`);
  }

  score += metaScore;
  if (metaScore === 20) {
    details.push({ label: "Мета-теги", score: 20, max: 20, status: "success", text: "Идеальные длины мета-тегов." });
  } else {
    details.push({ label: "Мета-теги", score: metaScore, max: 20, status: "warning", text: metaTips.join('. ') });
  }

  // ==========================================
  // КРИТИЧЕСКИЕ ШТРАФЫ (DANGER)
  // ==========================================
  
  const isStub = 
    lowerText.includes('не зарегистрирован в официальных архивах') ||
    lowerText.includes('информация по данному коду отсутствует') ||
    lowerText.includes('к сожалению, я не могу найти информацию');
  
  if (isStub) {
    score -= 50;
    penaltyReasons.push("Фразы-отказы ИИ");
    details.push({ label: "Детектор ИИ", score: -50, max: 0, status: "danger", text: "КРИТИЧНО! Найдены заглушки ИИ." });
  } else {
    details.push({ label: "Детектор ИИ", score: 0, max: 0, status: "success", text: "Шаблонные отказы ИИ не обнаружены." });
  }

  const brandName = (report.brand || '').toLowerCase().replace(/[^a-zа-я0-9]/g, '');
  const errorCode = (report.code || '').toLowerCase().replace(/[^a-zа-я0-9]/g, '');
  const titleClean = title.toLowerCase().replace(/[^a-zа-я0-9]/g, '');
  
  if (!titleClean.includes(brandName) || !titleClean.includes(errorCode)) {
    score -= 30;
    penaltyReasons.push("Нет ключа в Title");
    details.push({ label: "Ключи в Title", score: -30, max: 0, status: "danger", text: "КРИТИЧНО! В Title отсутствует марка или код ошибки." });
  }

  if (textLength < 500) {
    score -= 40;
    penaltyReasons.push("Thin Content (<500 симв)");
    details.push({ label: "Thin Content", score: -40, max: 0, status: "danger", text: "КРИТИЧНО! Текст слишком короткий." });
  }

  if (prisma) {
    try {
      const otherReports = await prisma.diagnosticReport.findMany({
        where: { 
          brand: report.brand,
          id: { not: report.id },
          seoTitle: report.seoTitle
        },
        select: { id: true }
      });

      if (otherReports.length > 0 && report.seoTitle) {
        score -= 50;
        penaltyReasons.push("Дубликат Title у этой же марки");
        details.push({ label: "Дубликаты Title", score: -50, max: 0, status: "danger", text: "КРИТИЧНО! Найден точный дубликат Title." });
      } else {
        details.push({ label: "Дубликаты Title", score: 0, max: 0, status: "success", text: "Title уникален." });
      }
    } catch (e) {
      console.error("[SEO Scanner] Ошибка проверки дубликатов мета-тегов:", e);
    }
  }

  score = Math.max(0, Math.min(100, score));

  let risk = 'SAFE';
  if (penaltyReasons.length > 0) {
    risk = 'DANGER';
  } else if (score >= 80) {
    risk = 'SAFE';
  } else if (score >= 60) {
    risk = 'WARNING';
  } else {
    risk = 'DANGER';
  }
  
  const penaltyString = penaltyReasons.join(' | ');

  // Возвращаем penaltyString в объекте
  return { score, risk, uniquenessScore, details, penaltyString };
}
