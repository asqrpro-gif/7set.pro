import { enrichReportText } from './lib/seoEnricher.js';

const text = "В этой машине сломался катализатор. Также барахлит ЭБУ и лямбда-зонд.";
const result = enrichReportText(text, 'Toyota', 'P0420', 'drive');
console.log(result);
