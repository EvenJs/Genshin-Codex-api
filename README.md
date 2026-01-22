# Genshin Codex API

Genshin Codex API is a **NestJS-based REST API** for a Genshin Impact companion application.

This backend service is responsible for:
- User authentication (JWT)
- Multi game-account (UID) management
- Achievement progress tracking (per UID)
- Character & build data
- Rule-based + AI-assisted recommendations (planned)

This repository contains **backend API code only**.

---

## 🏗 Tech Stack

- **Framework**: NestJS (TypeScript)
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Authentication**: JWT (Access Token)
- **Validation**: DTO + ValidationPipe
- **Testing**: Postman / e2e tests
- **API Docs**: Swagger (optional)

---

## 📂 Repository Scope

- ✅ Backend API only
- ❌ No frontend code
- ❌ No monorepo / workspace configuration
- ❌ No client-side logic

---

## 🚀 Getting Started

### 1️⃣ Prerequisites

- Node.js >= 18
- npm or pnpm
- PostgreSQL (local or cloud)

---

### 2️⃣ Install Dependencies

```bash
npm install
# or
pnpm install
