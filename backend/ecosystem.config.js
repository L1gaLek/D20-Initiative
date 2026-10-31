// Secrets are loaded from backend/.env by server.js or injected by the host.
// This template is portable; production runs from /root/initiative-server.
module.exports = {
  apps: [
    {
      name: 'initiative-ws',
      script: './server.js',
      cwd: __dirname,
      env: {
        PORT: 8080
      }
    }
  ]
};
