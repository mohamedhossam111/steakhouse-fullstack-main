# Steakhouse MIS — Fullstack (Single Link)

This repository contains the fullstack Steakhouse MIS: a Vite/React frontend (`client`) and a Node/Express + PostgreSQL backend (`server`). In **development**, both apps run together. In **production**, the server serves the built React app at **http://localhost:4000** (single link).

## Prerequisites
- Node.js 18+ and npm
- Docker (for local PostgreSQL), or your own running Postgres
- Port 5432 free (for Postgres) and 4000 free (for the app)

## Quick Start (Dev)

```bash
# 1) Install deps in both workspaces
npm run install-all

# 2) Start a local PostgreSQL DB in Docker
docker run --name steakdb \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_DB=steakhouse \
  -p 5432:5432 -d postgres:16

# 3) Create server/.env from example (edit if needed)
cp server/.env.example server/.env

# 4) (Optional) initialize/seed the database if your server provides a script
npm --prefix server run db:setup

# 5) Run both server and client together (dev)
npm run dev
