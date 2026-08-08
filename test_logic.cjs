const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const allReports = await prisma.diagnosticReport.findMany({
        select: { id: true, seoTitle: true, seoDescription: true, brand: true, model: true, code: true }
    });

    // New Title Logic
    let titleMap = {};
    let descMap = {};

    allReports.forEach(r => {
        if (!r.seoTitle || !r.seoDescription) return;

        let titleTpl = r.seoTitle.toLowerCase();
        let descTpl = r.seoDescription.toLowerCase();

        const codeLower = r.code.toLowerCase();
        const brandLower = r.brand.toLowerCase();
        const modelLower = r.model.toLowerCase();

        titleTpl = titleTpl.replace(new RegExp(codeLower, 'g'), '[code]');
        titleTpl = titleTpl.replace(new RegExp(brandLower, 'g'), '[brand]');
        titleTpl = titleTpl.replace(new RegExp(modelLower, 'g'), '[model]');
        titleTpl = titleTpl.replace(/\s+/g, ' ').trim();

        descTpl = descTpl.replace(new RegExp(codeLower, 'g'), '[code]');
        descTpl = descTpl.replace(new RegExp(brandLower, 'g'), '[brand]');
        descTpl = descTpl.replace(new RegExp(modelLower, 'g'), '[model]');
        descTpl = descTpl.replace(/\s+/g, ' ').trim();

        if (!titleMap[titleTpl]) titleMap[titleTpl] = [];
        titleMap[titleTpl].push(r);

        if (!descMap[descTpl]) descMap[descTpl] = [];
        descMap[descTpl].push(r);
    });

    for (const tpl in titleMap) {
        if (titleMap[tpl].length > 1) {
            console.log(`Duplicate Title Template (${titleMap[tpl].length}):`, tpl);
        }
    }
    for (const tpl in descMap) {
        if (descMap[tpl].length > 1) {
            console.log(`Duplicate Desc Template (${descMap[tpl].length}):`, tpl);
        }
    }
}
main();
