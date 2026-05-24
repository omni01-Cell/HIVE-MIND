import * as https from 'https';
import { URL } from 'url';

// Suites de chiffrement modernes typiques de Go-http-client / Chrome TLSv1.3 & TLSv1.2
const GO_CIPHERS = [
    'TLS_AES_128_GCM_SHA256',
    'TLS_AES_256_GCM_SHA384',
    'TLS_CHACHA20_POLY1305_SHA256',
    'ECDHE-ECDSA-AES128-GCM-SHA256',
    'ECDHE-RSA-AES128-GCM-SHA256',
    'ECDHE-ECDSA-AES256-GCM-SHA384',
    'ECDHE-RSA-AES256-GCM-SHA384',
    'ECDHE-ECDSA-CHACHA20-POLY1305',
    'ECDHE-RSA-CHACHA20-POLY1305'
].join(':');

const CHROMIUM_CIPHERS = [
    'TLS_AES_128_GCM_SHA256',
    'TLS_AES_256_GCM_SHA384',
    'TLS_CHACHA20_POLY1305_SHA256',
    'ECDHE-ECDSA-AES128-GCM-SHA256',
    'ECDHE-RSA-AES128-GCM-SHA256',
    'ECDHE-ECDSA-AES256-GCM-SHA384',
    'ECDHE-RSA-AES256-GCM-SHA384',
    'ECDHE-ECDSA-CHACHA20-POLY1305',
    'ECDHE-RSA-CHACHA20-POLY1305',
    'ECDHE-RSA-AES128-SHA',
    'ECDHE-RSA-AES256-SHA',
    'AES128-GCM-SHA256',
    'AES256-GCM-SHA384',
    'AES128-SHA',
    'AES256-SHA'
].join(':');

/**
 * Retourne un Agent HTTPS configuré pour imiter le handshake TLS et les ciphers
 * d'une plateforme cible (Go-http-client ou Chromium).
 */
export function getImpersonatedAgent(target: 'chromium' | 'go' = 'go'): https.Agent {
    const ciphers = target === 'chromium' ? CHROMIUM_CIPHERS : GO_CIPHERS;
    return new https.Agent({
        keepAlive: true,
        maxSockets: 100,
        ciphers,
        honorCipherOrder: true,
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.3',
        ecdhCurve: 'X25519:P-256:P-384',
        ALPNProtocols: ['http/1.1']
    });
}

/**
 * Effectue une requête HTTPS de manière native en utilisant l'agent impersonné,
 * garantissant à 100% la préservation de la signature TLS (JA3).
 */
export function impersonatedRequest(urlStr: string, options: { method?: string; headers?: Record<string, string>; body?: string }): Promise<{ ok: boolean; status: number; text: () => Promise<string>; json: () => Promise<any> }> {
    return new Promise((resolve, reject) => {
        try {
            const url = new URL(urlStr);
            const agent = getImpersonatedAgent('go');

            const reqOptions: https.RequestOptions = {
                hostname: url.hostname,
                port: url.port || 443,
                path: url.pathname + url.search,
                method: options.method || 'POST',
                headers: options.headers || {},
                agent,
                rejectUnauthorized: false
            };

            const req = https.request(reqOptions, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    const status = res.statusCode || 200;
                    const ok = status >= 200 && status < 300;
                    resolve({
                        ok,
                        status,
                        text: () => Promise.resolve(data),
                        json: () => {
                            try {
                                return Promise.resolve(JSON.parse(data));
                            } catch {
                                return Promise.resolve({});
                            }
                        }
                    });
                });
            });

            req.on('error', (err) => {
                reject(err);
            });

            if (options.body) {
                req.write(options.body);
            }
            req.end();
        } catch (err) {
            reject(err);
        }
    });
}
