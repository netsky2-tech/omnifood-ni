# Staging image for the admin backend.
#
# The managed builders (Railpack/Nixpacks) are intentionally bypassed: they
# selected Node 18 for this workspace and could not remove a cached
# node_modules directory during `npm ci`. Pinning the runtime here keeps the
# deploy reproducible and identical to the Node version used by CI.
FROM node:22-slim

WORKDIR /app

# Install from the lockfile only, so a dependency change invalidates the layer
# and an unchanged lockfile stays cached. `--include=dev` is explicit because a
# NODE_ENV=production service variable is present at build time and would
# otherwise omit the toolchain that `nest build` needs.
COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund

# Build the application. Migration execution happens at container start, not
# here, so image builds never touch a database.
COPY . .
RUN npm run build

EXPOSE 3000

# Migrations run before the server starts; a migration failure exits nonzero,
# which fails the deploy and keeps the previous healthy revision serving.
CMD ["npm", "run", "start:staging"]
