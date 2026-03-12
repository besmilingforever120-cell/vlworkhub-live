import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  serverExternalPackages: ['mssql', 'msnodesqlv8'],
};

export default nextConfig;
