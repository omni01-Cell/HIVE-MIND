#!/usr/bin/env node
// @ts-nocheck
// bin/hive-mind.js
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Déterminer le dossier racine du projet (V3/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Récupérer la commande (start, cli, audit, etc.)
const args = process.argv.slice(2);
const command = args[0];

if (!command) {
    showHelp();
    process.exit(1);
}

// Map des commandes vers les scripts
const commands = {
    'start': { cmd: 'node', args: ['bot.js'] },
    'cli': { cmd: 'node', args: ['scripts/admin-cli.js', ...args.slice(1)] },
    'audit': { cmd: 'node', args: ['scripts/audit-group.js', ...args.slice(1)] },
    'db:sync': { cmd: 'node', args: ['scripts/test-group-metadata.js', ...args.slice(1)] },
    'help': { fn: showHelp }
};

async function run() {
    if (!commands[command]) {
        console.error(`❌ Commande inconnue: ${command}`);
        showHelp();
        process.exit(1);
    }

    const target = commands[command];

    if (target.fn) {
        target.fn();
        return;
    }

    console.log(`🚀 Hive-Mind: Exécution de '${command}'...`);
    console.log(`📂 Context: ${projectRoot}`);

    // Lancer le processus distant
    const child = spawn(target.cmd, target.args, {
        cwd: projectRoot, // Important: s'exécuter dans le dossier du projet
        stdio: 'inherit', // Garder les couleurs et l'interaction
        shell: true       // Nécessaire sur Windows pour certains cas
    });

    child.on('close', (code: any) => {
        process.exit(code);
    });
}

function showHelp() {
    console.log(`
🧠 HIVE-MIND CLI v3.0

Usage: hive-mind <command> [options]

Commandes Principales:
  start           Démarrer le bot
  cli <cmd>       Exécuter une commande admin (ex: admin:list)
  audit <jid>     Auditer un groupe (Live vs DB)

Exemples:
  hive-mind start
  hive-mind cli redis:stats
  hive-mind audit 123456@g.us
    `);
}

run();
