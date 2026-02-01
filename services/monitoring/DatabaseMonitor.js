// services/monitoring/DatabaseMonitor.js
// ============================================================================
// Service de monitoring de la base de données avec alerting
// ============================================================================

import { supabase } from '../supabase.js';

/**
 * Service de monitoring de la base de données
 * Surveille la taille des tables, les performances et envoie des alertes
 */
export class DatabaseMonitor {
    constructor() {
        this.thresholds = {
            // Seuils d'alerte (en bytes)
            warning: 100 * 1024 * 1024,      // 100MB
            critical: 500 * 1024 * 1024,     // 500MB
            maxSize: 1024 * 1024 * 1024      // 1GB
        };
        
        this.alertedTables = new Set(); // Tracker les tables déjà alertées
        this.monitoringActive = false;
    }

    /**
     * Initialise le monitoring
     */
    async init() {
        console.log('[DatabaseMonitor] 🔍 Initialisation du monitoring DB...');
        
        // Vérifier la connectivité
        try {
            const { error } = await supabase.from('memories').select('id').limit(1);
            if (error) throw error;
            
            console.log('[DatabaseMonitor] ✅ Connecté à Supabase');
            this.monitoringActive = true;
            
            // Démarrer le monitoring périodique
            this.startPeriodicMonitoring();
            
        } catch (error) {
            console.error('[DatabaseMonitor] ❌ Erreur connexion:', error.message);
            this.monitoringActive = false;
        }
    }

    /**
     * Démarre le monitoring périodique
     * @private
     */
    startPeriodicMonitoring() {
        // Vérifier toutes les heures
        setInterval(async () => {
            if (!this.monitoringActive) return;
            
            try {
                await this.checkDatabaseHealth();
            } catch (error) {
                console.error('[DatabaseMonitor] Erreur monitoring:', error.message);
            }
        }, 60 * 60 * 1000); // Toutes les heures
        
        // Vérification complète tous les jours à 6h
        setInterval(async () => {
            if (!this.monitoringActive) return;
            
            try {
                console.log('[DatabaseMonitor] 📊 Vérification complète quotidienne...');
                await this.performFullCheck();
            } catch (error) {
                console.error('[DatabaseMonitor] Erreur vérification complète:', error.message);
            }
        }, this.getNextDailyCheck());
        
        console.log('[DatabaseMonitor] ⏰ Monitoring démarré');
    }

    /**
     * Vérifie la santé générale de la base de données
     */
    async checkDatabaseHealth() {
        const stats = await this.getDatabaseStats();
        
        // Vérifier chaque table
        for (const table of stats.tables) {
            await this.checkTableHealth(table);
        }
        
        // Vérifier les performances
        await this.checkPerformanceMetrics();
        
        // Log résumé
        console.log(`[DatabaseMonitor] 📈 Santé DB - Tables: ${stats.tables.length}, Taille totale: ${stats.totalSize}`);
    }

    /**
     * Vérifie la santé d'une table spécifique
     * @param {Object} table - Info table {name, size}
     */
    async checkTableHealth(table) {
        const { name, size } = table;
        
        // Vérifier seuils
        if (size > this.thresholds.critical) {
            await this.sendCriticalAlert(name, size);
        } else if (size > this.thresholds.warning) {
            await this.sendWarningAlert(name, size);
        }
        
        // Vérifier croissance anormale
        await this.checkGrowthRate(name);
    }

    /**
     * Obtient les statistiques de la base de données
     * @returns {Promise<Object>} - Stats DB
     */
    async getDatabaseStats() {
        try {
            // Obtenir la taille des tables principales
            const { data, error } = await supabase.rpc('exec_sql', {
                sql: `
                    SELECT 
                        schemaname,
                        tablename,
                        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size_pretty,
                        pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
                    FROM pg_tables 
                    WHERE schemaname = 'public'
                    ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
                `
            });
            
            if (error) throw error;
            
            const totalSize = data.reduce((sum, table) => sum + table.size_bytes, 0);
            
            return {
                tables: data,
                totalSize: totalSize,
                totalSizePretty: this.formatBytes(totalSize)
            };
            
        } catch (error) {
            console.error('[DatabaseMonitor] Erreur stats:', error.message);
            return { tables: [], totalSize: 0, totalSizePretty: '0 B' };
        }
    }

    /**
     * Vérifie le taux de croissance d'une table
     * @param {string} tableName 
     */
    async checkGrowthRate(tableName) {
        try {
            // Obtenir la croissance sur 7 jours
            const { data, error } = await supabase.rpc('exec_sql', {
                sql: `
                    SELECT 
                        date_trunc('day', created_at) as day,
                        count(*) as count
                    FROM ${tableName}
                    WHERE created_at > now() - interval '7 days'
                    GROUP BY day
                    ORDER BY day DESC;
                `
            });
            
            if (error) throw error;
            
            // Analyser la tendance
            if (data.length >= 3) {
                const recent = data.slice(0, 3).reduce((sum, d) => sum + d.count, 0) / 3;
                const older = data.slice(-3).reduce((sum, d) => sum + d.count, 3) / 3;
                
                const growthRate = (recent - older) / older;
                
                if (growthRate > 2) { // +200% = alerte
                    console.warn(`[DatabaseMonitor] 🚨 Croissance explosive détectée sur ${tableName}: +${Math.round(growthRate*100)}%`);
                    await this.sendGrowthAlert(tableName, growthRate);
                }
            }
            
        } catch (error) {
            console.warn(`[DatabaseMonitor] Erreur croissance ${tableName}:`, error.message);
        }
    }

    /**
     * Vérifie les métriques de performance
     */
    async checkPerformanceMetrics() {
        try {
            // Vérifier les temps de réponse des requêtes lentes
            const { data, error } = await supabase.rpc('exec_sql', {
                sql: `
                    SELECT query, mean_time, calls
                    FROM pg_stat_statements 
                    WHERE mean_time > 1000  -- > 1 seconde
                    ORDER BY mean_time DESC 
                    LIMIT 5;
                `
            });
            
            if (error) {
                // pg_stat_statements peut ne pas être activé
                console.log('[DatabaseMonitor] ℹ️ pg_stat_statements non disponible');
                return;
            }
            
            if (data && data.length > 0) {
                console.warn(`[DatabaseMonitor] ⚠️ ${data.length} requêtes lentes détectées`);
                data.forEach(query => {
                    console.warn(`[DatabaseMonitor] Lente: ${query.mean_time}ms - ${query.query.substring(0, 100)}...`);
                });
            }
            
        } catch (error) {
            console.warn('[DatabaseMonitor] Erreur perf metrics:', error.message);
        }
    }

    /**
     * Effectue une vérification complète
     */
    async performFullCheck() {
        console.log('[DatabaseMonitor] 🔍 Vérification complète...');
        
        // Stats détaillées
        const stats = await this.getDetailedStats();
        console.log('[DatabaseMonitor] Statistiques détaillées:', stats);
        
        // Vérifier les indexes
        await this.checkIndexesHealth();
        
        // Vérifier les contraintes
        await this.checkConstraintsHealth();
        
        // Générer rapport
        await this.generateHealthReport();
    }

    /**
     * Obtient des statistiques détaillées
     */
    async getDetailedStats() {
        try {
            const { data, error } = await supabase.rpc('exec_sql', {
                sql: `
                    SELECT 
                        table_name,
                        pg_size_pretty(pg_total_relation_size('public.' || table_name)) as size,
                        pg_total_relation_size('public.' || table_name) as size_bytes,
                        (SELECT count(*) FROM public.||table_name) as row_count,
                        (SELECT max(created_at) FROM public.||table_name WHERE created_at IS NOT NULL) as last_insert
                    FROM information_schema.tables 
                    WHERE table_schema = 'public'
                    ORDER BY pg_total_relation_size('public.' || table_name) DESC;
                `
            });
            
            return data || [];
            
        } catch (error) {
            console.error('[DatabaseMonitor] Erreur stats détaillées:', error.message);
            return [];
        }
    }

    /**
     * Vérifie la santé des indexes
     */
    async checkIndexesHealth() {
        try {
            const { data, error } = await supabase.rpc('exec_sql', {
                sql: `
                    SELECT 
                        schemaname,
                        tablename,
                        indexname,
                        indexdef
                    FROM pg_indexes 
                    WHERE schemaname = 'public'
                    ORDER BY tablename, indexname;
                `
            });
            
            if (error) throw error;
            
            console.log(`[DatabaseMonitor] 📊 Indexes: ${data.length} trouvés`);
            
            // Vérifier les indexes manquants sur les colonnes fréquemment utilisées
            const criticalColumns = ['chat_id', 'created_at', 'status'];
            const tablesNeedingIndexes = [];
            
            // Logique simplifiée - en production, utiliser pg_stat_user_tables
            for (const table of ['memories', 'agent_actions', 'facts']) {
                for (const column of criticalColumns) {
                    const hasIndex = data.some(idx => 
                        idx.tablename === table && idx.indexdef.includes(column)
                    );
                    
                    if (!hasIndex) {
                        tablesNeedingIndexes.push(`${table}.${column}`);
                    }
                }
            }
            
            if (tablesNeedingIndexes.length > 0) {
                console.warn(`[DatabaseMonitor] ⚠️ Indexes manquants suggérés:`, tablesNeedingIndexes);
            }
            
        } catch (error) {
            console.error('[DatabaseMonitor] Erreur indexes:', error.message);
        }
    }

    /**
     * Vérifie la santé des contraintes
     */
    async checkConstraintsHealth() {
        try {
            const { data, error } = await supabase.rpc('exec_sql', {
                sql: `
                    SELECT 
                        conname as constraint_name,
                        contype as constraint_type,
                        conrelid::regclass as table_name
                    FROM pg_constraint 
                    WHERE connamespace = 'public'::regnamespace
                    ORDER BY table_name, constraint_name;
                `
            });
            
            if (error) throw error;
            
            console.log(`[DatabaseMonitor] 🔒 Contraintes: ${data.length} trouvées`);
            
            // Vérifier les contraintes manquantes
            const expectedConstraints = [
                { table: 'facts', constraint: 'facts_chat_key_unique' }
            ];
            
            for (const expected of expectedConstraints) {
                const hasConstraint = data.some(c => 
                    c.table_name === expected.table && c.constraint_name === expected.constraint
                );
                
                if (!hasConstraint) {
                    console.warn(`[DatabaseMonitor] ⚠️ Contrainte manquante: ${expected.constraint} sur ${expected.table}`);
                }
            }
            
        } catch (error) {
            console.error('[DatabaseMonitor] Erreur contraintes:', error.message);
        }
    }

    /**
     * Génère un rapport de santé
     */
    async generateHealthReport() {
        const stats = await this.getDatabaseStats();
        const detailedStats = await this.getDetailedStats();
        
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                totalTables: stats.tables.length,
                totalSize: stats.totalSizePretty,
                largestTable: stats.tables[0]?.name || 'N/A',
                largestSize: stats.tables[0]?.size_pretty || 'N/A'
            },
            tables: detailedStats.map(table => ({
                name: table.table_name,
                size: table.size,
                rows: table.row_count,
                lastInsert: table.last_insert
            })),
            recommendations: await this.generateRecommendations()
        };
        
        // Sauvegarder le rapport
        await this.saveHealthReport(report);
        
        console.log('[DatabaseMonitor] 📋 Rapport de santé généré');
        return report;
    }

    /**
     * Génère des recommandations basées sur l'analyse
     */
    async generateRecommendations() {
        const recommendations = [];
        
        try {
            const stats = await this.getDatabaseStats();
            
            // Recommandation 1: Tables trop grosses
            for (const table of stats.tables) {
                if (table.size_bytes > this.thresholds.critical) {
                    recommendations.push({
                        type: 'size',
                        priority: 'high',
                        table: table.name,
                        message: `Table ${table.name} dépasse 500MB (${table.size_pretty}). Consider cleanup.`,
                        action: 'cleanup'
                    });
                }
            }
            
            // Recommandation 2: Vérifier les tables sans index
            const { data: indexes } = await supabase.rpc('exec_sql', {
                sql: `
                    SELECT table_name 
                    FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name NOT IN (
                        SELECT tablename 
                        FROM pg_indexes 
                        WHERE schemaname = 'public'
                    );
                `
            });
            
            if (indexes?.length > 0) {
                recommendations.push({
                    type: 'performance',
                    priority: 'medium',
                    tables: indexes.map(i => i.table_name),
                    message: 'Tables sans index détectées',
                    action: 'add_indexes'
                });
            }
            
        } catch (error) {
            console.error('[DatabaseMonitor] Erreur recommandations:', error.message);
        }
        
        return recommendations;
    }

    /**
     * Envoie une alerte critique
     */
    async sendCriticalAlert(tableName, size) {
        const alertKey = `critical_${tableName}`;
        
        if (this.alertedTables.has(alertKey)) return; // Déjà alerté
        
        const alert = {
            type: 'critical',
            table: tableName,
            size: this.formatBytes(size),
            message: `Table ${tableName} dépasse 500MB (${this.formatBytes(size)}) - Action immédiate requise`,
            timestamp: new Date().toISOString()
        };
        
        console.error(`[DatabaseMonitor] 🚨 ALERTE CRITIQUE:`, alert);
        
        // Sauvegarder dans la DB
        await supabase.from('system_alerts').insert({
            type: 'db_size_critical',
            severity: 'critical',
            message: alert.message,
            metadata: alert
        });
        
        this.alertedTables.add(alertKey);
        
        // Notification (dans une vraie app, envoyer email/Slack ici)
        await this.sendNotification(alert);
    }

    /**
     * Envoie une alerte warning
     */
    async sendWarningAlert(tableName, size) {
        const alertKey = `warning_${tableName}`;
        
        if (this.alertedTables.has(alertKey)) return;
        
        const alert = {
            type: 'warning',
            table: tableName,
            size: this.formatBytes(size),
            message: `Table ${tableName} dépasse 100MB (${this.formatBytes(size)}) - Surveillance recommandée`,
            timestamp: new Date().toISOString()
        };
        
        console.warn(`[DatabaseMonitor] ⚠️ ALERTE WARNING:`, alert);
        
        // Sauvegarder dans la DB
        await supabase.from('system_alerts').insert({
            type: 'db_size_warning',
            severity: 'warning',
            message: alert.message,
            metadata: alert
        });
        
        this.alertedTables.add(alertKey);
    }

    /**
     * Envoie une alerte de croissance
     */
    async sendGrowthAlert(tableName, growthRate) {
        const alert = {
            type: 'growth',
            table: tableName,
            growthRate: Math.round(growthRate * 100),
            message: `Table ${tableName} a une croissance de +${Math.round(growthRate*100)}% sur 7 jours`,
            timestamp: new Date().toISOString()
        };
        
        console.warn(`[DatabaseMonitor] 📈 ALERTE CROISSANCE:`, alert);
        
        await supabase.from('system_alerts').insert({
            type: 'db_growth_warning',
            severity: 'warning',
            message: alert.message,
            metadata: alert
        });
    }

    /**
     * Envoie une notification (placeholder pour intégration réelle)
     */
    async sendNotification(alert) {
        // Dans une vraie application, envoyer email/Slack/SMS ici
        console.log(`[DatabaseMonitor] 📧 Notification envoyée: ${alert.message}`);
    }

    /**
     * Sauvegarde le rapport de santé
     */
    async saveHealthReport(report) {
        try {
            await supabase.from('db_health_reports').insert({
                timestamp: report.timestamp,
                report_data: report,
                summary: report.summary
            });
        } catch (error) {
            console.error('[DatabaseMonitor] Erreur sauvegarde rapport:', error.message);
        }
    }

    /**
     * Obtient la prochaine vérification quotidienne (6h du matin)
     */
    getNextDailyCheck() {
        const now = new Date();
        const next = new Date(now);
        next.setHours(6, 0, 0, 0);
        
        if (next <= now) {
            next.setDate(next.getDate() + 1);
        }
        
        return next - now;
    }

    /**
     * Formate les bytes en format lisible
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Obtient le statut actuel du monitoring
     */
    getStatus() {
        return {
            active: this.monitoringActive,
            lastCheck: new Date().toISOString(),
            thresholds: this.thresholds,
            activeAlerts: this.alertedTables.size
        };
    }
}

// Export singleton
export const databaseMonitor = new DatabaseMonitor();
export default databaseMonitor;