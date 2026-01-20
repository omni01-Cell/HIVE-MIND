// utils/botIdentity.js
// Module de gestion de l'identité du bot (nom, variantes, détection)

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Classe de gestion de l'identité du bot
 * Centralise le nom et génère automatiquement les variantes
 */
class BotIdentity {
    constructor() {
        this._profile = null;
        this._nameParts = [];
        this._textVariants = [];
        this._vocalVariants = [];
        this._initialized = false;
    }

    /**
     * Charge le profil depuis profile.json
     */
    _loadProfile() {
        if (this._profile) return this._profile;

        try {
            const profilePath = join(__dirname, '..', 'persona', 'profile.json');
            this._profile = JSON.parse(readFileSync(profilePath, 'utf-8'));
        } catch (error) {
            console.warn('[BotIdentity] Erreur lecture profile.json:', error.message);
            this._profile = { name: 'Bot' };
        }

        return this._profile;
    }

    /**
     * Retourne le nom complet du bot
     * @returns {string}
     */
    get fullName() {
        const profile = this._loadProfile();
        return profile.name || 'Bot';
    }

    /**
     * Retourne les parties du nom (max 2 mots)
     * Ex: "Erina Nakiri" → ["Erina", "Nakiri"]
     * @returns {string[]}
     */
    get nameParts() {
        if (this._nameParts.length > 0) return this._nameParts;

        const parts = this.fullName.split(/\s+/).slice(0, 2);
        this._nameParts = parts.filter(p => p.length > 0);
        return this._nameParts;
    }

    /**
     * Retourne le prénom (premier mot du nom)
     * @returns {string}
     */
    get firstName() {
        return this.nameParts[0] || 'Bot';
    }

    /**
     * Retourne le nom de famille (second mot)
     * @returns {string|null}
     */
    get lastName() {
        return this.nameParts[1] || null;
    }

    /**
     * Génère les variantes textuelles pour la détection de mention
     * Ex: ["Erina", "Nakiri", "Erina Nakiri", "erina", "nakiri", "erina nakiri"]
     * @returns {string[]}
     */
    get textVariants() {
        if (this._textVariants.length > 0) return this._textVariants;

        const variants = new Set();

        // Ajouter chaque partie du nom
        for (const part of this.nameParts) {
            variants.add(part);
            variants.add(part.toLowerCase());
        }

        // Ajouter le nom complet
        variants.add(this.fullName);
        variants.add(this.fullName.toLowerCase());

        this._textVariants = Array.from(variants);
        return this._textVariants;
    }

    /**
     * Génère les variantes vocales (pour la transcription STT)
     * Inclut les erreurs de transcription courantes
     * @returns {string[]}
     */
    get vocalVariants() {
        if (this._vocalVariants.length > 0) return this._vocalVariants;

        const variants = new Set();

        // Ajouter les variantes textuelles de base
        for (const v of this.textVariants) {
            variants.add(v.toLowerCase());
        }

        // Générer des variantes phonétiques pour chaque partie
        for (const part of this.nameParts) {
            const generated = this._generatePhoneticVariants(part);
            for (const g of generated) {
                variants.add(g.toLowerCase());
            }
        }

        this._vocalVariants = Array.from(variants);
        return this._vocalVariants;
    }

    /**
     * Génère des variantes phonétiques d'un mot
     * Simule les erreurs courantes de transcription vocale
     * @param {string} word 
     * @returns {string[]}
     */
    _generatePhoneticVariants(word) {
        const variants = new Set([word.toLowerCase()]);
        const lower = word.toLowerCase();

        // Règles de transformation phonétique (erreurs courantes STT)
        const rules = [
            // Voyelles
            { from: /e/g, to: 'a' },
            { from: /i/g, to: 'e' },
            { from: /a/g, to: 'e' },
            // Consonnes
            { from: /r/g, to: 'l' },
            { from: /n/g, to: 'm' },
            // Espaces parasites
            { from: /(.)(.)/, to: '$1 $2' }, // "Erina" → "Er ina"
            // Terminaisons
            { from: /a$/, to: 'ah' },
            { from: /i$/, to: 'y' },
            { from: /e$/, to: 'é' },
            // Doublons
            { from: /(.)\1/, to: '$1' }, // "Anna" → "Ana"
        ];

        // Appliquer chaque règle
        for (const rule of rules) {
            const newVariant = lower.replace(rule.from, rule.to);
            if (newVariant !== lower && newVariant.length > 2) {
                variants.add(newVariant);
            }
        }

        // Variantes avec espaces (erreur de transcription)
        if (lower.length > 4) {
            const mid = Math.floor(lower.length / 2);
            variants.add(lower.slice(0, mid) + ' ' + lower.slice(mid));
        }

        // Préfixe "et" (erreur courante: "et Rina" au lieu de "Erina")
        if (lower.startsWith('e')) {
            variants.add('et ' + lower.slice(1));
        }

        return Array.from(variants);
    }

    /**
     * Vérifie si un texte mentionne le bot (textuel)
     * @param {string} text 
     * @returns {boolean}
     */
    isMentioned(text) {
        if (!text) return false;
        const lower = text.toLowerCase();
        return this.textVariants.some(v => lower.includes(v.toLowerCase()));
    }

    /**
     * Vérifie si une transcription vocale mentionne le bot
     * @param {string} transcription 
     * @returns {boolean}
     */
    isVocallyMentioned(transcription) {
        if (!transcription) return false;
        const lower = transcription.toLowerCase();
        return this.vocalVariants.some(v => lower.includes(v));
    }

    /**
     * Retourne le profil complet
     * @returns {Object}
     */
    get profile() {
        return this._loadProfile();
    }

    /**
     * Affiche les variantes générées (debug)
     */
    debug() {
        console.log('\n[BotIdentity] Debug:');
        console.log(`  Nom complet: ${this.fullName}`);
        console.log(`  Parties: ${this.nameParts.join(', ')}`);
        console.log(`  Variantes textuelles: ${this.textVariants.join(', ')}`);
        console.log(`  Variantes vocales (${this._vocalVariants.length}): ${this.vocalVariants.slice(0, 10).join(', ')}...`);
    }
}

export const botIdentity = new BotIdentity();
export default botIdentity;
