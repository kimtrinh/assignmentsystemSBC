/** @type {import('next').NextConfig} */
const isPages = process.env.GITHUB_PAGES === "true";
const basePath = isPages ? "/assignmentsystemSBC" : "";

const nextConfig = {
  output: "export",
  reactStrictMode: true,
  trailingSlash: true,
  basePath,
  assetPrefix: basePath ? `${basePath}/` : undefined,
  images: { unoptimized: true }
};

export default nextConfig;
