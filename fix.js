const fs = require('fs');

const path = 'c:/laragon/www/7set.pro/views/diagnostic.ejs';
let content = fs.readFileSync(path, 'utf8');

const lines = content.split('\n');
let newLines = [];
let i = 0;
while(i < lines.length) {
    if (lines[i].includes('Полный разбор причины')) {
        newLines.push(lines[i]);
        // Stop skipping when we hit Финансовый прогноз
        let j = i + 1;
        while(j < lines.length && !lines[j].includes('Финансовый прогноз')) {
            j++;
        }
        let k = j;
        while(k > i && !lines[k].includes('<details')) {
            k--;
        }
        
        newLines.push('              </summary>');
        newLines.push('              <div class="p-5 border-t border-gray-50 dark:border-slate-700 bg-white dark:bg-slate-800 prose prose-blue prose-lg dark:prose-invert max-w-none text-gray-800 dark:text-gray-200">');
        newLines.push('                <%- fullAnalysisHtml %>');
        newLines.push('              </div>');
        newLines.push('            </details>');
        newLines.push('');
        newLines.push('            <% if (typeof drivingRisksHtml !== \'undefined\' && drivingRisksHtml) { %>');
        newLines.push('            <details class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm mb-4 overflow-hidden border-l-4 border-red-500 border-gray-50 dark:border-slate-700" open>');
        newLines.push('              <summary class="flex items-center gap-3 font-semibold p-5 cursor-pointer hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors list-none outline-none">');
        newLines.push('                <h2 class="text-base md:text-lg font-semibold m-0 flex items-center gap-3 w-full font-inherit text-inherit text-red-700 dark:text-red-400">');
        newLines.push('                  <i data-lucide="alert-triangle" class="w-5 h-5 shrink-0 order-1"></i> <span class="order-2">ПДД и последствия эксплуатации</span></h2>');
        newLines.push('              </summary>');
        newLines.push('              <div class="p-5 border-t border-gray-50 dark:border-slate-700 bg-red-50/30 dark:bg-red-900/5 prose prose-blue prose-lg dark:prose-invert max-w-none text-gray-800 dark:text-gray-200">');
        newLines.push('                <%- drivingRisksHtml %>');
        newLines.push('              </div>');
        newLines.push('            </details>');
        newLines.push('            <% } %>');
        newLines.push('');
        newLines.push('            <% if (typeof diagnosticDataHtml !== \'undefined\' && diagnosticDataHtml) { %>');
        newLines.push('            <details class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm mb-4 overflow-hidden border border-gray-50 dark:border-slate-700" open>');
        newLines.push('              <summary class="flex items-center gap-3 font-semibold p-5 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors list-none outline-none">');
        newLines.push('                <h2 class="text-base md:text-lg font-semibold m-0 flex items-center gap-3 w-full font-inherit text-inherit text-gray-900 dark:text-white">');
        newLines.push('                  <i data-lucide="cpu" class="w-5 h-5 text-indigo-500 shrink-0 order-1"></i> <span class="order-2">Спецификации для диагноста</span></h2>');
        newLines.push('              </summary>');
        newLines.push('              <div class="p-5 border-t border-gray-50 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 prose prose-blue prose-lg dark:prose-invert max-w-none text-gray-800 dark:text-gray-200 font-mono text-sm">');
        newLines.push('                <%- diagnosticDataHtml %>');
        newLines.push('              </div>');
        newLines.push('            </details>');
        newLines.push('            <% } %>');
        newLines.push('');
        newLines.push('            <% if (typeof proTipsHtml !== \'undefined\' && proTipsHtml) { %>');
        newLines.push('            <details class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm mb-4 overflow-hidden border border-gray-50 dark:border-slate-700" open>');
        newLines.push('              <summary class="flex items-center gap-3 font-semibold p-5 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors list-none outline-none">');
        newLines.push('                <h2 class="text-base md:text-lg font-semibold m-0 flex items-center gap-3 w-full font-inherit text-inherit text-gray-900 dark:text-white">');
        newLines.push('                  <i data-lucide="lightbulb" class="w-5 h-5 text-yellow-500 shrink-0 order-1"></i> <span class="order-2">Советы эксперта по <%= displayBrand %></span></h2>');
        newLines.push('              </summary>');
        newLines.push('              <div class="p-5 border-t border-gray-50 dark:border-slate-700 bg-white dark:bg-slate-800 prose prose-blue prose-lg dark:prose-invert max-w-none text-gray-800 dark:text-gray-200">');
        newLines.push('                <%- proTipsHtml %>');
        newLines.push('              </div>');
        newLines.push('            </details>');
        newLines.push('            <% } %>');
        newLines.push('');
        newLines.push('            <details class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm mb-4 overflow-hidden border border-gray-50 dark:border-slate-700" open>');
        newLines.push('              <summary class="flex items-center gap-3 font-semibold p-5 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors list-none outline-none">');
        newLines.push('                <h2 class="text-base md:text-lg font-semibold m-0 flex items-center gap-3 w-full font-inherit text-inherit text-gray-900 dark:text-white">');
        newLines.push('                  <i data-lucide="shield-alert" class="w-5 h-5 text-red-500 shrink-0 order-1"></i> <span class="order-2">Защита от обмана на СТО</span></h2>');
        newLines.push('              </summary>');
        newLines.push('              <div class="p-5 border-t border-gray-50 dark:border-slate-700 bg-white dark:bg-slate-800 prose prose-blue prose-lg dark:prose-invert max-w-none text-gray-800 dark:text-gray-200">');
        newLines.push('                <%- scamProtectionHtml %>');
        newLines.push('              </div>');
        newLines.push('            </details>');
        
        i = k;
    } else {
        newLines.push(lines[i]);
        i++;
    }
}

fs.writeFileSync(path, newLines.join('\n'), 'utf8');
console.log('Fixed diagnostic.ejs');
