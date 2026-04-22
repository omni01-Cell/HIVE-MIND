import config from '../config/index.js';

console.log('✅ Configuration loaded and validated successfully!');
console.log('App Name:', config.app.name);
console.log('Env:', config.env);
console.log('Available Families:', config.priorityFamilies);
console.log('Active Models:', Object.keys(config.models.reglages_generaux.service_agents));
