FROM node:20-alpine

WORKDIR /app

# Copy root package.json and workspace definition
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./

# Copy packages
COPY packages/worker ./packages/worker
COPY packages/web/package.json ./packages/web/package.json

# Install dependencies
RUN npm ci

# Expose wrangler local port
EXPOSE 8787

WORKDIR /app/packages/worker

# Initialize D1 SQLite database (Optional pre-creation step to ensure the dir exists)
RUN mkdir -p .wrangler/state/v3/d1

# Run the worker via wrangler dev
CMD ["npm", "run", "dev", "--", "--ip", "0.0.0.0", "--port", "8787"]
