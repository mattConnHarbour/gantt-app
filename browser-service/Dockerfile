FROM mcr.microsoft.com/playwright:v1.56.1-noble
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY index.js proxy.js ./
ENV NODE_ENV=production
USER pwuser
CMD ["node", "index.js"]
