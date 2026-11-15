FROM node:20-alpine

WORKDIR /app

# Install libc compatibility for Alpine Linux
RUN apk add --no-cache libc6-compat

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy application source
COPY . .

# Environment defaults
ENV PORT=3000 \
    NODE_ENV=development \
    NEXT_PUBLIC_DEV_MODE=true \
    BACKEND_PORT=8080

EXPOSE 3000

CMD ["npm", "run", "dev"]
