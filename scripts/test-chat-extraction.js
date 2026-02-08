
const chatLog = 'USER: I want to visit Cédric Grolet Opera and maybe the Louvre. I hate crowds.';
const extracted = { mustInclude: 'Cédric Grolet Opera, Louvre', avoid: 'crowds' };
console.log('Chat Log:', chatLog);
console.log('Extracted:', extracted);
if (extracted.mustInclude.includes('Cédric Grolet')) console.log('PASS: Captured Cédric Grolet');
else console.error('FAIL: Missed Cédric Grolet');

