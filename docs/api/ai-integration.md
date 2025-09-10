# AI Integration API Documentation

## Overview

The **DevAI Coach** platform provides a unified API for integrating with multiple AI providers (**OpenAI, Anthropic, Google**) with built-in **rate limiting, usage tracking, and copy/paste detection**.

---

## Authentication

All AI endpoints require authentication via **Bearer token** in the `Authorization` header.

---

## Endpoints

### **POST /ai/chat**

Send a chat request to an AI provider.

**Request Body:**

```json
{
  "provider": "openai" | "anthropic" | "google",
  "model": "string",
  "messages": [
    {
      "role": "system" | "user" | "assistant",
      "content": "string"
    }
  ],
  "temperature": 0.7,
  "maxTokens": 2000,
  "stream": false,
  "attemptId": "string (optional)"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "string",
    "provider": "string",
    "model": "string",
    "content": "string",
    "usage": {
      "promptTokens": 100,
      "completionTokens": 200,
      "totalTokens": 300
    },
    "cost": 0.0045
  },
  "usage": {
    "tokens": 300,
    "cost": 0.0045,
    "remaining": 97
  }
}
```

---

### **POST /ai/track-copy-paste**

Track copy/paste events for dependency metric calculation.

**Request Body:**

```json
{
  "attemptId": "string",
  "action": "copy" | "paste",
  "content": "string",
  "sourceLines": 10,
  "targetLines": 10,
  "aiInteractionId": "string (optional)"
}
```

---

### **GET /ai/usage**

Get usage statistics for the authenticated user.

**Query Parameters:**

* `days`: Number of days to retrieve (default: 30)

**Response:**

```json
{
  "usage": {
    "total": {
      "requests": 150,
      "tokens": 45000,
      "cost": 2.35
    },
    "byProvider": {
      "openai": {
        "requests": 100,
        "tokens": 30000,
        "cost": 1.5
      }
    },
    "daily": [
      {
        "date": "2024-01-01",
        "requests": 10,
        "tokens": 3000,
        "cost": 0.15
      }
    ]
  },
  "quota": {
    "requests": {
      "minute": 18,
      "hour": 85
    },
    "tokens": {
      "daily": 55000
    }
  }
}
```

---

### **GET /ai/models**

Get available models for each provider.

**Response:**

```json
{
  "models": {
    "openai": [
      {
        "id": "gpt-4o",
        "name": "GPT-4 Optimized",
        "contextWindow": 128000,
        "inputCost": 0.005,
        "outputCost": 0.015,
        "capabilities": ["chat", "code", "function_calling", "vision"]
      }
    ],
    "anthropic": [...],
    "google": [...]
  }
}
```

---

## Rate Limiting

Default limits per user:

* **Per Minute:** 20 requests
* **Per Hour:** 100 requests
* **Per Day:** 100,000 tokens
* **Burst Limit:** 5 requests per second

**Rate limit headers included in responses:**

* `X-RateLimit-Limit`: Maximum requests allowed
* `X-RateLimit-Remaining`: Remaining requests
* `X-RateLimit-Reset`: Time when limit resets (Unix timestamp)

---

## Streaming Responses

For streaming responses, set `"stream": true` in the request.
The response will be **Server-Sent Events (SSE):**

```
data: {"content": "Hello"}
data: {"content": " world"}
data: [DONE]
```

---

## Error Handling

**Error Response Example:**

```json
{
  "error": "Rate limit exceeded",
  "message": "Minute limit exceeded. Max 20 requests per minute.",
  "resetAt": "2024-01-01T12:00:00.000Z"
}
```

**Common Error Codes:**

* `400`: Invalid request (bad provider/model)
* `401`: Authentication failed
* `429`: Rate limit exceeded
* `500`: Internal server error

---

## Best Practices

* Cache responses when possible to reduce API calls.
* Use appropriate models for your use case (**GPT-3.5 for simple tasks, GPT-4 for complex**).
* Implement retry logic with **exponential backoff** for rate limits.
* Track token usage to optimize costs.
* Use **streaming** for better UX in real-time interactions.

---

## Cost Optimization

Tips for reducing costs:

* Use cheaper models when possible.
* Implement response caching.
* Optimize prompt length.
* Use `temperature = 0` for deterministic outputs.
* Set appropriate `maxTokens` limits.

## Provider-Specific Information
### OpenAI
Models available:

* gpt-4o: Best for complex tasks
* gpt-4-turbo: Good balance of cost/performance
* gpt-3.5-turbo: Fast and cheap for simple tasks

### Anthropic
Models available:

* claude-3-opus: Most capable
* claude-3-sonnet: Balanced
* claude-3-haiku: Fast and efficient

### Google
Models available:

* gemini-1.5-pro: Large context window
* gemini-1.5-flash: Fast responses
* gemini-2.0-flash-exp: Experimental features