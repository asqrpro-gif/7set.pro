const fs = require('fs');
const path = require('path');
const filesToDelete = [
  'fix.js',
  'scratch_test.js',
  'views/admin_bad_cards.ejs',
  'views/admin_links_ops.ejs',
  'scripts/clean_test_cards.js',
  'scripts/reset_seo.js',
  'lib/db.js',
  'public/style — копия.css'
];

filesToDelete.forEach(file => {
  const filePath = path.join(__dirname, file);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`Deleted: ${file}`);
    } else {
      console.log(`Not found: ${file}`);
    }
  } catch(e) {
    console.error(`Error deleting ${file}:`, e.message);
  }
});

// Also self-destruct
try {
  fs.unlinkSync(__filename);
} catch(e){}
