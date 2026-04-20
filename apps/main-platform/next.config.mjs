const envAllowedOrigins = (process.env.NEXT_ALLOWED_DEV_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig = {
  experimental: {
    typedRoutes: true
  },
  allowedDevOrigins: ["192.168.1.156", ...envAllowedOrigins]
};

export default nextConfig;
