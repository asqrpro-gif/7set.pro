const fs = require('fs'); 
const errors = ['P0171', 'P0172', 'P0420', 'P0001', 'P0002', 'P0003', 'P0010', 'P0335', 'P1125', 'P1210', 'U0100']; 
const data = JSON.parse(fs.readFileSync('codes.json')); 
errors.forEach(c => { 
  const f = data.find(x => x.Code === c); 
  if(f) console.log(c + ':', f.Description_ru || f.Description); 
})
