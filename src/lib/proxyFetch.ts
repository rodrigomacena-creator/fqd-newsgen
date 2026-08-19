import { ProxyAgent, fetch as undiciFetch } from "undici";

const PROXY_HOST = process.env.RESIDENTIAL_PROXY_HOST;
const PROXY_PORT = process.env.RESIDENTIAL_PROXY_PORT;
const PROXY_USER = process.env.RESIDENTIAL_PROXY_USER;
const PROXY_PASSWORD = process.env.RESIDENTIAL_PROXY_PASSWORD;

/**
 * O YouTube trata IPs de datacenter (Vercel, VPS, etc.) de forma diferente de IPs
 * residenciais e bloqueia a extração de transcrição nesses casos. Quando as variáveis
 * de proxy residencial estão configuradas, cada chamada usa uma sessão aleatória
 * (IP residencial diferente) pra reduzir a chance de um IP específico ser limitado.
 */
export function getYoutubeFetch(): typeof fetch {
  if (!PROXY_HOST || !PROXY_PORT || !PROXY_USER || !PROXY_PASSWORD) {
    return fetch;
  }

  const session = Math.floor(Math.random() * 1_000_000);
  const proxyUrl = `http://${PROXY_USER}-${session}:${PROXY_PASSWORD}@${PROXY_HOST}:${PROXY_PORT}`;
  const agent = new ProxyAgent(proxyUrl);

  return ((url: string | URL, init?: RequestInit) =>
    undiciFetch(url as string, {
      ...(init as Record<string, unknown>),
      dispatcher: agent,
    })) as unknown as typeof fetch;
}
