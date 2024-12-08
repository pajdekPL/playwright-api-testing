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
