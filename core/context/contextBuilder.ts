// @ts-nocheck
// core/context/contextBuilder.js
// Construit le contexte enrichi pour l'IA (système prompt, mémoire, social awareness)
// Extrait de core/index.js pour modularité

import { container } from '../ServiceContainer.js';
import { factsMemory } from '../../services/memory.js';
import { consciousness } from '../../services/consciousnessService.js';
import { pluginLoader } from '../../plugins/loader.js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { botIdentity } from '../../utils/botIdentity.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Le persona est maintenant inclus directement dans le prompt système (SOTA)
const personaName = botIdentity.fullName;

// Charger le prompt système
let systemPrompt: any;
try {
    systemPrompt = readFileSync(
        join(__dirname, '..', '..', 'persona', 'prompts', 'system.md'), 'utf-8'
    );
} catch {
    systemPrompt = 'You are a friendly assistant.';
}

/**
 * Construit le contexte enrichi pour l'IA
 * @param {string} chatId - ID du chat
 * @param {Object} message - Message brut
 * @param {Array} shortTermContext - Contexte court terme (Redis)
 * @param {Object} transport - Instance transport pour accès au bot JID
 * @returns {Promise<{systemPrompt: string, history: Array}>}
 */
export async function buildContext(chatId, message, shortTermContext = [], transport = null) {
    // 1. Récupération des services
    const userService = container.get('userService');
    const groupService = container.get('groupService');
    const adminService = container.get('adminService');

    // 2. Récupération du profil utilisateur
    const senderProfile = await userService.getProfile(message.sender);

    // 3. Récupération du contexte groupe
    const socialData = await groupService.getContext(chatId, message.sender, senderProfile);

    // Calcul des droits admin
    const isSuperUser = await adminService.isSuperUser(message.sender);
    const isGlobalAdmin = await adminService.isGlobalAdmin(message.sender);
    let groupMembers = [];
    let isBotAdmin = false;

    // 4. Construction du bloc "Social Awareness"
    let socialBlock = "";

    if (socialData.type === 'GROUP' && socialData.group) {
        const g = socialData.group;
        const senderName = socialData.sender.names[0] || "Inconnu";

        console.log(`[Context] Authority: sender=${message.sender}, superUser=${isSuperUser}, globalAdmin=${isGlobalAdmin}, groupAdmin=${socialData.senderIsAdmin}`);

        let senderStatus = socialData.senderIsAdmin ? "ADMINISTRATEUR DU GROUPE" : "Membre";

        if (isSuperUser && socialData.senderIsAdmin) {
            senderStatus = "👑 [SUPREME AUTHORITY] (SuperUser + Admin)";
        } else if (isSuperUser) {
            senderStatus = "👑 [SuperUser]";
        }

        const familiarity = socialData.sender.interaction_count > 50 ? "Très familier" :
            (socialData.sender.interaction_count > 10 ? "Connu" : "Nouveau");

        const whatsappDesc = g.description || "Aucune description";
        const botMission = g.bot_mission || "Aucune mission définie";

        // Identifier le bot
        const botJid = transport?.sock?.user?.id;
        const botLid = transport?.sock?.user?.lid;
        const botPhoneId = botJid?.split(':')[0]?.split('@')[0];
        const botLidId = botLid?.split(':')[0]?.split('@')[0];

        const isBotJid = (jid: any) => {
            const id = jid.split('@')[0];
            return (botPhoneId && id.includes(botPhoneId)) ||
                (botLidId && id.includes(botLidId));
        };

        // Récupérer les membres du groupe
        groupMembers = await groupService.getGroupMembers(chatId);
        isBotAdmin = groupMembers.find((m: any) => isBotJid(m.jid))?.isAdmin || false;

        // Liste des admins
        let adminList = "Aucun admin détecté";
        if (g.admins && g.admins.length > 0) {
            const adminProfiles = await Promise.all(
                g.admins.map(async (jid: any) => {
                    if (isBotJid(jid)) return `moi (${personaName})`;

                    const profile = await userService.getProfile(jid);
                    let name = profile.names[0];

                    if (!name || name === 'Inconnu') {
                        const cachedMember = groupMembers.find((m: any) => m.jid === jid);
                        if (cachedMember?.name) name = cachedMember.name;
                    }

                    return name && name !== 'Inconnu' ? name : `@${jid.split('@')[0]}`;
                })
            );
            adminList = adminProfiles.join(', ');
        }

        // Traiter les mentions
        let mentionBlock = "";
        if (message.mentionedJids && message.mentionedJids.length > 0) {
            const mentionedProfiles = await Promise.all(
                message.mentionedJids.map(async (jid: any) => {
                    if (isBotJid(jid)) return `- ${personaName} (C'est moi !)`;

                    const profile = await userService.getProfile(jid);
                    let name = profile.names[0];

                    if (!name || name === 'Inconnu') {
                        const cached = groupMembers.find((m: any) => m.jid === jid);
                        if (cached?.name) name = cached.name;
                    }

                    if (!name || name === 'Inconnu') name = `@${jid.split('@')[0]}`;
                    return `- ${name} (ID: ${jid})`;
                })
            );

            const validMentions = mentionedProfiles.filter(Boolean);
            if (validMentions.length > 0) {
                mentionBlock = `\n### 🗣️ UTILISATEURS MENTIONNÉS (Focus)\nCes utilisateurs sont cités dans le message :\n${validMentions.join('\n')}\nUtilise ces noms si on te demande "qui est @..."\n`;
            }
        }

        // Global Admins
        const globalAdminsList = await adminService.listAdmins();
        let globalAdminsFormatted = "Aucun";
        if (globalAdminsList.length > 0) {
            const globalAdminNames = await Promise.all(
                globalAdminsList.map(async (admin: any) => {
                    if (isBotJid(admin.jid)) return "moi (Erina)";

                    const profile = await userService.getProfile(admin.jid);
                    const realName = profile.names[0];
                    if (realName && realName !== 'Inconnu') return realName;
                    if (admin.name && admin.name !== 'Inconnu') return admin.name;
                    return `@${admin.jid.split('@')[0]}`;
                })
            );
            globalAdminsFormatted = globalAdminNames.join(', ');
        }

        const senderGlobalStatus = isGlobalAdmin ? " + SUPER-ADMIN DU BOT" : "";

        // État de conscience
        const globalState = await consciousness.getGlobalState(chatId, message.sender);

        socialBlock = `
### 🌍 CONTEXTE SOCIAL (Temps Réel)
- **Lieu** : Groupe "${g.name}"
- **Description WhatsApp** : "${whatsappDesc}"
- **Mission Bot** : "${botMission}"
- **Membres** : ~${g.member_count} personnes.
- **Admins du groupe (WhatsApp)** : ${adminList}
- **Super-Admins du Bot (niveau global, peuvent me contrôler)** : ${globalAdminsFormatted}
- **Interlocuteur** : ${senderName}
- **Statut** : ${senderStatus}${senderGlobalStatus}
- **Historique relationnel** : ${familiarity} (${socialData.sender.interaction_count} interactions)
${mentionBlock}`;

        // Ajouter les membres connus
        if (groupMembers.length > 0) {
            const membersList = await Promise.all(
                groupMembers.slice(0, 25).map(async (m: any) => {
                    if (isBotJid(m.jid)) return null;

                    const profile = await userService.getProfile(m.jid);
                    let name = profile.names[0];

                    if ((!name || name === 'Inconnu') && m.name) name = m.name;

                    if (name && name !== 'Inconnu') {
                        const role = m.isAdmin ? '👑' : '';
                        return `${role}${name}`;
                    }
                    return null;
                })
            );
            const knownMembers = membersList.filter(Boolean);

            if (knownMembers.length > 0) {
                socialBlock += `- **Membres connus (tu peux les mentionner par nom)** : ${knownMembers.join(', ')}\n`;
            }
        }
    } else {
        // Mode Privé
        const senderName = socialData.sender.names[0] || "Inconnu";
        const isPrivateGlobalAdmin = await adminService.isGlobalAdmin(message.sender);
        const senderGlobalStatus = isPrivateGlobalAdmin ? " (SUPER-ADMIN DU BOT)" : "";

        const globalAdminsList = await adminService.listAdmins();
        const globalAdminsFormatted = globalAdminsList.length > 0
            ? globalAdminsList.map((a: any) => a.name || `+${a.jid.split('@')[0]}`).join(', ')
            : "Aucun";

        socialBlock = `
### 👤 CONTEXTE PRIVÉ
- **Interlocuteur** : ${senderName}${senderGlobalStatus}
- **Intensité relationnelle** : ${socialData.sender.interaction_count} messages échangés.
- **Super-Admins du Bot** : ${globalAdminsFormatted}
`;
    }

    // Récupérer les faits
    const facts = await factsMemory.format(message.sender);

    // RAG: Recherche sémantique
    let ragContext = '';
    try {
        const memory = container.get('memory');
        const relevantMemories = await memory.recall(chatId, message.text, 3);
        if (relevantMemories?.length > 0) {
            ragContext = relevantMemories.map((m: any) => `- ${m.content}`).join('\n');
            console.log(`[RAG] ${relevantMemories.length} souvenir(s) pertinent(s)`);
        }
    } catch (e: any) {
        console.warn('[RAG] Erreur recherche:', e.message);
    }

    // Contexte court terme
    const recentContext = shortTermContext
        .map((m: any) => `[${m.role}]: ${m.content}`)
        .join('\n');

    // Construire le system prompt (plus de remplacement de persona car natif dans le prompt)
    let prompt = systemPrompt;

    const now = new Date();
    const timeBlock = `
### 📅 TEMPS RÉEL
- **Date actuelle** : ${now.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
- **Heure** : ${now.toLocaleTimeString('fr-FR')}
- **Temporal Consciousness**: You are aware of this date. If your knowledge cuts off before 2026, assume it might be obsolete for tech/news topics.
`;

    prompt += `\n${timeBlock}\n${socialBlock}\n`;

    // Leçons apprises
    try {
        const { dreamService } = await import('../../services/dreamService.js');
        const lessons = dreamService.getLessons();
        if (lessons) {
            prompt += `\n### 🎓 LEÇONS APPRISES (Auto-Réflexion)\n${lessons}\n`;
        }
    } catch (e: any) {
        console.warn('[Context] Erreur injection leçons:', e.message);
    }

    // Bloc Conscience
    const globalState = await consciousness.getGlobalState(chatId, message.sender);
    const authorityLevel = isSuperUser ? "DIVIN (SuperUser)" :
        (isGlobalAdmin ? "SUPREME (Global Admin)" :
            (socialData.senderIsAdmin ? "GOUVERNEUR (Group Admin)" : "CITOYEN (Membre)"));
    const botAuthority = isBotAdmin ? "ADMINISTRATEUR (Droit de sanction)" : "MEMBRE (Observateur)";

    let consciousnessBlock = `
### 🧠 ÉTAT DE CONSCIENCE (GLOBAL WORKSPACE)
- **Identité** : Je suis ${globalState.identity.name} (${globalState.uptime}s uptime).
- **Situation Sociale** : Je suis ${botAuthority} face à un ${authorityLevel}.
`;

    const { annoyance, mood } = globalState.emotionalState;
    if (annoyance > 0) {
        consciousnessBlock += `- **État Émotionnel** : ${mood} (Niveau Agacement: ${annoyance}/100)\n`;
        if (annoyance > 50 && isBotAdmin) {
            if (!isSuperUser && !isGlobalAdmin && !socialData.senderIsAdmin) {
                consciousnessBlock += `⚠️ **ACTIVE WILL**: This user annoys you. You have the power and will to sanction them (Kick/Warn/Mute/Lock). Do it if necessary.\n`;
            } else {
                consciousnessBlock += `ℹ️ **Restraint**: You are annoyed by a Superior. You cannot act.\n`;
            }
        }
    } else {
        consciousnessBlock += `- **Emotional State**: ${mood} (Serene)\n`;
    }

    if (globalState.mission) {
        consciousnessBlock += `
### 🎯 MISSION ACTIVE
- **Titre** : ${globalState.mission.title}
- **Objectif** : ${globalState.mission.description}
- **Consigne** : Tes actions doivent servir cette mission.
`;
    }

    prompt += consciousnessBlock + '\n';

    // Remplacements finaux
    if (facts) {
        prompt = prompt.replace('{{memory}}', facts);
    } else {
        prompt = prompt.replace(/{{#if memory}}[\s\S]*?{{\/if}}/g, '');
    }

    if (recentContext) {
        prompt = prompt.replace('{{recentContext}}', recentContext);
    } else {
        prompt = prompt.replace(/{{#if recentContext}}[\s\S]*?{{\/if}}/g, '');
    }

    if (ragContext) {
        prompt += `\n### 🧠 SOUVENIRS PERTINENTS (de conversations passées)\n${ragContext}\n`;
    }

    // Nettoyer les placeholders
    prompt = prompt.replace(/{{#each.*?}}[\s\S]*?{{\/each}}/g, '');
    prompt = prompt.replace(/{{.*?}}/g, '');

    // 5. [NEW] Injection du snippet de rendu selon le canal
    const sourceChannel = message.sourceChannel || 'whatsapp';
    let renderingSnippet = "";
    
    if (sourceChannel === 'whatsapp') {
        renderingSnippet = `
### 📱 DIRECTIVE D'AFFICHAGE : WHATSAPP
- Réponds de manière concise et directe.
- Utilise le formatage WhatsApp : *gras*, _italique_, ~barré~, \`\`\`code bloc\`\`\`.
- Ne fais pas de tableaux Markdown (non supportés).
- Évite les blocs de code trop longs ou les logs techniques denses sauf si demandé explicitement.
`;
    } else if (sourceChannel === 'cli') {
        renderingSnippet = `
### 💻 DISPLAY DIRECTIVE: TERMINAL (CLI/TUI)
- You are in console mode. You can be more verbose and technical.
- Use data structures (JSON, Tables) and detailed logs.
- The rendering supports colors and rich Markdown.
`;
    } else if (sourceChannel === 'discord' || sourceChannel === 'telegram') {
        renderingSnippet = `
### 💬 DIRECTIVE D'AFFICHAGE : ${sourceChannel.toUpperCase()}
- Utilise le Markdown standard riche.
- Tu peux utiliser des blocs de code avec coloration syntaxique.
- Organise tes réponses avec des titres et des listes.
`;
    }

    prompt += `\n${renderingSnippet}\n`;

    return {
        systemPrompt: prompt,
        history: [],
        // Métadonnées utiles pour le caller
        authorityLevel,
        isBotAdmin,
        isSuperUser,
        isGlobalAdmin,
        groupMembers
    };
}

export default { buildContext };
