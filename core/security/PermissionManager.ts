// core/security/PermissionManager.ts
// ============================================================================
// Human-in-the-Loop (HITL) — Dual Logic Permission System
//
// LOGIQUE 1 (Primary — Out-of-Band): Admin Hub
//   Envoie toutes les requêtes de sécurité vers un canal dédié
//   (Discord #bot-approvals, Telegram group, WhatsApp group).
//   Admins répondent avec .approve <ID> ou .reject <ID> [feedback].
//
// LOGIQUE 2 (Fallback — In-Band): Approbation Contextuelle avec Escalade
//   Si l'utilisateur est SuperAdmin → demande dans le chat actuel.
//   Si non-admin ou tâche de fond → escalade en DM au Créateur.
//   Timeout de 10 minutes pour chaque logique.
// ============================================================================

import { resolve, isAbsolute } from 'path';
import * as fs from 'fs';
import { transportManager } from '../transport/TransportManager.js';
import { adminService } from '../../services/adminService.js';

export const BANNED_COMMANDS = [
    'alias', 'curl', 'wget', 'nc', 'telnet', 'curlie', 'axel',
    'aria2c', 'lynx', 'w3m', 'links', 'httpie', 'xh', 'chrome',
    'firefox', 'safari', 'su', 'sudo'
];

export const SAFE_COMMANDS = new Set([
    'git status', 'git diff', 'git log', 'git branch',
    'pwd', 'tree', 'date', 'which', 'ls', 'echo', 'cat', 'node --version', 'npm --version'
]);

/** Résultat enrichi d'une demande de permission (HITL) */
export interface PermissionResult {
    readonly granted: boolean;
    /** Instruction corrective de l'humain (ex: "utilise npm run build à la place") */
    readonly feedback?: string;
}

/** Métadonnées internes d'une requête de permission en attente */
interface PendingRequest {
    readonly id: string;
    readonly numericId: number;
    readonly chatId: string;
    readonly senderJid: string;
    readonly actionDescription: string;
    readonly sourceChannel: string;
    readonly createdAt: number;
    resolve: (result: PermissionResult) => void;
}

export class PermissionManager {
    private originalCwd: string;
    public sandboxDir: string;
    public storageDir: string;
    private allowedDirectories: Set<string> = new Set();
    private sessionPermissions: Set<string> = new Set();

    /** Map requestId (string "perm_xxx") → PendingRequest */
    private pendingRequests: Map<string, PendingRequest> = new Map();
    /** Map numericId (number) → requestId (string) pour les commandes .approve/.reject */
    private numericIdMap: Map<number, string> = new Map();

    private requestCounter: number = 0;

    // ===== Configuration (via process.env) =====

    /** Canal dédié Admin Hub (LOGIQUE 1) — ex: group WhatsApp ID, channel Discord */
    private readonly SECURITY_HUB_ID = process.env.SECURITY_HUB_ID || '';
    /** Transport pour le Hub (whatsapp, telegram, discord) */
    private readonly SECURITY_TRANSPORT = process.env.SECURITY_TRANSPORT || 'whatsapp';
    /** JID du super admin pour l'escalade DM (LOGIQUE 2 fallback) */
    private readonly SUPER_ADMIN_JID = process.env.SUPER_ADMIN_JID || '';

    /** Timeout In-Band (LOGIQUE 2) — 10 minutes */
    private readonly INBAND_TIMEOUT_MS = 10 * 60 * 1000;
    /** Timeout Admin Hub (LOGIQUE 1) — 10 minutes avant fallback vers LOGIQUE 2 */
    private readonly HUB_TIMEOUT_MS = 10 * 60 * 1000;

    constructor() {
        this.originalCwd = process.cwd();
        this.sandboxDir = process.env.SANDBOX_DIR 
            ? resolve(process.env.SANDBOX_DIR) 
            : resolve(this.originalCwd, 'Sandbox1');
            
        this.storageDir = process.env.STORAGE_DIR
            ? resolve(process.env.STORAGE_DIR)
            : resolve(this.originalCwd, 'storage_hm');

        if (!fs.existsSync(this.sandboxDir)) {
            fs.mkdirSync(this.sandboxDir, { recursive: true });
        }
        if (!fs.existsSync(this.storageDir)) {
            fs.mkdirSync(this.storageDir, { recursive: true });
        }
        
        this.allowedDirectories.add(this.sandboxDir);
        this.allowedDirectories.add(this.storageDir);
    }

    // =========================================================================
    // SANDBOX VALIDATION (inchangé)
    // =========================================================================

    isInSandbox(targetPath: string, currentCwd: string = this.originalCwd): boolean {
        const absoluteTarget = isAbsolute(targetPath) ? targetPath : resolve(currentCwd, targetPath);
        for (const allowedPath of this.allowedDirectories) {
            if (absoluteTarget.startsWith(allowedPath)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Génère un message d'aide lisible par le LLM listant les zones autorisées.
     * Injecté dans chaque message d'erreur pour permettre l'auto-correction.
     *
     * Zones autorisées :
     * - storage_hm/ → Stockage persistant libre de l'agent (notes, fichiers, données).
     * - Sandbox1    → Zone d'exécution de code et de scripts temporaires.
     */
    private getAuthorizedDirectoriesHint(): string {
        const dirs = [...this.allowedDirectories].join('\n  - ');
        return `\n[SANDBOX HINT] Tu as accès en lecture/écriture UNIQUEMENT aux répertoires suivants :\n  - ${dirs}\n  → ${this.storageDir} : ton espace de stockage persistant (fichiers, données, notes).\n  → ${this.sandboxDir} : ton espace d'exécution de code et de scripts temporaires.\nRetente l'action en ciblant l'un de ces répertoires.`;
    }

    validateBashCommand(command: string, currentCwd: string = this.originalCwd): { result: boolean; requiresPermission: boolean; reason?: string } {
        const parts = command.trim().split(' ');
        const baseCmd = parts[0]?.toLowerCase();

        if (BANNED_COMMANDS.includes(baseCmd)) {
            return { result: false, requiresPermission: false, reason: `La commande '${baseCmd}' est strictement interdite pour des raisons de sécurité.` };
        }
        if (SAFE_COMMANDS.has(command.trim())) {
            return { result: true, requiresPermission: false };
        }
        if (baseCmd === 'cd' && parts[1]) {
            const targetDir = parts[1].replace(/^['"]|['"]$/g, '');
            if (!this.isInSandbox(targetDir, currentCwd)) {
                return {
                    result: false,
                    requiresPermission: true,
                    reason: `Navigation impossible vers '${targetDir}' : répertoire hors sandbox.${this.getAuthorizedDirectoriesHint()}`
                };
            }
        }
        return { result: true, requiresPermission: false };
    }

    validateFileWrite(filePath: string, currentCwd: string = this.originalCwd): { result: boolean; requiresPermission: boolean; reason?: string } {
        if (!this.isInSandbox(filePath, currentCwd)) {
            return {
                result: false,
                requiresPermission: true,
                reason: `Écriture impossible vers '${filePath}' : répertoire hors sandbox.${this.getAuthorizedDirectoriesHint()}`
            };
        }
        return { result: true, requiresPermission: false };
    }

    // =========================================================================
    // PERMISSION REQUEST — DUAL LOGIC
    // =========================================================================

    /**
     * Demande de permission via le système dual :
     *
     * 1. LOGIQUE 1 (Admin Hub) — si SECURITY_HUB_ID est configuré :
     *    Envoie sur le canal dédié avec `.approve <ID>` / `.reject <ID> [feedback]`.
     *    Timeout → fallback vers LOGIQUE 2.
     *
     * 2. LOGIQUE 2 (In-Band avec Escalade) :
     *    - Si senderJid est SuperAdmin → demande dans le chat actuel (In-Band)
     *    - Sinon → escalade en DM au SUPER_ADMIN_JID
     *    Timeout → { granted: false }
     */
    async askPermission(
        chatId: string,
        actionDescription: string,
        sourceChannel: string = 'whatsapp',
        senderJid: string = 'system'
    ): Promise<PermissionResult> {
        this.requestCounter++;
        const numericId = this.requestCounter;
        const requestId = `perm_${Date.now()}_${numericId}`;

        return new Promise(async (resolvePromise) => {
            const pending: PendingRequest = {
                id: requestId,
                numericId,
                chatId,
                senderJid,
                actionDescription,
                sourceChannel,
                createdAt: Date.now(),
                resolve: resolvePromise
            };

            this.pendingRequests.set(requestId, pending);
            this.numericIdMap.set(numericId, requestId);

            // ── LOGIQUE 0 : CLI / TUI (Local Admin) ──
            // L'utilisateur physiquement devant le terminal est l'admin par défaut.
            if (sourceChannel === 'cli') {
                console.log(`[Permission] 💻 Requête CLI locale, demande directe dans le terminal.`);
                await this._startInBandFallback(pending, true);
                return;
            }

            // ── LOGIQUE 1 : Admin Hub (Out-of-Band) ──
            if (this.SECURITY_HUB_ID) {
                try {
                    await this._sendHubRequest(pending);
                    console.log(`[Permission] 🏢 Requête #${numericId} envoyée au Hub (${this.SECURITY_TRANSPORT})`);

                    // Prévenir l'utilisateur final qu'on attend l'admin
                    await transportManager.sendText(
                        chatId,
                        `⏳ _Une action sensible a été détectée. En attente de validation par l'administrateur système (Requête #${numericId})..._`,
                        {},
                        sourceChannel
                    ).catch(() => {}); // Non-bloquant

                    // Timeout Hub → Fallback vers LOGIQUE 2
                    setTimeout(() => {
                        if (this.pendingRequests.has(requestId)) {
                            console.log(`[Permission] ⏰ Timeout Hub pour #${numericId}, escalade vers LOGIQUE 2 (In-Band)`);
                            this._startInBandFallback(pending, false);
                        }
                    }, this.HUB_TIMEOUT_MS);

                    return; // La promise sera résolue par handleAdminCommand ou le fallback
                } catch (hubErr) {
                    console.warn(`[Permission] ⚠️ Hub indisponible, fallback direct vers LOGIQUE 2:`, hubErr);
                    // Fallthrough → LOGIQUE 2
                }
            }

            // ── LOGIQUE 2 : In-Band avec Escalade (direct ou fallback) ──
            await this._startInBandFallback(pending, false);
        });
    }

    // =========================================================================
    // LOGIQUE 1 — ADMIN HUB (Out-of-Band)
    // =========================================================================

    /** Envoie la requête formatée au canal de sécurité */
    private async _sendHubRequest(pending: PendingRequest): Promise<void> {
        const promptMessage =
            `🚨 *REQUÊTE DE SÉCURITÉ #${pending.numericId}* 🚨\n\n`
            + `*Source:* Conversation \`${pending.chatId.split('@')[0]}\`\n`
            + `*Initiateur:* ${pending.senderJid.split('@')[0]}\n`
            + `*Action:* ${pending.actionDescription}\n\n`
            + `Pour répondre :\n`
            + `👉 \`.approve ${pending.numericId}\`\n`
            + `👉 \`.reject ${pending.numericId} [instructions de correction]\``;

        await transportManager.sendText(this.SECURITY_HUB_ID, promptMessage, {}, this.SECURITY_TRANSPORT);
    }

    /**
     * Traite les commandes .approve / .reject depuis le Hub.
     */
    handleAdminCommand(text: string): boolean {
        const trimmed = text.trim();

        const approveMatch = trimmed.match(/^\.approve\s+(\d+)$/i);
        if (approveMatch) {
            const numId = parseInt(approveMatch[1], 10);
            return this._resolveByNumericId(numId, { granted: true });
        }

        const rejectMatch = trimmed.match(/^\.reject\s+(\d+)(?:\s+(.+))?$/i);
        if (rejectMatch) {
            const numId = parseInt(rejectMatch[1], 10);
            const feedback = rejectMatch[2]?.trim() || undefined;
            console.log(`[Permission] 📝 Rejet #${numId}${feedback ? ` avec feedback: "${feedback}"` : ''}`);
            return this._resolveByNumericId(numId, { granted: false, feedback });
        }

        return false;
    }

    private _resolveByNumericId(numericId: number, result: PermissionResult): boolean {
        const requestId = this.numericIdMap.get(numericId);
        if (!requestId) {
            console.warn(`[Permission] ⚠️ Requête #${numericId} introuvable ou expirée`);
            return false;
        }

        const pending = this.pendingRequests.get(requestId);
        if (!pending) return false;

        console.log(`[Permission] ${result.granted ? '✅' : '❌'} Requête #${numericId} ${result.granted ? 'approuvée' : 'rejetée'}`);
        this._cleanup(requestId, numericId);
        pending.resolve(result);
        return true;
    }

    // =========================================================================
    // LOGIQUE 2 — IN-BAND AVEC ESCALADE (Fallback)
    // =========================================================================

    /**
     * Démarre la logique In-Band :
     * - Si forceDirect (CLI) ou senderJid est SuperAdmin → demande dans le chat actuel
     * - Sinon (non-admin ou tâche système) → escalade en DM au Créateur
     */
    private async _startInBandFallback(pending: PendingRequest, forceDirect: boolean = false): Promise<void> {
        const { chatId, senderJid, actionDescription, sourceChannel, id: requestId, numericId } = pending;

        let targetChat = chatId;
        let escalated = false;
        let targetChannel = sourceChannel;

        const isAdmin = forceDirect || await adminService.isSuperUser(senderJid);

        if (!isAdmin) {
            // Non-admin ou tâche de fond → escalade vers DM du Super Admin
            if (this.SUPER_ADMIN_JID) {
                targetChat = this.SUPER_ADMIN_JID;
                targetChannel = 'whatsapp'; // On force sur WhatsApp pour le SuperAdmin
                escalated = true;
                console.log(`[Permission] 🔀 Escalade #${numericId} : demande envoyée en DM au Super Admin`);
            } else {
                console.warn(`[Permission] ⚠️ SUPER_ADMIN_JID non configuré. Blocage par défaut.`);
                this._cleanup(requestId, numericId);
                pending.resolve({ granted: false, feedback: "Aucun administrateur configuré pour approuver cette action." });
                return;
            }
        } else {
            console.log(`[Permission] 💬 Demande In-Band #${numericId} dans le chat actuel${forceDirect ? ' (CLI Local)' : ''}`);
        }

        const promptMessage =
            `⚠️ *ALERTE SÉCURITÉ${escalated ? ' (Escalade)' : ''}${forceDirect ? '' : ` — Requête #${numericId}`}* ⚠️\n\n`
            + `L'agent IA tente une action hors sandbox :\n`
            + `*Action:* ${actionDescription}\n`
            + `*Demandé par:* ${senderJid.split('@')[0]}\n\n`
            + `Répondez par :\n`
            + `👉 *oui* (autoriser)\n`
            + `👉 *non* (bloquer)\n`
            + `👉 *non, fais plutôt [votre consigne]* (corriger l'agent)`;

        try {
            await transportManager.sendText(targetChat, promptMessage, {}, targetChannel);

            // Timeout In-Band
            setTimeout(() => {
                if (this.pendingRequests.has(requestId)) {
                    console.log(`[Permission] ⏰ Timeout In-Band pour #${numericId}. Action bloquée.`);
                    transportManager.sendText(targetChat, `⏳ Timeout de la demande #${numericId} expirée. Action bloquée par défaut.`, {}, targetChannel).catch(() => {});
                    this._cleanup(requestId, numericId);
                    pending.resolve({ granted: false, feedback: "L'administrateur n'a pas répondu à temps (Timeout)." });
                }
            }, this.INBAND_TIMEOUT_MS);

        } catch (error) {
            console.error(`[Permission] ❌ Impossible d'envoyer la demande In-Band:`, error);
            this._cleanup(requestId, numericId);
            // WHY: If the request fails (network error, socket disconnected), we MUST provide feedback
            // to the LLM so it knows why its action was denied, rather than a silent failure.
            pending.resolve({ 
                granted: false, 
                feedback: "Impossible de joindre l'administrateur (erreur réseau/connexion). L'action a été bloquée par sécurité. Veuillez réessayer plus tard." 
            });
        }
    }

    // =========================================================================
    // IN-BAND RESPONSE HANDLER (oui/non/non, feedback)
    // =========================================================================

    /**
     * Traite une réponse oui/non d'un utilisateur (In-Band).
     * Sécurité : le Core doit vérifier que senderJid est admin AVANT d'appeler.
     *
     * Patterns reconnus :
     * - "oui" / "y" / "ok"              → granted: true
     * - "non" / "n" / "no"              → granted: false
     * - "non, utilise npm run build"     → granted: false, feedback: "utilise npm run build"
     */
    handleUserResponse(text: string): boolean {
        if (this.pendingRequests.size === 0) return false;

        const trimmed = text.trim();
        const lowerText = trimmed.toLowerCase();

        // Trouver la requête In-Band la plus ancienne
        const firstKey = this.pendingRequests.keys().next().value;
        if (!firstKey) return false;
        const pending = this.pendingRequests.get(firstKey);
        if (!pending) return false;

        // 1. Acceptation pure
        if (/^(oui|y|yes|ok|autoriser)$/i.test(lowerText)) {
            console.log(`[Permission] ✅ Requête #${pending.numericId} approuvée (In-Band)`);
            this._cleanup(pending.id, pending.numericId);
            pending.resolve({ granted: true });
            return true;
        }

        // 2. Refus avec correction (HITL Actif)
        const feedbackMatch = trimmed.match(/^non[,\s]+(.+)$/i);
        if (feedbackMatch) {
            const feedback = feedbackMatch[1].trim();
            console.log(`[Permission] ❌ Requête #${pending.numericId} rejetée avec feedback: "${feedback}"`);
            this._cleanup(pending.id, pending.numericId);
            pending.resolve({ granted: false, feedback });
            return true;
        }

        // 3. Refus pur
        if (/^(non|n|no|bloquer|annuler)$/i.test(lowerText)) {
            console.log(`[Permission] ❌ Requête #${pending.numericId} rejetée (In-Band)`);
            this._cleanup(pending.id, pending.numericId);
            pending.resolve({ granted: false });
            return true;
        }

        return false;
    }

    // =========================================================================
    // UTILITIES
    // =========================================================================

    /** Nettoyage des maps internes après résolution */
    private _cleanup(requestId: string, numericId: number): void {
        this.pendingRequests.delete(requestId);
        this.numericIdMap.delete(numericId);
    }

    /** Nombre de requêtes en attente (pour debug/monitoring) */
    get pendingCount(): number {
        return this.pendingRequests.size;
    }
}

export const permissionManager = new PermissionManager();
