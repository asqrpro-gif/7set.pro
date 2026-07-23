const { execSync } = require('child_process');
const fs = require('fs');

try {
  const output = execSync('git log -p -n 2').toString();
  fs.writeFileSync('git-log.txt', output);
  console.log('Success');
} catch (e) {
  console.error(e.toString());
}
