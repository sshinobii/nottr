import { verifyAccessToken } from '@privy-io/node';
import { createRemoteJWKSet } from 'jose';

// Privy's official per-app public keys rotate independently of environment configuration.
let cached: { appId: string; keys: ReturnType<typeof createRemoteJWKSet> } | undefined;
export async function verifyPrivyToken(token: string) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId || !/^[a-zA-Z0-9_-]{1,128}$/.test(appId)) throw new Error('Invalid Privy app configuration');
  if (!cached || cached.appId !== appId) cached = { appId, keys: createRemoteJWKSet(new URL(`https://api.privy.io/v1/apps/${appId}/jwks.json`)) };
  return verifyAccessToken({ access_token: token, app_id: appId, verification_key: cached.keys });
}
