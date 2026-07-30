import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serverFile = path.join(__dirname, 'server.js');
let content = fs.readFileSync(serverFile, 'utf8');

// 1. Add app.set('view engine', 'ejs');
const appInitRegex = /const app = express\(\);\nconst PORT = process\.env\.PORT \|\| 3005;/;
if (!content.includes("app.set('view engine', 'ejs');")) {
  content = content.replace(appInitRegex, `import path from 'path';\nimport { fileURLToPath } from 'url';\n\nconst __filename = fileURLToPath(import.meta.url);\nconst __dirname = path.dirname(__filename);\n\nconst app = express();\nconst PORT = process.env.PORT || 3005;\n\napp.set('view engine', 'ejs');\napp.set('views', path.join(__dirname, 'views'));`);
}

// 2. Replace res.send in /diagnostic route
const resSendStart = content.indexOf('    res.send(`\\n      <!DOCTYPE html>');
// Actually, let's use a more robust regex or indexOf
const startStr = '    res.send(`\\n      <!DOCTYPE html>';
let startIndex = content.indexOf(startStr);
if (startIndex === -1) {
    startIndex = content.indexOf('    res.send(`\\n      <!DOCTYPE html>'); // wait, backticks inside string literal 
}
// Alternative way to find bounds
const targetStartLine = '    res.send(`';
const targetStartHtml = '      <!DOCTYPE html>';
let startIdx = content.indexOf(targetStartLine);
while (startIdx !== -1) {
    if (content.substring(startIdx, startIdx + 100).includes(targetStartHtml)) {
        break;
    }
    startIdx = content.indexOf(targetStartLine, startIdx + 1);
}

const endIdx = content.indexOf('    `);\\n\\n  } catch (error) {', startIdx);
let realEndIdx = content.indexOf('  } catch (error) {', startIdx);
let replaceEndIdx = content.lastIndexOf('    `);', realEndIdx) + 7;

if (startIdx !== -1 && replaceEndIdx !== -1) {
  const replaceStr = `    res.render('diagnostic', {
      seoTitle,
      seoDescription,
      pageUrl,
      ogImage,
      schemaHtml,
      brand,
      model,
      displayBrand,
      displayModel,
      displayCode,
      isUnsupportedReport,
      severityClass: severityLevel === 'critical' || severityLevel === 'high' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' : severityLevel === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
      severityText: severity.text.replace(/<[^>]*>?/gm, ''),
      drivabilityDataClass: drivabilityData.class.replace('bg-green-100', 'bg-green-100 dark:bg-green-900/30').replace('text-green-800', 'text-green-800 dark:text-green-300').replace('bg-orange-100', 'bg-orange-100 dark:bg-orange-900/30').replace('text-orange-800', 'text-orange-800 dark:text-orange-300').replace('bg-red-100', 'bg-red-100 dark:bg-red-900/30').replace('text-red-800', 'text-red-800 dark:text-red-300'),
      drivabilityData,
      summaryText,
      teaserText,
      reportId: report ? report.id : '',
      isUnlockedForUser,
      fullAnalysisHtml,
      scamProtectionHtml,
      pricePartsHtml: (report.price_parts && report.price_parts !== 'Уточняется' ? report.price_parts.replace(/\\$/g, '').trim() + ' $' : 'Уточняется').replace(/\\\\n/g, '<br>'),
      priceLaborHtml: (report.price_labor && report.price_labor !== 'Уточняется' ? report.price_labor.replace(/\\$/g, '').trim() + ' $' : 'Уточняется').replace(/\\\\n/g, '<br>'),
      report,
      difficultyScoreHtml: (() => { const m = String(report && report.diy_difficulty_score ? report.diy_difficulty_score : '3/5').match(/(\\d+)\\s*(?:[\\/|из]\\s*(\\d+))?/i); return m ? \`\${m[1]} из \${m[2] || '5'}\` : '3 из 5'; })(),
      diyInstructionsHtml,
      relatedReportsHtml
    });`;
  content = content.substring(0, startIdx) + replaceStr + content.substring(replaceEndIdx);
} else {
  console.log("Could not find res.send block bounds");
  process.exit(1);
}

fs.writeFileSync(serverFile, content, 'utf8');
console.log("Refactoring diagnostic route done.");
