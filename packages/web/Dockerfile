# Stage 1: Build the React application
FROM node:22-slim AS builder

WORKDIR /app

# Copy root package.json and workspace definition
COPY package.json package-lock.json* ./

# Copy only package.json files for workspaces to leverage Docker cache
COPY packages/web/package.json ./packages/web/package.json
COPY packages/worker/package.json ./packages/worker/package.json

# Install dependencies
RUN npm ci

# Now copy the rest of the source code and configs
COPY tsconfig.base.json ./
COPY packages/web ./packages/web

# Build web package
RUN npm run build:web

# Stage 2: Serve with Nginx
FROM nginx:alpine

# Copy custom nginx config
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets
COPY --from=builder /app/packages/web/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
