/**
 * Blueprint Generator — Cartographie les imports de chaque fichier .js du projet.
 * 
 * Génère un rapport Markdown structuré avec :
 * - L'arbre complet des dépendances par fichier
 * - Les dépendances circulaires détectées
 * - Les fichiers orphelins (jamais importés)
 * - Les exports de chaque fichier (fonctions, classes, constantes)
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, relative, resolve, dirname, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const EXCLUDED_DIRECTORIES = new Set([
  'node_modules', '.git', 'session', 'temp', 'dist', '.GCC', '.agent'
]);

function collectJsFiles(directory) {
  const files = [];

  for (const entry of readdirSync(directory)) {
    if (EXCLUDED_DIRECTORIES.has(entry)) continue;

    const fullPath = join(directory, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...collectJsFiles(fullPath));
    } else if (extname(entry) === '.js') {
      files.push(fullPath);
    }
  }

  return files;
}

function extractImports(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const imports = [];

  const staticImportPattern = /import\s+(?:(?:\{[^}]*\}|[\w*]+)\s+from\s+)?['"]([^'"]+)['"]/g;
  const dynamicImportPattern = /(?:await\s+)?import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  const requirePattern = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  let match;

  while ((match = staticImportPattern.exec(content)) !== null) {
    imports.push({ source: match[1], type: 'static' });
  }
  while ((match = dynamicImportPattern.exec(content)) !== null) {
    imports.push({ source: match[1], type: 'dynamic' });
  }
  while ((match = requirePattern.exec(content)) !== null) {
    imports.push({ source: match[1], type: 'require' });
  }

  return imports;
}

function extractExports(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const exports = [];

  const namedExportPattern = /export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([\w]+)/g;
  const defaultExportPattern = /export\s+default\s+(?:(?:class|function)\s+)?([\w]+)?/g;

  let match;

  while ((match = namedExportPattern.exec(content)) !== null) {
    exports.push({ name: match[1], type: 'named' });
  }
  while ((match = defaultExportPattern.exec(content)) !== null) {
    exports.push({ name: match[1] || '(anonymous)', type: 'default' });
  }

  return exports;
}

function isLocalImport(source) {
  return source.startsWith('./') || source.startsWith('../');
}

function resolveLocalImport(importerPath, importSource) {
  const importerDir = dirname(importerPath);
  let resolved = resolve(importerDir, importSource);

  if (!extname(resolved)) {
    if (statSync(resolved + '.js', { throwIfNoEntry: false })) {
      return resolved + '.js';
    }
    if (statSync(join(resolved, 'index.js'), { throwIfNoEntry: false })) {
      return join(resolved, 'index.js');
    }
  }

  return resolved;
}

function detectCircularDependencies(dependencyGraph) {
  const circles = [];
  const visited = new Set();
  const recursionStack = new Set();

  function dfs(node, path) {
    visited.add(node);
    recursionStack.add(node);

    const dependencies = dependencyGraph.get(node) || [];
    for (const dep of dependencies) {
      if (!visited.has(dep)) {
        dfs(dep, [...path, dep]);
      } else if (recursionStack.has(dep)) {
        const cycleStart = path.indexOf(dep);
        if (cycleStart !== -1) {
          circles.push(path.slice(cycleStart));
        } else {
          circles.push([...path, dep]);
        }
      }
    }

    recursionStack.delete(node);
  }

  for (const node of dependencyGraph.keys()) {
    if (!visited.has(node)) {
      dfs(node, [node]);
    }
  }

  return circles;
}

console.log('🔍 Scanning project files...');
const allFiles = collectJsFiles(ROOT);
console.log(`📄 Found ${allFiles.length} JS files`);

const dependencyGraph = new Map();
const fileDetails = new Map();
const importedFiles = new Set();

for (const filePath of allFiles) {
  const relativePath = relative(ROOT, filePath).replace(/\\/g, '/');
  const imports = extractImports(filePath);
  const exports = extractExports(filePath);

  const localDependencies = [];
  const externalDependencies = [];

  for (const imp of imports) {
    if (isLocalImport(imp.source)) {
      try {
        const resolved = resolveLocalImport(filePath, imp.source);
        const resolvedRelative = relative(ROOT, resolved).replace(/\\/g, '/');
        localDependencies.push({ source: imp.source, resolved: resolvedRelative, type: imp.type });
        importedFiles.add(resolvedRelative);
      } catch {
        localDependencies.push({ source: imp.source, resolved: '❓ UNRESOLVED', type: imp.type });
      }
    } else {
      externalDependencies.push({ source: imp.source, type: imp.type });
    }
  }

  dependencyGraph.set(relativePath, localDependencies.map(d => d.resolved));
  fileDetails.set(relativePath, { localDependencies, externalDependencies, exports });
}

const orphanFiles = allFiles
  .map(f => relative(ROOT, f).replace(/\\/g, '/'))
  .filter(f => !importedFiles.has(f) && f !== 'bot.js' && f !== 'test_db.js');

const circles = detectCircularDependencies(dependencyGraph);

let markdown = `# 🏗️ HIVE-MIND Architecture Blueprint
> Generated on ${new Date().toISOString().split('T')[0]}
> **${allFiles.length}** files scanned | **${importedFiles.size}** files imported | **${orphanFiles.length}** potential orphans | **${circles.length}** circular dependencies

---

## 📊 Summary

| Metric | Value |
|--------|-------|
| Total JS files | ${allFiles.length} |
| Files imported by others | ${importedFiles.size} |
| Potential orphan files | ${orphanFiles.length} |
| Circular dependencies | ${circles.length} |

---

`;

if (circles.length > 0) {
  markdown += `## ⚠️ Circular Dependencies\n\n`;
  const uniqueCircles = [];
  const seen = new Set();
  for (const circle of circles) {
    const key = [...circle].sort().join('|');
    if (!seen.has(key)) {
      seen.add(key);
      uniqueCircles.push(circle);
    }
  }
  for (const circle of uniqueCircles) {
    markdown += `- \`${circle.join('` → `')}\`\n`;
  }
  markdown += `\n---\n\n`;
}

if (orphanFiles.length > 0) {
  markdown += `## 💀 Potential Orphan Files (never imported)\n\n`;
  markdown += `> These files are never imported by any other file. They may be entry points, scripts, or dead code.\n\n`;
  for (const orphan of orphanFiles) {
    markdown += `- \`${orphan}\`\n`;
  }
  markdown += `\n---\n\n`;
}

markdown += `## 📦 File Dependency Map\n\n`;

const layers = {
  'config/': [], 'utils/': [], 'core/': [],
  'services/': [], 'providers/': [], 'plugins/': [],
  'scheduler/': [], 'persona/': [], 'tests/': [],
  'scripts/': [], 'bin/': [], '(root)': []
};

for (const [filePath] of fileDetails) {
  let placed = false;
  for (const prefix of Object.keys(layers)) {
    if (prefix !== '(root)' && filePath.startsWith(prefix)) {
      layers[prefix].push(filePath);
      placed = true;
      break;
    }
  }
  if (!placed) layers['(root)'].push(filePath);
}

for (const [layerName, files] of Object.entries(layers)) {
  if (files.length === 0) continue;

  markdown += `### 📁 ${layerName}\n\n`;

  for (const filePath of files.sort()) {
    const details = fileDetails.get(filePath);
    const exportList = details.exports.map(e => `\`${e.name}\` (${e.type})`).join(', ');

    markdown += `#### \`${filePath}\`\n`;

    if (details.exports.length > 0) {
      markdown += `**Exports:** ${exportList}\n\n`;
    }

    if (details.localDependencies.length > 0) {
      markdown += `**Local imports:**\n`;
      for (const dep of details.localDependencies) {
        const icon = dep.type === 'dynamic' ? '⚡' : dep.type === 'require' ? '📦' : '→';
        markdown += `- ${icon} \`${dep.resolved}\`\n`;
      }
      markdown += `\n`;
    }

    if (details.externalDependencies.length > 0) {
      markdown += `**External packages:**\n`;
      for (const dep of details.externalDependencies) {
        markdown += `- 📦 \`${dep.source}\`\n`;
      }
      markdown += `\n`;
    }

    if (details.localDependencies.length === 0 && details.externalDependencies.length === 0) {
      markdown += `*No dependencies (leaf node)*\n\n`;
    }
  }
}

const outputPath = join(ROOT, 'docs', 'blueprint.md');
writeFileSync(outputPath, markdown, 'utf-8');
console.log(`✅ Blueprint written to: ${outputPath}`);
console.log(`  → ${allFiles.length} files mapped`);
console.log(`  → ${circles.length} circular dependencies found`);
console.log(`  → ${orphanFiles.length} potential orphans found`);
