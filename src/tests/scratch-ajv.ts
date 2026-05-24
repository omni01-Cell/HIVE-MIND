import Ajv from 'ajv';
console.log('Ajv loaded:', typeof Ajv);
const ajv = new Ajv();
console.log('ajv instance:', !!ajv);
