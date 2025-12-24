/**
 * PM2 config for FlowMail SMTP Gateway.
 *
 * Usage on VPS:
 *   cd /opt/flowmail-ai
 *   pm2 start server/ecosystem.config.cjs --env production
 *   pm2 save
 *   pm2 startup
 *
 * IMPORTANT:
 * - Keep the gateway bound to localhost via Nginx reverse proxy (recommended).
 * - Set real values via host env or by editing the env.production block below.
 */
module.exports = {
  apps: [
    {
      name: "flowmail-smtp-gateway",
      script: "server/smtp-gateway.mjs",
      node_args: "--enable-source-maps",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "development",
        PORT: "8787",
      },
      env_production: {
        NODE_ENV: "production",
        // Port that the gateway listens on locally (Nginx will proxy to this)
        PORT: "8787",

        // Protect the gateway endpoint (/send) with a Bearer token
        MAIL_GATEWAY_TOKEN: "CHANGE_ME__GENERATE_A_RANDOM_TOKEN",

        // Google SMTP Relay (typical defaults)
        SMTP_HOST: "smtp-relay.gmail.com",
        SMTP_PORT: "587",
        SMTP_SECURE: "false",

        // From address used for outbound mail
        SMTP_FROM: "jimmy@peremis.com",

        // Optional (only if your SMTP relay requires auth)
        // SMTP_USER: "",
        // SMTP_PASS: "",
      },
    },
  ],
};


