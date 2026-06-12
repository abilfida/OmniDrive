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

# Ensure wrangler.toml exists for wrangler dev
RUN cp wrangler.example.toml wrangler.toml

# Create a startup script to map OS environment variables to Wrangler's .dev.vars
RUN echo '#!/bin/sh' > start.sh && \
    echo 'echo "FRONTEND_URL=$FRONTEND_URL" > .dev.vars' >> start.sh && \
    echo 'echo "WORKER_URL=$WORKER_URL" >> .dev.vars' >> start.sh && \
    echo 'echo "GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID" >> .dev.vars' >> start.sh && \
    echo 'echo "GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET" >> .dev.vars' >> start.sh && \
    echo 'echo "JWT_SECRET=$JWT_SECRET" >> .dev.vars' >> start.sh && \
    echo 'echo "TOKEN_ENCRYPTION_KEY=$TOKEN_ENCRYPTION_KEY" >> .dev.vars' >> start.sh && \
    echo 'exec npm run dev -- --ip 0.0.0.0 --port 8787' >> start.sh && \
    chmod +x start.sh

# Run the worker via wrangler dev
CMD ["./start.sh"]
