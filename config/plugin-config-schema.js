// config/plugin-config-schema.js
/**
 * Configuration Schemas for Plugins
 * Used for validation and default values
 */

export const pluginSchemas = {
    duckduck_search: {
        max_results: {
            type: 'integer',
            default: 5,
            min: 1,
            max: 10
        }
    },
    crawlfire_web: {
        apiKey: {
            type: 'string',
            default: 'fc-YOUR-API-KEY-HERE',
            required: true
        },
        default_formats: {
            type: 'array',
            items: { type: 'string' },
            default: ['markdown']
        },
        timeout_ms: {
            type: 'integer',
            default: 30000
        }
    },
    deep_research: {
        max_iterations: {
            type: 'integer',
            default: 15
        }
    }
};

export default pluginSchemas;
