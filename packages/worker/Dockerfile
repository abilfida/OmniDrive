FROM node:22-slim

WORKDIR /app

# Copy root package.json and workspace definition
COPY package.json package-lock.json* ./

# Copy only package.json files for workspaces to leverage Docker cache
COPY packages/worker/package.json ./packages/worker/package.json
COPY packages/web/package.json ./packages/web/package.json

# Install dependencies
RUN npm ci

# Now copy the rest of the source code and configs
COPY tsconfig.base.json ./
COPY packages/worker ./packages/worker

# Expose wrangler local port
EXPOSE 8787

WORKDIR /app/packages/worker

# Initialize D1 SQLite database (Optional pre-creation step to ensure the dir exists)
RUN mkdir -p .wrangler/state/v3/d1

# Run the worker via wrangler dev
CMD ["npm", "run", "dev", "--", "--ip", "0.0.0.0", "--port", "8787"]
