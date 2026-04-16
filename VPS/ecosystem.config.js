module.exports = {
  apps: [
    {
      name: "initiative-ws",
      script: "./server.js",
      cwd: "/root/initiative-server",
      env: {
        PORT: 8080,
        DATABASE_URL: "postgresql://postgres:Kavabanga1541315@db.iwtxisgxikbddzqwpzsk.supabase.co:5432/postgres",

        S3_ENDPOINT: "https://s3.twcstorage.ru",
        S3_REGION: "ru-1",
        S3_BUCKET: "d20-init-storage",
        S3_ACCESS_KEY: "M5GFASPG5P3KXG9NJ5KL",
        S3_SECRET_KEY: "yOOrx6j2c6eJL47q4y0bnxcusks9BvunhTLQiI9B",
        S3_PUBLIC_BASE_URL: "https://s3.twcstorage.ru/d20-init-storage"
      }
    }
  ]
};
