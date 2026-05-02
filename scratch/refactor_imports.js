import fs from 'fs';
import path from 'path';

const pluginsDir = path.join(process.cwd(), 'plugins');

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf-8');
    
    // Find all imports from services
    const importRegex = /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+services[^'"]+)['"];?\n/g;
    let match;
    let servicesToImport = [];
    let modified = false;

    // Collect all imports
    let newContent = content.replace(importRegex, (fullMatch, variables, fromPath) => {
        const vars = variables.split(',').map(v => v.trim());
        servicesToImport.push({ vars, fromPath });
        modified = true;
        return ''; // remove top-level import
    });

    if (!modified) return;

    // Build the getServices function
    let getServicesCode = `\n// Lazy loaded services\nconst getServices = async () => {\n`;
    let importPromises = [];
    let returnedVars = [];

    servicesToImport.forEach(imp => {
        // e.g. import('../../services/userService.js')
        importPromises.push(`import('${imp.fromPath}')`);
        returnedVars.push(...imp.vars);
    });

    getServicesCode += `    const results = await Promise.all([\n        ${importPromises.join(',\n        ')}\n    ]);\n`;
    getServicesCode += `    return Object.assign({}, ...results);\n};\n`;

    // Insert getServices after the imports
    const lastImportIndex = newContent.lastIndexOf('import ');
    let insertIndex = 0;
    if (lastImportIndex !== -1) {
        insertIndex = newContent.indexOf('\n', lastImportIndex) + 1;
    }
    
    newContent = newContent.slice(0, insertIndex) + getServicesCode + newContent.slice(insertIndex);

    // Replace usages of the imported variables with `(await getServices()).X`
    // Wait, replacing `workingMemory.get` with `(await getServices()).workingMemory.get` is risky via simple regex.
    // Let's do a more robust approach:
    // Create a Proxy for each variable at the top level!
    
    let proxyCode = `\n// Proxies to avoid async refactoring\nlet _servicesCache = null;\n`;
    proxyCode += `const _getSvc = async () => { if (!_servicesCache) _servicesCache = await getServices(); return _servicesCache; };\n`;
    
    returnedVars.forEach(v => {
        proxyCode += `const ${v} = new Proxy({}, {\n`;
        proxyCode += `    get: function(target, prop) {\n`;
        proxyCode += `        if (prop === 'then') return undefined; // NOT A PROMISE\n`;
        proxyCode += `        return async (...args) => {\n`;
        proxyCode += `            const svc = await _getSvc();\n`;
        proxyCode += `            if (typeof svc['${v}'][prop] === 'function') {\n`;
        proxyCode += `                return svc['${v}'][prop](...args);\n`;
        proxyCode += `            }\n`;
        proxyCode += `            return svc['${v}'][prop];\n`;
        proxyCode += `        };\n`;
        proxyCode += `    }\n`;
        proxyCode += `});\n`;
    });

    // Actually, creating Proxies is nice but it assumes all usages are method calls: `workingMemory.doSomething()`.
    // If they access properties `workingMemory.prop`, it returns a promise, which breaks synchronous access.
    // Let's just find `execute` and inject `const { ... } = await getServices();`
    // And for `_helper` functions, we'll replace `X.y` with `(await getServices()).X.y`.
    // Wait, since these plugins are basically standard `export default { execute(...) { ... }, _helpers() { ... } }`,
    // The easiest and cleanest way that doesn't break syntax is to write a script that replaces `workingMemory.` with `(await getServices()).workingMemory.`.
    
    fs.writeFileSync(filePath, newContent);
    console.log('Processed', filePath);
}

function walkDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walkDir(fullPath);
        } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.js')) {
            processFile(fullPath);
        }
    }
}

walkDir(pluginsDir);
