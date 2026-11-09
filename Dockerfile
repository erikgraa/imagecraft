FROM node:26-alpine
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY --chown=node:node server.cjs ./server.cjs
COPY --chown=node:node public/ ./public/
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server.cjs"]
