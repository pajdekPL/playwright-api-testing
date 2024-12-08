# API Testing with Playwright and OpenAPI-Generated Types

This article demonstrates how to create a robust API testing framework using PlayWright and OpenAPI documentation. Examples are based on the [Restful-Booker Platform](https://automationintesting.online/), a purpose-built API testing playground. The Restful-Booker Platform provides a realistic environment for learning and practicing API testing techniques, featuring authentication, room management, and other common API operations.

All code examples are available under this [repository](https://github.com/pajdekPL/playwright-api-testing).

## Table of Contents

1. [Project Setup](#project-setup)
2. [Project Structure](#project-structure)
3. [OpenAPI Type Generation](#openapi-type-generation)
4. [Building Type-Safe API Clients](#building-type-safe-api-clients)
5. [Creating API Tests](#creating-api-tests)
6. [Best Practices](#best-practices)
7. [Final Suggestions](#final-suggestions)

## Project Setup

First, set up a new project with the necessary dependencies:

```bash
npm init playwright@latest
npm install -D openapi-typescript # You can skip this if you finished the previous step
npm install dotenv # For managing environment variables
```

Create a `.env` file in the root of your project to store environment variables:

```
USERNAME=admin
PASSWORD=password
BASE_API_URL=https://automationintesting.online/
```

Configure TypeScript in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "commonjs",
    "baseUrl": ".",
    "esModuleInterop": true,
    "strict": true,
    "paths": {
      "@api/*": ["src/api/*"],
      "@expects/*": ["src/expects/*"],
      "@models/*": ["src/models/*"],
      "@fixtures/*": ["src/fixtures/*"]
    }
  }
}
```

Import and configure dotenv at the beginning of your `playwright.config.ts` file:

```typescript
import dotenv from "dotenv";
dotenv.config();

export const BASE_API_URL = process.env.BASE_API_URL || "default-url";

// Rest of your Playwright configuration
```

## Project Structure

Organize your project with the following structure to maintain clarity and manageability:

```
project-root/
│
├── src/
│   ├── api/
|   |   ├── base-api-client.ts
│   │   ├── fetch-helpers.ts
│   │   ├── api-statuses.ts
│   │   ├── api-clients/
│   │   │   ├── rooms-api-client.ts
│   │   │   └── auth-api-client.ts
│   │   ├── types/
│   │   │   ├── room.d.ts
│   │   │   └── auth.d.ts
│   │   └── fixtures/
│   │       ├── api.fixture.ts
│   └── tests/
│       └── api/
│           └── rooms.api.spec.ts
│
├── .env
├── playwright.config.ts
├── package.json
└── tsconfig.json
```

This structure separates API clients, types, and tests, making it easier to navigate and maintain your codebase. The `api` directory contains all API-related files, including clients and generated types.

## OpenAPI Type Generation

### Setting Up Type Generation

1. **Install the required package:**

   ```bash
   npm install -D openapi-typescript  # You can skip this if you finished the previous step
   ```

2. **Download your OpenAPI/Swagger specifications**:

   In this article, we will use two APIs: the Room API and the Auth API. Download their respective OpenAPI/Swagger specifications:

   - **Room API**: [room.json](https://automationintesting.online/room/v3/api-docs/room-api)
   - **Auth API**: [auth.json](https://automationintesting.online/auth/v3/api-docs/auth-api)

3. **Generate TypeScript types using the command:**

   ```bash
   npx openapi-typescript room.json -o room.d.ts
   npx openapi-typescript auth.json -o auth.d.ts
   ```

   Ensure you have both specifications to generate the necessary TypeScript types for our API clients. You can copy and paste the JSON files directly into your project folder with names `room.json` and `auth.json`, or you can use curl to download them from the links provided above. Move the generated `.d.ts` files to the appropriate directory under `src/api/types/`

### Fetch Helpers

The `fetch-helpers.ts` file contains utility functions and types that simplify making HTTP requests. It provides a consistent way to handle API requests and responses, ensuring that all API interactions are type-safe and follow a standard pattern.

#### Contents of `fetch-helpers.ts`

- **FetchConfig**: A type that defines the configuration for making requests, including base URL and headers.
- **FetchOptions**: A type that specifies options for individual requests, such as method, headers, and body.
- **FetchResponse**: A type that represents the response from an API request, including status and data.
- **fetchWithConfig**: A function that performs an HTTP request using the provided configuration and options, returning a `FetchResponse`.

These helpers ensure that API requests are made consistently across the project, reducing code duplication and potential errors. By using TypeScript types, they also provide compile-time checks for request and response data, improving overall code quality.

Here's an example of what the `fetch-helpers.ts` might look like:

```typescript
// src/api/fetch-helpers.ts
import { APIRequestContext } from "@playwright/test";

export interface FetchConfig {
  baseURL: string;
  headers: Record<string, string>;
  validateStatus?: (status: number) => boolean;
}

export interface FetchResponse<T = unknown> {
  status: number;
  statusText: string;
  data: T;
  headers: Record<string, string>;
}

export interface FetchOptions<T = unknown> {
  method?: string;
  headers?: Record<string, string>;
  data?: T;
  params?: Record<string, string | number | boolean | undefined>;
}

export async function fetchWithConfig<T>(
  request: APIRequestContext,
  url: string,
  options: FetchOptions<T> = {}
): Promise<FetchResponse<T>> {
  const { method = "GET", headers = {}, data, params } = options;

  // Build URL with query parameters
  const urlObj = new URL(url);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        urlObj.searchParams.append(key, String(value));
      }
    });
  }

  const response = await request.fetch(urlObj.toString(), {
    method,
    headers,
    data: data !== undefined ? JSON.stringify(data) : undefined,
  });

  const responseData = (await response.json().catch(() => null)) as T;
  const responseHeaders = response.headers();

  return {
    status: response.status(),
    statusText: response.statusText(),
    data: responseData,
    headers: responseHeaders,
  };
}
```

### Using Generated Types

Before implementing API clients, let's create an api-statuses.ts file to define API status codes.

```typescript
// src/api/api-statuses.ts
export const API_STATUSES = {
  SUCCESSFUL_200_STATUS: 200,
  CREATED_201_STATUS: 201,
  ACCEPTED_202_STATUS: 202,
  ACCESS_DENIED_403_STATUS: 403,
  NO_CONTENT_204_STATUS: 204,
  NOT_FOUND_404_STATUS: 404,
  UNAUTHORIZED_401_STATUS: 401,
  UNPROCESSABLE_ENTITY_422_STATUS: 422,
};
```

### Using Playwright Custom Expect

We will also need a new custom expect extension to extend Playwright's `expect` capabilities in order to make API assertions more readable and maintainable. Please create the following api-expects.ts under the src/expects directory:

```typescript
// src/expects/api-expects.ts
import { expect as baseExpect } from "@playwright/test";
import { FetchResponse } from "@api/fetch-helpers";

export { test } from "@playwright/test";

export const expect = baseExpect.extend({
  toHaveStatusCode(
    response: FetchResponse,
    status: number
  ): { pass: boolean; message: () => string } {
    let pass: boolean;
    let matcherResult: string;
    try {
      baseExpect(response.status).toBe(status);
      pass = true;
      matcherResult = "Passed";
    } catch (error) {
      matcherResult = `${String(error)}, statusText: ${
        response.statusText
      } response data: ${JSON.stringify(
        response.data
      )} headers: ${JSON.stringify(response.headers)}`;
      pass = false;
    }
    return {
      message: () => matcherResult,
      pass: pass,
    };
  },
});
```

Let's implement our API clients using the generated types:

```typescript
// api/base-api-client.ts
import {
  FetchConfig,
  FetchOptions,
  FetchResponse,
  fetchWithConfig,
} from "@api/fetch-helpers";
import { APIRequestContext } from "@playwright/test";

export type RequestParams<TData = unknown> = Omit<
  FetchOptions<TData>,
  "data"
> & {
  data?: TData;
};

export class BaseApiClient {
  protected request: APIRequestContext;
  protected config: FetchConfig;
  protected basePath: string;

  constructor(
    config: FetchConfig,
    request: APIRequestContext,
    basePath: string
  ) {
    this.config = config;
    this.request = request;
    this.basePath = basePath;
  }

  protected async makeRequest<T, D extends T = T>(
    endpoint: string,
    options: RequestParams<D> = {}
  ): Promise<FetchResponse<T>> {
    const url = new URL(endpoint, this.config.baseURL).toString();
    return fetchWithConfig<T>(this.request, url, {
      ...options,
      headers: {
        ...this.config.headers,
        ...options.headers,
      },
    });
  }
}
```

### API Client Example

```typescript
// src/api/api-clients/rooms-api-client.ts
import { BaseApiClient } from "@api/base-api-client";
import { FetchConfig, FetchResponse } from "@api/fetch-helpers";
import type { components } from "@api/types/room";
import { APIRequestContext } from "@playwright/test";
import { BASE_API_URL } from "playwright.config";
import { expect } from "@expects/api-expects";
import { API_STATUSES } from "@api/statuses.api";
export type Room = components["schemas"]["Room"];
export type Rooms = components["schemas"]["Rooms"];

interface RoomQueryParams {
  roomName?: string;
  type?: string;
  accessible?: boolean;
  [key: string]: string | boolean | undefined;
}

export const ROOMS_API_URL = new URL("/room/", BASE_API_URL).toString();

export class RoomsApiClient extends BaseApiClient {
  constructor(config: FetchConfig, request: APIRequestContext) {
    super(config, request, "/room/");
  }

  async getRoomsRaw(params?: RoomQueryParams): Promise<FetchResponse<Rooms>> {
    return this.makeRequest<Rooms, never>(this.basePath, {
      method: "GET",
      params,
    });
  }

  async getRooms(params?: RoomQueryParams): Promise<Rooms> {
    const response = await this.getRoomsRaw(params);
    expect(response).toHaveStatusCode(API_STATUSES.SUCCESSFUL_200_STATUS);
    return response.data;
  }

  async getRoomRaw(id: number): Promise<FetchResponse<Room>> {
    return this.makeRequest<Room, never>(`${this.basePath}${id}`, {
      method: "GET",
    });
  }

  async getRoom(id: number): Promise<Room> {
    const response = await this.getRoomRaw(id);
    expect(response).toHaveStatusCode(API_STATUSES.SUCCESSFUL_200_STATUS);
    return response.data;
  }

  async createRoomRaw(data: Room): Promise<FetchResponse<Room>> {
    return this.makeRequest<Room, Room>(this.basePath, {
      method: "POST",
      data,
    });
  }

  async createRoom(data: Room): Promise<Room> {
    const response = await this.createRoomRaw(data);
    expect(response).toHaveStatusCode(API_STATUSES.CREATED_201_STATUS);
    return response.data;
  }

  async updateRoomRaw(id: number, data: Room): Promise<FetchResponse<Room>> {
    return this.makeRequest<Room, Room>(
      new URL(`${id}`, this.basePath).toString(),
      {
        method: "PUT",
        data,
      }
    );
  }

  async updateRoom(id: number, data: Room): Promise<Room> {
    const response = await this.updateRoomRaw(id, data);
    expect(response).toHaveStatusCode(API_STATUSES.SUCCESSFUL_200_STATUS);
    return response.data;
  }

  async deleteRoomRaw(id: number): Promise<FetchResponse<null>> {
    return this.makeRequest<null, never>(`${this.basePath}${id}`, {
      method: "DELETE",
    });
  }

  async deleteRoom(id: number): Promise<void> {
    const response = await this.deleteRoomRaw(id);
    expect(response).toHaveStatusCode(API_STATUSES.ACCEPTED_202_STATUS);
  }
}

export function createRoomsApiClient(
  request: APIRequestContext,
  cookies = "",
  token = ""
): RoomsApiClient {
  const config: FetchConfig = {
    baseURL: BASE_API_URL,
    headers: {
      "X-api-version": "1.0",
      "content-type": "application/json;charset=UTF-8",
      Cookie: cookies,
      Authorization: token ? `Bearer ${token}` : "",
    },
    validateStatus: () => true,
  };

  return new RoomsApiClient(config, request);
}
```

### Authentication API Client Example

In order to use the rooms client with authentication, we'll create an authentication API client:

```typescript
// src/api/api-clients/auth-api-client.ts
import { BaseApiClient } from "@api/base-api-client";
import { FetchConfig, FetchResponse } from "@api/fetch-helpers";
import { API_STATUSES } from "@api/statuses.api";
import type { components } from "@api/types/auth";
import { expect } from "@expects/api-expects";
import { APIRequestContext } from "@playwright/test";
import { BASE_API_URL } from "playwright.config";

export const AUTH_API_URL = new URL("/auth/", BASE_API_URL).toString();

export type Auth = components["schemas"]["Auth"];
export type Token = components["schemas"]["Token"];

export class AuthApiClient extends BaseApiClient {
  constructor(config: FetchConfig, request: APIRequestContext) {
    super(config, request, "/auth/");
  }

  async loginRaw(data: Auth): Promise<FetchResponse<Auth>> {
    return this.makeRequest<Auth>(`${this.basePath}login`, {
      method: "POST",
      data,
    });
  }

  async login(data: Auth): Promise<FetchResponse> {
    const response = await this.loginRaw(data);
    expect(response).toHaveStatusCode(API_STATUSES.SUCCESSFUL_200_STATUS);
    return response;
  }

  async loginAndReturnToken(data: Auth): Promise<string> {
    const response = await this.login(data);
    const setCookie = response.headers["set-cookie"];

    if (!setCookie) {
      throw new Error("Token not found in response headers");
    }

    const cookieValue =
      typeof setCookie === "string" ? setCookie : setCookie[0];
    const tokenMatch = /token=([^;]+)/.exec(cookieValue);
    if (!tokenMatch) {
      throw new Error("Token format not recognized in cookie");
    }

    return tokenMatch[1];
  }

  async validateToken(token: string): Promise<FetchResponse<Token>> {
    const response = await this.makeRequest<Token>(`${this.basePath}validate`, {
      method: "POST",
      data: { token },
    });

    if (!response.data?.token) {
      throw new Error("Invalid token response from server");
    }

    return response;
  }

  async clearToken(token: string): Promise<FetchResponse<Token>> {
    return this.makeRequest<Token>(`${this.basePath}logout`, {
      method: "POST",
      data: { token },
    });
  }
}

export function createAuthApiClient(
  request: APIRequestContext,
  token = "",
  cookies = ""
): AuthApiClient {
  const config: FetchConfig = {
    baseURL: BASE_API_URL,
    headers: {
      "X-api-version": "1.0",
      "content-type": "application/json;charset=UTF-8",
      Cookie: cookies ? `token=${cookies}` : "",
      Authorization: token ? `Bearer ${token}` : "",
    },
    validateStatus: () => true,
  };

  return new AuthApiClient(config, request);
}
```

## Creating API Tests

### Using Playwright Fixtures

Playwright's fixtures provide a powerful way to handle test setup and teardown. Instead of using `beforeEach`, we can create reusable fixtures that manage API client lifecycle and authentication. Please create the following fixture api.fixture.ts under the src/fixtures directory:

```typescript
// src/fixtures/api.fixture.ts
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
```

### Test Examples

```typescript
// tests/api/rooms.api.spec.ts
import { test } from "@fixtures/api-fixtures";
import { expect } from "@playwright/test";
import type { Room } from "@api/api-clients/rooms-api-client";

test.describe("Rooms API", () => {
  test("should create and retrieve a room as authenticated user", async ({
    roomsAuthenticatedApiClient: client,
  }) => {
    const newRoom: Room = {
      roomName: "Suite 101",
      type: "Double",
      accessible: true,
      roomPrice: 100,
    };

    const createdRoom = await client.createRoom(newRoom);
    expect(createdRoom.roomName).toBe(newRoom.roomName);

    const room = await client.getRoom(createdRoom.roomid as number);
    expect(room).toEqual(createdRoom);
  });

  test("should handle room deletion scenarios", async ({
    roomsAuthenticatedApiClient: client,
  }) => {
    // Create a room to delete
    const roomToDelete: Room = {
      roomName: "Temporary Room",
      type: "Double",
      accessible: true,
      roomPrice: 100,
      description: "Room to be deleted",
    };

    // Create and verify the room exists
    const createdRoom = await client.createRoom(roomToDelete);
    expect(createdRoom.roomid).toBeTruthy();

    // Delete the room
    await client.deleteRoom(createdRoom.roomid!);

    // Verify the room no longer exists
    const getRoomPromise = client.getRoom(createdRoom.roomid!);
    // 500 error is how our API handles getting a non-existent room
    await expect(getRoomPromise).rejects.toThrow(/500/);

    // Attempt to delete non-existent room
    const deleteNonExistentPromise = client.deleteRoom(99999);
    await expect(deleteNonExistentPromise).rejects.toThrow(/404/);
  });
});
```

## Best Practices

By combining Playwright's powerful testing capabilities with TypeScript and OpenAPI-generated types, you can create a robust, type-safe API testing framework. This approach helps catch errors early, improves maintainability, and provides excellent developer experience through IDE support and auto-completion.

Remember to keep your OpenAPI specification up-to-date and regenerate types when the API changes. This ensures your tests always reflect the current state of your API contract.

Creating dedicated API clients is a great way of building a maintainable API testing framework. Here's why:

- **Type Safety**: API clients encapsulate the OpenAPI-generated types, ensuring type-safe requests and responses.
- **Code Reusability**: Instead of duplicating API calls across tests, we centralize them in dedicated clients.
- **Response Validation**: We can enforce consistent response status code checks and error handling.
- **Maintainability**: When API endpoints change, we only need to update the client, not individual tests.
- **Better Developer Experience**: IDE autocompletion for request/response types makes writing tests easier.

### Key Takeaways

- **Maintainability**: Centralize API logic in clients to reduce duplication.
- **Type Safety**: Leverage TypeScript and OpenAPI for robust type checking.
- **Automation**: Use CI/CD pipelines to automate type generation and testing.
- **Documentation**: Keep your APIs and tests well-documented.
- **Fixtures**: Use fixtures to simplify setup and teardown.

Feel free to explore more advanced testing strategies and tools to further enhance your API testing framework!

## Final Suggestions

To successfully implement API testing frameworks like the one described in this article, it's crucial to have comprehensive and up-to-date API documentation. This ensures that all team members and automated systems have a clear understanding of the API's capabilities and expected behaviors.

Using strong typing, as demonstrated with TypeScript and OpenAPI-generated types, not only enhances code quality and maintainability but also facilitates the generation of tests using AI tools. Strong typing provides a clear contract for what the API expects and returns, which can be leveraged by AI to automate test generation and validation, improving both efficiency and accuracy.

By integrating these practices, you can create a robust, scalable, and efficient API testing framework that adapts to evolving requirements and technologies.
