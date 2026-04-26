const envAllowedOrigins = (process.env.NEXT_ALLOWED_DEV_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig = {
  typedRoutes: true,
  allowedDevOrigins: ["192.168.1.47", ...envAllowedOrigins]
};

export default nextConfig;
