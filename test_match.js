const { enrichReportText } = require('./lib/seoEnricher.js');
// Need to use dynamic import for ES modules
(async () => {
    const { enrichReportText } = await import('./lib/seoEnricher.js');
    const text = `### Что означает ошибка P0024?\nКод P0024 расшифровывается как **«Camshaft Position 'B' - Timing Over-Advanced or System Performance (Bank 2)»**. На автомобилях Toyota Camry (особенно с двигателями V6, такими как 3.5-литровый 2GR-FE) это означает, что блок управления двигателем (ECU) зафиксировал слишком раннее положение выпускного («B») распределительного вала на головке блока цилиндров №2 (Bank 2 — со стороны радиатора).\n\n### Возможные причины неисправности:\n1. **Проблемы с моторным маслом:** Низкий уровень масла, потеря его вязкости или сильное загрязнение. Система VVT-i крайне чувствительна к давлению и чистоте масла.`;
    const enriched = enrichReportText(text, 'toyota', 'camry', 'P0024', 'medium');
    console.log(enriched);
})();
