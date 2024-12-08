import { test as base, APIRequestContext } from "@playwright/test";
import {
  RoomsApiClient,
  createRoomsApiClient,
} from "@api/api-clients/rooms-api-client";
import {
  AuthApiClient,
  createAuthApiClient,
  Auth,
} from "@api/api-clients/auth-api-client";

interface ApiFixtures {
  roomsApiClient: RoomsApiClient;
  authApiClient: AuthApiClient;
  roomsAuthenticatedApiClient: RoomsApiClient;
}

export const test = base.extend<ApiFixtures>({
  roomsApiClient: async ({ request }, use) => {
    const roomsApiClient = createRoomsApiClient(request);
    await use(roomsApiClient);
  },
  authApiClient: async ({ request }, use) => {
    const authApiClient = createAuthApiClient(request);
    await use(authApiClient);
  },
  roomsAuthenticatedApiClient: async ({ request }, use) => {
    const user: Auth = {
      username: process.env.USERNAME,
      password: process.env.PASSWORD,
    };
    const token = await loginUserAndGetToken(request, user);
    const cookies = `token=${token}`;
    const roomsApiClient = createRoomsApiClient(request, cookies, "");
    await use(roomsApiClient);
  },
});

// Helper function for authentication
async function loginUserAndGetToken(
  request: APIRequestContext,
  user: Auth
): Promise<string> {
  const authApiClient = createAuthApiClient(request);
  const token = await authApiClient.loginAndReturnToken(user);
  return token.replace(/^token=/, "");
}
