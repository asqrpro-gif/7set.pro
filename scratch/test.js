const textToScan = `Код **P0202** означает: **Injector Circuit Malfunction\n* Cylinder 2**.`;
const textWithoutValidBold = textToScan.replace(/\*\*.*?\*\*/g, '');
console.log('Original:', textToScan);
console.log('Without valid bold:', textWithoutValidBold);
console.log('Includes **:', textWithoutValidBold.includes('**'));
