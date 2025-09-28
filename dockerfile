# Dockerfile
FROM node:20-bullseye

# Установим Chromium и зависимости для запуска headless браузера
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-liberation \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libnss3 \
    libasound2 \
    libpangocairo-1.0-0 \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
WORKDIR /app

COPY package*.json ./
# Можно установить нормально (Render выполняет build) — при желании добавьте PUPPETEER_SKIP_DOWNLOAD=true в build env
RUN npm install --production

COPY . .
CMD ["npm", "start"]
