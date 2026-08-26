const fs = require('fs');

const path = 'c:\\laragon\\www\\7set.pro\\views\\diagnostic.ejs';
let content = fs.readFileSync(path, 'utf8');

const brokenPart = `<div class="bg-orange-50 dark:bg-orange-900/20 border-l-4 border-orange-500 p-4 mb-4 rounded-r-xl">
                  <strong class="text-orange-600 dark:text-orange-400 flex items-center gap-2 mb-2 text-sm">
                    <i data-lucide="alert-triangle" class="w-4 h-4"></i> Внимание!
              class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm mb-4 overflow-hidden border border-gray-50 dark:border-slate-700"
              open>
              <summary
                class="flex items-center gap-3 font-semibold p-5 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors list-none outline-none">
                <h2
                  class="text-base md:text-lg font-semibold m-0 flex items-center gap-3 w-full font-inherit text-inherit text-gray-900 dark:text-white">
                  <i data-lucide="scale" class="w-5 h-5 <%= severityClass.includes('red') ? 'text-red-500' : (severityClass.includes('yellow') ? 'text-yellow-500' : 'text-green-500') %> shrink-0 order-1"></i> <span class="order-2">ПДД и полезные ресурсы</span></h2>
              </summary>`;

const fixedPart = `<div class="bg-orange-50 dark:bg-orange-900/20 border-l-4 border-orange-500 p-4 mb-4 rounded-r-xl">
                  <strong class="text-orange-600 dark:text-orange-400 flex items-center gap-2 mb-2 text-sm">
                    <i data-lucide="alert-triangle" class="w-4 h-4"></i> Внимание!
                  </strong>
                  <p class="text-orange-900 dark:text-orange-200 text-sm md:text-base m-0 leading-relaxed">
                    Автомобиль — это механизм повышенной опасности. Любое неквалифицированное вмешательство может
                    привести к серьезным поломкам (вплоть до "окирпичивания" электронных блоков) или создать угрозу ДТП.
                    Данная инструкция носит исключительно ознакомительный характер и не является прямым руководством к
                    действию. Всю ответственность за последствия самостоятельного ремонта вы берете на себя.
                  </p>
                </div>
                <div
                  class="prose prose-blue prose-lg dark:prose-invert max-w-none text-gray-800 dark:text-gray-200 mt-4">
                  <%- diyInstructionsHtml %></div>
              </div>
            </details>
            
            <% if (typeof seoFooterHtml !== 'undefined' && seoFooterHtml) { %>
            <details
              class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm mb-4 overflow-hidden border border-gray-50 dark:border-slate-700"
              open>
              <summary
                class="flex items-center gap-3 font-semibold p-5 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors list-none outline-none">
                <h2
                  class="text-base md:text-lg font-semibold m-0 flex items-center gap-3 w-full font-inherit text-inherit text-gray-900 dark:text-white">
                  <i data-lucide="link" class="w-5 h-5 text-blue-500 shrink-0 order-1"></i> <span class="order-2">Полезные ссылки</span></h2>
              </summary>`;

if (content.includes(brokenPart)) {
    content = content.replace(brokenPart, fixedPart);
    fs.writeFileSync(path, content, 'utf8');
    console.log("File fixed!");
} else {
    console.log("Broken part not found. Maybe line endings?");
    // Try to normalize line endings and check again
    const normalizedContent = content.replace(/\\r\\n/g, '\\n');
    const normalizedBrokenPart = brokenPart.replace(/\\r\\n/g, '\\n');
    if (normalizedContent.includes(normalizedBrokenPart)) {
        content = normalizedContent.replace(normalizedBrokenPart, fixedPart.replace(/\\r\\n/g, '\\n'));
        fs.writeFileSync(path, content, 'utf8');
        console.log("File fixed after CRLF normalization!");
    } else {
        console.log("Could not find broken part.");
    }
}
