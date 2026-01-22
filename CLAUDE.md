# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Genshin-Codex-api is a NestJS REST API for Genshin Impact game data.

## Development Rules

- Prefer minimal changes and avoid refactors unless requested
- Never generate code that breaks JWT account ownership validation
- Always use DTO + ValidationPipe patterns for request validation
- For bulk operations, use Prisma `$transaction` and idempotent upserts

## Scope & Safety
- Never edit files outside this repo.
- Do not introduce monorepo/workspaces changes here.
- Do not add unrelated libraries. Prefer standard NestJS/Prisma solutions.

## Architecture

- **Framework**: NestJS with TypeScript
- **ORM**: Prisma
- **Authentication**: JWT-based with account ownership validation

### Request Validation Pattern

All endpoints must use DTOs with ValidationPipe:

```typescript
@Post()
create(@Body() createDto: CreateItemDto) {
  return this.service.create(createDto);
}
```

### Bulk Operations Pattern

Use Prisma transactions with idempotent upserts:

```typescript
await prisma.$transaction(
  items.map(item =>
    prisma.item.upsert({
      where: { id: item.id },
      update: item,
      create: item,
    })
  )
);
```

# Project Rules (API) — Genshin Companion

You are working inside the `genshin-companion-api` repository (NestJS + Prisma + PostgreSQL + JWT).
Follow these rules strictly.

## 0) Scope & Safety
- Never edit files outside this repo.
- Do not introduce monorepo/workspaces changes here.
- Do not add unrelated libraries. Prefer standard NestJS/Prisma solutions.

## 1) Architecture
- Use NestJS module structure: Controller -> Service -> Prisma.
- Keep business logic in Services. Controllers should be thin.
- Use DTOs + class-validator for all request bodies and query params.
- Use a dedicated guard or helper for **GameAccount ownership validation** on any route with `accountId`.

## 2) Security (MANDATORY)
- All protected routes must use JWT access token.
- Any route receiving `:accountId` must verify:
  `GameAccount.userId === currentUser.userId`
  If not, return **403 Forbidden**.
- Never trust `userId` from client input.
- Password must be hashed with bcrypt.
- Refresh token must be stored securely (hash in DB) OR use an allowlist table.
- Do not log secrets/tokens.

## 3) API Conventions
- Base URL: `/`
- REST conventions:
  - GET list returns `{ items, total, page, pageSize }`
  - GET detail returns the object
  - Mutations return `{ ok: true }` or the updated entity
- Error responses:
  - 400: validation errors
  - 401: missing/invalid access token
  - 403: ownership violation
  - 404: not found
  - 409: unique constraint conflicts (e.g., duplicate UID)
- Use consistent enums: ProgressStatus (COMPLETED/NOT_COMPLETED)

## 4) Database & Prisma
- Use migrations (no manual DB edits).
- Prefer `upsert` for idempotent writes.
- For bulk operations, use `$transaction`.
- Ensure unique constraints:
  - GameAccount: unique(userId, uid, server)
  - UserAchievement: unique(accountId, achievementId)
  - AccountCharacter: unique(accountId, characterId)

## 5) Testing
- Add e2e tests for:
  - Auth flow (register/login/refresh)
  - Ownership checks for account routes
  - Progress bulk update
- Keep tests deterministic; seed minimal data.

## 6) Code Quality
- TypeScript strict-ish (avoid `any`).
- No duplicate logic; create helpers.
- Every new endpoint must be documented in Swagger decorators.

## 7) Output Rules (when generating code)
- Provide: changed file list + full file contents (not just diffs).
- Keep changes minimal and scoped to the task.
- Include a quick verification section: commands + curl examples.
