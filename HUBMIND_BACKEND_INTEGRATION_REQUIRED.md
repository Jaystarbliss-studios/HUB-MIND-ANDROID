# Hub-Mind Backend Integration Specification

## 1. Executive Summary

This document specifies the exact backend extensions required on the Node.js / Express server (`server.ts`) and Cloud Firestore to support real-time cross-device command routing and device mesh management between Android and Windows endpoints.

---

## 2. Required Firestore Schema Additions

### 2.1 Collection: `users/{userId}/devices/{deviceId}`
Store live telemetry and registration info:
```json
{
  "deviceId": "string",
  "deviceName": "string",
  "platform": "WINDOWS | ANDROID | WEB",
  "status": "ONLINE | BUSY | OFFLINE | UNAVAILABLE",
  "capabilities": ["string"],
  "lastSeenAt": "timestamp",
  "publicKey": "string"
}
```

### 2.2 Collection: `users/{userId}/deviceCommands/{commandId}`
Durable cross-device queue and execution audit trail:
```json
{
  "commandId": "string",
  "sourceDeviceId": "string",
  "targetDeviceId": "string",
  "actionType": "string",
  "parameters": "map",
  "status": "CREATED | ROUTED | EXECUTING | COMPLETED | FAILED",
  "result": "map",
  "createdAt": "timestamp"
}
```

---

## 3. Required Server Endpoints in `server.ts`

### 3.1 `GET /api/devices`
- **Auth**: Bearer ID Token.
- **Returns**: Array of device records for authenticated user.

### 3.2 `POST /api/devices/register`
- **Auth**: Bearer ID Token.
- **Body**: `{ deviceId, deviceName, platform, capabilities, publicKey }`.
- **Action**: Upserts `users/{userId}/devices/{deviceId}` and returns pairing status.

### 3.3 `POST /api/devices/dispatch`
- **Auth**: Bearer ID Token.
- **Body**: `CommandEnvelope`.
- **Action**: Validates token, checks `targetDeviceId` ownership, writes command to Firestore queue, and pushes frame over active WebSocket if connected.
