// Company authentication uses MSAL with an in-memory browser token cache.
import {
  PublicClientApplication,
  InteractionRequiredAuthError,
} from "@azure/msal-browser";
type AuthConfig = {
  mode: string;
  clientId: string;
  tenantId: string;
  scope: string;
};
let initialization: Promise<PublicClientApplication | null> | null = null;
let config: AuthConfig;
function initialize() {
  if (!initialization)
    initialization = (async () => {
      const response = await fetch("/api/auth/config");
      if (!response.ok)
        throw new Error("Authentication configuration unavailable");
      config = await response.json();
      if (config.mode !== "entra") return null;
      const client = new PublicClientApplication({
        auth: {
          clientId: config.clientId,
          authority: `https://login.microsoftonline.com/${config.tenantId}`,
          redirectUri: window.location.origin,
        },
        cache: { cacheLocation: "memoryStorage" },
      });
      await client.initialize();
      await client.handleRedirectPromise();
      return client;
    })().catch((error) => {
      initialization = null;
      throw error;
    });
  return initialization;
}
export async function accessToken() {
  const client = await initialize();
  if (!client) return null;
  const account = client.getAllAccounts()[0];
  if (!account) return null;
  try {
    return (
      await client.acquireTokenSilent({ account, scopes: [config.scope] })
    ).accessToken;
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) return null;
    throw e;
  }
}
export async function signIn() {
  const client = await initialize();
  if (!client)
    throw new Error(
      "Company authentication is not configured for this development workspace",
    );
  await client.loginPopup({ scopes: [config.scope] });
}
