# Stage 1: Build the React application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package.json and workspace definition
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./

# Copy packages
COPY packages/web ./packages/web
COPY packages/worker/package.json ./packages/worker/package.json

# Install dependencies
RUN npm ci

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
