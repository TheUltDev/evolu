import nextMDX from "@next/mdx";

import { recmaPlugins } from "./src/mdx/recma.mjs";
import { rehypePlugins } from "./src/mdx/rehype.mjs";
import { remarkPlugins } from "./src/mdx/remark.mjs";
import withSearch from "./src/mdx/search.mjs";

const withMDX = nextMDX({
  options: {
    remarkPlugins,
    rehypePlugins,
    recmaPlugins,
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ["js", "jsx", "ts", "tsx", "mdx"],
  outputFileTracingIncludes: {
    "/**/*": ["./src/app/**/*.mdx"],
  },
  async redirects() {
    return [
      {
        source: "/docs",
        destination: "/docs/quickstart",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/docs/installation",
        destination: "/docs/quickstart",
      },
      {
        source: "/docs/evolu-server",
        destination: "/docs/evolu-relay",
      },
      {
        source: "/examples/:path",
        destination: "/docs/examples",
      },
    ];
  },
};

export default withSearch(withMDX(nextConfig));
