FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN apt-get update \
	&& apt-get install -y --no-install-recommends python3 make g++ \
	&& npm ci \
	&& apt-get purge -y --auto-remove python3 make g++ \
	&& rm -rf /var/lib/apt/lists/*

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3001
ENV DB_PATH=/app/data/food.db
ENV AI_PROVIDER=google
ENV GOOGLE_AI_MODEL=gemini-3.5-flash-lite
ENV OPENAI_MODEL=gpt-4o-mini

RUN mkdir -p /app/data
VOLUME ["/app/data"]
EXPOSE 3001

CMD ["npm", "start"]
